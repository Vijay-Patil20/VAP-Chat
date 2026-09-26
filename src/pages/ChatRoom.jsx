import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

function ChatRoom() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')

  const socketRef = useRef(null)
  const heartbeatRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const shouldReconnectRef = useRef(true)

  const [clientId] = useState(() =>
    crypto.randomUUID()
  )

  const [chatExists, setChatExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] =
    useState('Connecting...')
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    let isInitialConnection = true

    /*
     * Stop the heartbeat timer.
     */
    function stopHeartbeat() {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }

    /*
     * Start the heartbeat timer.
     */
    function startHeartbeat(socket) {
      stopHeartbeat()

      heartbeatRef.current = setInterval(() => {
        if (
          socket.readyState ===
          WebSocket.OPEN
        ) {
          socket.send(
            JSON.stringify({
              type: 'ping',
            })
          )

          console.log(
            'Heartbeat ping sent'
          )
        }
      }, 20000)
    }

    /*
     * Schedule another connection attempt.
     */
    function scheduleReconnect(connectWebSocket) {
      if (!shouldReconnectRef.current) {
        return
      }

      if (reconnectTimerRef.current) {
        return
      }

      const attempt =
        reconnectAttemptsRef.current

      const delay =
        Math.min(
          1000 * Math.pow(2, attempt),
          10000
        )

      reconnectAttemptsRef.current =
        attempt + 1

      console.log(
        `Reconnecting in ${delay / 1000} seconds...`
      )

      setConnectionStatus('Reconnecting...')

      reconnectTimerRef.current =
        setTimeout(() => {
          reconnectTimerRef.current = null
          connectWebSocket()
        }, delay)
    }

    /*
     * Create a WebSocket connection.
     */
    function connectWebSocket() {
      if (
        !shouldReconnectRef.current ||
        !code
      ) {
        return
      }

      /*
       * Don't create another connection if
       * one is already open or connecting.
       */
      if (
        socketRef.current &&
        (
          socketRef.current.readyState ===
            WebSocket.OPEN ||
          socketRef.current.readyState ===
            WebSocket.CONNECTING
        )
      ) {
        return
      }

      setConnectionStatus(
        reconnectAttemptsRef.current > 0
          ? 'Reconnecting...'
          : 'Connecting...'
      )

      const protocol =
        window.location.protocol === 'https:'
          ? 'wss:'
          : 'ws:'

      const socketUrl =
        `${protocol}//${window.location.host}` +
        `/api/chat/ws?code=${encodeURIComponent(code)}`

      const socket = new WebSocket(socketUrl)

      socketRef.current = socket

      /*
       * WebSocket connected.
       */
      socket.onopen = () => {
        console.log(
          'WebSocket connected'
        )

        reconnectAttemptsRef.current = 0

        setConnectionStatus('Connected')
        setLoading(false)

        startHeartbeat(socket)
      }

      /*
       * Receive WebSocket messages.
       */
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          /*
           * Heartbeat response.
           */
          if (data.type === 'pong') {
            console.log(
              'Heartbeat pong received'
            )

            return
          }

          /*
           * Normal chat message.
           */
          if (data.type === 'message') {
            setMessages(
              (currentMessages) => [
                ...currentMessages,
                {
                  id: data.id,
                  senderId: data.senderId,
                  text: data.text,
                  timestamp: data.timestamp,
                },
              ]
            )
          }

          /*
           * Server-side error.
           */
          if (data.type === 'error') {
            console.error(
              data.message
            )
          }
        } catch (error) {
          console.error(
            'Unable to process WebSocket message:',
            error
          )
        }
      }

      /*
       * WebSocket error.
       */
      socket.onerror = (error) => {
        console.error(
          'WebSocket error:',
          error
        )
      }

      /*
       * WebSocket closed.
       */
      socket.onclose = () => {
        console.log(
          'WebSocket disconnected'
        )

        stopHeartbeat()

        /*
         * Only schedule reconnect if the user
         * is still on the chat page.
         */
        if (
          shouldReconnectRef.current
        ) {
          setConnectionStatus(
            'Reconnecting...'
          )

          scheduleReconnect(
            connectWebSocket
          )
        }
      }

      /*
       * The initial connection attempt is now
       * being handled by the WebSocket.
       */
      if (isInitialConnection) {
        isInitialConnection = false
      }
    }

    /*
     * First verify that the chat exists.
     * After that, establish the WebSocket.
     */
    async function connectToChat() {
      if (!code) {
        setError(
          'No chat code was provided.'
        )

        setLoading(false)

        return
      }

      try {
        const response = await fetch(
          `/api/chat/join?code=${encodeURIComponent(code)}`
        )

        const result =
          await response.json()

        if (!response.ok) {
          setError(
            result.message ||
              'Chat not found.'
          )

          setLoading(false)

          return
        }

        setChatExists(true)

        connectWebSocket()
      } catch (error) {
        console.error(error)

        setError(
          'Unable to connect to the chat. Please try again.'
        )

        setLoading(false)
      }
    }

    connectToChat()

    /*
     * Cleanup when leaving the chat page.
     */
    return () => {
      shouldReconnectRef.current = false

      stopHeartbeat()

      if (reconnectTimerRef.current) {
        clearTimeout(
          reconnectTimerRef.current
        )

        reconnectTimerRef.current = null
      }

      if (socketRef.current) {
        socketRef.current.close()
      }

      socketRef.current = null
    }
  }, [code])

  /*
   * Send a normal chat message.
   */
  function handleSendMessage() {
    const trimmedMessage =
      message.trim()

    if (!trimmedMessage) {
      return
    }

    if (
      !socketRef.current ||
      socketRef.current.readyState !==
        WebSocket.OPEN
    ) {
      return
    }

    socketRef.current.send(
      JSON.stringify({
        type: 'message',
        senderId: clientId,
        text: trimmedMessage,
      })
    )

    setMessage('')
  }

  /*
   * Send message when Enter is pressed.
   */
  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      handleSendMessage()
    }
  }

  /*
   * Initial loading screen.
   */
  if (loading) {
    return (
      <main className="app">
        <section className="hero">
          <div className="logo">
            VAP CHAT
          </div>

          <h1>Joining Chat...</h1>

          <p className="subtitle">
            Connecting to your temporary chat.
          </p>
        </section>
      </main>
    )
  }

  /*
   * Chat doesn't exist / initial connection failed.
   */
  if (error || !chatExists) {
    return (
      <main className="app">
        <section className="hero">
          <div className="logo">
            VAP CHAT
          </div>

          <h1>Chat Not Found</h1>

          <p className="subtitle">
            {error ||
              'This chat does not exist.'}
          </p>

          <Link
            to="/"
            className="secondary-button"
          >
            Back to Home
          </Link>
        </section>
      </main>
    )
  }

  /*
   * Chat UI.
   */
  return (
    <main className="app">
      <section className="chat-room">
        <div className="chat-header">
          <div>
            <div className="logo">
              VAP CHAT
            </div>

            <span className="connection-status">
              ● {connectionStatus}
            </span>
          </div>

          <span className="chat-code">
            {code}
          </span>
        </div>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-chat">
              No messages yet. Say hello!
            </div>
          ) : (
            messages.map((item) => {
              const isOwnMessage =
                item.senderId === clientId

              return (
                <div
                  key={item.id}
                  className={`message ${
                    isOwnMessage
                      ? 'sent'
                      : 'received'
                  }`}
                >
                  <div>{item.text}</div>

                  <span className="message-time">
                    {new Date(
                      item.timestamp
                    ).toLocaleTimeString(
                      [],
                      {
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    )}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <div className="message-input">
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            onKeyDown={handleKeyDown}
            maxLength={2000}
            disabled={
              connectionStatus !==
              'Connected'
            }
          />

          <button
            className="send-button"
            onClick={handleSendMessage}
            disabled={
              connectionStatus !==
                'Connected' ||
              !message.trim()
            }
          >
            Send
          </button>
        </div>

        <Link
          to="/"
          className="leave-button"
        >
          Leave Chat
        </Link>
      </section>
    </main>
  )
}

export default ChatRoom
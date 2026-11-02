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

  const [clientId] = useState(() => crypto.randomUUID())
  const [chatExists, setChatExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] =
    useState('Connecting...')
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    // React StrictMode runs effect setup/cleanup twice in development.
    // Reset the shared reconnect flag for each active effect instance.
    shouldReconnectRef.current = true
    reconnectAttemptsRef.current = 0

    let isEffectActive = true

    setChatExists(false)
    setLoading(true)
    setError('')
    setConnectionStatus('Connecting...')
    setMessages([])
    setMessage('')

    function stopHeartbeat() {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }

    function startHeartbeat(socket) {
      stopHeartbeat()

      heartbeatRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
      }, 20000)
    }

    function scheduleReconnect(reconnect) {
      if (
        !isEffectActive ||
        !shouldReconnectRef.current ||
        reconnectTimerRef.current
      ) {
        return
      }

      const attempt = reconnectAttemptsRef.current
      const delay = Math.min(
        1000 * Math.pow(2, attempt),
        10000
      )

      reconnectAttemptsRef.current = attempt + 1
      setConnectionStatus('Reconnecting...')

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        reconnect()
      }, delay)
    }

    function connectWebSocket() {
      if (
        !isEffectActive ||
        !shouldReconnectRef.current ||
        !code
      ) {
        return
      }

      if (
        socketRef.current &&
        (
          socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING
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
        window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socketUrl =
        protocol + '//' + window.location.host +
        '/api/chat/ws?code=' + encodeURIComponent(code)
      const socket = new WebSocket(socketUrl)

      socketRef.current = socket

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0
        setConnectionStatus('Connected')
        setLoading(false)
        startHeartbeat(socket)
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'pong') {
            return
          }

          if (data.type === 'message') {
            setMessages((currentMessages) => [
              ...currentMessages,
              {
                id: data.id,
                senderId: data.senderId,
                text: data.text,
                timestamp: data.timestamp,
              },
            ])
          }

          if (
            data.type === 'error' &&
            data.code === 'CHAT_EXPIRED'
          ) {
            shouldReconnectRef.current = false
            stopHeartbeat()
            setConnectionStatus('Chat expired')
            setError(
              'This chat expired after 15 minutes of inactivity.'
            )
          }
        } catch (error) {
          console.error(
            'Unable to process WebSocket message:',
            error
          )
        }
      }

      socket.onerror = (event) => {
        console.error('WebSocket error:', event)
      }

      socket.onclose = (event) => {
        stopHeartbeat()

        if (!isEffectActive) {
          return
        }

        if (event.code === 4000) {
          shouldReconnectRef.current = false
          setConnectionStatus('Chat expired')
          setError(
            'This chat expired after 15 minutes of inactivity.'
          )
          setLoading(false)
          return
        }

        if (shouldReconnectRef.current) {
          scheduleReconnect(reconnectToChat)
        }
      }
    }

    async function reconnectToChat() {
      if (
        !isEffectActive ||
        !shouldReconnectRef.current ||
        !code
      ) {
        return
      }

      try {
        const response = await fetch(
          '/api/chat/join?code=' + encodeURIComponent(code)
        )
        const result = await response.json()

        if (!isEffectActive || !shouldReconnectRef.current) {
          return
        }

        if (response.status === 404) {
          shouldReconnectRef.current = false
          setConnectionStatus('Chat expired')
          setError(
            result.message ||
            'This chat expired after 15 minutes of inactivity.'
          )
          setLoading(false)
          return
        }

        if (!response.ok) {
          throw new Error(
            result.message || 'Unable to reconnect to chat.'
          )
        }

        connectWebSocket()
      } catch (error) {
        console.error('Unable to verify chat before reconnect:', error)
        scheduleReconnect(reconnectToChat)
      }
    }

    async function connectToChat() {
      if (!code) {
        setError('No chat code was provided.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(
          '/api/chat/join?code=' + encodeURIComponent(code)
        )
        const result = await response.json()

        if (!isEffectActive) {
          return
        }

        if (!response.ok) {
          setError(result.message || 'Chat not found.')
          setLoading(false)
          return
        }

        setChatExists(true)
        connectWebSocket()
      } catch (error) {
        if (!isEffectActive) {
          return
        }

        console.error(error)
        setError(
          'Unable to connect to the chat. Please try again.'
        )
        setLoading(false)
      }
    }

    connectToChat()

    return () => {
      isEffectActive = false
      shouldReconnectRef.current = false
      stopHeartbeat()

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      if (socketRef.current) {
        socketRef.current.close()
      }

      socketRef.current = null
    }
  }, [code])

  function handleSendMessage() {
    const trimmedMessage = message.trim()

    if (
      !trimmedMessage ||
      !socketRef.current ||
      socketRef.current.readyState !== WebSocket.OPEN
    ) {
      return
    }

    socketRef.current.send(JSON.stringify({
      type: 'message',
      senderId: clientId,
      text: trimmedMessage,
    }))

    setMessage('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      handleSendMessage()
    }
  }

  if (loading) {
    return (
      <main className="app">
        <section className="hero">
          <div className="logo">VAP CHAT</div>
          <h1>Joining Chat...</h1>
          <p className="subtitle">
            Connecting to your temporary chat.
          </p>
        </section>
      </main>
    )
  }

  if (error || !chatExists) {
    return (
      <main className="app">
        <section className="hero">
          <div className="logo">VAP CHAT</div>
          <h1>Chat Not Found</h1>
          <p className="subtitle">
            {error || 'This chat does not exist.'}
          </p>
          <Link to="/" className="secondary-button">
            Back to Home
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="chat-room">
        <div className="chat-header">
          <div>
            <div className="logo">VAP CHAT</div>
            <span className="connection-status">
              ● {connectionStatus}
            </span>
          </div>
          <span className="chat-code">{code}</span>
        </div>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-chat">
              No messages yet. Say hello!
            </div>
          ) : (
            messages.map((item) => {
              const isOwnMessage = item.senderId === clientId

              return (
                <div
                  key={item.id}
                  className={
                    'message ' + (isOwnMessage ? 'sent' : 'received')
                  }
                >
                  <div>{item.text}</div>
                  <span className="message-time">
                    {new Date(item.timestamp).toLocaleTimeString(
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
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            disabled={connectionStatus !== 'Connected'}
          />

          <button
            className="send-button"
            onClick={handleSendMessage}
            disabled={
              connectionStatus !== 'Connected' ||
              !message.trim()
            }
          >
            Send
          </button>
        </div>

        <Link to="/" className="leave-button">
          Leave Chat
        </Link>
      </section>
    </main>
  )
}

export default ChatRoom

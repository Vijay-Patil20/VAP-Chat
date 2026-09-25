import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

function ChatRoom() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')

  const [chatExists, setChatExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function verifyChat() {
      if (!code) {
        setError('No chat code was provided.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(
          `/api/chat/join?code=${encodeURIComponent(code)}`
        )

        const result = await response.json()

        if (!response.ok) {
          setError(
            result.message || 'Chat not found.'
          )
          return
        }

        setChatExists(true)
      } catch (error) {
        console.error(error)
        setError(
          'Unable to connect to the chat. Please try again.'
        )
      } finally {
        setLoading(false)
      }
    }

    verifyChat()
  }, [code])

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

  return (
    <main className="app">
      <section className="chat-room">
        <div className="chat-header">
          <div>
            <div className="logo">VAP CHAT</div>

            <span className="connection-status">
              ● Connected
            </span>
          </div>

          <span className="chat-code">
            {code}
          </span>
        </div>

        <div className="messages">
          <div className="empty-chat">
            Chat connected successfully.
          </div>
        </div>

        <div className="message-input">
          <input
            type="text"
            placeholder="Type a message..."
            disabled
          />

          <button
            className="send-button"
            disabled
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
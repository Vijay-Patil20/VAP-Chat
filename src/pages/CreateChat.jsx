import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function CreateChat() {
  const navigate = useNavigate()

  const [chat, setChat] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreateChat() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/chat/create')

      if (!response.ok) {
        throw new Error('Unable to create chat.')
      }

      const newChat = await response.json()

      setChat(newChat)
    } catch (error) {
      console.error(error)
      setError('Unable to create chat. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleEnterChat() {
    if (chat?.code) {
      navigate(`/chat?code=${chat.code}`)
    }
  }

  async function handleCopyCode() {
    if (!chat?.code) {
      return
    }

    await navigator.clipboard.writeText(chat.code)
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="logo">VAP CHAT</div>

        {!chat ? (
          <>
            <h1>Create a Chat</h1>

            <p className="subtitle">
              Create a temporary chat and share the code
              with someone.
            </p>

            {error && (
              <p className="error-message">
                {error}
              </p>
            )}

            <div className="actions">
              <button
                className="primary-button"
                onClick={handleCreateChat}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Chat'}
              </button>

              <Link to="/" className="secondary-button">
                Back
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1>Your Chat Is Ready</h1>

            <p className="subtitle">
              Share this code with the person you want to
              chat with.
            </p>

            <div className="generated-code">
              {chat.code}
            </div>

            <div className="actions">
              <button
                className="primary-button"
                onClick={handleEnterChat}
              >
                Enter Chat
              </button>

              <button
                className="secondary-button"
                onClick={handleCopyCode}
              >
                Copy Code
              </button>

              <Link to="/" className="secondary-button">
                Back
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default CreateChat
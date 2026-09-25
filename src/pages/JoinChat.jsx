import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDemoChat } from '../utils/demoChat'

function JoinChat() {
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  function handleJoinChat() {
    const normalizedCode = code.trim().toUpperCase()

    if (!normalizedCode) {
      setError('Please enter a chat code.')
      return
    }

    const chat = getDemoChat(normalizedCode)

    if (!chat) {
      setError('Chat not found. Please check the code and try again.')
      return
    }

    setError('')
    navigate(`/chat?code=${chat.code}`)
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="logo">VAP CHAT</div>

        <h1>Join a Chat</h1>

        <p className="subtitle">
          Enter the chat code shared with you.
        </p>

        <div className="chat-code-input">
          <input
            type="text"
            placeholder="Enter chat code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              setError('')
            }}
            maxLength={7}
            autoComplete="off"
          />
        </div>

        {error && (
          <p className="error-message">
            {error}
          </p>
        )}

        <div className="actions">
          <button
            className="primary-button"
            onClick={handleJoinChat}
          >
            Join Chat
          </button>

          <Link to="/" className="secondary-button">
            Back
          </Link>
        </div>
      </section>
    </main>
  )
}

export default JoinChat
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createDemoChat } from '../utils/demoChat'

function CreateChat() {
  const navigate = useNavigate()
  const [chat, setChat] = useState(null)

  function handleCreateChat() {
    const newChat = createDemoChat()
    setChat(newChat)
  }

  function handleEnterChat() {
    if (chat) {
      navigate(`/chat?code=${chat.code}`)
    }
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

            <div className="actions">
              <button
                className="primary-button"
                onClick={handleCreateChat}
              >
                Create Chat
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
                onClick={() => {
                  navigator.clipboard.writeText(chat.code)
                }}
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
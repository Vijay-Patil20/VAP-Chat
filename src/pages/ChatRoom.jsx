import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getDemoChat, saveDemoChat } from '../utils/demoChat'

function ChatRoom() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')

  const [chat, setChat] = useState(() => {
  if (!code) {
    return null
  }

  return getDemoChat(code)
})

const [message, setMessage] = useState('')

  function handleSendMessage() {
    const trimmedMessage = message.trim()

    if (!trimmedMessage || !chat) {
      return
    }

    const newMessage = {
      id: crypto.randomUUID(),
      text: trimmedMessage,
      sender: 'you',
      timestamp: new Date().toISOString(),
    }

    const updatedChat = {
      ...chat,
      messages: [...chat.messages, newMessage],
    }

    saveDemoChat(updatedChat)
    setChat(updatedChat)
    setMessage('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      handleSendMessage()
    }
  }

  if (!chat) {
    return (
      <main className="app">
        <section className="hero">
          <div className="logo">VAP CHAT</div>

          <h1>Chat Not Found</h1>

          <p className="subtitle">
            This chat does not exist in this browser.
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
              ● Demo Mode
            </span>
          </div>

          <span className="chat-code">
            {chat.code}
          </span>
        </div>

        <div className="messages">
          {chat.messages.length === 0 ? (
            <div className="empty-chat">
              No messages yet. Say hello!
            </div>
          ) : (
            chat.messages.map((item) => (
            <div
  key={item.id}
  className={`message ${
    item.sender === 'you'
      ? 'sent'
      : 'received'
  }`}
>
  <div>{item.text}</div>

  <span className="message-time">
    {new Date(item.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}
  </span>
</div>
            ))
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
          />

          <button
            className="send-button"
            onClick={handleSendMessage}
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
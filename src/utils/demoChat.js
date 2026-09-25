const DEMO_CHAT_KEY = 'vap-demo-chat'

export function generateChatCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  let code = ''

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(
      Math.random() * characters.length
    )

    code += characters[randomIndex]
  }

  return `${code.slice(0, 3)}-${code.slice(3)}`
}

export function createDemoChat() {
  const code = generateChatCode()

  const chat = {
    code,
    createdAt: new Date().toISOString(),
    messages: [],
  }

  localStorage.setItem(
    `${DEMO_CHAT_KEY}-${code}`,
    JSON.stringify(chat)
  )

  return chat
}

export function getDemoChat(code) {
  const normalizedCode = code.trim().toUpperCase()

  const storedChat = localStorage.getItem(
    `${DEMO_CHAT_KEY}-${normalizedCode}`
  )

  if (!storedChat) {
    return null
  }

  return JSON.parse(storedChat)
}

export function saveDemoChat(chat) {
  localStorage.setItem(
    `${DEMO_CHAT_KEY}-${chat.code}`,
    JSON.stringify(chat)
  )
}
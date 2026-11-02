export const MAX_CHAT_PARTICIPANTS = 2

export function isChatFull(activeConnections) {
  return (
    Number.isFinite(activeConnections) &&
    activeConnections >= MAX_CHAT_PARTICIPANTS
  )
}

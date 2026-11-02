const CHAT_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{3}$/

export function normalizeChatCode(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toUpperCase()

  return CHAT_CODE_PATTERN.test(normalized)
    ? normalized
    : null
}

const CHAT_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CHAT_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/

export const CHAT_CODE_LENGTH = 12

export function normalizeChatCode(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toUpperCase()

  return CHAT_CODE_PATTERN.test(normalized)
    ? normalized
    : null
}

export function generateChatCode(randomValues) {
  if (!randomValues || typeof randomValues[Symbol.iterator] !== 'function') {
    return null
  }

  // The alphabet has 32 symbols (2^5), so uint32 modulo maps evenly
  // across the alphabet without discarding any valid random values.
  const range = 0x100000000
  const limit = Math.floor(range / CHAT_CODE_CHARACTERS.length) *
    CHAT_CODE_CHARACTERS.length
  let code = ''

  for (const value of randomValues) {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value >= range ||
      value >= limit
    ) {
      continue
    }

    code += CHAT_CODE_CHARACTERS[value % CHAT_CODE_CHARACTERS.length]

    if (code.length === CHAT_CODE_LENGTH) {
      return code.slice(0, 4) + '-' +
        code.slice(4, 8) + '-' +
        code.slice(8)
    }
  }

  return null
}

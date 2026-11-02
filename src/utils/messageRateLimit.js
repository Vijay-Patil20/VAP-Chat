export const MAX_MESSAGES_PER_WINDOW = 5
export const MESSAGE_WINDOW_MS = 10000

export function getRecentMessageTimestamps(
  timestamps,
  now
) {
  if (!Array.isArray(timestamps)) {
    return []
  }

  return timestamps.filter(
    (timestamp) =>
      Number.isFinite(timestamp) &&
      timestamp > now - MESSAGE_WINDOW_MS
  )
}

export function isMessageRateLimited(timestamps) {
  return timestamps.length >= MAX_MESSAGES_PER_WINDOW
}

export function consumeTokenBucket(
  previousState,
  now,
  capacity,
  refillIntervalMs
) {
  const previousTokens = previousState?.tokens
  const previousUpdatedAt = previousState?.updatedAt

  const validState =
    Number.isFinite(previousTokens) &&
    Number.isFinite(previousUpdatedAt)

  const elapsed = validState
    ? Math.max(0, now - previousUpdatedAt)
    : 0

  const availableTokens = validState
    ? Math.min(
        capacity,
        previousTokens + elapsed / refillIntervalMs
      )
    : capacity

  const allowed = availableTokens >= 1
  const tokens = allowed
    ? availableTokens - 1
    : availableTokens

  const retryAfterSeconds = allowed
    ? 0
    : Math.max(
        1,
        Math.ceil(
          ((1 - availableTokens) * refillIntervalMs) / 1000
        )
      )

  return {
    allowed,
    tokens,
    updatedAt: now,
    retryAfterSeconds,
  }
}

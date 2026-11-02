import test from 'node:test'
import assert from 'node:assert/strict'
import { consumeTokenBucket } from '../src/utils/tokenBucket.js'
import {
  isChatFull,
  MAX_CHAT_PARTICIPANTS,
} from '../src/utils/participantLimit.js'
import {
  getRecentMessageTimestamps,
  isMessageRateLimited,
  MAX_MESSAGES_PER_WINDOW,
} from '../src/utils/messageRateLimit.js'

test('token bucket starts with its configured burst capacity', () => {
  const result = consumeTokenBucket(null, 1000, 3, 20000)

  assert.equal(result.allowed, true)
  assert.equal(result.tokens, 2)
  assert.equal(result.retryAfterSeconds, 0)
})

test('token bucket rejects requests after the burst is exhausted', () => {
  let state = null

  for (let index = 0; index < 3; index += 1) {
    const result = consumeTokenBucket(state, 1000, 3, 20000)
    assert.equal(result.allowed, true)
    state = {
      tokens: result.tokens,
      updatedAt: result.updatedAt,
    }
  }

  const blocked = consumeTokenBucket(state, 1000, 3, 20000)

  assert.equal(blocked.allowed, false)
  assert.equal(blocked.retryAfterSeconds, 20)
})

test('token bucket replenishes gradually and caps at capacity', () => {
  const initial = {
    tokens: 0,
    updatedAt: 1000,
  }

  const replenished = consumeTokenBucket(
    initial,
    11000,
    3,
    20000
  )

  assert.equal(replenished.allowed, false)
  assert.equal(replenished.tokens, 0.5)
  assert.equal(replenished.retryAfterSeconds, 10)

  const full = consumeTokenBucket(
    { tokens: 3, updatedAt: 1000 },
    100000,
    3,
    20000
  )

  assert.equal(full.tokens, 2)
  assert.equal(full.allowed, true)
})

test('chat room permits exactly two participants', () => {
  assert.equal(MAX_CHAT_PARTICIPANTS, 2)
  assert.equal(isChatFull(0), false)
  assert.equal(isChatFull(1), false)
  assert.equal(isChatFull(2), true)
  assert.equal(isChatFull(3), true)
})

test('message rate limiter retains only timestamps in the active window', () => {
  const recent = getRecentMessageTimestamps(
    [1000, 5000, 9000, 9500, 9999, 10001],
    20000
  )

  assert.deepEqual(recent, [10001])
})

test('message rate limiter blocks the sixth message in ten seconds', () => {
  const fiveMessages = [11000, 12000, 13000, 14000, 15000]

  assert.equal(MAX_MESSAGES_PER_WINDOW, 5)
  assert.equal(isMessageRateLimited(fiveMessages), true)
  assert.equal(isMessageRateLimited(fiveMessages.slice(1)), false)
})

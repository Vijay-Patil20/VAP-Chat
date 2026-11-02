import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHAT_EXPIRED_CLOSE_CODE,
  CHAT_INACTIVITY_TIMEOUT_MS,
  ChatLifecycle,
  getExpiryTimestamp,
  isChatExpired,
} from '../src/utils/chatLifecycle.js'

class MemoryStorage {
  constructor() {
    this.values = new Map()
    this.alarmTimestamp = null
  }

  async get(key) {
    return this.values.get(key)
  }

  async put(key, value) {
    this.values.set(key, value)
  }

  async setAlarm(timestamp) {
    this.alarmTimestamp = timestamp
  }

  async deleteAll() {
    this.values.clear()
    this.alarmTimestamp = null
  }
}

function createFixture(startTime = 1_000_000) {
  let now = startTime
  const storage = new MemoryStorage()
  const sockets = []
  const lifecycle = new ChatLifecycle(
    storage,
    () => sockets,
    () => now
  )

  return {
    storage,
    sockets,
    lifecycle,
    setNow(value) {
      now = value
    },
  }
}

test('new chat stores creation and activity timestamps and schedules expiry', async () => {
  const fixture = createFixture()
  const { lifecycle, storage } = fixture

  await lifecycle.initialize()

  assert.equal(
    await storage.get('lastActivityAt'),
    1_000_000
  )
  assert.equal(
    Date.parse(await storage.get('createdAt')),
    1_000_000
  )
  assert.equal(
    storage.alarmTimestamp,
    1_000_000 + CHAT_INACTIVITY_TIMEOUT_MS
  )
})

test('valid activity moves the expiry deadline forward', async () => {
  const fixture = createFixture()
  const { lifecycle, storage, setNow } = fixture

  await lifecycle.initialize()
  setNow(1_000_000 + 5 * 60 * 1000)

  await lifecycle.touchActivity()

  assert.equal(
    await storage.get('lastActivityAt'),
    1_000_000 + 5 * 60 * 1000
  )
  assert.equal(
    storage.alarmTimestamp,
    1_000_000 + 20 * 60 * 1000
  )
})

test('a room remains active immediately before the inactivity deadline', async () => {
  const fixture = createFixture()
  const { lifecycle, setNow } = fixture

  await lifecycle.initialize()
  setNow(1_000_000 + CHAT_INACTIVITY_TIMEOUT_MS - 1)

  assert.equal(await lifecycle.isActive(), true)
})

test('a room expires at the inactivity deadline and closes connected sockets', async () => {
  const fixture = createFixture()
  const { lifecycle, sockets, storage, setNow } = fixture
  const socket = {
    readyState: 1,
    sent: [],
    closeCode: null,
    send(payload) {
      this.sent.push(JSON.parse(payload))
    },
    close(code) {
      this.closeCode = code
      this.readyState = 3
    },
  }

  sockets.push(socket)
  await lifecycle.initialize()
  setNow(1_000_000 + CHAT_INACTIVITY_TIMEOUT_MS)

  assert.equal(await lifecycle.isActive(), false)
  assert.equal(socket.closeCode, CHAT_EXPIRED_CLOSE_CODE)
  assert.equal(socket.sent[0].code, 'CHAT_EXPIRED')
  assert.equal(storage.values.size, 0)
  assert.equal(storage.alarmTimestamp, null)
})

test('an early alarm reschedules itself instead of expiring the room', async () => {
  const fixture = createFixture()
  const { lifecycle, storage, setNow } = fixture

  await lifecycle.initialize()
  setNow(1_000_000 + CHAT_INACTIVITY_TIMEOUT_MS - 1000)

  await lifecycle.alarm()

  assert.equal(
    await storage.get('createdAt') !== undefined,
    true
  )
  assert.equal(
    storage.alarmTimestamp,
    1_000_000 + CHAT_INACTIVITY_TIMEOUT_MS
  )
})

test('an alarm uses the latest activity time and does not delete a recently active room', async () => {
  const fixture = createFixture()
  const { lifecycle, storage, setNow } = fixture

  await lifecycle.initialize()
  setNow(1_000_000 + 14 * 60 * 1000)
  await lifecycle.touchActivity()

  // Simulate the original alarm firing after a later message reset it.
  setNow(1_000_000 + 15 * 60 * 1000)
  await lifecycle.alarm()

  assert.equal(
    await storage.get('createdAt') !== undefined,
    true
  )
  assert.equal(
    storage.alarmTimestamp,
    1_000_000 + 29 * 60 * 1000
  )
})

test('legacy rooms use createdAt when no activity timestamp exists', async () => {
  const fixture = createFixture()
  const { lifecycle, storage, setNow } = fixture

  await storage.put(
    'createdAt',
    new Date(1_000_000).toISOString()
  )
  setNow(1_000_000 + 2 * 60 * 1000)

  assert.equal(await lifecycle.isActive(), true)
  assert.equal(await storage.get('lastActivityAt'), 1_000_000)
  assert.equal(
    storage.alarmTimestamp,
    1_000_000 + CHAT_INACTIVITY_TIMEOUT_MS
  )
})

test('expiry helpers handle the exact boundary and invalid timestamps safely', () => {
  assert.equal(
    getExpiryTimestamp(1_000_000, null),
    1_000_000 + CHAT_INACTIVITY_TIMEOUT_MS
  )
  assert.equal(
    isChatExpired(2_000, 1_999),
    false
  )
  assert.equal(
    isChatExpired(2_000, 2_000),
    true
  )
  assert.equal(
    getExpiryTimestamp(undefined, 'not-a-date'),
    null
  )
})

test('the Durable Object alarm expires an inactive room and closes its sockets', async () => {
  const fixture = createFixture()
  const { lifecycle, sockets, storage, setNow } = fixture
  const socket = {
    readyState: 1,
    sent: [],
    closeCode: null,
    send(payload) {
      this.sent.push(JSON.parse(payload))
    },
    close(code) {
      this.closeCode = code
      this.readyState = 3
    },
  }

  sockets.push(socket)
  await lifecycle.initialize()
  setNow(1_000_000 + CHAT_INACTIVITY_TIMEOUT_MS)

  await lifecycle.alarm()

  assert.equal(socket.closeCode, CHAT_EXPIRED_CLOSE_CODE)
  assert.equal(socket.sent[0].code, 'CHAT_EXPIRED')
  assert.equal(storage.values.size, 0)
  assert.equal(storage.alarmTimestamp, null)
})

export const CHAT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000
export const CHAT_EXPIRED_CLOSE_CODE = 4000
export const CHAT_EXPIRED_CLOSE_REASON =
  'Chat expired due to inactivity'

export function getLastActivityTimestamp(
  lastActivityAt,
  createdAt
) {
  if (
    typeof lastActivityAt === 'number' &&
    Number.isFinite(lastActivityAt)
  ) {
    return lastActivityAt
  }

  if (typeof lastActivityAt === 'string') {
    const numericTimestamp = Number(lastActivityAt)

    if (
      lastActivityAt.trim() &&
      Number.isFinite(numericTimestamp)
    ) {
      return numericTimestamp
    }

    const parsedTimestamp = Date.parse(lastActivityAt)

    if (Number.isFinite(parsedTimestamp)) {
      return parsedTimestamp
    }
  }

  const createdTimestamp = Date.parse(createdAt)

  return Number.isFinite(createdTimestamp)
    ? createdTimestamp
    : null
}

export function getExpiryTimestamp(
  lastActivityAt,
  createdAt
) {
  const activityTimestamp = getLastActivityTimestamp(
    lastActivityAt,
    createdAt
  )

  return activityTimestamp === null
    ? null
    : activityTimestamp + CHAT_INACTIVITY_TIMEOUT_MS
}

export function isChatExpired(
  expiryTimestamp,
  now = Date.now()
) {
  return (
    !Number.isFinite(expiryTimestamp) ||
    now >= expiryTimestamp
  )
}

export class ChatLifecycle {
  constructor(storage, getWebSockets, now = () => Date.now()) {
    this.storage = storage
    this.getWebSockets = getWebSockets
    this.now = now
  }

  async initialize() {
    // Keep this tombstone after cleanup. A Durable Object ID must never
    // become a fresh room again after its original room expires.
    const expiredAt = await this.storage.get('expiredAt')

    if (expiredAt != null) {
      return false
    }

    const createdAt = await this.storage.get('createdAt')

    if (createdAt) {
      // This also expires stale legacy rooms and writes the tombstone.
      await this.isActive()
      return false
    }

    const now = this.now()

    await this.storage.put('createdAt', new Date(now).toISOString())
    await this.storage.put('lastActivityAt', now)
    await this.storage.setAlarm(
      now + CHAT_INACTIVITY_TIMEOUT_MS
    )

    return true
  }

  async touchActivity() {
    const expiredAt = await this.storage.get('expiredAt')

    if (expiredAt != null) {
      return false
    }

    const now = this.now()

    await this.storage.put('lastActivityAt', now)
    await this.storage.setAlarm(
      now + CHAT_INACTIVITY_TIMEOUT_MS
    )

    return true
  }

  async isActive({ touch = false } = {}) {
    const expiredAt = await this.storage.get('expiredAt')

    if (expiredAt != null) {
      return false
    }

    const createdAt = await this.storage.get('createdAt')

    if (!createdAt) {
      return false
    }

    const lastActivityAt = await this.storage.get(
      'lastActivityAt'
    )
    const expiryTimestamp = getExpiryTimestamp(
      lastActivityAt,
      createdAt
    )

    if (isChatExpired(expiryTimestamp, this.now())) {
      await this.expire()
      return false
    }

    if (lastActivityAt == null) {
      const activityTimestamp = getLastActivityTimestamp(
        lastActivityAt,
        createdAt
      )

      await this.storage.put(
        'lastActivityAt',
        activityTimestamp
      )
    }

    if (touch) {
      await this.touchActivity()
    } else {
      await this.storage.setAlarm(expiryTimestamp)
    }

    return true
  }

  async alarm() {
    const expiredAt = await this.storage.get('expiredAt')

    if (expiredAt != null) {
      return
    }

    const createdAt = await this.storage.get('createdAt')

    if (!createdAt) {
      return
    }

    const lastActivityAt = await this.storage.get(
      'lastActivityAt'
    )
    const expiryTimestamp = getExpiryTimestamp(
      lastActivityAt,
      createdAt
    )

    if (isChatExpired(expiryTimestamp, this.now())) {
      await this.expire()
      return
    }

    if (lastActivityAt == null) {
      const activityTimestamp = getLastActivityTimestamp(
        lastActivityAt,
        createdAt
      )

      await this.storage.put(
        'lastActivityAt',
        activityTimestamp
      )
    }

    await this.storage.setAlarm(expiryTimestamp)
  }

  async expire() {
    // Persist the tombstone before closing sockets or deleting room data.
    // If cleanup is interrupted, the room still cannot be reinitialized.
    const expiredAt = await this.storage.get('expiredAt')

    if (expiredAt == null) {
      await this.storage.put('expiredAt', this.now())
    }

    for (const socket of this.getWebSockets()) {
      if (socket.readyState !== 1) {
        continue
      }

      try {
        socket.send(JSON.stringify({
          type: 'error',
          code: 'CHAT_EXPIRED',
          message: 'This chat expired after 15 minutes of inactivity.',
        }))
      } catch (error) {
        console.error('Unable to notify chat participant:', error)
      }

      try {
        socket.close(
          CHAT_EXPIRED_CLOSE_CODE,
          CHAT_EXPIRED_CLOSE_REASON
        )
      } catch (error) {
        console.error('Unable to close expired chat connection:', error)
      }
    }

    await this.storage.delete('createdAt')
    await this.storage.delete('lastActivityAt')
    await this.storage.deleteAlarm()
  }
}

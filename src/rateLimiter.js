import { DurableObject } from 'cloudflare:workers'
import { consumeTokenBucket } from './utils/tokenBucket.js'

const RATE_LIMITS = {
  create: {
    capacity: 3,
    refillIntervalMs: 20000,
  },
  join: {
    capacity: 20,
    refillIntervalMs: 3000,
  },
  websocket: {
    capacity: 20,
    refillIntervalMs: 3000,
  },
}

export class RateLimiter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)

    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
        scope TEXT PRIMARY KEY,
        tokens REAL NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    )
  }

  async fetch(request) {
    const url = new URL(request.url)

    if (
      request.method !== 'POST' ||
      url.pathname !== '/consume'
    ) {
      return new Response('Not Found', { status: 404 })
    }

    let body

    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object') {
      return Response.json(
        { error: 'Invalid rate-limit scope.' },
        { status: 400 }
      )
    }

    const config = RATE_LIMITS[body.scope]

    if (!config) {
      return Response.json(
        { error: 'Invalid rate-limit scope.' },
        { status: 400 }
      )
    }

    const previous = this.ctx.storage.sql.exec(
      'SELECT tokens, updated_at FROM rate_limit_buckets WHERE scope = ?',
      body.scope
    ).toArray()[0]

    const now = Date.now()
    const decision = consumeTokenBucket(
      previous
        ? {
            tokens: previous.tokens,
            updatedAt: previous.updated_at,
          }
        : null,
      now,
      config.capacity,
      config.refillIntervalMs
    )

    this.ctx.storage.sql.exec(
      `INSERT INTO rate_limit_buckets
        (scope, tokens, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(scope) DO UPDATE SET
         tokens = excluded.tokens,
         updated_at = excluded.updated_at`,
      body.scope,
      decision.tokens,
      decision.updatedAt
    )

    return Response.json({
      allowed: decision.allowed,
      retryAfterSeconds: decision.retryAfterSeconds,
    })
  }
}

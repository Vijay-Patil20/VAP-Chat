/* global WebSocketPair */

import { DurableObject } from 'cloudflare:workers'
import { ChatLifecycle } from './utils/chatLifecycle.js'
import { normalizeChatCode } from './utils/chatCode.js'
import { RateLimiter } from './rateLimiter.js'
import { isChatFull } from './utils/participantLimit.js'
import {
  getRecentMessageTimestamps,
  isMessageRateLimited,
} from './utils/messageRateLimit.js'

export { RateLimiter }

const CHAT_CODE_CHARACTERS =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateChatCode() {
  const randomValues = new Uint32Array(6)

  crypto.getRandomValues(randomValues)

  let code = ''

  for (const value of randomValues) {
    code +=
      CHAT_CODE_CHARACTERS[
        value % CHAT_CODE_CHARACTERS.length
      ]
  }

  return code.slice(0, 3) + '-' + code.slice(3)
}

async function checkRateLimit(request, env, scope) {
  const clientAddress =
    request.headers.get('CF-Connecting-IP') ||
    'local-development'
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(clientAddress)
  )
  const clientKey = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')

  const limiterId = env.RATE_LIMITER.idFromName(clientKey)
  const limiter = env.RATE_LIMITER.get(limiterId)
  const response = await limiter.fetch(
    new Request('https://rate-limiter/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope }),
    })
  )
  const decision = await response.json()

  if (!response.ok || !decision.allowed) {
    const retryAfter = decision.retryAfterSeconds || 1

    return Response.json(
      {
        status: 'rate_limited',
        message: 'Too many requests. Please wait before trying again.',
        retryAfterSeconds: retryAfter,
      },
      {
        status: response.ok ? 429 : 503,
        headers: {
          'Retry-After': String(retryAfter),
        },
      }
    )
  }

  return null
}

export class ChatRoom extends DurableObject {
  createLifecycle() {
    return new ChatLifecycle(
      this.ctx.storage,
      () => this.ctx.getWebSockets()
    )
  }

  async fetch(request) {
    const url = new URL(request.url)
    const lifecycle = this.createLifecycle()

    if (url.pathname === '/initialize') {
      await lifecycle.initialize()

      return Response.json({
        status: 'created',
      })
    }

    if (url.pathname === '/status') {
      const active = await lifecycle.isActive()

      if (!active) {
        return Response.json(
          { status: 'not_found' },
          { status: 404 }
        )
      }

      const createdAt = await this.ctx.storage.get(
        'createdAt'
      )
      const activeConnections = this.ctx
        .getWebSockets()
        .filter((socket) => socket.readyState === WebSocket.OPEN)
        .length

      return Response.json({
        status: 'found',
        createdAt,
        activeConnections,
      })
    }

    if (url.pathname === '/websocket') {
      if (
        request.headers.get('Upgrade') !== 'websocket'
      ) {
        return new Response(
          'Expected WebSocket',
          { status: 400 }
        )
      }

      const active = await lifecycle.isActive()

      if (!active) {
        return Response.json(
          {
            status: 'not_found',
            message: 'Chat not found or expired.',
          },
          { status: 404 }
        )
      }

      const activeConnections = this.ctx
        .getWebSockets()
        .filter((socket) => socket.readyState === WebSocket.OPEN)
        .length

      if (isChatFull(activeConnections)) {
        return Response.json(
          {
            status: 'full',
            message: 'This chat already has two participants.',
          },
          { status: 409 }
        )
      }

      const webSocketPair = new WebSocketPair()
      const [client, server] = Object.values(webSocketPair)

      this.ctx.acceptWebSocket(server)
      server.serializeAttachment({
        messageTimestamps: [],
      })
      await lifecycle.touchActivity()

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    return new Response('Not Found', { status: 404 })
  }

  async alarm() {
    await this.createLifecycle().alarm()
  }

  async webSocketMessage(ws, message) {
    let data

    try {
      data =
        typeof message === 'string'
          ? JSON.parse(message)
          : JSON.parse(
              new TextDecoder().decode(message)
            )
    } catch {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format.',
      }))
      return
    }

    // Heartbeats keep the connection healthy but do not count as chat activity.
    if (data.type === 'ping') {
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString(),
      }))
      return
    }

    if (
      data.type !== 'message' ||
      typeof data.text !== 'string'
    ) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid chat message.',
      }))
      return
    }

    const text = data.text.trim()

    if (!text) {
      return
    }

    if (text.length > 2000) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Message cannot exceed 2000 characters.',
      }))
      return
    }

    const now = Date.now()
    const attachment = ws.deserializeAttachment() || {}
    const recentMessages = getRecentMessageTimestamps(
      attachment.messageTimestamps,
      now
    )

    if (isMessageRateLimited(recentMessages)) {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'RATE_LIMITED',
        message: 'You are sending messages too quickly. Please wait a few seconds.',
      }))
      return
    }

    recentMessages.push(now)
    ws.serializeAttachment({
      messageTimestamps: recentMessages,
    })

    // A valid message within the rate limit resets the inactivity timer.
    const active = await this.createLifecycle().isActive({
      touch: true,
    })

    if (!active) {
      return
    }

    const chatMessage = JSON.stringify({
      type: 'message',
      id: crypto.randomUUID(),
      senderId: data.senderId,
      text,
      timestamp: new Date().toISOString(),
    })

    for (const client of this.ctx.getWebSockets()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(chatMessage)
      }
    }
  }

  async webSocketClose(ws, code, reason) {
    console.log(
      'WebSocket closed: ' + code + ' ' + reason
    )
  }

  async webSocketError(ws, error) {
    console.error('WebSocket error:', error)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        service: 'vap-chat-backend',
      })
    }

    if (url.pathname === '/api/chat/create') {
      const rateLimitResponse = await checkRateLimit(
        request,
        env,
        'create'
      )

      if (rateLimitResponse) {
        return rateLimitResponse
      }

      const code = generateChatCode()
      const chatRoomId = env.CHAT_ROOM.idFromName(code)
      const chatRoom = env.CHAT_ROOM.get(chatRoomId)

      await chatRoom.fetch(
        new Request('https://chat-room/initialize', {
          method: 'POST',
        })
      )

      return Response.json({
        code,
        status: 'created',
      })
    }

    if (url.pathname === '/api/chat/join') {
      const rateLimitResponse = await checkRateLimit(
        request,
        env,
        'join'
      )

      if (rateLimitResponse) {
        return rateLimitResponse
      }

      const code = url.searchParams
        .get('code')
        ?.trim()
        .toUpperCase()

      const normalizedCode = normalizeChatCode(code)

      if (!normalizedCode) {
        return Response.json(
          {
            status: 'error',
            message: 'A valid chat code in XXX-XXX format is required.',
          },
          { status: 400 }
        )
      }

      const chatRoomId = env.CHAT_ROOM.idFromName(normalizedCode)
      const chatRoom = env.CHAT_ROOM.get(chatRoomId)
      const response = await chatRoom.fetch(
        new Request('https://chat-room/status')
      )

      if (!response.ok) {
        return Response.json(
          {
            status: 'not_found',
            message: 'Chat not found or expired.',
          },
          { status: 404 }
        )
      }

      const roomStatus = await response.json()

      if (
        isChatFull(roomStatus.activeConnections)
      ) {
        return Response.json(
          {
            status: 'full',
            message: 'This chat already has two participants.',
          },
          { status: 409 }
        )
      }

      return Response.json({
        code: normalizedCode,
        status: 'found',
      })
    }

    if (url.pathname === '/api/chat/ws') {
      const rateLimitResponse = await checkRateLimit(
        request,
        env,
        'websocket'
      )

      if (rateLimitResponse) {
        return rateLimitResponse
      }

      const code = url.searchParams
        .get('code')
        ?.trim()
        .toUpperCase()

      const normalizedCode = normalizeChatCode(code)

      if (!normalizedCode) {
        return Response.json(
          {
            status: 'error',
            message: 'A valid chat code in XXX-XXX format is required.',
          },
          { status: 400 }
        )
      }

      if (
        request.headers.get('Upgrade') !== 'websocket'
      ) {
        return new Response(
          'Expected WebSocket',
          { status: 400 }
        )
      }

      const chatRoomId = env.CHAT_ROOM.idFromName(normalizedCode)
      const chatRoom = env.CHAT_ROOM.get(chatRoomId)
      const statusResponse = await chatRoom.fetch(
        new Request('https://chat-room/status')
      )

      if (!statusResponse.ok) {
        return Response.json(
          {
            status: 'not_found',
            message: 'Chat not found or expired.',
          },
          { status: 404 }
        )
      }

      const roomStatus = await statusResponse.json()

      if (
        isChatFull(roomStatus.activeConnections)
      ) {
        return Response.json(
          {
            status: 'full',
            message: 'This chat already has two participants.',
          },
          { status: 409 }
        )
      }

      return chatRoom.fetch(
        new Request('https://chat-room/websocket', request)
      )
    }

    return new Response(
      'Not Found',
      { status: 404 }
    )
  },
}

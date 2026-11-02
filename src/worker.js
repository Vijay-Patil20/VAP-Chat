/* global WebSocketPair */

import { DurableObject } from 'cloudflare:workers'
import { ChatLifecycle } from './utils/chatLifecycle.js'
import { normalizeChatCode } from './utils/chatCode.js'

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

      return Response.json({
        status: 'found',
        createdAt,
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

      const webSocketPair = new WebSocketPair()
      const [client, server] = Object.values(webSocketPair)

      this.ctx.acceptWebSocket(server)
      await lifecycle.touchActivity()

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    return new Response(
      'VAP Chat Room is working.'
    )
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

    // A valid message resets the inactivity timer.
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

      return Response.json({
        code: normalizedCode,
        status: 'found',
      })
    }

    if (url.pathname === '/api/chat/ws') {
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

      return chatRoom.fetch(
        new Request('https://chat-room/websocket', request)
      )
    }


    return new Response(
      'VAP Chat backend is working.'
    )
  },
}

/* global WebSocketPair */

import { DurableObject } from 'cloudflare:workers'

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

  return `${code.slice(0, 3)}-${code.slice(3)}`
}

export class ChatRoom extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url)

    /*
     * Create / initialize chat
     */
    if (url.pathname === '/initialize') {
      const existingChat =
        await this.ctx.storage.get('createdAt')

      if (!existingChat) {
        await this.ctx.storage.put(
          'createdAt',
          new Date().toISOString()
        )
      }

      return Response.json({
        status: 'created',
      })
    }

    /*
     * Check whether chat exists
     */
    if (url.pathname === '/status') {
      const createdAt =
        await this.ctx.storage.get('createdAt')

      if (!createdAt) {
        return Response.json(
          {
            status: 'not_found',
          },
          { status: 404 }
        )
      }

      return Response.json({
        status: 'found',
        createdAt,
      })
    }

    /*
     * WebSocket connection
     */
    if (url.pathname === '/websocket') {
      if (
        request.headers.get('Upgrade') !==
        'websocket'
      ) {
        return new Response(
          'Expected WebSocket',
          { status: 400 }
        )
      }

      const webSocketPair =
        new WebSocketPair()

      const [client, server] =
        Object.values(webSocketPair)

      this.ctx.acceptWebSocket(server)

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    return new Response(
      'VAP Chat Room is working.'
    )
  }

  /*
   * Receive message from a connected client
   */
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
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid message format.',
        })
      )

      return
    }

    /*
     * Heartbeat
     *
     * The browser will periodically send
     * a "ping" message.
     *
     * The server responds with "pong"
     * to confirm that the connection is alive.
     */
    if (data.type === 'ping') {
      ws.send(
        JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString(),
        })
      )

      return
    }

    /*
     * Validate normal chat message
     */
    if (
      data.type !== 'message' ||
      typeof data.text !== 'string'
    ) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid chat message.',
        })
      )

      return
    }

    const text = data.text.trim()

    /*
     * Ignore empty messages
     */
    if (!text) {
      return
    }

    /*
     * Limit message length
     */
    if (text.length > 2000) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message:
            'Message cannot exceed 2000 characters.',
        })
      )

      return
    }

    /*
     * Create chat message
     */
    const chatMessage = JSON.stringify({
      type: 'message',
      id: crypto.randomUUID(),
      senderId: data.senderId,
      text,
      timestamp: new Date().toISOString(),
    })

    /*
     * Send message to everyone
     * in this chat room
     */
    for (const client of this.ctx.getWebSockets()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(chatMessage)
      }
    }
  }

  /*
   * Handle WebSocket close
   */
  async webSocketClose(
    ws,
    code,
    reason
  ) {
    console.log(
      `WebSocket closed: ${code} ${reason}`
    )
  }

  /*
   * Handle WebSocket error
   */
  async webSocketError(ws, error) {
    console.error(
      'WebSocket error:',
      error
    )
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    /*
     * Health check
     */
    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        service: 'vap-chat-backend',
      })
    }

    /*
     * Create chat
     */
    if (url.pathname === '/api/chat/create') {
      const code = generateChatCode()

      const chatRoomId =
        env.CHAT_ROOM.idFromName(code)

      const chatRoom =
        env.CHAT_ROOM.get(chatRoomId)

      await chatRoom.fetch(
        new Request(
          'https://chat-room/initialize',
          {
            method: 'POST',
          }
        )
      )

      return Response.json({
        code,
        status: 'created',
      })
    }

    /*
     * Join chat
     */
    if (url.pathname === '/api/chat/join') {
      const code = url.searchParams
        .get('code')
        ?.trim()
        .toUpperCase()

      if (!code) {
        return Response.json(
          {
            status: 'error',
            message:
              'Chat code is required.',
          },
          { status: 400 }
        )
      }

      const chatRoomId =
        env.CHAT_ROOM.idFromName(code)

      const chatRoom =
        env.CHAT_ROOM.get(chatRoomId)

      const response =
        await chatRoom.fetch(
          new Request(
            'https://chat-room/status'
          )
        )

      if (!response.ok) {
        return Response.json(
          {
            status: 'not_found',
            message: 'Chat not found.',
          },
          { status: 404 }
        )
      }

      return Response.json({
        code,
        status: 'found',
      })
    }

    /*
     * WebSocket chat connection
     */
    if (url.pathname === '/api/chat/ws') {
      const code = url.searchParams
        .get('code')
        ?.trim()
        .toUpperCase()

      if (!code) {
        return new Response(
          'Chat code is required.',
          { status: 400 }
        )
      }

      if (
        request.headers.get('Upgrade') !==
        'websocket'
      ) {
        return new Response(
          'Expected WebSocket',
          { status: 400 }
        )
      }

      const chatRoomId =
        env.CHAT_ROOM.idFromName(code)

      const chatRoom =
        env.CHAT_ROOM.get(chatRoomId)

      /*
       * Make sure the chat actually exists
       * before opening a WebSocket connection.
       */
      const statusResponse =
        await chatRoom.fetch(
          new Request(
            'https://chat-room/status'
          )
        )

      if (!statusResponse.ok) {
        return Response.json(
          {
            status: 'not_found',
            message: 'Chat not found.',
          },
          { status: 404 }
        )
      }

      /*
       * Forward the WebSocket request
       * to the Durable Object.
       */
      return chatRoom.fetch(
        new Request(
          'https://chat-room/websocket',
          request
        )
      )
    }

    /*
     * Backend test endpoint
     */
    if (url.pathname === '/api/chat/test') {
      const chatRoomId =
        env.CHAT_ROOM.idFromName(
          'TEST-ROOM'
        )

      const chatRoom =
        env.CHAT_ROOM.get(chatRoomId)

      return chatRoom.fetch(request)
    }

    return new Response(
      'VAP Chat backend is working.'
    )
  },
}
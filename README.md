# VAP Chat

VAP Chat is a temporary, anonymous messaging application for simple conversations without an account, name, email address, or phone number.

## Current capabilities

- Create a chat and receive a shareable random code.
- Join an existing chat using its code.
- Exchange messages in real time over WebSockets.
- Enforce a strict two-participant maximum per room.
- Limit each connection to five messages per rolling ten-second window.
- Allow at most three chat creations per minute per public IP (burst of three).
- Allow at most 20 join attempts and 20 WebSocket connection attempts per minute per public IP (burst of 20 for each route).
- Reconnect automatically after a temporary connection loss.
- Expire rooms after 15 minutes without chat activity.
- Close connected participants and clear room storage when a room expires.
- Responsive interface for desktop and mobile.

## How temporary chats work

A room's 15-minute inactivity window starts when it is created. The timer is reset when someone joins or reconnects, or when a valid non-empty chat message is sent.

WebSocket heartbeat pings do not count as activity. Simply leaving the chat open and reading messages does not keep it alive.

Cloudflare Durable Object Alarms perform expiry on the server, including when no browser is connected. When a room expires, connected sockets are closed and the Durable Object storage is cleared. Subsequent attempts to join receive a not-found response.

The current chat implementation broadcasts messages in real time but does not persist message history. Messages are therefore not available to users who join after they were sent or reconnect after missing them.

## Architecture

```text
React + Vite frontend
        |
        | same-origin HTTP and WebSocket requests
        v
Cloudflare Worker
        |
        | one Durable Object per chat code
        v
Chat Room Durable Object (SQLite storage)
        |
        +-- room creation and activity timestamps
        +-- 15-minute inactivity alarm
        +-- WebSocket connections and message broadcast
        +-- expiry and storage cleanup

Cloudflare Worker
        |
        | hashed client IP
        v
Rate Limiter Durable Object (SQLite storage)
        +-- strict token buckets for create, join, and WebSocket routes
```

## Local development

Requirements: Node.js 22.12+ (or a compatible newer LTS release) and npm.

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm test
npm run build
npm audit --omit=dev
```

## Deployment

The project uses the Cloudflare Vite plugin and Wrangler. Review the Cloudflare Worker and Durable Object configuration in `wrangler.jsonc` before deploying.

## Current limitations

- Chat messages are not persisted or replayed after reconnect.
- There is no participant authentication; possession of a valid chat code grants access.
- The 15-minute inactivity duration is currently a code constant and is not user-configurable.
- Requests from users sharing one public IP (for example, some mobile carrier or office networks) share that IP's API rate-limit buckets.

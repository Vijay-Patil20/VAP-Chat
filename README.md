# VAP Chat

VAP Chat is a temporary, anonymous messaging application for simple conversations without an account, name, email address, or phone number.

## Current capabilities

- Create a chat and receive a shareable random invite code.
- Join an existing chat using its invite code.
- Use 12-character invite codes formatted as `XXXX-XXXX-XXXX`, generated with cryptographic randomness and unbiased character selection.
- Never reuse a room ID after its room expires; a small expiry tombstone is retained by the Durable Object.
- Exchange messages in real time over WebSockets.
- Enforce a strict two-participant maximum per room.
- Limit each connection to five messages per rolling ten-second window.
- Chat creation has a per-public-IP burst capacity of three, replenishing one token every 20 seconds.
- Join and WebSocket connection attempts each have a per-public-IP burst capacity of 20, replenishing one token every three seconds.
- Reconnect automatically after a temporary connection loss.
- Expire rooms after 15 minutes without chat activity.
- Close connected participants and clear active room data when a room expires.
- Responsive interface for desktop and mobile.

## How temporary chats work

A room's 15-minute inactivity window starts when it is created. The timer is reset when someone joins or reconnects, or when a valid non-empty chat message is sent.

WebSocket heartbeat pings do not count as activity. Simply leaving the chat open and reading messages does not keep it alive.

Cloudflare Durable Object Alarms perform expiry on the server, including when no browser is connected. When a room expires, connected sockets are closed and active room data is cleared. A small `expiredAt` tombstone remains so the same Durable Object ID can never be initialized as a new room. Subsequent attempts to join receive a not-found response.

The current chat implementation broadcasts messages in real time but does not persist message history. Messages are therefore not available to users who join after they were sent or reconnect after missing them.

## Architecture

```text
React + Vite frontend
        |
        | same-origin HTTP and WebSocket requests
        v
Cloudflare Worker
        |
        | one Durable Object per invite code
        v
Chat Room Durable Object (SQLite storage)
        |
        +-- room creation and activity timestamps
        +-- permanent expiry tombstone
        +-- 15-minute inactivity alarm
        +-- WebSocket connections and message broadcast
        +-- active room data cleanup

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
- There is no participant authentication; possession of a valid invite code grants access.
- The 15-minute inactivity duration is currently a code constant and is not user-configurable.
- Expiry tombstones are intentionally retained to prevent room-ID reuse; they are tiny but accumulate over time.
- Requests from users sharing one public IP (for example, some mobile carrier or office networks) share that IP's API rate-limit buckets.

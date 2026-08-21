# aware-mq-core

Shared RabbitMQ messaging library for Project A.W.A.R.E services.

It wraps [`amqplib`](https://www.npmjs.com/package/amqplib) so that every service in the
platform talks to the broker the same way: one topic exchange, one event envelope format,
per-queue retry and dead-letter handling, and self-healing connections. Services should not
call `amqplib` directly — they import this package instead.

This is the reusable extraction of the prototype scripts in [message_queue/](../message_queue/).

---

## What it gives you

| Concern | Handled by | Behaviour |
| --- | --- | --- |
| Connecting to the broker | [connection.js](src/connection.js) | Connects, logs errors, auto-reconnects every 5s on failure or close |
| Publishing | [publisher.js](src/publisher.js) | Wraps your payload in a standard envelope, publishes persistently |
| Consuming | [consumer.js](src/consumer.js) | Binds a queue to routing keys, prefetch=1, idempotency hook, error routing |
| Retries / dead letters | [dlq.js](src/dlq.js) | Per-queue retry queue with TTL + per-queue DLQ, bounded retry count |
| Shared names & limits | [topology.js](src/topology.js) | Exchange names, retry TTL, max retries |

---

## Topology

Everything flows through a single durable **topic** exchange, `aware.events`. Services bind
their own durable queue to it with the routing keys (event types) they care about.

```
                       ┌────────────────────────┐
   publish(eventType)  │  aware.events (topic)  │
  ───────────────────► │                        │
                       └────┬──────────┬────────┘
                            │          │           routing key = eventType
                    ┌───────▼──┐  ┌────▼─────┐
                    │ svc-a.q  │  │ svc-b.q  │    durable queues, prefetch 1
                    └───┬──────┘  └──────────┘
                        │ handler throws
                        ▼
              ┌─────────────────────┐
              │ svc-a.q.retry       │  x-message-ttl: RETRY_TTL
              │ (delay queue)       │  dead-letters to "" → svc-a.q
              └─────────┬───────────┘
                        │ TTL expires → back to svc-a.q
                        │
                        │ retries exhausted (x-retry-count >= maxRetries)
                        ▼
              ┌─────────────────────┐      ┌──────────────────┐
              │ aware.events.dlx    │─────►│ svc-a.q.dlq      │
              │ (topic)             │ key: │ (terminal)       │
              └─────────────────────┘ svc-a.q.dead └──────────┘
```

Key points:

- **One exchange, many queues.** Adding a consumer never requires changing a publisher.
- **Failures are isolated per queue.** Each queue gets its own `.retry` and `.dlq`, so one
  service's poison messages can't block another's.
- **The retry queue is a delay queue.** Nothing consumes it. A message sits there for
  `RETRY_TTL` ms, then RabbitMQ dead-letters it back to the original queue via the default
  exchange (routing key = queue name).
- **Everything durable and persistent**, so a broker restart doesn't lose in-flight events.

---

## The event envelope

`createPublisher` never sends your raw payload. It wraps it:

```json
{
  "eventId":    "9f1c...-uuid",          // also set as AMQP messageId, use it to dedupe
  "eventType":  "order.created",         // also the routing key
  "occurredAt": "2026-08-21T10:12:03.44Z",
  "source":     "orders-service",        // serviceName passed to createPublisher
  "version":    1,                       // envelope schema version
  "data":       { "orderId": 1 }         // your payload
}
```

Consumers receive the parsed envelope, not the raw buffer. Read your payload from
`envelope.data` and dedupe on `envelope.eventId`.

---

## Retry and dead-letter flow

When a handler throws, `handleFailure` inspects the `x-retry-count` header:

1. **`retryCount < maxRetries`** → republish to `<queue>.retry` with `x-retry-count + 1`,
   then `ack` the original. The message reappears on the main queue after `RETRY_TTL` ms.
2. **`retryCount >= maxRetries`** → publish to the DLX with routing key `<queue>.dead`,
   which lands it in `<queue>.dlq`, then `ack` the original.

The original message is always acked — the message is never lost, it just moves. Nothing is
`nack`ed back onto the head of the queue, so a single bad message can never spin the
consumer. Terminal failures accumulate in the DLQ for manual inspection or replay.

---

## Install

The package is consumed from within this repo, so reference it by path:

```bash
npm install ../aware-mq-core     # or use an npm/pnpm workspace
```

It requires `amqplib` and Node with ESM enabled (`"type": "module"`).

---

## Usage

### Publishing

```js
import { createConnection, createPublisher } from 'aware-mq-core';

const conn = createConnection('orders-service');
const channel = await conn.connect();

const publish = createPublisher(channel, 'orders-service');

const eventId = publish('order.created', { orderId: 1, total: 4200 });
```

### Consuming

```js
import { createConnection, createConsumer } from 'aware-mq-core';

const conn = createConnection('billing-service');
const channel = await conn.connect();

const subscribe = createConsumer(channel, 'billing-service', {
  // optional idempotency hooks — back these with Redis/Postgres in production
  checkIdempotency: async (eventId) => seen.has(eventId),
  markProcessed:    async (eventId) => { seen.add(eventId); },
});

await subscribe(
  'billing-service.q',              // queue name (its .retry/.dlq derive from this)
  ['order.created', 'order.paid'],  // routing keys to bind
  async (envelope) => {
    await chargeCustomer(envelope.data);   // throw to trigger retry/DLQ
  },
  { maxRetries: 3 }
);
```

Wildcards work as in any RabbitMQ topic exchange: `order.*` matches one segment,
`order.#` matches one or more.

---

## API

### `createConnection(serviceName, url?)`

`url` defaults to `process.env.RABBITMQ_URL`, then `amqp://localhost`.

- `connect(): Promise<Channel>` — connects (retrying every 5s until it succeeds), creates a
  channel, and registers `error`/`close` handlers that reconnect automatically.
- `getChannel(): Channel` — returns the live channel, throws `channel not ready` if the
  connection is currently down.

### `createPublisher(channel, serviceName) → publish(eventType, data) → eventId`

Builds the envelope, publishes to `aware.events` with `eventType` as the routing key,
`persistent: true`, `messageId: eventId`, `contentType: application/json`. Returns the
`eventId` so callers can correlate.

### `createConsumer(channel, serviceName, { checkIdempotency, markProcessed }) → subscribe(...)`

`subscribe(queueName, routingKeys, handler, { maxRetries = 3 })`:

- asserts `queueName` durable and binds each routing key on `aware.events`
- calls `setupDlq` to create `<queueName>.retry` and `<queueName>.dlq`
- sets `prefetch(1)` so one message is in flight per consumer
- for each message: parses the envelope → if `checkIdempotency(eventId)` is truthy, acks and
  skips → otherwise runs `handler(envelope)` → `markProcessed(eventId)` → ack
- on a thrown handler: logs and delegates to `handleFailure`

Both idempotency hooks are optional. Omit them and every message is processed as new.

### `setupDlq(channel, queueName) → { dlqName, retryQueueName }`

Idempotent. Asserts the DLX, the queue's DLQ (bound with `<queueName>.dead`), and the
TTL'd retry queue. Called for you by `subscribe`; call it directly only if you're writing a
custom consumer loop.

### `handleFailure(channel, msg, { queueName, dlqName, retryQueueName, maxRetries })`

The retry-or-dead-letter decision described above. Call it from the `catch` block of a
custom consumer.

### `topology`

```js
{
  EXCHANGE:    'aware.events',
  DLX:         'aware.events.dlx',
  RETRY_TTL:   10000,   // ms a message waits in the retry queue
  MAX_RETRIES: 3
}
```

> Changing `RETRY_TTL` changes the `x-message-ttl` argument on retry queues. RabbitMQ won't
> redeclare an existing queue with different arguments — delete the old `.retry` queues
> before deploying a new TTL.

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `RABBITMQ_URL` | `amqp://localhost` | Broker connection string |

Local broker for development:

```bash
docker run -d --name aware-rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management
# management UI: http://localhost:15672  (guest/guest)
```

---

## Operational notes

- **Prefetch is 1.** Throughput scales by running more consumer processes, not by batching.
- **Consumers create their own topology.** Start a consumer before publishing the first
  event of a type, or messages published to unbound routing keys are silently dropped by the
  exchange.
- **Draining a DLQ** is a manual operation: consume `<queue>.dlq`, fix or discard, and
  republish to `aware.events` with the original `eventType`.
- **Idempotency is your job.** The library gives you the hooks and a stable `eventId`; an
  in-memory `Set` is fine for development but loses state on restart.

---

## Status / known gaps

This package was split out of the prototype scripts and hasn't been wired up end-to-end yet.
Before first use:

- [src/consumer.js](src/consumer.js#L37) ends with `module.exports = { createConsumer }` in an
  ESM module — needs `export { createConsumer }`.
- [src/topology.js](src/topology.js) uses a default export, but
  [consumer.js](src/consumer.js#L2), [publisher.js](src/publisher.js#L2) and
  [dlq.js](src/dlq.js#L2) import `{ EXCHANGE }` / `{ DLX, RETRY_TTL }` as named bindings.
  Either add named exports to `topology.js` or import the default and destructure.
- [src/dlq.js:27](src/dlq.js#L27) references `RETRY_TTL_MS`, but the import is `RETRY_TTL`.
- [index.js](index.js#L2-L3) imports `{ createPublisher }` and `{ createConsumer }` as named,
  while `publisher.js` exports a default.
- [package.json](package.json#L2) still has the placeholder name `"y"` and no `amqplib`
  dependency declared.
- `RETRY_TTL` is commented `// 1 minute` but set to `10000` (10 seconds).
- There are no tests (`npm test` exits 1).

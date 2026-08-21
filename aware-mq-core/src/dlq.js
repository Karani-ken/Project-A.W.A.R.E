
import { DLX, RETRY_TTL } from './topology.js';

/**
 * Sets up the dead-letter infrastructure for a given service queue:
 * - a DLQ specific to that queue (so each service's failures are isolated)
 * - a retry queue with TTL that bounces messages back via the DLX
 *
 * Call this once per queue, right after asserting the queue itself.
 */
async function setupDlq(channel, queueName) {
  const dlqName = `${queueName}.dlq`;
  const retryQueueName = `${queueName}.retry`;

  // Dead-letter exchange — shared across the whole platform, fanout is fine
  // since each service's DLQ binds to it with its own routing, keeping failures isolated per queue.
  await channel.assertExchange(DLX, 'topic', { durable: true });

  // Final DLQ for this specific queue
  await channel.assertQueue(dlqName, { durable: true });
  await channel.bindQueue(dlqName, DLX, `${queueName}.dead`);

  // Retry/delay queue for this specific queue
  await channel.assertQueue(retryQueueName, {
    durable: true,
    arguments: {
      'x-message-ttl': RETRY_TTL_MS,
      'x-dead-letter-exchange': '',       // default exchange
      'x-dead-letter-routing-key': queueName, // bounces back to the original queue by name
    },
  });

  return { dlqName, retryQueueName };
}

/**
 * Sends a failed message either to the retry queue (if under the limit)
 * or permanently to the DLQ (if retries exhausted).
 * Call this from your consumer's catch block.
 */
function handleFailure(channel, msg, { queueName, dlqName, retryQueueName, maxRetries }) {
  const retryCount = msg.properties.headers?.['x-retry-count'] || 0;

  if (retryCount < maxRetries) {
    channel.sendToQueue(retryQueueName, msg.content, {
      persistent: true,
      messageId: msg.properties.messageId,
      headers: { ...msg.properties.headers, 'x-retry-count': retryCount + 1 },
    });
    channel.ack(msg); // remove from main queue, it now lives in retry
  } else {
    // publish to DLX with the .dead routing key so it lands in dlqName
    channel.publish(DLX, `${queueName}.dead`, msg.content, {
      persistent: true,
      messageId: msg.properties.messageId,
      headers: msg.properties.headers,
    });
    channel.ack(msg); // remove from main queue, it's now in the DLQ
  }
}

export { setupDlq, handleFailure };
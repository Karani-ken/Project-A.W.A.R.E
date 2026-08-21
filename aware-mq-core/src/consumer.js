// aware-mq-core/src/consumer.js — updated to use dlq.js
import { EXCHANGE } from './topology.js';
import { setupDlq, handleFailure } from './dlq.js';
function createConsumer(channel, serviceName, { checkIdempotency, markProcessed } = {}) {
  return async function subscribe(queueName, routingKeys, handler, { maxRetries = 3 } = {}) {
    await channel.assertQueue(queueName, { durable: true });
    for (const key of routingKeys) {
      await channel.bindQueue(queueName, EXCHANGE, key);
    }

    const { dlqName, retryQueueName } = await setupDlq(channel, queueName);
    channel.prefetch(1);

    channel.consume(queueName, async (msg) => {
      if (!msg) return;
      const envelope = JSON.parse(msg.content.toString());

      try {
        if (checkIdempotency && (await checkIdempotency(envelope.eventId))) {
          console.log(`[${serviceName}] duplicate ${envelope.eventId} — skipping`);
          channel.ack(msg);
          return;
        }

        await handler(envelope);

        if (markProcessed) await markProcessed(envelope.eventId);
        channel.ack(msg);
      } catch (err) {
        console.error(`[${serviceName}] handler failed for ${envelope.eventType}:`, err.message);
        handleFailure(channel, msg, { queueName, dlqName, retryQueueName, maxRetries });
      }
    });
  };
}

module.exports = { createConsumer };
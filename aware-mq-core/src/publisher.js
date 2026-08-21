import { randomUUID } from 'crypto';
import { EXCHANGE } from './topology.js';

function createPublisher(channel, serviceName) {
  return function publish(eventType, data) {
    const envelope = {
      eventId: randomUUID(),
      eventType,
      occurredAt: new Date().toISOString(),
      source: serviceName,
      version: 1,
      data,
    };

    channel.publish(EXCHANGE, eventType, Buffer.from(JSON.stringify(envelope)), {
      persistent: true,
      messageId: envelope.eventId,
      contentType: 'application/json',
    });

    console.log(`[${serviceName}] published ${eventType}`, envelope.eventId);
    return envelope.eventId;
  };
}

export default createPublisher;
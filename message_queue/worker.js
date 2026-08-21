import { connect, getChannel } from "./mq.js";
import logger from "./logger.js";
const processedIds = new Set();

async function startWorker(queueName){
    await connect();
    const channel = await getChannel();
    await channel.assertQueue(queueName, { durable: true } );

    console.log(`[*] ${queueName} waiting for message`);

    channel.consume(queueName, (msg) => {
        if(msg === null) return;
        const id = msg.properties.messageId;
        logger.info({queue: queueName, messageId: id, event: msg.content.toString()}, 'Received message');

        if(!id){
            logger.warn({queue: queueName, messageId: id}, 'message has no messageId — cannot dedupe, processing anyway');
        } else if(processedIds.has(id)){
            logger.info({queue: queueName, messageId: id}, 'duplicate detected — skipping, ack only');
            channel.ack(msg);
            return;
        }
          logger.info({queue: queueName, messageId: id}, `processing: ${msg.content.toString()}`);
          // real work would be done here
          if(id) processedIds.add(id);
          channel.ack(msg);
        
    }, {noAck: false})
}

const queueName = process.argv[2];
if(!queueName){
  console.error('Usage: node worker.js <queue-name>');
  process.exit(1);
}

startWorker(queueName).catch(console.error);
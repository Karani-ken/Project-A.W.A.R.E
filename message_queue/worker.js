import { connect, getChannel } from "./mq.js";

async function startWorker(queueName){
    await connect();
    const channel = await getChannel();
    await channel.assertQueue(queueName, { durable: true } );

    console.log(`[*] ${queueName} waiting for message`);

    channel.consume(queueName, (msg) => {
        if(msg !== null){
            console.log(`[${queueName}] recieved: ${msg.content.toString()}`);
            channel.ack(msg);
        }
        
    }, {noAck: false})
}

const queueName = process.argv[2];
if(!queueName){
  console.error('Usage: node worker.js <queue-name>');
  process.exit(1);
}

startWorker(queueName).catch(console.error);
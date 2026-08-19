import { connect, getChannel } from './mq.js';

async function recieveMessages(queue){
    await connect(); //waits for connection and channel to be established
    const channel = await getChannel();

 await  channel.assertQueue(queue, {durable:true});

 //don't dispatch a new message to a worker until it's acked the previous one
 channel.prefetch(1);

  console.log(`[*] Waiting for messages in ${queue}. To exit press CTRL+C`);

  channel.consume(
    queue,
    (msg) => {
        if (msg !== null){
            console.log(`[x] Recieved: ${msg.content.toString()}`);
            channel.ack(msg);// acknowledge - removes it from the queue
        }
    },
    {noAck: false}
  );
}
const queue = 'task_queue'
recieveMessages(queue).catch(console.error);
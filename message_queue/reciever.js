import { connect, getChannel, setUpQueues } from './mq.js';

async function recieveMessages(){
    await connect(); //waits for connection and channel to be established
    const channel = await getChannel();
    const { MAIN_QUEUE } = await setUpQueues(channel);


 //don't dispatch a new message to a worker until it's acked the previous one
 channel.prefetch(1);

  console.log(`[*] Waiting for messages in ${MAIN_QUEUE}. To exit press CTRL+C`);

  channel.consume(
    MAIN_QUEUE,
    (msg) => {
        if (msg === null) return;

        try {
            const content = msg.content.toString();
            console.log(`[x] Received: ${content}`);

            // simulate a processing failure for testing — remove this later
            if (content.includes('fail')) {
                throw new Error('simulated processing failure');
            }
            channel.ack(msg)

        } catch (error) {
            console.error(`[!] Processing failed: ${error.message} — dead-lettering message`);
            channel.nack(msg, false, false); // requeue: false → goes to DLQ
        }
        
           
    },
    {noAck: false}
  );
}

recieveMessages().catch(console.error);
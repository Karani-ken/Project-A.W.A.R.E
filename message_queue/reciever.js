import { connect, getChannel, setUpQueues } from './mq.js';

async function recieveMessages(){
    await connect(); //waits for connection and channel to be established
    const channel = await getChannel();
    const { MAIN_QUEUE, RETRY_QUEUE, MAX_RETRIES } = await setUpQueues(channel);


 //don't dispatch a new message to a worker until it's acked the previous one
 channel.prefetch(1);

  console.log(`[*] Waiting for messages in ${MAIN_QUEUE}. To exit press CTRL+C`);

  channel.consume(
    MAIN_QUEUE,
    (msg) => {
        if (msg === null) return;
        const content = msg.content.toString();

        //TRACK retry count via a header we stamp ourselves
        const retryCount = (msg.properties.headers && msg.properties.headers['x-retry-count']) || 0;

        try {            
            console.log(`[x] Received: ${content}`);

            // simulate a processing failure for testing — remove this later
            if (content.includes('fail')) {
                throw new Error('simulated processing failure');
            }
            channel.ack(msg)

        } catch (error) {
            if(retryCount < MAX_RETRIES) {
                console.error(`[!] Failed (attempt ${retryCount + 1}/${MAX_RETRIES}) — sending to retry queue`);
                channel.sendToQueue(RETRY_QUEUE, msg.content, {
                    persistent: true,
                    headers: {'x-retry-count': retryCount + 1}
                });
                channel.ack(msg); //remove from main queue - it now lives in the retry queue
            }else{
                console.error(`[!] Exhausted ${MAX_RETRIES} retries — dead-lettering permanently`);
                channel.nack(msg, false, false); // now truly goes to DLX → DLQ
            }
           
        }
        
           
    },
    {noAck: false}
  );
}

recieveMessages().catch(console.error);
import {connect, getChannel, setUpQueues} from './mq.js'

async function sendMessage(message) {
    await connect(); //waits for connection and channel to be established
    const channel = await getChannel();
    const { MAIN_QUEUE } = await setUpQueues(channel);
    
    channel.sendToQueue(MAIN_QUEUE, Buffer.from(message),{persistent: true})
    console.log(`[x] Sent: ${message}`);

  setTimeout(() => process.exit(0), 500)

}

// allow passing a custom message from the command line
const arg = process.argv[2];
sendMessage(arg || 'Hello, RabbitMQ!').catch(console.error);

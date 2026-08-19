import {connect, getChannel} from './mq.js'

async function sendMessage(queue, message) {
    await connect(); //waits for connection and channel to be established
    const channel = await getChannel();

    //derable: true means the queue survives a RabbitMQ restart
    await channel.assertQueue(queue, {durable: true})
    
    channel.sendToQueue(queue, Buffer.from(message),{persistent: true})
    console.log(`[x] Sent: ${message}`);

    //give it a moment to flush before closing
    setTimeout(() => {
        process.exit(0)
    }, 500)

}

const queue = 'task_queue';
const message = 'Hello, RabbitMQ!'

sendMessage(queue, message).catch(console.error)
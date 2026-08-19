import amqp from 'amqplib'

let connection = null;
let channel = null;

async function connect(){
    try {
        connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
        connection.on('error', (err) => {
            console.error('[AMQP], connection error:', err.message)
        })
        connection.on('close', () => {
            console.error('[AMQP], connection closed, reconnecting in 5s...')
            channel = null;
            setTimeout(connect, 5000)
        })

        channel = await connection.createChannel();
        console.log('[AMQP] connected and channel ready');
        return channel;

    } catch (error) {
        console.error('[AMQP], failed to connect, retrying in 5s...:', error.message)
        await new Promise(resolve => setTimeout(resolve, 5000));
        //loop until we get a connection
    }
}

function getChannel(){
    if(!channel){
        throw new Error('Channel is not created yet. Call connect() first.');
    }
    return channel;
}

async function setUpQueues(channel){
    const DLX = 'dlx.task_queue';
    const DLQ = 'task_queue.dlq';
    const MAIN_QUEUE = 'task_queue';

    //1. Create the dead-letter exchange (fanout is simplest - just routes to DLQ)
    await channel.assertExchange(DLX, 'fanout', {durable: true});

    //2. Create a dead-letter queue and bind it to the DLX
    await channel.assertQueue(DLQ, {durable: true});
    await channel.bindQueue(DLQ, DLX, '');

    //3. CREATE THE MAIN queue, telling it to dead-letter into DLX on rejection
    await channel.assertQueue(MAIN_QUEUE, {
        durable: true,
        arguments: {
            'a-dead-letter-exchange': DLX,
        },
    });

    return {MAIN_QUEUE, DLQ, DLX}
}

export { connect, getChannel, setUpQueues };
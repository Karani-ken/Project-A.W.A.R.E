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
     const MAIN_QUEUE = 'task_queue';
    const DLX = 'dlx.task_queue';
    const DLQ = 'task_queue.dlq';
    const RETRY_QUEUE = 'task_queue.retry';
    const RETRY_TTL_MS = 10000; // 10s wait before retry
    const MAX_RETRIES = 3;   

    //1. Create the dead-letter exchange (fanout is simplest - just routes to DLQ)
    await channel.assertExchange(DLX, 'fanout', {durable: true});

    //2. Create a dead-letter queue and bind it to the DLX
    await channel.assertQueue(DLQ, {durable: true});
    await channel.bindQueue(DLQ, DLX, '');

    //retry queue: no consumer ever reads this directly.
    //messages just sit here until TTL expires, then get dead-lettered
    //back to the MAIN_QUEUE automatically
    await channel.assertQueue(RETRY_QUEUE, {
        durable: true,
        arguments:{
            'x-message-ttl': RETRY_TTL_MS,
            'x-dead-letter-exchange': '', // ''= default exchange
            'x-dead-letter-routing-key': MAIN_QUEUE // routes back to task_queue by name
        }
    })

    //3. CREATE THE MAIN queue, telling it to dead-letter into DLX on rejection
    await channel.assertQueue(MAIN_QUEUE, {
        durable: true,
        arguments: {
            'a-dead-letter-exchange': DLX,
        },
    });

    return {MAIN_QUEUE, RETRY_QUEUE, DLQ, DLX, MAX_RETRIES}
}

async function setupFanoutExchange(channel) {
    const EXCHANGE = 'orders.fanout';

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true })
    //Each service gets it's own queue, all bound to the same exchange
    const queues = ['orders.inventory', 'orders.email', 'orders.analytics'];

    for (const q of queues){
        await channel.assertQueue(q, {durable: true});
        await channel.bindQueue(q, EXCHANGE, '') // ''routing ket ignored for fanout
    }

    return { EXCHANGE, queues }
}

async function setTopicExchange(channel){
    const EXCHANGE = 'orders.topic';
    await channel.assertExchange(EXCHANGE, 'topic', {durable: true});

    return {EXCHANGE};
}

async function bindTopicQueues(channel, exchange){
    //inventory only cares about new orders
    await channel.assertQueue('topic.inventory', {durable: true});
    await channel.bindQueue('topic.inventory', exchange, 'order.created');

    //finance cares about anything payment related
    await channel.assertQueue('topic.finance', {durable: true});
    await channel.bindQueue('topic.finance', exchange, 'payment.*');

    //audit logs care about everything
    await channel.assertQueue('topic.audit', {durable: true});
    await channel.bindQueue('topic.audit', exchange, '#'); // # = wildcard for all routing keys

    return ['topic.inventory', 'topic.finance', 'topic.audit'];
}
export { connect, getChannel, setUpQueues, setupFanoutExchange, setTopicExchange, bindTopicQueues };
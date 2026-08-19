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

export { connect, getChannel };
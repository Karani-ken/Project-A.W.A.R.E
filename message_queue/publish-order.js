import { connect, getChannel, setupFanoutExchange } from "./mq.js";

async function publishOrder() {
    await connect();
    const channel = getChannel();
    const {EXCHANGE} = await setupFanoutExchange(channel);

    const order = JSON.stringify({orderId:1001, item: 'Widget', qty: 5});

    //publish (not sendToQueue) -- goes to the exchange, exchange fans it out
    channel.publish(EXCHANGE, '', Buffer.from(order), { persistent: true } );
    console.log(`[x] Published order: ${order}`);

    setTimeout(() => process.exit(0), 500)
}

publishOrder().catch(console.error)
import { connect, getChannel, setTopicExchange, bindTopicQueues } from "./mq.js";

async function publishEvent(routingKey, payload) {
    await connect();
    const channel = await getChannel();
    const {EXCHANGE} = await setTopicExchange(channel);

    await bindTopicQueues(channel, EXCHANGE);// ensure queue exists before publishing
    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)),{
        persistent: true
    });

    console.log(`[x] Published "${routingKey}":`, payload);

    setTimeout(() => process.exit(0), 500);
}

//usage: node publish-event.js order.created '{"orderId": 1}
const routingKey = process.argv[2];
const payload = process.argv[3] ? JSON.parse(process.argv[3]) : {};

if(!routingKey){
    console.error('Usage: node publish-event.js <routing-key> [json-payload]');
    process.exit(1);
}

publishEvent(routingKey, payload).catch(console.error);
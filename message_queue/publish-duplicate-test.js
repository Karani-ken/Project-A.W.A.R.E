// quick test script: publish-duplicate-test.js
import { connect, getChannel, setTopicExchange, bindTopicQueues } from "./mq.js";

async function run() {
  await connect();
  const channel = await getChannel();
  const { EXCHANGE } = await setTopicExchange(channel);
  await bindTopicQueues(channel, EXCHANGE);

  const fixedId = 'test-duplicate-12345';
  const payload = Buffer.from(JSON.stringify({ test: true }));

  channel.publish(EXCHANGE, 'order.created', payload, { persistent: true, messageId: fixedId });
  channel.publish(EXCHANGE, 'order.created', payload, { persistent: true, messageId: fixedId });

  console.log('Published the same messageId twice');
  setTimeout(() => process.exit(0), 500);
}

run().catch(console.error);
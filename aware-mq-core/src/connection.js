import amqp from 'amqplib';


function createConnection(serviceName, url = process.env.RABBITMQ_URL || 'amqp://localhost') {
  let connection = null;
  let channel = null;

  async function connect() {
    while (true) {
      try {
        connection = await amqp.connect(url);
        connection.on('error', (err) =>
          console.error(`[${serviceName}] AMQP error:`, err.message)
        );
        connection.on('close', () => {
          console.error(`[${serviceName}] AMQP closed, reconnecting in 5s...`);
          channel = null;
          setTimeout(connect, 5000);
        });
        channel = await connection.createChannel();
        console.log(`[${serviceName}] AMQP connected`);
        return channel;
      } catch (err) {
        console.error(`[${serviceName}] connect failed, retrying in 5s:`, err.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  function getChannel() {
    if (!channel) throw new Error(`[${serviceName}] channel not ready`);
    return channel;
  }

  return { connect, getChannel };
}

export default createConnection;
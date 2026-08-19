# Message Queue
## Key Concepts
1. Connection - A connection is a TCP connection between your Node.js application and the RabbitMQ broker. It is established using the `amqplib` library.
2. Channel - A channel is a virtual connection inside a connection. It is used to send and receive messages. Channels are lightweight and can be created and closed frequently.
3. Queue - A queue is a buffer that stores messages. Producers send messages to queues, and consumers receive messages from queues. Queues are durable and can survive broker restarts.
4. Buffer - A buffer is a temporary storage area for data. In the context of message queues, buffers are used to hold messages before they are sent to the queue or after they are received from the queue.
5. Message - A message is a piece of data that is sent from a producer to a consumer through a queue. Messages can be in various formats, such as JSON, XML, or plain text.
6. durable - A durable queue is a queue that will survive a broker restart. Messages sent to a durable queue will be persisted to disk, ensuring that they are not lost in case of a failure.
7. persistent - A persistent message is a message that will be saved to disk by the broker. This ensures that the message is not lost in case of a broker failure. Persistent messages are typically used in conjunction with durable queues.
8. ack/noAck - Acknowledgment (ack) is a signal sent by a consumer to the broker indicating that a message has been successfully processed. If a message is not acknowledged (noAck), it will be re-delivered to another consumer or the same consumer if it fails to process it.
9. prefetch - Prefetch is a setting that controls how many messages a consumer can receive at once. It allows you to limit the number of unacknowledged messages that a consumer can have, preventing it from being overwhelmed with too many messages at once.


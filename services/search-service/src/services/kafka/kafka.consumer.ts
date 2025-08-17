import { consumer, es } from "../../config";

export async function startKafkaConsumers() {
  await consumer.connect();

  await consumer.subscribe({ topic: "users", fromBeginning: true });
  await consumer.subscribe({ topic: "messages", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString());

      if (topic === "users") {
        if (event.event === "userCreated") {
          await es.index({
            index: "users-v1",
            id: event.data._id,
            document: event.data,
          });
        } else if (event.event === "userUpdated") {
          await es.update({
            index: "users-v1",
            id: event.data._id,
            doc: event.data,
          });
        } else if (event.event === "userDeleted") {
          await es.delete({
            index: "users-v1",
            id: event.data._id,
          });
        }
      }

      if (topic === "messages") {
        if (event.event === "messageCreated") {
          await es.index({
            index: "messages-v1",
            id: event.data._id,
            document: event.data,
          });
        } else if (event.event === "messageDeleted") {
          await es.delete({
            index: "messages-v1",
            id: event.data._id,
          });
        }
      }
    },
  });
}

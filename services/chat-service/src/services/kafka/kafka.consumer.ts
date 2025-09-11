import { consumer } from "../../config";
import {
  deleteLRU,
  deleteRedis,
  getLRU,
  getRedis,
  setLRU,
  setRedis,
} from "../../utils/cache.util";

export async function startKafkaConsumers() {
  await consumer.connect();
  await consumer.subscribe({ topic: "users", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString());

      if (topic === "users") {
        if (event.event === "userUpdated") {
          const cache = getLRU(event.data._id);
          if (cache) setLRU(event.data._id, event.data);

          const redis = await getRedis(`user:${event.data._id}`);
          if (redis) await setRedis(`user:${event.data._id}`, event.data);
        } else if (event.event === "userDeleted") {
          deleteLRU(event.data._id);
          await deleteRedis(`user:${event.data._id}`);
        } else if (event.event === "userNameUpdated") {
          deleteLRU(event.data.oldUsername);
          await deleteRedis(`user:${event.data.oldUsername}`);

          setLRU(event.data.newUsername, event.data._id);
          await setRedis(`user:${event.data.newUsername}`, event.data._id);
        }
      }
    },
  });
}

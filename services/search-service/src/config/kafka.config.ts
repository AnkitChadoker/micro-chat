import { Kafka } from "kafkajs";

export const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "microchat",
  brokers: ["localhost:9092"],
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: "search-service" });

export async function connectKafka() {
  await producer.connect();
  await consumer.connect();
  console.log("✅ Kafka connected");
}

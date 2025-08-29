import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import route from "./routes";
import { startKafkaConsumers } from "./services/kafka/kafka.consumer";
import { connectKafka } from "./config";

const app = express();
dotenv.config();
app.use(cors());
app.use(bodyParser.json());

app.use("/", route);

const PORT = process.env.PORT || 3003;

(async () => {
  try {
    await connectKafka(); // ✅ Connect to Kafka first
  } catch (err) {
    console.error("❌ Failed to connect Kafka", err);
    process.exit(1); // Exit if Kafka isn't available
  }
})();

app.listen(PORT, async () => {
  console.log(`🚀 Search service running on http://localhost:${PORT}`);
  // await startKafkaConsumers();
});

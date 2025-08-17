import express, { Application } from "express";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import morgan from "morgan";
import router from "./routes";
import { connectDB, connectKafka } from "./config";
import { errorHandler } from "./middlewares/error-handler.middleware";
import { startGrpcServer } from "./grpc-server";

dotenv.config();
connectDB();
const app: Application = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(compression());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_, res) => {
  res.send("Auth service is running");
});

app.use("/", router);
app.use(errorHandler);

(async () => {
  try {
    await connectKafka(); // ✅ Connect to Kafka first
    app.listen(4000, () => console.log("Auth-service running on 4000 🚀"));
  } catch (err) {
    console.error("❌ Failed to connect Kafka", err);
    process.exit(1); // Exit if Kafka isn't available
  }
})();

app.listen(PORT, async () => {
  console.log(`Auth service is running on http://localhost:${PORT}`);
  startGrpcServer();
});

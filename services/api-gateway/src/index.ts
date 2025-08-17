import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import proxyRoutes from "./routes/proxy.route";

dotenv.config();
const app: Application = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(helmet());
app.use(compression());

app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: Number(config.rateLimit.windowMs),
  max: Number(config.rateLimit.max),
  message: "Too many requests, please try again later.",
});
app.use(limiter);

app.get("/", (req, res) => {
  res.send("API Gateway is running!");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "API Gateway",
  });
});

app.use("/api", proxyRoutes);

//** since we are not handling the post request in the gateway directly we do not need it or if we may need it in future we have to use it after the proxy routes. */
// app.use(express.json());

app.listen(PORT, () => {
  console.log(`API Gateway is running on http://localhost:${PORT}`);
});
export default app;

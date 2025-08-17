import { Router } from "express";
import chatRoute from "./chat.route";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();
router.use("/chat", authMiddleware, chatRoute);

export default router;

import { Router } from "express";
import roomRoute from "./room.route";
import messageRoute from "./message.route";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();
router.use("/room", authMiddleware, roomRoute);
router.use("/message", authMiddleware, messageRoute);

export default router;

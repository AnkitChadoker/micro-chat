import { Router } from "express";
import roomRoute from "./room.route";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();
router.use("/room", authMiddleware, roomRoute);

export default router;

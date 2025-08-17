import { Router } from "express";
import loginRoute from "./auth.route";
import profileRoute from "./profile.route";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();
router.use("/", loginRoute);
router.use("/profile", authMiddleware, profileRoute);

export default router;

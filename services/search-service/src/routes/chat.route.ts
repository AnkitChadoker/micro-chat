import { Router } from "express";
import { search } from "../controllers/chat.controller";

const router = Router();

router.get("/", search);

export default router;

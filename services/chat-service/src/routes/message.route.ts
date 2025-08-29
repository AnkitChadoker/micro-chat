import { Router } from "express";
import { send } from "../controllers/message.controller";

const router = Router();

router.post("/send/:roomId", send);
// router.post("/create-group", createGroup);
// router.put("/update-group/:id", updateGroup);
// router.get("/members/:id", members);

export default router;

import { Router } from "express";
import {
  list,
  react,
  reactions,
  send,
} from "../controllers/message.controller";

const router = Router();

router.post("/list/:roomId", list);
router.post("/send/:roomId", send);
router.put("/:messageId/react", react);
router.post("/:messageId/reactions", reactions);
// router.post("/create-group", createGroup);
// router.put("/update-group/:id", updateGroup);
// router.get("/members/:id", members);

export default router;

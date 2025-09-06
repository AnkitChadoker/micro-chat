import { Router } from "express";
import {
  clearChat,
  deleteForEveryone,
  deleteForMe,
  jumpOnMessage,
  list,
  pin,
  pinnedMessages,
  react,
  reactions,
  send,
  star,
  starredMessages,
} from "../controllers/message.controller";

const router = Router();

router.post("/list/:roomId", list);
router.post("/jump-on-message/:roomId", jumpOnMessage);
router.post("/send/:roomId", send);
router.put("/:messageId/react", react);
router.post("/:messageId/reactions", reactions);

router.put("/:messageId/pin", pin);
router.post("/pinned-messages/:roomId", pinnedMessages);
router.put("/:messageId/star", star);
router.post("/starred-messages", starredMessages);

router.delete("/delete-for-me/:roomId", deleteForMe);
router.delete("/delete-for-everyone/:roomId", deleteForEveryone);
router.delete("/clear-chat/:roomId", clearChat);

export default router;

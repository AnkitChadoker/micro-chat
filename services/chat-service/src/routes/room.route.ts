import { Router } from "express";
import {
  createGroup,
  createPrivate,
  members,
  updateGroup,
} from "../controllers/room.controller";

const router = Router();

router.post("/create-private", createPrivate);
router.post("/create-group", createGroup);
router.put("/update-group/:id", updateGroup);
router.get("/members/:id", members);

export default router;

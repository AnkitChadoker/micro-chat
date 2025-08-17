import { Router } from "express";
import { me, updateProfile } from "../controllers/profile.controller";

const router = Router();

router.get("/me", me);
router.put("/update-profile", updateProfile);

export default router;

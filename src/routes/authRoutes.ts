import { Router } from "express";
import { register, login, googleLogin } from "../controllers/authControllers";

const router = Router();

// POST /api/auth/register
router.post("/register", register);

// POST /api/auth/login
router.post("/login", login);

router.post("/google/verify-token", googleLogin);

export default router;

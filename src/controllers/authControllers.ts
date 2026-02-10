import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/Users";
import { registerSchema, loginSchema } from "../validation/authValidation";
import { OAuth2Client } from "google-auth-library";
import logger from "../utils/logger";

const client = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const generateToken = (user: IUser) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "1d" }
  );
};

export const register = async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { username, password } = value;

  try {
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ message: "User already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    user = new User({
      username,
      passwordHash,
      role: "user",
    });
    await user.save();

    res.status(201).json({ message: "User registered successfully!" });
    logger.info("User registered successfully", { username });
  } catch (err: any) {
    logger.error("Registration error", { error: err.message, stack: err.stack, username });
    res.status(500).json({ message: "Server error during registration." });
  }
};

export const login = async (req: Request, res: Response) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { username, password } = value;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
    logger.info("User logged in successfully", { username: user.username, userId: user._id });
  } catch (err: any) {
    logger.error("Login error", { error: err.message, stack: err.stack, username });
    res.status(500).json({ message: "Server error during login." });
  }
};

export const googleLogin = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: "Missing Google ID Token." });
  }

  if (!client || !process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({
      message: "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID environment variable.",
    });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(401).json({ message: "Invalid token payload." });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      let username = name || email;
      if (await User.findOne({ username })) {
        username = `${(name || email.split("@")[0]).replace(/\s+/g, "_")}_${googleId.slice(-8)}`;
      }
      user = new User({
        username,
        email: email,
        googleId: googleId,
        role: "user",
      });
      await user.save();
    } else if (!user.googleId) {
      user.googleId = googleId;
      await user.save();
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
    logger.info("Google login successful", { userId: user._id, email });
  } catch (err: any) {
    logger.error("Google token verification error", {
      error: err.message,
      stack: err.stack,
      hint: "Ensure GOOGLE_CLIENT_ID in backend .env matches the frontend Google Sign-In client_id exactly.",
    });
    res
      .status(401)
      .json({ message: "Token verification failed. Please try again." });
  }
};

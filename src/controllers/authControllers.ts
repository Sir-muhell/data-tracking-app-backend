import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/Users";
import { registerSchema, loginSchema } from "../validation/authValidation";
import { OAuth2Client } from "google-auth-library"; // Import Google verification client

// Initialize the Google OAuth2Client
// IMPORTANT: Ensure process.env.GOOGLE_CLIENT_ID is set in your environment
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Utility function to generate a JWT
const generateToken = (user: IUser) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1d" } // Token expires in 1 day
  );
};

// --- User Registration Controller ---
export const register = async (req: Request, res: Response) => {
  // 1. Validate the request body
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { username, password } = value;

  try {
    // 2. Check if user already exists
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ message: "User already exists." });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Create and save the new user
    user = new User({
      username,
      passwordHash,
      // First registered user could optionally be an admin,
      // but for now, we default to 'user'
      role: "user",
    });
    await user.save();

    // 5. Respond (Do NOT return the passwordHash!)
    res.status(201).json({ message: "User registered successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during registration." });
  }
};

// --- User Login Controller ---
export const login = async (req: Request, res: Response) => {
  // 1. Validate the request body
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { username, password } = value;

  try {
    // 2. Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // ADDED CHECK: If the user exists but has no passwordHash, they must be an OAuth user.
    if (!user.passwordHash) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // 3. Compare passwords
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // 4. Generate JWT
    const token = generateToken(user);

    // 5. Send back the token and user info
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during login." });
  }
};

// --- Google Login/Verify Token Controller (Handles the frontend request) ---
export const googleLogin = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: "Missing Google ID Token." });
  }

  try {
    // 1. Verify the ID Token with Google
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID, // Use the client ID for audience verification
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(401).json({ message: "Invalid token payload." });
    }

    // Extract necessary data
    const googleId = payload.sub; // Google unique user ID
    const email = payload.email;
    const name = payload.name;

    // 2. Check for existing user in your database (via Google ID or Email)
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      // 3. If user doesn't exist, create a new one
      user = new User({
        username: name || email, // Use name or email as username fallback
        email: email,
        googleId: googleId,
        role: "user",
        // Note: No passwordHash needed for OAuth user
      });
      await user.save();
    } else if (!user.googleId) {
      // If a user with that email already exists but wasn't previously linked to Google, link them now
      user.googleId = googleId;
      await user.save();
    }

    // 4. Generate your application's JWT
    const token = generateToken(user);

    // 5. Send back the token and user info
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Google Token Verification Error:", err);
    res
      .status(401)
      .json({ message: "Token verification failed. Please try again." });
  }
};

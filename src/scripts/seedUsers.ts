import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../models/Users";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI as string;

const DEFAULT_PASSWORD = "Test1234!"; // Meets validation: 8+ chars, upper, lower, number, special

const usersToSeed = [
  { username: "admin", role: "admin" as const },
  { username: "user1", role: "user" as const },
  { username: "user2", role: "user" as const },
  { username: "user3", role: "user" as const },
  { username: "user4", role: "user" as const },
  { username: "user5", role: "user" as const },
];

async function seedUsers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, salt);

    for (const u of usersToSeed) {
      const existing = await User.findOne({ username: u.username });
      if (existing) {
        console.log(`User '${u.username}' already exists, skipping.`);
        continue;
      }
      await User.create({
        username: u.username,
        passwordHash,
        role: u.role,
      });
      console.log(`Created ${u.role}: ${u.username}`);
    }

    console.log("\nSeed complete!");
    console.log("Default password for all users:", DEFAULT_PASSWORD);
    process.exit(0);
  } catch (error) {
    console.error("Error seeding users:", error);
    process.exit(1);
  }
}

seedUsers();

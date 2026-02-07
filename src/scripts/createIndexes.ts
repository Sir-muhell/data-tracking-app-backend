import mongoose from "mongoose";
import dotenv from "dotenv";
import Person from "../models/Persons";
import WeeklyReport from "../models/WeeklyReports";
import User from "../models/Users";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI as string;

async function createIndexes() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    console.log("Creating indexes for Person model...");
    await Person.collection.createIndex({ createdBy: 1 });
    await Person.collection.createIndex({ name: 1 });
    await Person.collection.createIndex({ phone: 1 });
    await Person.collection.createIndex({ createdBy: 1, createdAt: -1 });
    console.log("Person indexes created");

    console.log("Creating indexes for WeeklyReport model...");
    await WeeklyReport.collection.createIndex({ person: 1 });
    await WeeklyReport.collection.createIndex({ reportedBy: 1 });
    await WeeklyReport.collection.createIndex({ weekOf: -1 });
    await WeeklyReport.collection.createIndex({ person: 1, weekOf: -1 });
    console.log("WeeklyReport indexes created");

    console.log("Creating indexes for User model...");
    await User.collection.createIndex({ email: 1 });
    await User.collection.createIndex({ googleId: 1 });
    console.log("User indexes created");

    console.log("All indexes created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error creating indexes:", error);
    process.exit(1);
  }
}

createIndexes();

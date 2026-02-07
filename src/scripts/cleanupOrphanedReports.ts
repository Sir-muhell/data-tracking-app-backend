import mongoose from "mongoose";
import dotenv from "dotenv";
import Person from "../models/Persons";
import WeeklyReport from "../models/WeeklyReports";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI as string;

async function cleanupOrphanedReports() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // Get all valid person IDs
    const validPersonIds = await Person.find().distinct("_id");
    console.log(`Found ${validPersonIds.length} valid persons`);

    // Find reports that reference non-existent persons
    const orphanedReports = await WeeklyReport.find({
      person: { $nin: validPersonIds }
    });

    console.log(`Found ${orphanedReports.length} orphaned reports`);

    if (orphanedReports.length > 0) {
      // Delete orphaned reports
      const result = await WeeklyReport.deleteMany({
        person: { $nin: validPersonIds }
      });
      console.log(`Deleted ${result.deletedCount} orphaned reports`);
    } else {
      console.log("No orphaned reports found. Database is clean!");
    }

    console.log("Cleanup completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error cleaning up orphaned reports:", error);
    process.exit(1);
  }
}

cleanupOrphanedReports();

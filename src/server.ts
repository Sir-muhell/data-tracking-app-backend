import express from "express";
import cors, { CorsOptions } from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import personRoutes from "./routes/personRoutes";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(express.json()); // Allows parsing of JSON request body

// --- CORS Configuration ---
const allowedOrigins = [
  "http://localhost:5173",
  "192.168.20.12:5173",
  "https://follow-up-unit.web.app", // Your frontend development URL
  // Add your production frontend domain here when you deploy! e.g., 'https://your-production-app.com'
];

// Define custom function for origin check
const originCheck = (
  origin: string | undefined, // origin is optional (undefined) for non-browser requests
  callback: (err: Error | null, allow?: boolean) => void
) => {
  // Allow requests with no origin (like mobile apps, postman, or curl)
  if (!origin) return callback(null, true);

  if (allowedOrigins.indexOf(origin) === -1) {
    const msg =
      "The CORS policy for this site does not allow access from the specified Origin.";
    // Pass an Error object to reject the request
    return callback(new Error(msg), false);
  }
  // Pass null error and true to allow the request
  return callback(null, true);
};

const corsOptions: CorsOptions = {
  origin: originCheck, // Use the custom function
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true, // Allow cookies and authentication headers
  optionsSuccessStatus: 204, // Default status for preflight requests
};

// Apply CORS middleware
app.use(cors(corsOptions));
// --------------------------

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI as string;

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully."))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

app.get("/", (req, res) => {
  res.send("You shouldn't be here!");
});

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/persons", personRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

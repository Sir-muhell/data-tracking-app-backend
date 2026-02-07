import express from "express";
import cors, { CorsOptions } from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import personRoutes from "./routes/personRoutes";
import { validateEnv } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { startKeepAlive } from "./utils/keepAlive";
import { requestLogger } from "./middleware/requestLogger";
import logger from "./utils/logger";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";

dotenv.config();

const env = validateEnv();

const app = express();
const PORT = env.PORT;

app.use(requestLogger);
app.use(express.json());

const getAllowedOrigins = (): string[] => {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim());
  }
  return [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://follow-up-unit.web.app",
  ];
};

const allowedOrigins = getAllowedOrigins();

const originCheck = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (!origin) return callback(null, true);

  if (allowedOrigins.indexOf(origin) === -1) {
    logger.warn("CORS rejected origin", { origin, allowed: allowedOrigins });
    const msg =
      "The CORS policy for this site does not allow access from the specified Origin.";
    return callback(new Error(msg), false);
  }
  return callback(null, true);
};

const corsOptions: CorsOptions = {
  origin: originCheck,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

mongoose
  .connect(env.MONGO_URI)
  .then(() => logger.info("MongoDB connected successfully"))
  .catch((err) => {
    logger.error("MongoDB connection error", { error: err.message, stack: err.stack });
    process.exit(1);
  });

app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Server is running",
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/persons", personRoutes);

if (process.env.NODE_ENV !== "production") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info("Swagger UI available at /api-docs");
}

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`, { port: PORT, env: process.env.NODE_ENV });
  startKeepAlive();
});

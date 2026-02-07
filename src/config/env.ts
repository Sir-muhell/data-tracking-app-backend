import logger from "../utils/logger";

interface EnvConfig {
  PORT: string;
  MONGO_URI: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string | undefined;
}

const requiredEnvVars: (keyof EnvConfig)[] = [
  "MONGO_URI",
  "JWT_SECRET",
];

const optionalEnvVars: (keyof EnvConfig)[] = [
  "GOOGLE_CLIENT_ID",
];

export const validateEnv = (): EnvConfig => {
  const missing: string[] = [];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    logger.error("Missing required environment variables", { missing });
    console.error("❌ Missing required environment variables:");
    missing.forEach((envVar) => console.error(`   - ${envVar}`));
    console.error("\nPlease set these variables in your .env file or environment.");
    process.exit(1);
  }

  for (const envVar of optionalEnvVars) {
    if (!process.env[envVar]) {
      logger.warn(`Optional environment variable not set: ${envVar}`);
      console.warn(`⚠️  Optional environment variable not set: ${envVar}`);
      console.warn(`   Google OAuth login will not work without this variable.`);
    }
  }

  return {
    PORT: process.env.PORT || "5001",
    MONGO_URI: process.env.MONGO_URI!,
    JWT_SECRET: process.env.JWT_SECRET!,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  };
};

import https from "https";
import http from "http";
import logger from "./logger";

const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000;

const getServerUrl = (): string | null => {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  if (process.env.RENDER_URL) {
    return process.env.RENDER_URL;
  }
  if (process.env.SERVER_URL) {
    return process.env.SERVER_URL;
  }
  return null;
};

export const startKeepAlive = () => {
  const serverUrl = getServerUrl();

  if (!serverUrl) {
    logger.info("Keep-alive disabled: No server URL found in environment variables");
    return;
  }

  if (process.env.NODE_ENV === "development") {
    logger.info("Keep-alive disabled in development mode");
    return;
  }

  logger.info(`Keep-alive started. Pinging ${serverUrl}/health every 14 minutes`);

  const pingServer = () => {
    try {
      const url = new URL("/health", serverUrl);
      const client = url.protocol === "https:" ? https : http;

      const req = client.get(url.toString(), (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode === 200) {
          logger.debug("Keep-alive ping successful", { timestamp: new Date().toISOString() });
        } else {
          logger.warn("Keep-alive ping returned non-200 status", { statusCode });
        }
      });

      req.on("error", (err) => {
        logger.error("Keep-alive ping failed", { error: err.message });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        logger.warn("Keep-alive ping timeout");
      });
    } catch (err: any) {
      logger.error("Keep-alive ping error", { error: err.message, stack: err.stack });
    }
  };

  pingServer();
  setInterval(pingServer, KEEP_ALIVE_INTERVAL);
};

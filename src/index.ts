import { createAppServer } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createMailSidecarRuntime } from "./orchestration/runtime.js";
import { initializeDatabase } from "./storage/db.js";

const config = loadConfig(process.env);
const logger = createLogger(config.serviceName);

const database = initializeDatabase(config);
const runtime = createMailSidecarRuntime({
  db: database.db,
  config
});
let ready = true;

const server = createAppServer({
  config,
  isReady: () => ready,
  mailApi: runtime
});

server.listen(config.http.port, config.http.host, () => {
  logger.info("mailclaws listening", {
    host: config.http.host,
    port: config.http.port,
    sqlitePath: config.storage.sqlitePath
  });
  if (process.stdout.isTTY) {
    const baseUrl = config.http.publicBaseUrl.trim() || `http://${config.http.host}:${String(config.http.port)}`;
    const mailTabUrl = `${baseUrl}/workbench/mail`;
    const gatewayUrl = config.openClaw.publicBaseUrl.trim();
    console.log(
      [
        "",
        "MailClaws is ready.",
        `Gateway ${gatewayUrl || "not configured"}`,
        `Mail tab ${mailTabUrl}`,
        `Health ${baseUrl}/healthz`,
        "",
        "Next:",
        "  mailclaws onboard you@example.com",
        "  mailclaws login",
        "  mailclaws gateway",
        "  mailclaws dashboard"
      ].join("\n")
    );
  }
});

const shutdown = (signal: NodeJS.Signals) => {
  ready = false;
  logger.info("mailclaws shutting down", { signal });
  server.close((error) => {
    if (error) {
      logger.error("server close failed", {
        signal,
        error: error.message
      });
      process.exitCode = 1;
    }

    database.close();
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

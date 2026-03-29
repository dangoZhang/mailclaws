type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export function createLogger(service: string): Logger {
  const format = (process.env.MAILCLAW_LOG_FORMAT ?? "pretty").trim().toLowerCase();
  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    const timestamp = new Date().toISOString();
    const record = {
      timestamp,
      level,
      service,
      message,
      ...fields
    };
    const output =
      format === "json"
        ? JSON.stringify(record)
        : renderPrettyLog({
            timestamp,
            level,
            service,
            message,
            fields
          });
    if (level === "error") {
      console.error(output);
      return;
    }

    console.log(output);
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields)
  };
}

function renderPrettyLog(input: {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  fields: LogFields;
}) {
  const suffix = Object.entries(input.fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");

  return [`[${input.timestamp}]`, input.level.toUpperCase(), input.service, input.message, suffix]
    .filter(Boolean)
    .join(" ");
}

type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export function createLogger(service: string): Logger {
  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...fields
    };

    const output = JSON.stringify(record);
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

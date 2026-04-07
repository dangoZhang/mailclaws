import { describe, expect, it, vi } from "vitest";

import { runMailclaws } from "../src/cli/mailclaws-main.js";

function createWritableBuffer() {
  let buffer = "";
  return {
    stream: {
      write(chunk: string) {
        buffer += chunk;
      }
    },
    read() {
      return buffer;
    }
  };
}

describe("mailclaws user-facing cli", () => {
  it("delegates onboarding, register, login, and skills to mailctl", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const delegated: string[][] = [];

    const exitCode = await runMailclaws(["onboard", "person@gmail.com"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      runMailctl: async (args) => {
        delegated.push(args);
        return 0;
      }
    });

    expect(exitCode).toBe(0);
    expect(delegated).toEqual([["connect", "start", "person@gmail.com"]]);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toBe("");

    const loginExitCode = await runMailclaws(["login", "qq"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      runMailctl: async (args) => {
        delegated.push(args);
        return 0;
      }
    });

    expect(loginExitCode).toBe(0);
    expect(delegated.at(-1)).toEqual(["connect", "login", "qq"]);

    const registerExitCode = await runMailclaws(["register", "person@gmail.com"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      runMailctl: async (args) => {
        delegated.push(args);
        return 0;
      }
    });

    expect(registerExitCode).toBe(0);
    expect(delegated.at(-1)).toEqual(["connect", "start", "person@gmail.com"]);

    const skillsExitCode = await runMailclaws(["skills", "list", "acct-1"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      runMailctl: async (args) => {
        delegated.push(args);
        return 0;
      }
    });

    expect(skillsExitCode).toBe(0);
    expect(delegated.at(-1)).toEqual(["skills", "list", "acct-1"]);

    const syncExitCode = await runMailclaws(["sync-mail", "room-1", "msg-1"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      runMailctl: async (args) => {
        delegated.push(args);
        return 0;
      }
    });

    expect(syncExitCode).toBe(0);
    expect(delegated.at(-1)).toEqual(["gateway", "sync-mail", "room-1", "msg-1"]);
  });

  it("starts the server by default", async () => {
    const startServer = vi.fn(async () => undefined);

    const exitCode = await runMailclaws([], {
      startServer
    });

    expect(exitCode).toBe(0);
    expect(startServer).toHaveBeenCalledTimes(1);
  });

  it("treats `gateway` as the service-style start command", async () => {
    const startServer = vi.fn(async () => undefined);

    const exitCode = await runMailclaws(["gateway"], {
      startServer
    });

    expect(exitCode).toBe(0);
    expect(startServer).toHaveBeenCalledTimes(1);
  });

  it("opens the browser console shortcut", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);

    const exitCode = await runMailclaws(["open"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      openExternal
    });

    expect(exitCode).toBe(0);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(String(openExternal.mock.calls[0]?.[0])).toContain("/workbench/mail");
    expect(stdout.read()).toContain("/workbench/mail");
    expect(stderr.read()).toContain("Opening");
  });

  it("opens the dashboard alias", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);
    const previousGatewayUrl = process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = "https://gateway.example.com";

    try {
      const exitCode = await runMailclaws(["dashboard"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal
      });

      expect(exitCode).toBe(0);
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(String(openExternal.mock.calls[0]?.[0])).toBe("https://gateway.example.com/");
      expect(stdout.read()).toContain("https://gateway.example.com/");
      expect(stderr.read()).toContain("Opening");
    } finally {
      if (previousGatewayUrl === undefined) {
        delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;
      } else {
        process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = previousGatewayUrl;
      }
    }
  });

  it("opens the configured OpenClaw dashboard root", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);
    const previousGatewayUrl = process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = "https://gateway.example.com";

    try {
      const exitCode = await runMailclaws(["dashboard"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal
      });

      expect(exitCode).toBe(0);
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(String(openExternal.mock.calls[0]?.[0])).toBe("https://gateway.example.com/");
      expect(stdout.read()).toContain("https://gateway.example.com/");
      expect(stderr.read()).toContain("Opening");
    } finally {
      if (previousGatewayUrl === undefined) {
        delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;
      } else {
        process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = previousGatewayUrl;
      }
    }
  });

  it("delegates gateway control commands to mailctl instead of opening the browser", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const delegated: string[][] = [];
    const openExternal = vi.fn(async () => undefined);

    const exitCode = await runMailclaws(["gateway", "trace", "room-1"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      openExternal,
      runMailctl: async (args) => {
        delegated.push(args);
        return 0;
      }
    });

    expect(exitCode).toBe(0);
    expect(openExternal).not.toHaveBeenCalled();
    expect(delegated).toEqual([["gateway", "trace", "room-1"]]);
  });

  it("falls back to the direct Mail tab when dashboard host is not configured", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);
    const previousGatewayUrl = process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    try {
      const exitCode = await runMailclaws(["dashboard"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal
      });

      expect(exitCode).toBe(0);
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(String(openExternal.mock.calls[0]?.[0])).toContain("/workbench/mail");
      expect(stderr.read()).toContain("falling back to the direct Mail tab");
    } finally {
      if (previousGatewayUrl === undefined) {
        delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;
      } else {
        process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = previousGatewayUrl;
      }
    }
  });

  it("preserves the requested path when gateway falls back to the direct workbench", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);
    const previousGatewayUrl = process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    try {
      const exitCode = await runMailclaws(["dashboard", "rooms/room-1"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal
      });

      expect(exitCode).toBe(0);
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(String(openExternal.mock.calls[0]?.[0])).toContain("/console/rooms/room-1");
      expect(stderr.read()).toContain("falling back to the direct Mail tab");
    } finally {
      if (previousGatewayUrl === undefined) {
        delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;
      } else {
        process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = previousGatewayUrl;
      }
    }
  });

  it("keeps legacy gateway open-path behavior for compatibility", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);
    const previousGatewayUrl = process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = "https://gateway.example.com";

    try {
      const exitCode = await runMailclaws(["gateway", "rooms/room-1"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal
      });

      expect(exitCode).toBe(0);
      expect(String(openExternal.mock.calls[0]?.[0])).toBe("https://gateway.example.com/rooms/room-1");
    } finally {
      if (previousGatewayUrl === undefined) {
        delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;
      } else {
        process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = previousGatewayUrl;
      }
    }
  });

  it("supports browser as a dashboard alias", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);
    const previousGatewayUrl = process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = "https://gateway.example.com";

    try {
      const exitCode = await runMailclaws(["browser"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal
      });

      expect(exitCode).toBe(0);
      expect(String(openExternal.mock.calls[0]?.[0])).toBe("https://gateway.example.com/");
    } finally {
      if (previousGatewayUrl === undefined) {
        delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;
      } else {
        process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = previousGatewayUrl;
      }
    }
  });

  it("opens browser login for web-first auth flows", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);

    const exitCode = await runMailclaws(["login", "web"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      openExternal,
      runMailctl: async () => {
        throw new Error("should not delegate browser login to mailctl");
      }
    });

    expect(exitCode).toBe(0);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(String(openExternal.mock.calls[0]?.[0])).toContain("/workbench/mail/login");
    expect(stdout.read()).toContain("/workbench/mail/login");
    expect(stderr.read()).toContain("Opening");
  });

  it("prefers the configured OpenClaw host for browser login", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const openExternal = vi.fn(async () => undefined);
    const previousGatewayUrl = process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;

    process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = "https://gateway.example.com";

    try {
      const exitCode = await runMailclaws(["login", "web"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal,
        runMailctl: async () => {
          throw new Error("should not delegate browser login to mailctl");
        }
      });

      expect(exitCode).toBe(0);
      expect(String(openExternal.mock.calls[0]?.[0])).toBe("https://gateway.example.com/workbench/mail/login");
    } finally {
      if (previousGatewayUrl === undefined) {
        delete process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL;
      } else {
        process.env.MAILCLAW_OPENCLAW_PUBLIC_BASE_URL = previousGatewayUrl;
      }
    }
  });

  it("prints help that matches the supported user-facing commands", async () => {
    const stdout = createWritableBuffer();

    const exitCode = await runMailclaws(["--help"], {
      stdout: stdout.stream
    });

    expect(exitCode).toBe(0);
    expect(stdout.read()).toContain("providers");
    expect(stdout.read()).toContain("console");
    expect(stdout.read()).toContain("health");
    expect(stdout.read()).toContain("browser");
    expect(stdout.read()).toContain("gateway-history");
  });

  it("reports status from the local runtime probe", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runMailclaws(["status"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      fetchJson: async (url) => {
        if (String(url).endsWith("/healthz")) {
          return { status: "ok", service: "MailClaws", env: "test" };
        }
        return { status: "ok", service: "MailClaws" };
      }
    });

    expect(exitCode).toBe(0);
    expect(stdout.read()).toContain("MailClaws");
    expect(stdout.read()).toContain("mail tab:");
    expect(stderr.read()).toBe("");
  });

  it("supports health and version style top-level commands", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const healthExitCode = await runMailclaws(["health"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      fetchJson: async (url) => {
        if (String(url).endsWith("/healthz")) {
          return { status: "ok", service: "MailClaws", env: "test" };
        }
        return { status: "ok", service: "MailClaws" };
      }
    });

    expect(healthExitCode).toBe(0);
    expect(stdout.read()).toContain("status: ok / ready: ok");

    const versionStdout = createWritableBuffer();
    const versionExitCode = await runMailclaws(["--version"], {
      stdout: versionStdout.stream
    });

    expect(versionExitCode).toBe(0);
    expect(versionStdout.read().trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prints doctor guidance when the runtime is unavailable", async () => {
    const stdout = createWritableBuffer();

    const exitCode = await runMailclaws(["doctor"], {
      stdout: stdout.stream,
      fetchJson: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:3000");
      }
    });

    expect(exitCode).toBe(1);
    expect(stdout.read()).toContain("MailClaws doctor");
    expect(stdout.read()).toContain("Start MailClaws with `mailclaws gateway`");
  });
});

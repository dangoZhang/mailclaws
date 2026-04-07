import { once } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

import { createAppServer } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const servers: Array<ReturnType<typeof createAppServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        })
    )
  );
});

describe("createAppServer", () => {
  it("serves health and readiness probes", async () => {
    const server = createAppServer({
      config: loadConfig({})
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an address info result");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const healthResponse = await fetch(`${baseUrl}/healthz`);
    const readinessResponse = await fetch(`${baseUrl}/readyz`);

    expect(healthResponse.status).toBe(200);
    expect(readinessResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toMatchObject({
      status: "ok",
      service: "mailclaws"
    });
  });
});

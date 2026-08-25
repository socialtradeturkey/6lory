import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "./_core/app";

describe("Vercel API application", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(createApiApp());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it("serves the OAuth callback route without requiring a listening production server", async () => {
    const response = await fetch(`${baseUrl}/api/oauth/callback`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "code and state are required",
    });
  });
});

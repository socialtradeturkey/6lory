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

  it("redirects legacy OAuth callbacks to the current login surface", async () => {
    const response = await fetch(`${baseUrl}/api/oauth/callback?state=stale`, {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://6loryapp-pernhdey.manus.space/?auth=retry&legacy=1",
    );
  });
});

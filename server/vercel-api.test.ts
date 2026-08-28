import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appOriginForHost, createApiApp, VERCEL_APP_URL } from "./_core/app";

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

  it("selects the Vercel origin only for allowlisted Vercel hosts", () => {
    expect(appOriginForHost("6lory.vercel.app")).toBe(VERCEL_APP_URL);
    expect(appOriginForHost("6lory-git-main-socialtradeturkey-7533s-projects.vercel.app")).toBe(VERCEL_APP_URL);
    expect(appOriginForHost("6loryapp-pernhdey.manus.space")).toBe("https://6loryapp-pernhdey.manus.space");
    expect(appOriginForHost("attacker.example")).toBe("https://6loryapp-pernhdey.manus.space");
  });

  it("uses the request host to create the Vercel OAuth redirect URI", async () => {
    const response = await fetch(`${baseUrl}/api/social-oauth/youtube/start?mode=login`, {
      headers: { "x-forwarded-host": "6lory.vercel.app" },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toContain(encodeURIComponent("https://6lory.vercel.app/api/social-oauth/youtube/callback"));
    expect(location).not.toContain(encodeURIComponent("https://6loryapp-pernhdey.manus.space/api/social-oauth/youtube/callback"));
  });

  it("prefers the explicit Vercel host header when an upstream rewrites forwarded host", async () => {
    const response = await fetch(`${baseUrl}/api/social-oauth/youtube/start?mode=login`, {
      headers: {
        "x-sixlory-public-host": "6lory.vercel.app",
        "x-forwarded-host": "6loryapp-pernhdey.manus.space",
      },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      encodeURIComponent("https://6lory.vercel.app/api/social-oauth/youtube/callback"),
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
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { createAdminSetupToken } from "./routers";

describe("admin password setup token", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret-for-admin-setup";
  });

  it("binds the token to the user id and expiration timestamp", () => {
    const expiresAt = Date.now() + 60_000;
    const token = createAdminSetupToken(4050001, expiresAt);
    const [userId, expiry, signature] = token.split(".");

    expect(userId).toBe("4050001");
    expect(expiry).toBe(String(expiresAt));
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createAdminSetupToken(4050001, expiresAt)).toBe(token);
    expect(createAdminSetupToken(4050002, expiresAt)).not.toBe(token);
  });

  it("uses a short default lifetime", () => {
    const now = Date.now();
    const [, expiry] = createAdminSetupToken(4050001).split(".");
    const lifetime = Number(expiry) - now;

    expect(lifetime).toBeGreaterThan(14 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});


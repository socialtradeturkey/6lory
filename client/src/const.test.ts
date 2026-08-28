import { describe, expect, it } from "vitest";
import { GOOGLE_LOGIN_URL } from "./const";

describe("Google login entrypoint", () => {
  it("starts on the canonical Vercel production origin", () => {
    const url = new URL(GOOGLE_LOGIN_URL);
    expect(url.origin).toBe("https://6lory.vercel.app");
    expect(url.pathname).toBe("/api/social-oauth/youtube/start");
    expect(url.searchParams.get("mode")).toBe("login");
  });
});

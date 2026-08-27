import { describe, expect, it } from "vitest";
import { isApiPath } from "./_core/vite";

describe("API fallback routing", () => {
  it("recognizes API paths with query strings", () => {
    expect(isApiPath("/api/trpc/tasks.list?batch=1")).toBe(true);
    expect(isApiPath("/api/social-oauth/youtube/callback?code=abc")).toBe(true);
    expect(isApiPath("/api")).toBe(true);
  });

  it("does not classify SPA routes or assets as API paths", () => {
    expect(isApiPath("/tasks?from_webdev=1")).toBe(false);
    expect(isApiPath("/assets/index.js")).toBe(false);
    expect(isApiPath("/apiary")).toBe(false);
  });
});

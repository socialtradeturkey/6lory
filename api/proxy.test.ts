import { describe, expect, it } from "vitest";
import { getManagedApiUrl, MANAGED_API_ORIGIN } from "./[...path]";

describe("Vercel managed API proxy", () => {
  it("forwards the API path and query to the managed origin", () => {
    const target = getManagedApiUrl(
      "/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"
    );

    expect(target.origin).toBe(MANAGED_API_ORIGIN);
    expect(target.pathname).toBe("/api/trpc/auth.me");
    expect(target.searchParams.get("batch")).toBe("1");
    expect(target.searchParams.get("input")).toContain('"json"');
  });

  it("does not allow an absolute request path to replace the managed origin", () => {
    const target = getManagedApiUrl("https://attacker.example/api/trpc/auth.me");
    expect(target.origin).toBe(MANAGED_API_ORIGIN);
    expect(target.pathname).toBe("/api/trpc/auth.me");
  });
});

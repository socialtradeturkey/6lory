import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { copyRequestHeaders, getManagedApiUrl, MANAGED_API_ORIGIN } from "./[...path]";

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

  it("forwards the canonical Vercel host instead of an upstream Manus host", () => {
    const request = {
      headers: {
        host: "6lory-ato6flknk-socialtradeturkey-7533s-projects.vercel.app",
        "x-forwarded-host": "6loryapp-pernhdey.manus.space",
      },
    } as IncomingMessage;

    const headers = copyRequestHeaders(request);
    expect(headers.get("x-forwarded-host")).toBe("6lory.vercel.app");
  });
});

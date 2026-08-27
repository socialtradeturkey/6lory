import { describe, expect, it } from "vitest";
import { youtubeAuthorizeUrl } from "./youtube";

describe("YouTube OAuth client configuration", () => {
  it("uses the configured Google Web client in the authorize endpoint URL", async () => {
    const url = youtubeAuthorizeUrl("test-state", "https://6loryapp-pernhdey.manus.space/api/social-oauth/youtube/callback");
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://accounts.google.com");
    expect(parsed.searchParams.get("client_id")).toBe("219183351050-4eh84mr3kdmmsba9cge66f652dvm7rtd.apps.googleusercontent.com");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://6loryapp-pernhdey.manus.space/api/social-oauth/youtube/callback");
    expect(parsed.searchParams.get("scope")).toContain("youtube.force-ssl");

    const response = await fetch(parsed, { method: "HEAD", redirect: "manual" });
    expect([200, 302, 303, 307, 308]).toContain(response.status);
  });
});

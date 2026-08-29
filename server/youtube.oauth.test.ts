import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_CLIENT_ID =
  "219183351050-4eh84mr3kdmmsba9cge66f652dvm7rtd.apps.googleusercontent.com";

describe("YouTube OAuth client configuration", () => {
  beforeEach(() => {
    vi.stubEnv("YOUTUBE_OAUTH_CLIENT_ID", TEST_CLIENT_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured Google Web client in the authorize endpoint URL", async () => {
    // Import after stubbing the environment because the implementation reads
    // deployment configuration when its module is initialized.
    const { youtubeAuthorizeUrl } = await import("./youtube");
    const url = youtubeAuthorizeUrl(
      "test-state",
      "https://6loryapp-pernhdey.manus.space/api/social-oauth/youtube/callback",
    );
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://accounts.google.com");
    expect(parsed.searchParams.get("client_id")).toBe(TEST_CLIENT_ID);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://6loryapp-pernhdey.manus.space/api/social-oauth/youtube/callback",
    );
    expect(parsed.searchParams.get("scope")).toContain("youtube.force-ssl");

    const response = await fetch(parsed, { method: "HEAD", redirect: "manual" });
    expect([200, 302, 303, 307, 308]).toContain(response.status);
  });
});

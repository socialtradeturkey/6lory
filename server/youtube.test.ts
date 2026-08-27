import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createYoutubeProof,
  extractYoutubeVideoId,
  verifyYoutubeProof,
  youtubeRequirementsSatisfied,
  YOUTUBE_PROOF_TTL_MS,
  refreshYoutubeAccessToken,
  revokeYoutubeToken,
} from "./youtube";

beforeEach(() => {
  process.env.JWT_SECRET = "youtube-proof-test-secret";
});

describe("YouTube proof token", () => {
  it("creates and verifies a proof bound to user, video and channel", () => {
    const proof = createYoutubeProof({
      userId: 7,
      videoId: "abc123_XY",
      channelId: "UC12345678901234567890",
      subscribed: true,
      liked: false,
      checkedAt: Date.now(),
    });

    expect(verifyYoutubeProof(proof, {
      userId: 7,
      videoId: "abc123_XY",
      channelId: "UC12345678901234567890",
    })).toMatchObject({ subscribed: true, liked: false });
    expect(verifyYoutubeProof(proof, {
      userId: 8,
      videoId: "abc123_XY",
      channelId: "UC12345678901234567890",
    })).toBeNull();
  });

  it("rejects stale proofs", () => {
    const proof = createYoutubeProof({
      userId: 7,
      videoId: "abc123_XY",
      channelId: "UC12345678901234567890",
      subscribed: true,
      liked: true,
      checkedAt: Date.now() - YOUTUBE_PROOF_TTL_MS - 1,
    });
    expect(verifyYoutubeProof(proof, {
      userId: 7,
      videoId: "abc123_XY",
      channelId: "UC12345678901234567890",
    })).toBeNull();
  });
});

describe("YouTube OAuth lifecycle", () => {
  it("refreshes tokens and revokes Google access without exposing token values", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fresh-token", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    try {
      await expect(refreshYoutubeAccessToken("refresh-token")).resolves.toMatchObject({ access_token: "fresh-token" });
      await expect(revokeYoutubeToken("access-token")).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST" }));
      expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("https://oauth2.googleapis.com/revoke?token="), expect.objectContaining({ method: "POST" }));
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe("YouTube task requirements", () => {
  it("requires only the flags enabled by the task", () => {
    expect(youtubeRequirementsSatisfied({ requiresSubscription: true, requiresLike: false }, { subscribed: true, liked: false })).toBe(true);
    expect(youtubeRequirementsSatisfied({ requiresSubscription: true, requiresLike: false }, { subscribed: false, liked: true })).toBe(false);
    expect(youtubeRequirementsSatisfied({ requiresSubscription: false, requiresLike: true }, { subscribed: false, liked: true })).toBe(true);
    expect(youtubeRequirementsSatisfied({ requiresSubscription: false, requiresLike: false }, null)).toBe(true);
  });
});

describe("YouTube URL parsing", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123_XY", "abc123_XY"],
    ["https://youtu.be/abc123_XY", "abc123_XY"],
    ["https://www.youtube.com/embed/abc123_XY?rel=0", "abc123_XY"],
    ["https://www.youtube.com/shorts/abc123_XY", "abc123_XY"],
  ])("extracts %s", (url, expected) => {
    expect(extractYoutubeVideoId(url)).toBe(expected);
  });

  it("rejects non-YouTube or malformed URLs", () => {
    expect(extractYoutubeVideoId("https://example.com/watch?v=abc123_XY")).toBeNull();
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=bad")).toBeNull();
  });
});

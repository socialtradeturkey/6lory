import { describe, expect, it } from "vitest";

describe("GitHub sync credential", () => {
  it("can read the configured repository without exposing the token", async () => {
    const token = process.env.GITHUB_SYNC_TOKEN;
    if (!token) {
      return;
    }

    const response = await fetch("https://api.github.com/repos/socialtradeturkey/6lory", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    expect(response.status).toBe(200);
    const repository = (await response.json()) as { full_name?: string; permissions?: { push?: boolean } };
    expect(repository.full_name).toBe("socialtradeturkey/6lory");
    expect(repository.permissions?.push).toBe(true);
  }, 20_000);
});

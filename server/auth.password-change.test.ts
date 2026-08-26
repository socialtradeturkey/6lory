import { describe, expect, it } from "vitest";
import { hashLocalPassword, verifyLocalPassword } from "./routers";

describe("auth.changePassword password primitives", () => {
  it("accepts the new password, rejects a different password, and salts each hash", async () => {
    const first = await hashLocalPassword("TemporaryAdmin42");
    const second = await hashLocalPassword("TemporaryAdmin42");

    expect(first.hash).not.toBe(second.hash);
    expect(first.salt).not.toBe(second.salt);
    await expect(verifyLocalPassword("TemporaryAdmin42", first.salt, first.hash)).resolves.toBe(true);
    await expect(verifyLocalPassword("WrongPassword42", first.salt, first.hash)).resolves.toBe(false);
  });
});

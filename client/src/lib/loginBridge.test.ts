import { describe, expect, it } from "vitest";
import { consumeLoginBridgeUrl } from "./loginBridge";

describe("consumeLoginBridgeUrl", () => {
  it("consumes the managed login bridge flag before OAuth begins", () => {
    expect(
      consumeLoginBridgeUrl("https://6loryapp-pernhdey.manus.space/?login=1"),
    ).toBe("/");
  });

  it("consumes the legacy Vercel bridge flag", () => {
    expect(
      consumeLoginBridgeUrl("https://6loryapp-pernhdey.manus.space/?auth=vercel&next=tasks"),
    ).toBe("/?next=tasks");
  });

  it("does not alter ordinary application URLs", () => {
    expect(
      consumeLoginBridgeUrl("https://6loryapp-pernhdey.manus.space/tasks"),
    ).toBeNull();
  });
});

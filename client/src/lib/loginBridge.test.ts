import { describe, expect, it } from "vitest";
import { consumeLoginBridgeUrl } from "./loginBridge";

describe("consumeLoginBridgeUrl", () => {
  it("consumes the managed login bridge flag before OAuth begins", () => {
    expect(
      consumeLoginBridgeUrl("https://6loryapp-pernhdey.manus.space/?login=1"),
    ).toEqual({ cleanPath: "/", postLoginPath: null });
  });

  it("consumes the legacy Vercel bridge flag", () => {
    expect(
      consumeLoginBridgeUrl("https://6loryapp-pernhdey.manus.space/?auth=vercel&next=tasks"),
    ).toEqual({ cleanPath: "/", postLoginPath: null });
  });

  it("retains a safe internal admin destination", () => {
    expect(
      consumeLoginBridgeUrl("https://6loryapp-pernhdey.manus.space/?login=1&next=%2Fadmin"),
    ).toEqual({ cleanPath: "/", postLoginPath: "/admin" });
  });

  it("does not alter ordinary application URLs", () => {
    expect(
      consumeLoginBridgeUrl("https://6loryapp-pernhdey.manus.space/tasks"),
    ).toBeNull();
  });
});

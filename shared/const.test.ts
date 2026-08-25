import { describe, expect, it } from "vitest";
import { getSafeOAuthReturnPath } from "./const";

describe("getSafeOAuthReturnPath", () => {
  it("allows only the explicit internal admin destination", () => {
    expect(getSafeOAuthReturnPath("/admin")).toBe("/admin");
  });

  it("fails closed to the home route for missing, external, or malformed values", () => {
    expect(getSafeOAuthReturnPath(undefined)).toBe("/");
    expect(getSafeOAuthReturnPath("https://attacker.example/admin")).toBe("/");
    expect(getSafeOAuthReturnPath("//attacker.example")).toBe("/");
    expect(getSafeOAuthReturnPath("/tasks")).toBe("/");
  });
});

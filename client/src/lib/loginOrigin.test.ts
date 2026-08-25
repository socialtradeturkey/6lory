import { describe, expect, it } from "vitest";
import { MANAGED_AUTH_ORIGIN, resolveLoginOrigin } from "./loginOrigin";

describe("resolveLoginOrigin", () => {
  it("keeps the current origin for a supported managed application domain", () => {
    expect(resolveLoginOrigin("https://6loryapp-pernhdey.manus.space")).toBe(
      "https://6loryapp-pernhdey.manus.space",
    );
  });

  it("sends the Vercel production domain to the supported managed login origin", () => {
    expect(resolveLoginOrigin("https://6lory.vercel.app")).toBe(MANAGED_AUTH_ORIGIN);
  });

  it("sends Vercel deployment aliases to the supported managed login origin", () => {
    expect(
      resolveLoginOrigin("https://6lory-git-main-socialtradeturkey-7533s-projects.vercel.app"),
    ).toBe(MANAGED_AUTH_ORIGIN);
  });
});

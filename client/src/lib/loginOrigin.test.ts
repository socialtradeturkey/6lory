import { describe, expect, it } from "vitest";
import {
  getManagedLoginStartUrl,
  MANAGED_AUTH_ORIGIN,
  normalizePostLoginPath,
  resolveLoginOrigin,
} from "./loginOrigin";

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

  it("creates an explicit managed login start URL for Vercel visitors", () => {
    expect(getManagedLoginStartUrl("https://6lory.vercel.app")).toBe(
      `${MANAGED_AUTH_ORIGIN}/?login=1`,
    );
  });

  it("preserves a safe Vercel admin destination through managed login", () => {
    expect(getManagedLoginStartUrl("https://6lory.vercel.app", "/admin")).toBe(
      `${MANAGED_AUTH_ORIGIN}/?login=1&next=%2Fadmin`,
    );
  });

  it("rejects external post-login destinations", () => {
    expect(normalizePostLoginPath("//untrusted.example")).toBeNull();
    expect(normalizePostLoginPath("https://untrusted.example")).toBeNull();
  });

  it("does not redirect an already managed visitor before OAuth starts", () => {
    expect(getManagedLoginStartUrl(MANAGED_AUTH_ORIGIN)).toBeNull();
  });
});

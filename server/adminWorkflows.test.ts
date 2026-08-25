import { describe, expect, it } from "vitest";
import {
  assertRedemptionTransition,
  needsRedemptionRefund,
} from "./adminWorkflows";

describe("yönetici ödül işlem akışı", () => {
  it("yalnız izinli teslimat durum geçişlerini kabul eder", () => {
    expect(() => assertRedemptionTransition("requested", "approved")).not.toThrow();
    expect(() => assertRedemptionTransition("approved", "preparing")).not.toThrow();
    expect(() => assertRedemptionTransition("shipped", "delivered")).not.toThrow();
  });

  it("geçmişe dönük veya son durumdan yapılan geçişleri reddeder", () => {
    expect(() => assertRedemptionTransition("delivered", "approved")).toThrow(
      "REDEMPTION_INVALID_TRANSITION",
    );
    expect(() => assertRedemptionTransition("preparing", "rejected")).toThrow(
      "REDEMPTION_INVALID_TRANSITION",
    );
  });

  it("yalnız henüz işleme alınmamış ret veya iptal kararlarında puan iadesi ister", () => {
    expect(needsRedemptionRefund("requested", "rejected")).toBe(true);
    expect(needsRedemptionRefund("under_review", "cancelled")).toBe(true);
    expect(needsRedemptionRefund("approved", "preparing")).toBe(false);
  });
});

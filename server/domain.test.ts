import { describe, expect, it } from "vitest";
import { assertRedemptionEligibility, evaluateWebSignals, hashSecretCode, isMatchingSecretCode, resolveVerification } from "./domain";

describe("6lory doğrulama kuralları", () => {
  it("gerekli süre tamamlanmadığında görevi onaylamaz", () => {
    const result = evaluateWebSignals({ sessionValid: true, activeSeconds: 30, requiredSeconds: 60, visibilityScore: 100, interactionCount: 2 });
    expect(result.status).toBe("fail");
  });

  it("platform API desteği yokken sahte başarı üretmez", () => {
    const result = resolveVerification({ method: "platform_api", webSignals: { sessionValid: true, activeSeconds: 100, requiredSeconds: 60, visibilityScore: 100, interactionCount: 1 } });
    expect(result.status).toBe("unavailable");
  });

  it("platform API fallback’inde görevi manuel incelemeye yönlendirir", () => {
    const result = resolveVerification({ method: "platform_api_manual_fallback", webSignals: { sessionValid: true, activeSeconds: 100, requiredSeconds: 60, visibilityScore: 100, interactionCount: 1 } });
    expect(result.status).toBe("manual_review");
    expect(result.status).not.toBe("pass");
  });

  it("yalnızca tarayıcı sinyalleriyle otomatik puan onayı vermez", () => {
    const result = resolveVerification({ method: "web_signals", webSignals: { sessionValid: true, activeSeconds: 100, requiredSeconds: 60, visibilityScore: 100, interactionCount: 1 } });
    expect(result.status).toBe("manual_review");
  });

  it("secret code yalnızca doğru değer için doğrulanır", () => {
    const hash = hashSecretCode("739241");
    expect(isMatchingSecretCode("739241", hash)).toBe(true);
    expect(isMatchingSecretCode("739242", hash)).toBe(false);
  });

  it("yetersiz puanla ödül talebini engeller", () => {
    expect(() => assertRedemptionEligibility({ availablePoints: 50, pointsCost: 100, stock: 1, priorRedemptions: 0, maxPerUser: 1, riskStatus: "normal" })).toThrow("INSUFFICIENT_POINTS");
  });
});

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export type VerificationStatus = "pass" | "fail" | "unavailable" | "manual_review";

export type VerificationDecision = {
  status: VerificationStatus;
  score: number | null;
  reason: string;
  signals: Record<string, number | boolean | string>;
};

export type WebSignals = {
  sessionValid: boolean;
  activeSeconds: number;
  requiredSeconds: number;
  visibilityScore: number;
  interactionCount: number;
};

export function evaluateWebSignals(signals: WebSignals): VerificationDecision {
  const durationPassed = signals.activeSeconds >= signals.requiredSeconds;
  const visibilityPassed = signals.visibilityScore >= 70;
  const interactionPassed = signals.interactionCount > 0;
  const score = Math.round(
    (signals.sessionValid ? 35 : 0) +
      (durationPassed ? 35 : Math.min(35, (signals.activeSeconds / Math.max(1, signals.requiredSeconds)) * 35)) +
      (visibilityPassed ? 20 : Math.max(0, Math.min(20, signals.visibilityScore * 0.2))) +
      (interactionPassed ? 10 : 0),
  );

  if (!signals.sessionValid) {
    return { status: "fail", score, reason: "Geçerli bir görev oturumu bulunamadı.", signals: { ...signals, durationPassed, visibilityPassed, interactionPassed } };
  }
  if (!durationPassed) {
    return { status: "fail", score, reason: "Gerekli aktif süre henüz tamamlanmadı.", signals: { ...signals, durationPassed, visibilityPassed, interactionPassed } };
  }
  if (!visibilityPassed || !interactionPassed) {
    return { status: "manual_review", score, reason: "Sinyaller otomatik onay için yeterli değil; manuel inceleme gerekiyor.", signals: { ...signals, durationPassed, visibilityPassed, interactionPassed } };
  }
  return { status: "pass", score, reason: "Görev sinyalleri doğrulama eşiğini geçti.", signals: { ...signals, durationPassed, visibilityPassed, interactionPassed } };
}

export function createSecretCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashSecretCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function isMatchingSecretCode(candidate: string, storedHash: string | null) {
  if (!storedHash || !/^\d{6}$/.test(candidate)) return false;
  const candidateHash = Buffer.from(hashSecretCode(candidate), "utf8");
  const stored = Buffer.from(storedHash, "utf8");
  return candidateHash.length === stored.length && timingSafeEqual(candidateHash, stored);
}

export function getTaskSessionAccess(input: { sessionUserId: number; requesterUserId: number; expiresAt: Date; status: string; now?: Date }) {
  const now = input.now ?? new Date();
  if (input.sessionUserId !== input.requesterUserId) return { allowed: false, code: "SESSION_NOT_OWNED" as const };
  if (input.expiresAt <= now) return { allowed: false, code: "SESSION_EXPIRED" as const };
  if (input.status !== "active") return { allowed: false, code: "SESSION_NOT_ACTIVE" as const };
  return { allowed: true, code: "OK" as const };
}

export function resolveVerification(input: {
  method: "web_signals" | "secret_code" | "manual_review" | "platform_api" | "platform_api_manual_fallback";
  webSignals: WebSignals;
  secretCodeValid?: boolean;
}): VerificationDecision {
  if (input.method === "manual_review") {
    return { status: "manual_review", score: null, reason: "Bu görev yönetici incelemesi gerektirir.", signals: {} };
  }
  if (input.method === "platform_api") {
    return { status: "unavailable", score: null, reason: "Bu platform eylemi için izinli bir otomatik doğrulama adapter’ı kullanılamıyor.", signals: {} };
  }
  if (input.method === "platform_api_manual_fallback") {
    return { status: "manual_review", score: null, reason: "Platform API doğrulaması kullanılamıyor; görev manuel incelemeye alındı.", signals: {} };
  }

  const webDecision = evaluateWebSignals(input.webSignals);
  if (webDecision.status !== "pass") return webDecision;
  if (input.method === "secret_code" && !input.secretCodeValid) {
    return { status: "fail", score: webDecision.score, reason: "Secret Code geçersiz, süresi dolmuş veya bu oturuma ait değil.", signals: webDecision.signals };
  }
  return {
    status: "manual_review",
    score: webDecision.score,
    reason: "Tarayıcı sinyalleri tek başına kesin kanıt değildir; görev manuel incelemeye alındı.",
    signals: webDecision.signals,
  };
}

export function assertRedemptionEligibility(input: {
  availablePoints: number;
  pointsCost: number;
  stock: number;
  priorRedemptions: number;
  maxPerUser: number;
  riskStatus: "normal" | "watch" | "review" | "restricted" | "suspended";
}) {
  if (input.riskStatus === "restricted" || input.riskStatus === "suspended") throw new Error("RISK_REVIEW_REQUIRED");
  if (input.stock < 1) throw new Error("REWARD_OUT_OF_STOCK");
  if (input.availablePoints < input.pointsCost) throw new Error("INSUFFICIENT_POINTS");
  if (input.priorRedemptions >= input.maxPerUser) throw new Error("REWARD_USER_LIMIT_REACHED");
}

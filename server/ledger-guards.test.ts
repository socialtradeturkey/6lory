import { describe, expect, it, vi } from "vitest";
import { assertRedemptionEligibility } from "./domain";
import { writeTaskReward } from "./routers";

describe("ledger ve redemption korumaları", () => {
  it("aynı doğrulama denemesi için mevcut ledger kaydını döndürür ve ikinci puanı yazmaz", async () => {
    const existingLedger = { id: 91, idempotencyKey: "task:700" };
    const insert = vi.fn();
    const update = vi.fn();
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [existingLedger] }) }) }),
      insert,
      update,
    };

    const result = await writeTaskReward(tx, { userId: 1, taskId: 5, verificationAttemptId: 700, points: 120 });

    expect(result).toEqual(existingLedger);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("ilk geçerli doğrulamada tekil ledger anahtarıyla bakiyeyi projekte eder", async () => {
    let selectCount = 0;
    const updates: unknown[] = [];
    const inserts: unknown[] = [];
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => {
        selectCount += 1;
        return selectCount === 1 ? [] : [{ availablePoints: 50, lifetimeEarned: 80 }];
      } }) }) }),
      update: () => ({ set: (value: unknown) => { updates.push(value); return { where: async () => undefined }; } }),
      insert: () => ({ values: (value: unknown) => { inserts.push(value); return undefined; } }),
    };

    const result = await writeTaskReward(tx, { userId: 1, taskId: 8, verificationAttemptId: 701, points: 120 });

    expect(result).toEqual({ balanceAfter: 170 });
    expect(updates).toContainEqual({ availablePoints: 170, lifetimeEarned: 200 });
    expect(inserts).toContainEqual(expect.objectContaining({ idempotencyKey: "task:701", amount: 120, balanceAfter: 170 }));
  });

  it("stok, kullanıcı limiti ve yüksek riskte ödül kullanımını engeller", () => {
    const base = { availablePoints: 500, pointsCost: 100, stock: 1, priorRedemptions: 0, maxPerUser: 1, riskStatus: "normal" as const };
    expect(() => assertRedemptionEligibility({ ...base, stock: 0 })).toThrow("REWARD_OUT_OF_STOCK");
    expect(() => assertRedemptionEligibility({ ...base, priorRedemptions: 1 })).toThrow("REWARD_USER_LIMIT_REACHED");
    expect(() => assertRedemptionEligibility({ ...base, riskStatus: "restricted" })).toThrow("RISK_REVIEW_REQUIRED");
  });
});

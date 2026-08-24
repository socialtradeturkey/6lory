import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import {
  notifications,
  pointBalances,
  pointLedger,
  rewardRedemptions,
  rewards,
  taskAssignments,
  taskSessions,
  tasks,
  trustScores,
  userProfiles,
  users,
  verificationAttempts,
  verificationSignals,
  manualReviews,
} from "../drizzle/schema";
import { appRouter } from "./routers";

const runRealDbIntegration = process.env.RUN_REAL_DB_INTEGRATION === "1";
const runId = `itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

let testUserId: number | undefined;
let testTaskId: number | undefined;
let testRewardId: number | undefined;

function createUserContext(userId: number): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: userId,
      openId: `${runId}_open_id`,
      name: "6lory Integration Test",
      email: `${runId}@example.invalid`,
      loginMethod: "integration-test",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

async function cleanIntegrationFixtures() {
  const db = await getDb();
  if (!db || !testUserId) return;

  const attempts = await db
    .select({ id: verificationAttempts.id })
    .from(verificationAttempts)
    .where(eq(verificationAttempts.userId, testUserId));
  const attemptIds = attempts.map(attempt => attempt.id);

  await db.delete(notifications).where(eq(notifications.userId, testUserId));
  await db.delete(pointLedger).where(eq(pointLedger.userId, testUserId));
  await db
    .delete(rewardRedemptions)
    .where(eq(rewardRedemptions.userId, testUserId));
  if (attemptIds.length) {
    await db
      .delete(verificationSignals)
      .where(inArray(verificationSignals.verificationAttemptId, attemptIds));
    await db
      .delete(manualReviews)
      .where(inArray(manualReviews.verificationAttemptId, attemptIds));
  }
  await db
    .delete(verificationAttempts)
    .where(eq(verificationAttempts.userId, testUserId));
  await db.delete(taskSessions).where(eq(taskSessions.userId, testUserId));
  await db
    .delete(taskAssignments)
    .where(eq(taskAssignments.userId, testUserId));
  if (testTaskId) await db.delete(tasks).where(eq(tasks.id, testTaskId));
  if (testRewardId)
    await db.delete(rewards).where(eq(rewards.id, testRewardId));
  await db.delete(pointBalances).where(eq(pointBalances.userId, testUserId));
  await db.delete(trustScores).where(eq(trustScores.userId, testUserId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  await db.delete(users).where(eq(users.id, testUserId));

  testUserId = undefined;
  testTaskId = undefined;
  testRewardId = undefined;
}

afterEach(async () => {
  await cleanIntegrationFixtures();
});

describe.runIf(runRealDbIntegration)(
  "gerçek DB kritik kullanıcı yolculuğu",
  () => {
    it("tasks.start → Secret Code verify → idempotent ledger → rewards.redeem zincirini temiz yan etkilerle tamamlar", async () => {
      const db = await getDb();
      if (!db) throw new Error("DATABASE_URL gerekli");

      const userResult = await db.insert(users).values({
        openId: `${runId}_open_id`,
        name: "6lory Integration Test",
        email: `${runId}@example.invalid`,
        loginMethod: "integration-test",
        role: "user",
      });
      testUserId = Number(userResult[0].insertId);

      await db.insert(userProfiles).values({
        userId: testUserId,
        username: runId.slice(0, 48),
        displayName: "6lory Integration Test",
        onboardingStatus: "completed",
      });
      await db.insert(pointBalances).values({ userId: testUserId });
      await db.insert(trustScores).values({
        userId: testUserId,
        score: 80,
        status: "normal",
      });

      const taskResult = await db.insert(tasks).values({
        title: `${runId} görev`,
        description: "Gerçek DB bütünlük testi için geçici görev.",
        platform: "web",
        actionType: "VISIT",
        rewardPoints: 100,
        totalQuota: 1,
        perUserLimit: 1,
        status: "active",
        verificationMethod: "secret_code",
        fallbackMethod: "none",
        estimatedDurationSeconds: 60,
        sessionDurationSeconds: 900,
        instructions: ["Bu, otomatik bütünlük testidir."],
        createdBy: 1,
      });
      testTaskId = Number(taskResult[0].insertId);

      const rewardResult = await db.insert(rewards).values({
        name: `${runId} ödül`,
        description: "Gerçek DB bütünlük testi için geçici ödül.",
        pointsCost: 40,
        stock: 2,
        status: "active",
        deliveryType: "digital",
        maxPerUser: 1,
      });
      testRewardId = Number(rewardResult[0].insertId);

      const caller = appRouter.createCaller(createUserContext(testUserId));
      const signals = {
        sessionValid: true,
        activeSeconds: 60,
        visibilityScore: 100,
        interactionCount: 2,
      };
      const startKey = `${runId}_start`;
      const verifyKey = `${runId}_verify`;
      const redeemKey = `${runId}_redeem`;

      const started = await caller.tasks.start({
        taskId: testTaskId,
        idempotencyKey: startKey,
      });
      expect(started.reused).toBe(false);
      expect(started.session?.status).toBe("active");

      const secret = await caller.tasks.issueSecretCode({
        sessionPublicId: started.session!.publicId,
        signals,
      });
      expect(secret.code).toMatch(/^\d{6}$/);

      const verified = await caller.tasks.verify({
        sessionPublicId: started.session!.publicId,
        idempotencyKey: verifyKey,
        secretCode: secret.code,
        signals,
      });
      expect(verified.idempotent).toBe(false);
      expect(verified.verification?.status).toBe("pass");

      const replay = await caller.tasks.verify({
        sessionPublicId: started.session!.publicId,
        idempotencyKey: verifyKey,
        secretCode: secret.code,
        signals,
      });
      expect(replay.idempotent).toBe(true);

      const taskLedger = await db
        .select()
        .from(pointLedger)
        .where(
          eq(pointLedger.idempotencyKey, `task:${verified.verification!.id}`)
        );
      const sessionRows = await db
        .select()
        .from(taskSessions)
        .where(eq(taskSessions.publicId, started.session!.publicId));
      const assignmentRows = await db
        .select()
        .from(taskAssignments)
        .where(eq(taskAssignments.id, started.session!.assignmentId));
      const balanceAfterVerify = await db
        .select()
        .from(pointBalances)
        .where(eq(pointBalances.userId, testUserId));

      expect(taskLedger).toHaveLength(1);
      expect(taskLedger[0]).toMatchObject({
        type: "task_reward",
        amount: 100,
        balanceAfter: 100,
      });
      expect(sessionRows[0]).toMatchObject({
        status: "verified",
        verificationState: "passed",
      });
      expect(assignmentRows[0]).toMatchObject({ status: "completed" });
      expect(balanceAfterVerify[0]).toMatchObject({
        availablePoints: 100,
        lifetimeEarned: 100,
      });

      const redeemed = await caller.rewards.redeem({
        rewardId: testRewardId,
        idempotencyKey: redeemKey,
      });
      expect(redeemed.idempotent).toBe(false);
      expect(redeemed.redemption).toMatchObject({
        rewardId: testRewardId,
        pointsCost: 40,
        status: "requested",
      });

      const balanceAfterRedeem = await db
        .select()
        .from(pointBalances)
        .where(eq(pointBalances.userId, testUserId));
      const rewardRows = await db
        .select()
        .from(rewards)
        .where(eq(rewards.id, testRewardId));
      const redemptionLedger = await db
        .select()
        .from(pointLedger)
        .where(eq(pointLedger.idempotencyKey, `redeem:${redeemKey}`));
      const redemptionRows = await db
        .select()
        .from(rewardRedemptions)
        .where(eq(rewardRedemptions.id, redeemed.redemption!.id));

      expect(balanceAfterRedeem[0]).toMatchObject({
        availablePoints: 60,
        lifetimeEarned: 100,
        lifetimeSpent: 40,
      });
      expect(rewardRows[0].stock).toBe(1);
      expect(redemptionRows).toHaveLength(1);
      expect(redemptionLedger[0]).toMatchObject({
        type: "reward_redemption",
        amount: -40,
        balanceAfter: 60,
      });

      const summaryBeforeRead = await caller.dashboard.summary();
      expect(summaryBeforeRead.unreadNotifications).toBe(2);

      const markedRead = await caller.notifications.markAllRead();
      expect(markedRead.updated).toBe(2);
      const summaryAfterRead = await caller.dashboard.summary();
      expect(summaryAfterRead.unreadNotifications).toBe(0);

      const clearedRead = await caller.notifications.clearRead();
      expect(clearedRead.deleted).toBe(2);
      expect(await caller.notifications.list()).toHaveLength(0);
    }, 30_000);
  }
);

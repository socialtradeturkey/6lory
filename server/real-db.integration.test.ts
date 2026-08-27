import { afterEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";
import { getDb, upsertUser } from "./db";
import {
  auditLogs,
  campaigns,
  commentPools,
  comments,
  notifications,
  pointBalances,
  pointLedger,
  rewardRedemptions,
  rewards,
  riskEvents,
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
let testCampaignId: number | undefined;
let testCampaignTaskId: number | undefined;
let testCommentPoolId: number | undefined;
let testCommentId: number | undefined;
const testRedemptionIds: number[] = [];

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

function createAdminContext(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 1,
      openId: "integration-admin",
      name: "Integration Admin",
      email: "admin@example.invalid",
      loginMethod: "integration-test",
      role: "admin",
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
  await db.delete(riskEvents).where(eq(riskEvents.userId, testUserId));
  const auditTargets = [
    testCampaignId,
    testCampaignTaskId,
    testCommentId,
    ...testRedemptionIds,
    testUserId,
  ]
    .filter((value): value is number => value !== undefined)
    .map(String);
  if (auditTargets.length) {
    await db.delete(auditLogs).where(
      and(
        eq(auditLogs.actorUserId, 1),
        inArray(auditLogs.entityId, auditTargets),
      ),
    );
  }
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
  if (testCampaignTaskId)
    await db.delete(tasks).where(eq(tasks.id, testCampaignTaskId));
  if (testCampaignId)
    await db.delete(campaigns).where(eq(campaigns.id, testCampaignId));
  if (testCommentPoolId)
    await db.delete(commentPools).where(eq(commentPools.id, testCommentPoolId));
  if (testRewardId)
    await db.delete(rewards).where(eq(rewards.id, testRewardId));
  await db.delete(pointBalances).where(eq(pointBalances.userId, testUserId));
  await db.delete(trustScores).where(eq(trustScores.userId, testUserId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  await db.delete(users).where(eq(users.id, testUserId));

  testUserId = undefined;
  testTaskId = undefined;
  testRewardId = undefined;
  testCampaignId = undefined;
  testCampaignTaskId = undefined;
  testCommentPoolId = undefined;
  testCommentId = undefined;
  testRedemptionIds.length = 0;
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
        maxPerUser: 2,
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

      const admin = appRouter.createCaller(createAdminContext());
      const campaign = await admin.admin.createCampaign({
        name: `${runId} kampanya`,
        description: "İzole yönetici operasyon testi.",
        pointBudget: 500,
      });
      testCampaignId = campaign.id;
      await admin.admin.setCampaignStatus({
        campaignId: campaign.id,
        status: "active",
      });
      const campaignTask = await admin.admin.createTask({
        campaignId: campaign.id,
        title: `${runId} kampanya görevi`,
        platform: "web",
        actionType: "VISIT",
        rewardPoints: 25,
        totalQuota: 10,
        perUserLimit: 1,
        verificationMethod: "manual_review",
        fallbackMethod: "manual_review",
        estimatedDurationSeconds: 30,
        sessionDurationSeconds: 900,
        instructions: ["İzole yönetici görev testi."],
      });
      testCampaignTaskId = campaignTask.id;

      const campaignRows = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaign.id));
      const campaignTaskRows = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, campaignTask.id));
      expect(campaignRows[0]).toMatchObject({ status: "active" });
      expect(campaignTaskRows[0]).toMatchObject({
        campaignId: campaign.id,
        status: "active",
        audienceMode: "assigned",
        claimedQuota: 0,
        totalQuota: 10,
      });
      expect(campaignTaskRows[0].assignmentTargetCount).toBeGreaterThan(0);
      await admin.admin.setTaskStatus({
        taskId: campaignTask.id,
        status: "paused",
      });
      await admin.admin.setTaskStatus({
        taskId: campaignTask.id,
        status: "archived",
      });
      const archivedCampaignTask = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, campaignTask.id));
      expect(archivedCampaignTask[0]).toMatchObject({ status: "archived" });
      await expect(caller.tasks.detail({ taskId: campaignTask.id })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      testRedemptionIds.push(redeemed.redemption!.id);
      await admin.admin.processRewardRedemption({
        redemptionId: redeemed.redemption!.id,
        status: "under_review",
        note: "Talep inceleme kuyruğuna alındı.",
      });
      await admin.admin.processRewardRedemption({
        redemptionId: redeemed.redemption!.id,
        status: "rejected",
        note: "İzole test kapsamında talep reddedildi.",
      });
      const rejectedRedemption = await db
        .select()
        .from(rewardRedemptions)
        .where(eq(rewardRedemptions.id, redeemed.redemption!.id));
      const refundedBalance = await db
        .select()
        .from(pointBalances)
        .where(eq(pointBalances.userId, testUserId));
      const refundLedger = await db
        .select()
        .from(pointLedger)
        .where(eq(pointLedger.idempotencyKey, `refund:redemption:${redeemed.redemption!.id}`));
      expect(rejectedRedemption[0]).toMatchObject({ status: "rejected" });
      expect(refundedBalance[0]).toMatchObject({ availablePoints: 100, lifetimeSpent: 0 });
      expect(refundLedger).toHaveLength(1);
      expect(refundLedger[0]).toMatchObject({ type: "reversal", amount: 40, balanceAfter: 100 });
      const restockedReward = await db
        .select()
        .from(rewards)
        .where(eq(rewards.id, testRewardId));
      expect(restockedReward[0]).toMatchObject({ stock: 2 });

      const deliveryRedeemKey = `${runId}_redeem_delivery`;
      const deliveryRedemption = await caller.rewards.redeem({
        rewardId: testRewardId,
        idempotencyKey: deliveryRedeemKey,
      });
      testRedemptionIds.push(deliveryRedemption.redemption!.id);
      await admin.admin.processRewardRedemption({
        redemptionId: deliveryRedemption.redemption!.id,
        status: "approved",
        note: "İzole test kapsamında talep onaylandı.",
      });
      await admin.admin.processRewardRedemption({
        redemptionId: deliveryRedemption.redemption!.id,
        status: "preparing",
        note: "Ödül teslimat için hazırlanıyor.",
      });
      await admin.admin.processRewardRedemption({
        redemptionId: deliveryRedemption.redemption!.id,
        status: "shipped",
        note: "Ödül teslimata çıkarıldı.",
      });
      await admin.admin.processRewardRedemption({
        redemptionId: deliveryRedemption.redemption!.id,
        status: "delivered",
        note: "Ödül teslim edildi.",
      });
      const deliveredRedemption = await db
        .select()
        .from(rewardRedemptions)
        .where(eq(rewardRedemptions.id, deliveryRedemption.redemption!.id));
      const deliveryAudit = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, String(deliveryRedemption.redemption!.id)));
      const deliveryNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testUserId));
      expect(deliveredRedemption[0]).toMatchObject({ status: "delivered" });
      expect(deliveryAudit.filter(log => log.action === "redemption.status_changed")).toHaveLength(4);
      expect(deliveryNotifications.filter(item => item.type === "reward_status_updated")).toHaveLength(6);
      await admin.admin.setRewardStatus({
        rewardId: testRewardId,
        status: "paused",
      });
      await admin.admin.setRewardStatus({
        rewardId: testRewardId,
        status: "archived",
      });
      const archivedReward = await db
        .select()
        .from(rewards)
        .where(eq(rewards.id, testRewardId));
      expect(archivedReward[0]).toMatchObject({ status: "archived" });

      await admin.admin.updateRiskStatus({
        userId: testUserId,
        status: "restricted",
        reason: "İzole risk aksiyonu testi.",
      });
      const restrictedTrust = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.userId, testUserId));
      const riskRows = await db
        .select()
        .from(riskEvents)
        .where(eq(riskEvents.userId, testUserId));
      expect(restrictedTrust[0]).toMatchObject({ status: "restricted" });
      expect(riskRows.some(row => row.type === "admin_risk_status_change")).toBe(true);
      const riskNotification = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, testUserId),
            eq(notifications.type, "account_risk_status_updated"),
          ),
        );
      expect(riskNotification).toHaveLength(1);

      const pool = await admin.admin.createCommentPool({
        name: `${runId} yorum havuzu`,
      });
      testCommentPoolId = pool.id;
      const comment = await admin.admin.addComment({
        poolId: pool.id,
        body: "İzole yönetici içerik testi.",
        weight: 5,
      });
      testCommentId = comment.id;
      const poolComments = await admin.admin.listComments({ poolId: pool.id });
      expect(poolComments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: comment.id, weight: 5 }),
        ]),
      );

      const adminAudit = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.actorUserId, 1));
      expect(adminAudit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: "campaign.status_changed", entityId: String(campaign.id) }),
          expect.objectContaining({ action: "task.created", entityId: String(campaignTask.id) }),
          expect.objectContaining({ action: "task.status_changed", entityId: String(campaignTask.id) }),
          expect.objectContaining({ action: "redemption.status_changed", entityId: String(redeemed.redemption!.id) }),
          expect.objectContaining({ action: "reward.status_changed", entityId: String(testRewardId) }),
          expect.objectContaining({ action: "risk.status_changed", entityId: String(testUserId) }),
          expect.objectContaining({ action: "comment_pool.comment_added", entityId: String(comment.id) }),
        ]),
      );
    }, 60_000);

    it("aynı e-posta ile farklı OAuth openId geldiğinde mevcut admin rolünü korur", async () => {
      const db = await getDb();
      if (!db) throw new Error("DATABASE_URL gerekli");

      const inserted = await db.insert(users).values({
        openId: `${runId}_local_open_id`,
        name: "OAuth Link Admin",
        email: `${runId}@example.invalid`,
        loginMethod: "email",
        role: "admin",
      });
      testUserId = Number(inserted[0].insertId);

      await upsertUser({
        openId: `${runId}_google_open_id`,
        name: "OAuth Link Admin",
        email: `${runId}@example.invalid`,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const matches = await db
        .select()
        .from(users)
        .where(eq(users.email, `${runId}@example.invalid`));
      expect(matches).toHaveLength(1);
      expect(matches[0]).toEqual(
        expect.objectContaining({
          openId: `${runId}_google_open_id`,
          role: "admin",
          loginMethod: "google",
        }),
      );
    });
  }
);

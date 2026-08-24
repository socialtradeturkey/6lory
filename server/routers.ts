import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  auditLogs,
  campaigns,
  commentPools,
  comments,
  manualReviews,
  notifications,
  pointBalances,
  pointLedger,
  rewardRedemptions,
  rewards,
  rolePermissions,
  socialAccounts,
  taskAssignments,
  taskSessions,
  tasks,
  trustScores,
  userProfiles,
  verificationAttempts,
  verificationSignals,
  webPushSubscriptions,
} from "../drizzle/schema";
import {
  assertRedemptionEligibility,
  createSecretCode,
  evaluateWebSignals,
  getTaskSessionAccess,
  getTaskStartEligibility,
  hashSecretCode,
  isMatchingSecretCode,
  resolveVerification,
} from "./domain";
import { getDb } from "./db";
import { assertWebPushConfigured, getWebPushStatus } from "./webpush";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";

const idempotencyKey = z.string().min(12).max(96);
const taskSessionInput = z.object({
  sessionValid: z.boolean(),
  activeSeconds: z.number().int().min(0).max(86_400),
  visibilityScore: z.number().min(0).max(100),
  interactionCount: z.number().int().min(0).max(10_000),
});
const eligibilityRuleInput = z.object({
  minimumTrustScore: z.number().int().min(0).max(100).optional(),
  requiresVerifiedSocial: z.boolean().optional(),
  maxDailyTasks: z.number().int().min(1).max(100).optional(),
});

async function databaseOrThrow() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Veritabanı şu anda kullanılamıyor.",
    });
  return db;
}

async function requireAdminCapability(
  user: { role: string },
  capability: string
) {
  const db = await databaseOrThrow();
  const [permission] = await db
    .select({ id: rolePermissions.id })
    .from(rolePermissions)
    .where(
      and(
        eq(
          rolePermissions.roleCode,
          user.role as
            | "user"
            | "admin"
            | "moderator"
            | "verification_reviewer"
            | "reward_manager"
        ),
        eq(rolePermissions.permission, capability)
      )
    )
    .limit(1);
  if (!permission)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Bu yönetici işlemi için gerekli izin atanmamış.",
    });
}

function productError(error: unknown): never {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    RISK_REVIEW_REQUIRED: "Bu ödül talebi risk incelemesi gerektiriyor.",
    REWARD_OUT_OF_STOCK: "Bu ödül şu anda stokta yok.",
    INSUFFICIENT_POINTS: "Bu ödül için yeterli puanınız yok.",
    REWARD_USER_LIMIT_REACHED: "Bu ödül için kullanıcı limitinize ulaştınız.",
  };
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: messages[code] ?? "İşlem şu anda tamamlanamadı.",
  });
}

export async function writeTaskReward(
  tx: any,
  input: {
    userId: number;
    taskId: number;
    verificationAttemptId: number;
    points: number;
  }
) {
  const ledgerKey = `task:${input.verificationAttemptId}`;
  const [existing] = await tx
    .select()
    .from(pointLedger)
    .where(eq(pointLedger.idempotencyKey, ledgerKey))
    .limit(1);
  if (existing) return existing;

  let [balance] = await tx
    .select()
    .from(pointBalances)
    .where(eq(pointBalances.userId, input.userId))
    .limit(1);
  if (!balance) {
    await tx.insert(pointBalances).values({ userId: input.userId });
    [balance] = await tx
      .select()
      .from(pointBalances)
      .where(eq(pointBalances.userId, input.userId))
      .limit(1);
  }
  const nextBalance = (balance?.availablePoints ?? 0) + input.points;
  await tx
    .update(pointBalances)
    .set({
      availablePoints: nextBalance,
      lifetimeEarned: (balance?.lifetimeEarned ?? 0) + input.points,
    })
    .where(eq(pointBalances.userId, input.userId));
  await tx.insert(pointLedger).values({
    idempotencyKey: ledgerKey,
    userId: input.userId,
    type: "task_reward",
    amount: input.points,
    taskId: input.taskId,
    verificationAttemptId: input.verificationAttemptId,
    balanceAfter: nextBalance,
    reason: "Doğrulanmış görev ödülü",
  });
  return { balanceAfter: nextBalance };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const db = await databaseOrThrow();
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, ctx.user.id))
        .limit(1);
      const [balance] = await db
        .select()
        .from(pointBalances)
        .where(eq(pointBalances.userId, ctx.user.id))
        .limit(1);
      const [trust] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.userId, ctx.user.id))
        .limit(1);
      return { user: ctx.user, profile, balance, trust };
    }),
    setup: protectedProcedure
      .input(
        z.object({
          username: z
            .string()
            .trim()
            .min(3)
            .max(48)
            .regex(/^[a-zA-Z0-9_]+$/),
          displayName: z.string().trim().min(2).max(96).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        try {
          await db
            .insert(userProfiles)
            .values({
              userId: ctx.user.id,
              username: input.username,
              displayName: input.displayName,
              onboardingStatus: "completed",
            });
          await db
            .insert(pointBalances)
            .values({ userId: ctx.user.id })
            .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
          await db
            .insert(trustScores)
            .values({ userId: ctx.user.id })
            .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
          return { success: true };
        } catch {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Bu kullanıcı adı kullanılıyor veya profil zaten oluşturulmuş.",
          });
        }
      }),
    socialAccounts: protectedProcedure.query(async ({ ctx }) => {
      const db = await databaseOrThrow();
      return db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.userId, ctx.user.id));
    }),
    addSocialAccount: protectedProcedure
      .input(
        z.object({
          platform: z.enum(["instagram", "youtube", "tiktok"]),
          username: z.string().trim().min(2).max(160),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        try {
          const result = await db
            .insert(socialAccounts)
            .values({
              userId: ctx.user.id,
              ...input,
              verificationStatus: "pending",
            });
          return { id: Number(result[0].insertId), status: "pending" as const };
        } catch {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Bu sosyal hesap zaten profilinize eklenmiş.",
          });
        }
      }),
  }),

  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await databaseOrThrow();
      const [balance] = await db
        .select()
        .from(pointBalances)
        .where(eq(pointBalances.userId, ctx.user.id))
        .limit(1);
      const [trust] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.userId, ctx.user.id))
        .limit(1);
      const unread = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, ctx.user.id),
            eq(notifications.status, "unread")
          )
        );
      const completed = await db
        .select()
        .from(taskAssignments)
        .where(
          and(
            eq(taskAssignments.userId, ctx.user.id),
            eq(taskAssignments.status, "completed")
          )
        );
      return {
        balance: balance ?? {
          availablePoints: 0,
          pendingPoints: 0,
          lifetimeEarned: 0,
          lifetimeSpent: 0,
        },
        trust,
        unreadNotifications: unread.length,
        completedTasks: completed.length,
      };
    }),
  }),

  tasks: router({
    list: protectedProcedure.query(async () => {
      const db = await databaseOrThrow();
      const now = new Date();
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "active"),
            or(isNull(tasks.startsAt), lte(tasks.startsAt, now)),
            or(isNull(tasks.endsAt), gte(tasks.endsAt, now))
          )
        )
        .orderBy(desc(tasks.priority), desc(tasks.createdAt));
    }),
    detail: protectedProcedure
      .input(z.object({ taskId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await databaseOrThrow();
        const [task] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, input.taskId))
          .limit(1);
        if (!task)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Görev bulunamadı.",
          });
        return task;
      }),
    start: protectedProcedure
      .input(z.object({ taskId: z.number().int().positive(), idempotencyKey }))
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [reused] = await tx
            .select()
            .from(taskSessions)
            .where(
              and(
                eq(taskSessions.userId, ctx.user.id),
                eq(taskSessions.startIdempotencyKey, input.idempotencyKey)
              )
            )
            .limit(1);
          if (reused) return { session: reused, reused: true };

          const [task] = await tx
            .select()
            .from(tasks)
            .where(eq(tasks.id, input.taskId))
            .limit(1);
          if (!task) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Bu görev şu anda başlatılamıyor.",
            });
          }
          let [assignment] = await tx
            .select()
            .from(taskAssignments)
            .where(
              and(
                eq(taskAssignments.taskId, task.id),
                eq(taskAssignments.userId, ctx.user.id)
              )
            )
            .limit(1);
          const eligibility = getTaskStartEligibility({
            status: task.status,
            startsAt: task.startsAt,
            endsAt: task.endsAt,
            claimedQuota: task.claimedQuota,
            totalQuota: task.totalQuota,
            existingAssignmentStatus: assignment?.status,
          });
          if (!eligibility.allowed) {
            const isQuota = eligibility.code === "TASK_QUOTA_REACHED";
            throw new TRPCError({
              code: isQuota ? "CONFLICT" : "BAD_REQUEST",
              message: isQuota
                ? "Bu görevin kotası doldu."
                : "Bu görev şu anda başlatılamıyor.",
            });
          }
          if (!assignment) {
            await tx
              .update(tasks)
              .set({ claimedQuota: task.claimedQuota + 1 })
              .where(eq(tasks.id, task.id));
            const created = await tx
              .insert(taskAssignments)
              .values({
                taskId: task.id,
                userId: ctx.user.id,
                expiresAt: task.endsAt,
              });
            [assignment] = await tx
              .select()
              .from(taskAssignments)
              .where(eq(taskAssignments.id, Number(created[0].insertId)))
              .limit(1);
          }
          if (!assignment) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Bu görev size yeniden atanamaz.",
            });
          }
          const publicId = nanoid(24);
          const session = {
            publicId,
            startIdempotencyKey: input.idempotencyKey,
            taskId: task.id,
            assignmentId: assignment.id,
            userId: ctx.user.id,
            signedReferenceHash: hashSecretCode(
              `${ctx.user.id}:${task.id}:${publicId}`
            ),
            status: "active" as const,
            expiresAt: new Date(
              Math.min(
                task.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
                Date.now() + task.sessionDurationSeconds * 1000
              )
            ),
          };
          await tx.insert(taskSessions).values(session);
          const [stored] = await tx
            .select()
            .from(taskSessions)
            .where(eq(taskSessions.publicId, publicId))
            .limit(1);
          return { session: stored, reused: false };
        });
      }),
    issueSecretCode: protectedProcedure
      .input(
        z.object({
          sessionPublicId: z.string().min(12),
          signals: taskSessionInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        const [session] = await db
          .select()
          .from(taskSessions)
          .where(eq(taskSessions.publicId, input.sessionPublicId))
          .limit(1);
        const access = session
          ? getTaskSessionAccess({
              sessionUserId: session.userId,
              requesterUserId: ctx.user.id,
              expiresAt: session.expiresAt,
              status: session.status,
            })
          : null;
        if (!session || !access?.allowed)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Geçerli görev oturumu bulunamadı.",
          });
        const [task] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, session.taskId))
          .limit(1);
        if (!task || task.verificationMethod !== "secret_code")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Bu görev Secret Code kullanmıyor.",
          });
        const decision = evaluateWebSignals({
          ...input.signals,
          requiredSeconds: task.estimatedDurationSeconds,
        });
        if (decision.status !== "pass")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: decision.reason,
          });
        const code = createSecretCode();
        const expiresAt = new Date(
          Math.min(session.expiresAt.getTime(), Date.now() + 5 * 60 * 1000)
        );
        await db
          .update(taskSessions)
          .set({
            secretCodeHash: hashSecretCode(code),
            secretCodeExpiresAt: expiresAt,
          })
          .where(eq(taskSessions.id, session.id));
        return { code, expiresAt };
      }),
    verify: protectedProcedure
      .input(
        z.object({
          sessionPublicId: z.string().min(12),
          idempotencyKey,
          signals: taskSessionInput,
          secretCode: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [prior] = await tx
            .select()
            .from(verificationAttempts)
            .where(
              eq(verificationAttempts.idempotencyKey, input.idempotencyKey)
            )
            .limit(1);
          if (prior) return { verification: prior, idempotent: true };
          const [session] = await tx
            .select()
            .from(taskSessions)
            .where(eq(taskSessions.publicId, input.sessionPublicId))
            .limit(1);
          const access = session
            ? getTaskSessionAccess({
                sessionUserId: session.userId,
                requesterUserId: ctx.user.id,
                expiresAt: session.expiresAt,
                status: session.status,
              })
            : null;
          if (!session || !access?.allowed)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Görev oturumu geçersiz veya süresi dolmuş.",
            });
          const [task] = await tx
            .select()
            .from(tasks)
            .where(eq(tasks.id, session.taskId))
            .limit(1);
          if (!task)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Görev bulunamadı.",
            });
          const secretCodeValid = Boolean(
            input.secretCode &&
              session.secretCodeExpiresAt &&
              session.secretCodeExpiresAt >= new Date() &&
              !session.secretCodeUsedAt &&
              isMatchingSecretCode(input.secretCode, session.secretCodeHash)
          );
          const decision = resolveVerification({
            method: task.verificationMethod,
            webSignals: {
              ...input.signals,
              requiredSeconds: task.estimatedDurationSeconds,
            },
            secretCodeValid,
          });
          const inserted = await tx.insert(verificationAttempts).values({
            idempotencyKey: input.idempotencyKey,
            taskId: task.id,
            userId: ctx.user.id,
            sessionId: session.id,
            adapter: task.verificationMethod,
            status: decision.status,
            score: decision.score,
            reason: decision.reason,
            completedAt: new Date(),
          });
          const verificationAttemptId = Number(inserted[0].insertId);
          await tx
            .insert(verificationSignals)
            .values(
              Object.entries(decision.signals).map(([key, value]) => ({
                verificationAttemptId,
                key,
                value,
                score: typeof value === "number" ? Math.round(value) : null,
              }))
            );
          if (decision.status === "manual_review")
            await tx.insert(manualReviews).values({ verificationAttemptId });
          if (decision.status === "pass") {
            await writeTaskReward(tx, {
              userId: ctx.user.id,
              taskId: task.id,
              verificationAttemptId,
              points: task.rewardPoints,
            });
            await tx
              .update(taskSessions)
              .set({
                status: "verified",
                verificationState: "passed",
                completedAt: new Date(),
                secretCodeUsedAt:
                  task.verificationMethod === "secret_code"
                    ? new Date()
                    : session.secretCodeUsedAt,
              })
              .where(eq(taskSessions.id, session.id));
            await tx
              .update(taskAssignments)
              .set({ status: "completed", completedAt: new Date() })
              .where(eq(taskAssignments.id, session.assignmentId));
            await tx
              .insert(notifications)
              .values({
                userId: ctx.user.id,
                type: "points_earned",
                title: "Puanlar hesabınıza eklendi",
                body: `+${task.rewardPoints} puan kazandınız.`,
                destination: "/",
              });
          } else {
            await tx
              .update(taskSessions)
              .set({
                status:
                  decision.status === "manual_review"
                    ? "pending_verification"
                    : "rejected",
                verificationState:
                  decision.status === "manual_review"
                    ? "manual_review"
                    : decision.status === "unavailable"
                      ? "unavailable"
                      : "failed",
              })
              .where(eq(taskSessions.id, session.id));
          }
          const [verification] = await tx
            .select()
            .from(verificationAttempts)
            .where(eq(verificationAttempts.id, verificationAttemptId))
            .limit(1);
          return { verification, idempotent: false };
        });
      }),
  }),

  rewards: router({
    list: protectedProcedure.query(async () => {
      const db = await databaseOrThrow();
      return db
        .select()
        .from(rewards)
        .where(eq(rewards.status, "active"))
        .orderBy(desc(rewards.createdAt));
    }),
    redeem: protectedProcedure
      .input(
        z.object({ rewardId: z.number().int().positive(), idempotencyKey })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [existing] = await tx
            .select()
            .from(rewardRedemptions)
            .where(eq(rewardRedemptions.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing) return { redemption: existing, idempotent: true };
          const [reward] = await tx
            .select()
            .from(rewards)
            .where(eq(rewards.id, input.rewardId))
            .limit(1);
          const [balance] = await tx
            .select()
            .from(pointBalances)
            .where(eq(pointBalances.userId, ctx.user.id))
            .limit(1);
          const [trust] = await tx
            .select()
            .from(trustScores)
            .where(eq(trustScores.userId, ctx.user.id))
            .limit(1);
          const prior = await tx
            .select()
            .from(rewardRedemptions)
            .where(
              and(
                eq(rewardRedemptions.userId, ctx.user.id),
                eq(rewardRedemptions.rewardId, input.rewardId)
              )
            );
          if (!reward || reward.status !== "active")
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Ödül bulunamadı veya kullanıma açık değil.",
            });
          try {
            assertRedemptionEligibility({
              availablePoints: balance?.availablePoints ?? 0,
              pointsCost: reward.pointsCost,
              stock: reward.stock,
              priorRedemptions: prior.length,
              maxPerUser: reward.maxPerUser,
              riskStatus: trust?.status ?? "normal",
            });
          } catch (error) {
            productError(error);
          }
          const created = await tx
            .insert(rewardRedemptions)
            .values({
              idempotencyKey: input.idempotencyKey,
              rewardId: reward.id,
              userId: ctx.user.id,
              pointsCost: reward.pointsCost,
              riskSnapshot: {
                score: trust?.score ?? 50,
                status: trust?.status ?? "normal",
              },
            });
          const redemptionId = Number(created[0].insertId);
          const nextBalance =
            (balance?.availablePoints ?? 0) - reward.pointsCost;
          await tx
            .update(rewards)
            .set({ stock: reward.stock - 1 })
            .where(eq(rewards.id, reward.id));
          await tx
            .update(pointBalances)
            .set({
              availablePoints: nextBalance,
              lifetimeSpent: (balance?.lifetimeSpent ?? 0) + reward.pointsCost,
            })
            .where(eq(pointBalances.userId, ctx.user.id));
          await tx
            .insert(pointLedger)
            .values({
              idempotencyKey: `redeem:${input.idempotencyKey}`,
              userId: ctx.user.id,
              type: "reward_redemption",
              amount: -reward.pointsCost,
              rewardRedemptionId: redemptionId,
              balanceAfter: nextBalance,
              reason: "Ödül talebi",
            });
          await tx
            .insert(notifications)
            .values({
              userId: ctx.user.id,
              type: "reward_requested",
              title: "Ödül talebiniz alındı",
              body: `${reward.name} için talebinizi inceleyeceğiz.`,
              destination: "/rewards",
            });
          const [redemption] = await tx
            .select()
            .from(rewardRedemptions)
            .where(eq(rewardRedemptions.id, redemptionId))
            .limit(1);
          return { redemption, idempotent: false };
        });
      }),
  }),

  notifications: router({
    pushStatus: protectedProcedure.query(() => getWebPushStatus()),
    savePushSubscription: protectedProcedure
      .input(
        z.object({
          endpoint: z.string().url().max(2048),
          keys: z.object({
            p256dh: z.string().min(16),
            auth: z.string().min(8),
          }),
          userAgent: z.string().max(512).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertWebPushConfigured();
        const db = await databaseOrThrow();
        await db
          .insert(webPushSubscriptions)
          .values({
            userId: ctx.user.id,
            endpoint: input.endpoint,
            publicKey: input.keys.p256dh,
            authSecret: input.keys.auth,
            userAgent: input.userAgent,
          })
          .onDuplicateKeyUpdate({
            set: {
              userId: ctx.user.id,
              publicKey: input.keys.p256dh,
              authSecret: input.keys.auth,
              userAgent: input.userAgent,
              revokedAt: null,
            },
          });
        await db
          .update(userProfiles)
          .set({ pushEnabled: true })
          .where(eq(userProfiles.userId, ctx.user.id));
        return { success: true };
      }),
    revokePushSubscription: protectedProcedure
      .input(z.object({ endpoint: z.string().url().max(2048) }))
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        await db
          .update(webPushSubscriptions)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(webPushSubscriptions.userId, ctx.user.id),
              eq(webPushSubscriptions.endpoint, input.endpoint)
            )
          );
        return { success: true };
      }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await databaseOrThrow();
      return db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, ctx.user.id))
        .orderBy(desc(notifications.createdAt));
    }),
    markRead: protectedProcedure
      .input(z.object({ notificationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        const result = await db
          .update(notifications)
          .set({ status: "read", readAt: new Date() })
          .where(
            and(
              eq(notifications.id, input.notificationId),
              eq(notifications.userId, ctx.user.id)
            )
          );
        if (!result[0].affectedRows)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Bildirim bulunamadı.",
          });
        return { success: true };
      }),
  }),

  leaderboard: router({
    list: protectedProcedure.query(async () => {
      const db = await databaseOrThrow();
      return db
        .select({
          userId: pointBalances.userId,
          username: userProfiles.username,
          displayName: userProfiles.displayName,
          avatarUrl: userProfiles.avatarUrl,
          lifetimeEarned: pointBalances.lifetimeEarned,
        })
        .from(pointBalances)
        .innerJoin(userProfiles, eq(pointBalances.userId, userProfiles.userId))
        .orderBy(desc(pointBalances.lifetimeEarned))
        .limit(50);
    }),
  }),

  admin: router({
    access: protectedProcedure.query(async ({ ctx }) => {
      const db = await databaseOrThrow();
      const permissions = await db
        .select({ permission: rolePermissions.permission })
        .from(rolePermissions)
        .where(
          eq(
            rolePermissions.roleCode,
            ctx.user.role as
              | "user"
              | "admin"
              | "moderator"
              | "verification_reviewer"
              | "reward_manager"
          )
        );
      return {
        role: ctx.user.role,
        permissions: permissions.map(item => item.permission),
      };
    }),
    overview: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "operations.read");
      const db = await databaseOrThrow();
      const [
        allCampaigns,
        allTasks,
        allReviews,
        allRedemptions,
        allRiskEvents,
      ] = await Promise.all([
        db.select().from(campaigns),
        db.select().from(tasks),
        db
          .select()
          .from(manualReviews)
          .where(eq(manualReviews.status, "pending")),
        db
          .select()
          .from(rewardRedemptions)
          .where(
            or(
              eq(rewardRedemptions.status, "requested"),
              eq(rewardRedemptions.status, "under_review")
            )
          ),
        db
          .select()
          .from(trustScores)
          .where(
            or(
              eq(trustScores.status, "review"),
              eq(trustScores.status, "restricted"),
              eq(trustScores.status, "suspended")
            )
          ),
      ]);
      return {
        totalCampaigns: allCampaigns.length,
        activeTasks: allTasks.filter(task => task.status === "active").length,
        pendingReviews: allReviews.length,
        pendingRedemptions: allRedemptions.length,
        riskUsers: allRiskEvents.length,
      };
    }),
    listCampaigns: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "tasks.write");
      const db = await databaseOrThrow();
      return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    }),
    listTasks: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "tasks.read");
      const db = await databaseOrThrow();
      return db.select().from(tasks).orderBy(desc(tasks.createdAt));
    }),
    listRewards: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "rewards.read");
      const db = await databaseOrThrow();
      return db.select().from(rewards).orderBy(desc(rewards.createdAt));
    }),
    rewardRequests: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "redemptions.read");
      const db = await databaseOrThrow();
      return db
        .select()
        .from(rewardRedemptions)
        .orderBy(desc(rewardRedemptions.createdAt));
    }),
    listCommentPools: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "comment_pools.read");
      const db = await databaseOrThrow();
      return db
        .select()
        .from(commentPools)
        .orderBy(desc(commentPools.createdAt));
    }),
    auditLog: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "audit.read");
      const db = await databaseOrThrow();
      return db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);
    }),
    riskCenter: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "risk.read");
      const db = await databaseOrThrow();
      return db
        .select({
          userId: trustScores.userId,
          score: trustScores.score,
          status: trustScores.status,
          factors: trustScores.factors,
          updatedAt: trustScores.updatedAt,
          username: userProfiles.username,
          displayName: userProfiles.displayName,
        })
        .from(trustScores)
        .leftJoin(userProfiles, eq(trustScores.userId, userProfiles.userId))
        .orderBy(desc(trustScores.updatedAt))
        .limit(100);
    }),
    createCampaign: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(3).max(160),
          description: z.string().max(4000).optional(),
          pointBudget: z.number().int().positive().optional(),
          startsAt: z.date().optional(),
          endsAt: z.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "campaigns.write");
        if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Kampanya bitişi başlangıçtan sonra olmalı.",
          });
        const db = await databaseOrThrow();
        const created = await db
          .insert(campaigns)
          .values({
            ...input,
            status: input.startsAt ? "scheduled" : "draft",
            createdBy: ctx.user.id,
          });
        return { id: Number(created[0].insertId) };
      }),
    createTask: adminProcedure
      .input(
        z.object({
          campaignId: z.number().int().positive().optional(),
          title: z.string().trim().min(3).max(200),
          description: z.string().max(6000).optional(),
          platform: z.enum(["web", "instagram", "youtube", "tiktok", "custom"]),
          actionType: z.string().trim().min(2).max(64),
          targetUrl: z.string().url().optional(),
          rewardPoints: z.number().int().positive().max(1_000_000),
          totalQuota: z.number().int().positive(),
          perUserLimit: z.number().int().positive().max(10),
          verificationMethod: z.enum([
            "web_signals",
            "secret_code",
            "manual_review",
            "platform_api",
            "platform_api_manual_fallback",
          ]),
          fallbackMethod: z
            .enum(["none", "manual_review", "unavailable"])
            .default("none"),
          estimatedDurationSeconds: z.number().int().min(5).max(86_400),
          sessionDurationSeconds: z.number().int().min(60).max(86_400),
          instructions: z.array(z.string().min(1).max(500)).min(1).max(12),
          eligibilityRules: eligibilityRuleInput.optional(),
          startsAt: z.date().optional(),
          endsAt: z.date().optional(),
          priority: z.number().int().min(-10).max(10).default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "tasks.write");
        if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Görev bitişi başlangıçtan sonra olmalı.",
          });
        const db = await databaseOrThrow();
        const status =
          input.startsAt && input.startsAt > new Date()
            ? "scheduled"
            : "active";
        const created = await db
          .insert(tasks)
          .values({ ...input, status, createdBy: ctx.user.id });
        const taskId = Number(created[0].insertId);
        await db
          .insert(auditLogs)
          .values({
            actorUserId: ctx.user.id,
            action: "task.created",
            entityType: "task",
            entityId: String(taskId),
            afterState: {
              title: input.title,
              verificationMethod: input.verificationMethod,
            },
          });
        return { id: taskId, status };
      }),
    createReward: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(3).max(160),
          description: z.string().max(4000).optional(),
          pointsCost: z.number().int().positive(),
          stock: z.number().int().min(0),
          category: z.string().trim().max(96).optional(),
          deliveryType: z.enum([
            "digital",
            "physical",
            "coupon",
            "gift_card",
            "custom",
          ]),
          maxPerUser: z.number().int().min(1).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "rewards.write");
        const db = await databaseOrThrow();
        const created = await db
          .insert(rewards)
          .values({ ...input, status: "active" });
        const rewardId = Number(created[0].insertId);
        await db
          .insert(auditLogs)
          .values({
            actorUserId: ctx.user.id,
            action: "reward.created",
            entityType: "reward",
            entityId: String(rewardId),
            afterState: {
              name: input.name,
              stock: input.stock,
              pointsCost: input.pointsCost,
            },
          });
        return { id: rewardId };
      }),
    createCommentPool: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(3).max(160),
          category: z.string().trim().max(96).optional(),
          language: z.string().trim().min(2).max(16).default("tr"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "comment_pools.write");
        const db = await databaseOrThrow();
        const created = await db
          .insert(commentPools)
          .values({ ...input, createdBy: ctx.user.id });
        return { id: Number(created[0].insertId) };
      }),
    addComment: adminProcedure
      .input(
        z.object({
          poolId: z.number().int().positive(),
          body: z.string().trim().min(3).max(1200),
          weight: z.number().int().min(1).max(100).default(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "comment_pools.write");
        const db = await databaseOrThrow();
        const created = await db.insert(comments).values(input);
        const commentId = Number(created[0].insertId);
        await db
          .insert(auditLogs)
          .values({
            actorUserId: ctx.user.id,
            action: "comment_pool.comment_added",
            entityType: "comment",
            entityId: String(commentId),
            afterState: { poolId: input.poolId },
          });
        return { id: commentId };
      }),
    verificationQueue: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "verification.decide");
      const db = await databaseOrThrow();
      return db
        .select()
        .from(manualReviews)
        .where(eq(manualReviews.status, "pending"))
        .orderBy(desc(manualReviews.createdAt));
    }),
    decideReview: adminProcedure
      .input(
        z.object({
          reviewId: z.number().int().positive(),
          decision: z.enum(["approved", "rejected", "retry_requested"]),
          reason: z.string().trim().min(3).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "verification.decide");
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [review] = await tx
            .select()
            .from(manualReviews)
            .where(eq(manualReviews.id, input.reviewId))
            .limit(1);
          if (!review || review.status !== "pending")
            throw new TRPCError({
              code: "CONFLICT",
              message: "Bu inceleme artık beklemede değil.",
            });
          const [attempt] = await tx
            .select()
            .from(verificationAttempts)
            .where(eq(verificationAttempts.id, review.verificationAttemptId))
            .limit(1);
          if (!attempt)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Doğrulama denemesi bulunamadı.",
            });
          await tx
            .update(manualReviews)
            .set({
              status: input.decision,
              reviewerId: ctx.user.id,
              decisionReason: input.reason,
              decidedAt: new Date(),
            })
            .where(eq(manualReviews.id, review.id));
          if (input.decision === "approved") {
            const [task] = await tx
              .select()
              .from(tasks)
              .where(eq(tasks.id, attempt.taskId))
              .limit(1);
            if (!task)
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Görev bulunamadı.",
              });
            await tx
              .update(verificationAttempts)
              .set({
                status: "pass",
                reason: input.reason,
                completedAt: new Date(),
              })
              .where(eq(verificationAttempts.id, attempt.id));
            await writeTaskReward(tx, {
              userId: attempt.userId,
              taskId: task.id,
              verificationAttemptId: attempt.id,
              points: task.rewardPoints,
            });
            await tx
              .update(taskSessions)
              .set({
                status: "verified",
                verificationState: "passed",
                completedAt: new Date(),
              })
              .where(eq(taskSessions.id, attempt.sessionId));
            await tx
              .update(taskAssignments)
              .set({ status: "completed", completedAt: new Date() })
              .where(
                and(
                  eq(taskAssignments.taskId, attempt.taskId),
                  eq(taskAssignments.userId, attempt.userId)
                )
              );
          } else {
            await tx
              .update(verificationAttempts)
              .set({
                status: "fail",
                reason: input.reason,
                completedAt: new Date(),
              })
              .where(eq(verificationAttempts.id, attempt.id));
          }
          await tx
            .insert(auditLogs)
            .values({
              actorUserId: ctx.user.id,
              action: `verification.${input.decision}`,
              entityType: "manual_review",
              entityId: String(review.id),
              afterState: { reason: input.reason },
            });
          return { success: true };
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;

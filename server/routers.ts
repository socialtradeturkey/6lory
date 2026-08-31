import { TRPCError } from "@trpc/server";
import { promisify } from "node:util";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  auditLogs,
  campaigns,
  commentPools,
  localAuthCredentials,
  comments,
  manualReviews,
  notifications,
  pointBalances,
  pointLedger,
  rewardRedemptions,
  rewards,
  rolePermissions,
  riskEvents,
  socialAccounts,
  taskAssignments,
  taskSessions,
  tasks,
  trustScores,
  userProfiles,
  users,
  youtubeConnections,
  verificationAttempts,
  verificationSignals,
} from "../drizzle/schema.js";
import {
  createYoutubeProof,
  decryptYoutubeToken,
  encryptYoutubeToken,
  extractYoutubeVideoId,
  refreshYoutubeAccessToken,
  revokeYoutubeToken,
  verifyYoutubeProof,
  youtubeRequirementsSatisfied,
  youtubeVerification,
  youtubeSubscribe,
  youtubeLike,
  resolveYoutubeChannel,
} from "./youtube.js";
import {
  assertRedemptionEligibility,
  createSecretCode,
  evaluateWebSignals,
  getServerElapsedSeconds,
  getTaskSessionAccess,
  getTaskStartEligibility,
  hashSecretCode,
  isMatchingSecretCode,
  resolveVerification,
} from "./domain.js";
import { buildOperationsAnalytics } from "./operationsAnalytics.js";
import { isEligibleAudienceUser, planAudienceAssignments } from "./taskAudience.js";
import {
  assertRedemptionTransition,
  needsRedemptionRefund,
  type RedemptionStatus,
} from "./adminWorkflows.js";
import { getDb } from "./db.js";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { sdk } from "./_core/sdk.js";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc.js";

const scrypt = promisify(scryptCallback);
const LOCAL_SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const LOCAL_LOCK_MS = 1000 * 60 * 15;
const LOCAL_MAX_FAILED_ATTEMPTS = 5;
const localPasswordInput = z
  .string()
  .min(10, "Parola en az 10 karakter olmalı.")
  .max(128, "Parola en fazla 128 karakter olabilir.")
  .regex(/[A-Za-z]/, "Parola en az bir harf içermeli.")
  .regex(/[0-9]/, "Parola en az bir rakam içermeli.");

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function adminSetupSignature(userId: number, expiresAt: number) {
  return createHmac("sha256", process.env.JWT_SECRET ?? "").update(`admin-setup:${userId}:${expiresAt}`).digest("base64url");
}

export function createAdminSetupToken(userId: number, expiresAt = Date.now() + 15 * 60 * 1000) {
  return `${userId}.${expiresAt}.${adminSetupSignature(userId, expiresAt)}`;
}

function isValidAdminSetupToken(token: string, userId: number) {
  const [tokenUserId, expiresAtText, signature] = token.split(".");
  const expiresAt = Number(expiresAtText);
  if (Number(tokenUserId) !== userId || !Number.isSafeInteger(expiresAt) || expiresAt < Date.now() || !signature) return false;
  const expected = adminSetupSignature(userId, expiresAt);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function hashLocalPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: derivedKey.toString("hex") };
}

export async function verifyLocalPassword(password: string, salt: string, storedHash: string) {
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(storedHash, "hex");
  return expected.length === derivedKey.length && timingSafeEqual(expected, derivedKey);
}

async function setSessionCookie(ctx: { req: any; res: any }, openId: string, name: string) {
  const token = await sdk.createSessionToken(openId, { expiresInMs: LOCAL_SESSION_MS, name });
  ctx.res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: LOCAL_SESSION_MS,
  });
}

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

function publicTaskSession<T extends { secretCodeCiphertext?: unknown }>(session: T) {
  const { secretCodeCiphertext: _secretCodeCiphertext, ...publicSession } = session;
  return publicSession;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function getYoutubeAccessToken(db: Database, userId: number) {
  const [connection] = await db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, userId)).limit(1);
  if (!connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Önce YouTube hesabınızı bağlayın." });
  let accessToken = decryptYoutubeToken(connection.accessTokenCiphertext);
  if (connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now() + 60_000 && connection.refreshTokenCiphertext) {
    try {
      const refreshed = await refreshYoutubeAccessToken(decryptYoutubeToken(connection.refreshTokenCiphertext));
      accessToken = refreshed.access_token;
      await db.update(youtubeConnections).set({ accessTokenCiphertext: encryptYoutubeToken(accessToken), expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : connection.expiresAt, scopes: refreshed.scope?.split(" ") ?? connection.scopes }).where(eq(youtubeConnections.id, connection.id));
    } catch {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "YouTube yetkisi süresi dolmuş. Profil sayfasından hesabınızı yeniden bağlayın." });
    }
  }
  return { connection, accessToken };
}

async function getYoutubeTaskActionContext(db: Database, sessionPublicId: string, userId: number, action: "subscription" | "like") {
  const [session] = await db.select().from(taskSessions).where(eq(taskSessions.publicId, sessionPublicId)).limit(1);
  const access = session ? getTaskSessionAccess({ sessionUserId: session.userId, requesterUserId: userId, expiresAt: session.expiresAt, status: session.status }) : null;
  if (!session || !access?.allowed) throw new TRPCError({ code: "BAD_REQUEST", message: "Görev oturumu geçersiz veya süresi dolmuş." });
  const [task] = await db.select().from(tasks).where(eq(tasks.id, session.taskId)).limit(1);
  if (!task || task.platform !== "youtube" || (action === "subscription" ? !task.requiresYoutubeSubscription : !task.requiresYoutubeLike)) throw new TRPCError({ code: "BAD_REQUEST", message: "Bu YouTube görevi istenen eylemi kullanmıyor." });
  const requiredWatchSeconds = task.requiredWatchSeconds ?? task.estimatedDurationSeconds;
  if (getServerElapsedSeconds(session.startedAt) < requiredWatchSeconds) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Bu işlem için önce videoyu en az ${requiredWatchSeconds} saniye izlemeniz gerekiyor.`,
    });
  }
  return { session, task };
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
    setupAdminPassword: publicProcedure
      .input(z.object({ token: z.string().min(32).max(512), password: localPasswordInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        const [admin] = await db.select().from(users).where(and(eq(users.email, "murathand08@gmail.com"), eq(users.role, "admin"))).limit(1);
        if (!admin || !isValidAdminSetupToken(input.token, admin.id)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Bu parola kurulum bağlantısı geçersiz veya süresi dolmuş." });
        }
        const [existing] = await db.select({ id: localAuthCredentials.id }).from(localAuthCredentials).where(eq(localAuthCredentials.userId, admin.id)).limit(1);
        const password = await hashLocalPassword(input.password);
        await db.transaction(async tx => {
          if (existing) {
            await tx
              .update(localAuthCredentials)
              .set({
                email: "murathand08@gmail.com",
                passwordHash: password.hash,
                passwordSalt: password.salt,
                failedAttempts: 0,
                lockedUntil: null,
              })
              .where(eq(localAuthCredentials.id, existing.id));
          } else {
            await tx.insert(localAuthCredentials).values({
              userId: admin.id,
              email: "murathand08@gmail.com",
              passwordHash: password.hash,
              passwordSalt: password.salt,
            });
          }
          const [profile] = await tx.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, admin.id)).limit(1);
          if (!profile) {
            await tx.insert(userProfiles).values({ userId: admin.id, username: "murathand08", displayName: admin.name ?? "6lory yöneticisi", onboardingStatus: "completed" });
          }
        });
        return { success: true } as const;
      }),
    register: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(96),
          username: z.string().trim().min(3).max(48).regex(/^[a-zA-Z0-9_]+$/).optional(),
          email: z.string().trim().email().max(320),
          password: localPasswordInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        const email = normalizeEmail(input.email);
        const username = normalizeUsername(input.username ?? `user_${nanoid(10)}`);
        const password = await hashLocalPassword(input.password);
        try {
          const user = await db.transaction(async tx => {
            const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
            if (existing) {
              throw new TRPCError({ code: "CONFLICT", message: "Bu e-posta ile zaten bir hesap bulunuyor." });
            }
            const [existingUsername] = await tx.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.username, username)).limit(1);
            if (existingUsername) {
              throw new TRPCError({ code: "CONFLICT", message: "Bu kullanıcı adı zaten kullanılıyor." });
            }
            const openId = `local_${nanoid(48)}`;
            await tx.insert(users).values({
              openId,
              name: input.name.trim(),
              email,
              loginMethod: "local",
              role: "user",
            });
            const [created] = await tx.select().from(users).where(eq(users.openId, openId)).limit(1);
            if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hesap oluşturulamadı." });
            await tx.insert(localAuthCredentials).values({
              userId: created.id,
              email,
              passwordHash: password.hash,
              passwordSalt: password.salt,
            });
            await tx.insert(userProfiles).values({
              userId: created.id,
              username,
              displayName: input.name.trim(),
              onboardingStatus: "completed",
            });
            return created;
          });
          await setSessionCookie(ctx, user.openId, user.name ?? "6lory kullanıcısı");
          return { success: true } as const;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: "CONFLICT", message: "Bu e-posta ile kayıt tamamlanamadı." });
        }
      }),
    login: publicProcedure
      .input(z.object({ email: z.string().trim().min(3).max(320), password: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        const identifier = input.email.trim().toLowerCase();
        const [matched] = await db
          .select({ credential: localAuthCredentials })
          .from(localAuthCredentials)
          .leftJoin(userProfiles, eq(userProfiles.userId, localAuthCredentials.userId))
          .where(or(eq(localAuthCredentials.email, normalizeEmail(identifier)), eq(userProfiles.username, normalizeUsername(identifier))))
          .limit(1);
        const credential = matched?.credential;
        const invalid = () => new TRPCError({ code: "UNAUTHORIZED", message: "Kullanıcı adı/e-posta veya parola geçersiz." });
        if (!credential) throw invalid();
        const now = Date.now();
        if (credential.lockedUntil && credential.lockedUntil.getTime() > now) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin." });
        }
        const valid = await verifyLocalPassword(input.password, credential.passwordSalt, credential.passwordHash);
        if (!valid) {
          const failedAttempts = credential.failedAttempts + 1;
          await db
            .update(localAuthCredentials)
            .set({
              failedAttempts,
              lockedUntil: failedAttempts >= LOCAL_MAX_FAILED_ATTEMPTS ? new Date(now + LOCAL_LOCK_MS) : null,
            })
            .where(eq(localAuthCredentials.id, credential.id));
          throw invalid();
        }
        await db
          .update(localAuthCredentials)
          .set({ failedAttempts: 0, lockedUntil: null })
          .where(eq(localAuthCredentials.id, credential.id));
        const [user] = await db.select().from(users).where(eq(users.id, credential.userId)).limit(1);
        if (!user || user.accountStatus !== "active") {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Bu hesap aktif değil veya erişimi engellenmiş." });
        }
        await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
        await setSessionCookie(ctx, user.openId, user.name ?? "6lory kullanıcısı");
        return { success: true } as const;
      }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1).max(128),
          newPassword: localPasswordInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        const [credential] = await db
          .select()
          .from(localAuthCredentials)
          .where(eq(localAuthCredentials.userId, ctx.user.id))
          .limit(1);
        if (!credential) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Bu hesap için parola kaydı bulunamadı.",
          });
        }
        const valid = await verifyLocalPassword(
          input.currentPassword,
          credential.passwordSalt,
          credential.passwordHash
        );
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Mevcut parola geçersiz.",
          });
        }
        const password = await hashLocalPassword(input.newPassword);
        await db
          .update(localAuthCredentials)
          .set({
            passwordHash: password.hash,
            passwordSalt: password.salt,
            failedAttempts: 0,
            lockedUntil: null,
          })
          .where(eq(localAuthCredentials.id, credential.id));
        await setSessionCookie(ctx, ctx.user.openId, ctx.user.name ?? "6lory kullanıcısı");
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
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
          await db.insert(userProfiles).values({
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
    update: protectedProcedure
      .input(z.object({ phoneNumber: z.string().trim().min(7).max(32).optional(), province: z.string().trim().min(2).max(64).optional(), age: z.number().int().min(13).max(120).optional(), gender: z.enum(["female", "male", "non_binary", "prefer_not_to_say"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Önce kullanıcı adınızı belirleyin." });
        await db.update(userProfiles).set({ ...input, onboardingStatus: "completed" }).where(eq(userProfiles.userId, ctx.user.id));
        return { success: true };
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
          const result = await db.insert(socialAccounts).values({
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

  youtube: router({
    connectionStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Veritabanı kullanılamıyor." });
      const [connection] = await db.select({ id: youtubeConnections.id, youtubeChannelId: youtubeConnections.youtubeChannelId, scopes: youtubeConnections.scopes, expiresAt: youtubeConnections.expiresAt, lastCheckedAt: youtubeConnections.lastCheckedAt }).from(youtubeConnections).where(eq(youtubeConnections.userId, ctx.user.id)).limit(1);
      return { connected: Boolean(connection), connection: connection ?? null };
    }),
    subscribe: protectedProcedure.input(z.object({ sessionPublicId: z.string().min(12) })).mutation(async ({ ctx, input }) => {
      const db = await databaseOrThrow();
      const { session, task } = await getYoutubeTaskActionContext(db, input.sessionPublicId, ctx.user.id, "subscription");
      if (!task.youtubeChannelId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bu görevin YouTube kanal hedefi yapılandırılmamış." });
      const { accessToken } = await getYoutubeAccessToken(db, ctx.user.id);
      try {
        const result = await youtubeSubscribe(accessToken, task.youtubeChannelId);
        await db.update(taskSessions).set({ progress: { ...(session.progress ?? {}), youtubeSubscribed: true } }).where(eq(taskSessions.id, session.id));
        return result;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "YouTube abonelik işlemi tamamlanamadı." });
      }
    }),
    like: protectedProcedure.input(z.object({ sessionPublicId: z.string().min(12) })).mutation(async ({ ctx, input }) => {
      const db = await databaseOrThrow();
      const { session, task } = await getYoutubeTaskActionContext(db, input.sessionPublicId, ctx.user.id, "like");
      const videoId = extractYoutubeVideoId(task.targetUrl);
      if (!videoId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bu görevin YouTube video hedefi yapılandırılmamış." });
      const { accessToken } = await getYoutubeAccessToken(db, ctx.user.id);
      try {
        const result = await youtubeLike(accessToken, videoId);
        await db.update(taskSessions).set({ progress: { ...(session.progress ?? {}), youtubeLiked: true } }).where(eq(taskSessions.id, session.id));
        return result;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "YouTube beğeni işlemi tamamlanamadı." });
      }
    }),
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Veritabanı kullanılamıyor." });
      const [connection] = await db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, ctx.user.id)).limit(1);
      if (!connection) return { success: true, disconnected: false };
      try {
        await revokeYoutubeToken(decryptYoutubeToken(connection.accessTokenCiphertext));
      } catch {
        // Google may already have revoked the token. Local deletion still prevents further API use.
      }
      await db.delete(youtubeConnections).where(eq(youtubeConnections.id, connection.id));
      return { success: true, disconnected: true };
    }),
    verify: protectedProcedure.input(z.object({ sessionPublicId: z.string().min(12), videoId: z.string().regex(/^[a-zA-Z0-9_-]{6,}$/), channelId: z.string().regex(/^UC[a-zA-Z0-9_-]{10,}$/) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Veritabanı kullanılamıyor." });
      const [connection] = await db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, ctx.user.id)).limit(1);
      if (!connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Önce YouTube hesabınızı bağlayın." });
      let accessToken = decryptYoutubeToken(connection.accessTokenCiphertext);
      if (connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now() + 60_000 && connection.refreshTokenCiphertext) {
        try {
          const refreshed = await refreshYoutubeAccessToken(decryptYoutubeToken(connection.refreshTokenCiphertext));
          accessToken = refreshed.access_token;
          await db.update(youtubeConnections).set({ accessTokenCiphertext: encryptYoutubeToken(accessToken), expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : connection.expiresAt, scopes: refreshed.scope?.split(" ") ?? connection.scopes }).where(eq(youtubeConnections.id, connection.id));
        } catch {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "YouTube yetkisi süresi dolmuş. Profil sayfasından hesabınızı yeniden bağlayın." });
        }
      }
      const [session] = await db.select({ userId: taskSessions.userId, taskId: taskSessions.taskId }).from(taskSessions).where(eq(taskSessions.publicId, input.sessionPublicId)).limit(1);
      if (!session || session.userId !== ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Görev oturumu geçersiz." });
      const [task] = await db.select({ platform: tasks.platform, targetUrl: tasks.targetUrl, youtubeChannelId: tasks.youtubeChannelId, requiresYoutubeSubscription: tasks.requiresYoutubeSubscription, requiresYoutubeLike: tasks.requiresYoutubeLike }).from(tasks).where(eq(tasks.id, session.taskId)).limit(1);
      const expectedVideoId = task ? extractYoutubeVideoId(task.targetUrl) : null;
      if (!task || task.platform !== "youtube" || expectedVideoId !== input.videoId || task.youtubeChannelId !== input.channelId || (!task.requiresYoutubeSubscription && !task.requiresYoutubeLike)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "YouTube doğrulama hedefi görev oturumuyla eşleşmiyor." });
      }
      const result = await youtubeVerification(accessToken, input.videoId, input.channelId);
      const effectiveResult = result;
      await db.update(youtubeConnections).set({ lastCheckedAt: new Date() }).where(eq(youtubeConnections.id, connection.id));
      return {
        ...effectiveResult,
        proofToken: createYoutubeProof({ userId: ctx.user.id, videoId: input.videoId, channelId: input.channelId, ...effectiveResult, checkedAt: Date.now() }),
      };
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
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await databaseOrThrow();
      const now = new Date();
      const visibleTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "active"),
            or(isNull(tasks.startsAt), lte(tasks.startsAt, now)),
            or(isNull(tasks.endsAt), gt(tasks.endsAt, now))
          )
        )
        .orderBy(desc(tasks.priority), desc(tasks.createdAt));
      // Görev görünürlüğü kullanıcı hesabının oluşturulma zamanına veya
      // önceki assignment kayıtlarına bağlanmaz. Admin tarafından silinmemiş
      // (archived olmayan), aktif ve zaman penceresi içindeki görevler yeni
      // kullanıcılar dahil tüm aktif kullanıcılar için keşfedilebilir olmalıdır.
      return visibleTasks;
    }),
    detail: protectedProcedure
      .input(z.object({ taskId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await databaseOrThrow();
        const now = new Date();
        const [task] = await db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.id, input.taskId),
              eq(tasks.status, "active"),
              or(isNull(tasks.startsAt), lte(tasks.startsAt, now)),
              or(isNull(tasks.endsAt), gt(tasks.endsAt, now)),
            ),
          )
          .limit(1);
        if (!task)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Görev bulunamadı veya artık kullanılamıyor.",
          });
        // `audienceMode` assignment/notification operasyonlarında kullanılabilir;
        // görev detayına erişim ise yeni kullanıcıların da aktif görevleri
        // başlatabilmesi için yalnızca status ve zaman penceresiyle sınırlıdır.
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
          if (reused) return { session: publicTaskSession(reused), reused: true };

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
          const [activeSession] = await tx
            .select()
            .from(taskSessions)
            .where(
              and(
                eq(taskSessions.taskId, task.id),
                eq(taskSessions.userId, ctx.user.id),
                eq(taskSessions.status, "active"),
                gte(taskSessions.expiresAt, new Date()),
              )
            )
            .limit(1);
          if (activeSession && task.status === "active" && (!task.startsAt || task.startsAt <= new Date()) && (!task.endsAt || task.endsAt > new Date())) {
            return { session: publicTaskSession(activeSession), reused: true };
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
            const created = await tx.insert(taskAssignments).values({
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
          return { session: stored ? publicTaskSession(stored) : stored, reused: false };
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
          sessionValid: true,
          activeSeconds: getServerElapsedSeconds(session.startedAt),
          requiredSeconds: task.requiredWatchSeconds ?? task.estimatedDurationSeconds,
        });
        if (decision.status !== "pass")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: decision.reason,
          });
        if (session.secretCodeUsedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Bu görev oturumunun Secret Code’u daha önce kullanıldı." });
        }

        if (session.secretCodeHash) {
          if (!session.secretCodeCiphertext || !session.secretCodeExpiresAt) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Bu oturumun Secret Code’u zaten oluşturuldu; yeni kod üretilemez. Lütfen yeni görev oturumu başlatın." });
          }
          if (session.secretCodeExpiresAt < new Date()) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Bu görev oturumunun Secret Code süresi doldu." });
          }
          return { code: decryptYoutubeToken(session.secretCodeCiphertext), expiresAt: session.secretCodeExpiresAt };
        }

        const code = createSecretCode();
        const expiresAt = new Date(
          Math.min(
            session.expiresAt.getTime(),
            Date.now() + (task.secretCodeDisplaySeconds ?? 12) * 1000,
          )
        );
        await db
          .update(taskSessions)
          .set({
            secretCodeHash: hashSecretCode(code),
            secretCodeCiphertext: encryptYoutubeToken(code),
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
          youtubeProof: z.string().min(32).optional(),
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
          const requiredWatchSeconds = task.requiredWatchSeconds ?? task.estimatedDurationSeconds;
          if (getServerElapsedSeconds(session.startedAt) < requiredWatchSeconds) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Görevi göndermek için en az ${requiredWatchSeconds} saniyelik görev süresini tamamlamanız gerekiyor.`,
            });
          }
          // YouTube abonelik/beğeni kontrolü görev gönderimini bloke etmez.
          // Görev, izleme süresi ve doğrulama yöntemi üzerinden değerlendirilir.
          const requiresYoutubeProof = false;
          let youtubeProof: ReturnType<typeof verifyYoutubeProof> = null;
          if (requiresYoutubeProof) {
            const expectedVideoId = extractYoutubeVideoId(task.targetUrl);
            if (!expectedVideoId || !task.youtubeChannelId)
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bu YouTube görevinin kanal veya video doğrulaması yapılandırılmamış." });
            try {
              const { accessToken } = await getYoutubeAccessToken(db, ctx.user.id);
              const current = await youtubeVerification(accessToken, expectedVideoId, task.youtubeChannelId);
              const actionProgress = (session.progress ?? {}) as Record<string, unknown>;
              youtubeProof = {
                userId: ctx.user.id,
                videoId: expectedVideoId,
                channelId: task.youtubeChannelId,
                subscribed: current.subscribed,
                liked: current.liked,
                checkedAt: Date.now(),
              };
            } catch (error) {
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "YouTube koşulları doğrulanamadı." });
            }
            const missingSubscription = task.requiresYoutubeSubscription && !youtubeProof?.subscribed;
            const missingLike = task.requiresYoutubeLike && !youtubeProof?.liked;
            if (!youtubeRequirementsSatisfied({ requiresSubscription: task.requiresYoutubeSubscription, requiresLike: task.requiresYoutubeLike }, youtubeProof))
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: `YouTube koşulları tamamlanmadan görev gönderilemez.${missingSubscription ? " Kanal aboneliği eksik." : ""}${missingLike ? " Video beğenisi eksik." : ""}` });
          }
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
              sessionValid: true,
              activeSeconds: getServerElapsedSeconds(session.startedAt),
              requiredSeconds: task.requiredWatchSeconds ?? task.estimatedDurationSeconds,
            },
            secretCodeValid,
          });
          // Secret Code yalnızca görevin kullanıcı tarafından tamamlandığını kanıtlar.
          // Puan, yönetici kararı verilene kadar hiçbir koşulda ledger'a yazılmaz.
          const verificationStatus = secretCodeValid ? "manual_review" : decision.status;
          const verificationReason = secretCodeValid
            ? requiresYoutubeProof
              ? "Secret Code ve YouTube koşulları doğru; yönetici onayı bekleniyor."
              : "Secret Code doğru; yönetici onayı bekleniyor."
            : decision.reason;
          const inserted = await tx.insert(verificationAttempts).values({
            idempotencyKey: input.idempotencyKey,
            taskId: task.id,
            userId: ctx.user.id,
            sessionId: session.id,
            adapter: task.verificationMethod,
            status: verificationStatus,
            score: decision.score,
            reason: verificationReason,
            completedAt: new Date(),
          });
          const verificationAttemptId = Number(inserted[0].insertId);
          const persistedSignals = {
            ...decision.signals,
            ...(youtubeProof
              ? {
                  youtubeSubscribed: youtubeProof.subscribed,
                  youtubeLiked: youtubeProof.liked,
                  youtubeCheckedAt: youtubeProof.checkedAt,
                }
              : {}),
          };
          try {
            await tx.insert(verificationSignals).values(
              Object.entries(persistedSignals)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => ({
                  verificationAttemptId,
                  key,
                  value,
                  score: typeof value === "number" ? Math.round(value) : null,
                }))
            );
          } catch (signalError) {
            // Signal persistence is audit-only. A schema/serialization issue
            // must never roll back a valid task verification or admin review.
            console.error("verification_signals persistence failed", signalError);
          }
          if (verificationStatus === "manual_review") {
            await tx.insert(manualReviews).values({ verificationAttemptId });
            let [balance] = await tx
              .select()
              .from(pointBalances)
              .where(eq(pointBalances.userId, ctx.user.id))
              .limit(1);
            if (!balance) {
              await tx.insert(pointBalances).values({ userId: ctx.user.id });
              [balance] = await tx
                .select()
                .from(pointBalances)
                .where(eq(pointBalances.userId, ctx.user.id))
                .limit(1);
            }
            await tx
              .update(pointBalances)
              .set({ pendingPoints: (balance?.pendingPoints ?? 0) + task.rewardPoints })
              .where(eq(pointBalances.userId, ctx.user.id));
          }
          if (verificationStatus === "pass") {
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
            await tx.insert(notifications).values({
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
                  verificationStatus === "manual_review"
                    ? "pending_verification"
                    : "rejected",
                verificationState:
                  verificationStatus === "manual_review"
                    ? "manual_review"
                    : verificationStatus === "unavailable"
                      ? "unavailable"
                      : "failed",
                secretCodeUsedAt:
                  verificationStatus === "manual_review" && task.verificationMethod === "secret_code"
                    ? new Date()
                    : session.secretCodeUsedAt,
              })
              .where(eq(taskSessions.id, session.id));
            if (verificationStatus === "manual_review") {
              // Submission consumes the user's one attempt immediately;
              // admin approval controls the reward, not repeat eligibility.
              await tx
                .update(taskAssignments)
                .set({ status: "completed", completedAt: new Date() })
                .where(eq(taskAssignments.id, session.assignmentId));
            }
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
          const created = await tx.insert(rewardRedemptions).values({
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
          await tx.insert(pointLedger).values({
            idempotencyKey: `redeem:${input.idempotencyKey}`,
            userId: ctx.user.id,
            type: "reward_redemption",
            amount: -reward.pointsCost,
            rewardRedemptionId: redemptionId,
            balanceAfter: nextBalance,
            reason: "Ödül talebi",
          });
          await tx.insert(notifications).values({
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
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await databaseOrThrow();
      const result = await db
        .update(notifications)
        .set({ status: "read", readAt: new Date() })
        .where(
          and(
            eq(notifications.userId, ctx.user.id),
            eq(notifications.status, "unread")
          )
        );
      return { updated: result[0].affectedRows };
    }),
    clearRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await databaseOrThrow();
      const result = await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.userId, ctx.user.id),
            eq(notifications.status, "read")
          )
        );
      return { deleted: result[0].affectedRows };
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
    resolveYoutubeChannel: adminProcedure
      .input(z.object({ target: z.string().trim().min(1).max(2048) }))
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "tasks.write");
        const db = await databaseOrThrow();
        const { accessToken } = await getYoutubeAccessToken(db, ctx.user.id);
        try {
          return await resolveYoutubeChannel(accessToken, input.target);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "YouTube kanal kimliği çözümlenemedi.",
          });
        }
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
    analytics: adminProcedure
      .input(
        z.object({ days: z.union([z.literal(7), z.literal(30)]).default(7) })
      )
      .query(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "operations.read");
        const db = await databaseOrThrow();
        const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
        const [
          notificationRows,
          sessionRows,
          verificationRows,
          assignmentRows,
          redemptionRows,
        ] = await Promise.all([
          db
            .select()
            .from(notifications)
            .where(gte(notifications.createdAt, since)),
          db
            .select()
            .from(taskSessions)
            .where(gte(taskSessions.createdAt, since)),
          db
            .select()
            .from(verificationAttempts)
            .where(gte(verificationAttempts.createdAt, since)),
          db
            .select()
            .from(taskAssignments)
            .where(gte(taskAssignments.assignedAt, since)),
          db
            .select()
            .from(rewardRedemptions)
            .where(gte(rewardRedemptions.createdAt, since)),
        ]);
        return buildOperationsAnalytics({
          days: input.days,
          notifications: notificationRows,
          sessions: sessionRows,
          verifications: verificationRows,
          assignments: assignmentRows.map(assignment => ({
            ...assignment,
            createdAt: assignment.assignedAt,
          })),
          redemptions: redemptionRows,
        });
      }),
    listCampaigns: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "tasks.write");
      const db = await databaseOrThrow();
      return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    }),
    setCampaignStatus: adminProcedure
      .input(
        z.object({
          campaignId: z.number().int().positive(),
          status: z.enum(["draft", "scheduled", "active", "paused", "archived"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "campaigns.write");
        const db = await databaseOrThrow();
        const [campaign] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, input.campaignId))
          .limit(1);
        if (!campaign) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Kampanya bulunamadı." });
        }
        await db.transaction(async tx => {
          await tx
            .update(campaigns)
            .set({ status: input.status })
            .where(eq(campaigns.id, campaign.id));
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: "campaign.status_changed",
            entityType: "campaign",
            entityId: String(campaign.id),
            beforeState: { status: campaign.status },
            afterState: { status: input.status },
          });
        });
        return { success: true };
      }),
    setTaskStatus: adminProcedure
      .input(
        z.object({
          taskId: z.number().int().positive(),
          status: z.enum(["draft", "scheduled", "active", "paused", "ended", "archived"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "tasks.write");
        const db = await databaseOrThrow();
        const [task] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, input.taskId))
          .limit(1);
        if (!task) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Görev bulunamadı." });
        }
        if (task.status === input.status) return { success: true, unchanged: true };
        await db.transaction(async tx => {
          await tx.update(tasks).set({ status: input.status }).where(eq(tasks.id, task.id));
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: "task.status_changed",
            entityType: "task",
            entityId: String(task.id),
            beforeState: { status: task.status },
            afterState: { status: input.status },
          });
        });
        return { success: true, unchanged: false };
      }),
    listUsers: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "operations.read");
      const db = await databaseOrThrow();
      return db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          accountStatus: users.accountStatus,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
          username: userProfiles.username,
          displayName: userProfiles.displayName,
          availablePoints: pointBalances.availablePoints,
          pendingPoints: pointBalances.pendingPoints,
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .leftJoin(pointBalances, eq(pointBalances.userId, users.id))
        .orderBy(desc(users.createdAt));
    }),
    setUserStatus: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), status: z.enum(["active", "blocked", "deleted"]), reason: z.string().trim().min(3).max(500) }))
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "operations.write");
        if (input.userId === ctx.user.id || input.status === "deleted" && input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Kendi yönetici hesabınızın durumunu bu işlemle değiştiremezsiniz." });
        }
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [target] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
          if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Kullanıcı bulunamadı." });
          await tx.update(users).set({ accountStatus: input.status }).where(eq(users.id, target.id));
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: `user.${input.status}`,
            entityType: "user",
            entityId: String(target.id),
            beforeState: { accountStatus: target.accountStatus },
            afterState: { accountStatus: input.status, reason: input.reason },
          });
          await tx.insert(notifications).values({
            userId: target.id,
            type: "account_status_updated",
            title: input.status === "blocked" ? "Hesabınız engellendi" : input.status === "deleted" ? "Hesabınız kapatıldı" : "Hesabınız yeniden aktifleştirildi",
            body: input.reason,
            destination: "/profile",
          });
          return { success: true };
        });
      }),
    taskParticipantStats: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "operations.read");
      const db = await databaseOrThrow();
      const [userRows, sessions, attempts, ledger] = await Promise.all([
        db.select({ id: users.id, name: users.name, email: users.email, username: userProfiles.username }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(eq(users.accountStatus, "active")),
        db.select().from(taskSessions),
        db.select().from(verificationAttempts),
        db.select().from(pointLedger).where(eq(pointLedger.type, "task_reward")),
      ]);
      return userRows.map(user => {
        const userSessions = sessions.filter(row => row.userId === user.id);
        const userAttempts = attempts.filter(row => row.userId === user.id);
        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          started: userSessions.length,
          completed: userSessions.filter(row => row.status === "verified" || row.status === "pending_verification").length,
          approved: userAttempts.filter(row => row.status === "pass").length,
          pendingApproval: userAttempts.filter(row => row.status === "manual_review").length,
          rejected: userAttempts.filter(row => row.status === "fail").length,
          earnedPoints: ledger.filter(row => row.userId === user.id).reduce((sum, row) => sum + row.amount, 0),
        };
      }).sort((a, b) => b.earnedPoints - a.earnedPoints || b.started - a.started);
    }),
    listTasks: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "tasks.read");
      const db = await databaseOrThrow();
      return db.select().from(tasks).orderBy(desc(tasks.createdAt));
    }),
    deleteTask: adminProcedure
      .input(z.object({ taskId: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }))
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "tasks.write");
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
          if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Görev bulunamadı." });
          if (task.status === "archived") return { success: true, unchanged: true };
          await tx.update(tasks).set({ status: "archived" }).where(eq(tasks.id, task.id));
          await tx.update(taskAssignments).set({ status: "cancelled" }).where(eq(taskAssignments.taskId, task.id));
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: "task.deleted",
            entityType: "task",
            entityId: String(task.id),
            beforeState: { status: task.status, title: task.title },
            afterState: { status: "archived", reason: input.reason },
          });
          return { success: true, unchanged: false };
        });
      }),
    taskAudiencePreview: adminProcedure
      .input(z.object({ taskId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "tasks.read");
        const db = await databaseOrThrow();
        const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Görev bulunamadı." });
        const audienceRows = await db
          .select({ id: users.id, role: users.role, trustStatus: trustScores.status })
          .from(users)
          .leftJoin(trustScores, eq(trustScores.userId, users.id));
        const eligibleUsers = audienceRows.filter(isEligibleAudienceUser);
        const existingAssignments = await db
          .select({ userId: taskAssignments.userId, status: taskAssignments.status })
          .from(taskAssignments)
          .where(eq(taskAssignments.taskId, task.id));
        const existingIds = new Set(existingAssignments.map(row => row.userId));
        return {
          taskId: task.id,
          audienceMode: task.audienceMode,
          assignmentTargetCount: task.assignmentTargetCount,
          eligibleUserCount: eligibleUsers.length,
          assignedUserCount: existingAssignments.length,
          availableUserCount: eligibleUsers.filter(user => !existingIds.has(user.id)).length,
          claimedQuota: task.claimedQuota,
          totalQuota: task.totalQuota,
        };
      }),
    assignTaskToActiveUsers: adminProcedure
      .input(
        z.object({
          taskId: z.number().int().positive(),
          targetCount: z.number().int().positive().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "tasks.write");
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
          if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Görev bulunamadı." });
          if (task.status === "archived" || task.status === "ended") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Arşivlenmiş veya sona ermiş göreve atama yapılamaz." });
          }
            const audienceRows = await tx
            .select({ id: users.id, role: users.role, trustStatus: trustScores.status })
            .from(users)
            .leftJoin(trustScores, eq(trustScores.userId, users.id));
          const eligibleUsers = audienceRows.filter(isEligibleAudienceUser);
          const existing = await tx
            .select({ userId: taskAssignments.userId })
            .from(taskAssignments)
            .where(eq(taskAssignments.taskId, task.id));
          const plan = planAudienceAssignments({
            eligibleUserIds: eligibleUsers.map(user => user.id),
            assignedUserIds: existing.map(row => row.userId),
            targetCount: input.targetCount,
            totalQuota: task.totalQuota,
            claimedQuota: task.claimedQuota,
          });
          const targetCount = plan.targetCount;
          if (targetCount < 1) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Atanabilecek uygun aktif kullanıcı bulunamadı." });
          }
          const selected = plan.selectedUserIds.map(userId => ({ id: userId }));
          if (selected.length) {
            await tx.insert(taskAssignments).values(
              selected.map(user => ({ taskId: task.id, userId: user.id, expiresAt: task.endsAt })),
            );
            await tx.insert(notifications).values(
              selected.map(user => ({
                userId: user.id,
                type: "task_assigned",
                title: "Yeni görev atandı",
                body: `Size yeni bir görev atandı: ${task.title}`,
                destination: `/tasks/${task.id}`,
              })),
            );
          }
          await tx.update(tasks).set({ audienceMode: "assigned", assignmentTargetCount: targetCount }).where(eq(tasks.id, task.id));
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: "task.audience_assigned",
            entityType: "task",
            entityId: String(task.id),
            beforeState: { audienceMode: task.audienceMode, assignmentTargetCount: task.assignmentTargetCount },
            afterState: { audienceMode: "assigned", assignmentTargetCount: targetCount, inserted: selected.length },
          });
          return {
            success: true,
            eligibleUserCount: plan.eligibleUserCount,
            targetCount,
            insertedCount: selected.length,
            alreadyAssignedCount: Math.min(plan.assignedUserCount, targetCount),
          };
        });
      }),
    listRewards: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "rewards.read");
      const db = await databaseOrThrow();
      return db.select().from(rewards).orderBy(desc(rewards.createdAt));
    }),
    setRewardStatus: adminProcedure
      .input(
        z.object({
          rewardId: z.number().int().positive(),
          status: z.enum(["draft", "active", "paused", "archived"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "rewards.write");
        const db = await databaseOrThrow();
        const [reward] = await db
          .select()
          .from(rewards)
          .where(eq(rewards.id, input.rewardId))
          .limit(1);
        if (!reward) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ödül bulunamadı." });
        }
        if (reward.status === input.status) return { success: true, unchanged: true };
        await db.transaction(async tx => {
          await tx.update(rewards).set({ status: input.status }).where(eq(rewards.id, reward.id));
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: "reward.status_changed",
            entityType: "reward",
            entityId: String(reward.id),
            beforeState: { status: reward.status },
            afterState: { status: input.status },
          });
        });
        return { success: true, unchanged: false };
      }),
    rewardRequests: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "redemptions.read");
      const db = await databaseOrThrow();
      return db
        .select({
          id: rewardRedemptions.id,
          rewardId: rewardRedemptions.rewardId,
          userId: rewardRedemptions.userId,
          pointsCost: rewardRedemptions.pointsCost,
          status: rewardRedemptions.status,
          riskSnapshot: rewardRedemptions.riskSnapshot,
          fulfillmentData: rewardRedemptions.fulfillmentData,
          processedBy: rewardRedemptions.processedBy,
          processedAt: rewardRedemptions.processedAt,
          createdAt: rewardRedemptions.createdAt,
          rewardName: rewards.name,
          username: userProfiles.username,
          displayName: userProfiles.displayName,
        })
        .from(rewardRedemptions)
        .innerJoin(rewards, eq(rewards.id, rewardRedemptions.rewardId))
        .leftJoin(userProfiles, eq(userProfiles.userId, rewardRedemptions.userId))
        .orderBy(desc(rewardRedemptions.createdAt));
    }),
    processRewardRedemption: adminProcedure
      .input(
        z.object({
          redemptionId: z.number().int().positive(),
          status: z.enum([
            "under_review",
            "approved",
            "preparing",
            "shipped",
            "delivered",
            "rejected",
            "cancelled",
          ]),
          note: z.string().trim().min(3).max(1000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "redemptions.write");
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [redemption] = await tx
            .select()
            .from(rewardRedemptions)
            .where(eq(rewardRedemptions.id, input.redemptionId))
            .limit(1);
          if (!redemption) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Ödül talebi bulunamadı." });
          }

          const currentStatus = redemption.status as RedemptionStatus;
          const nextStatus = input.status as RedemptionStatus;
          try {
            assertRedemptionTransition(currentStatus, nextStatus);
          } catch {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Bu ödül talebi için seçilen durum geçişine izin verilmiyor.",
            });
          }

          const shouldRefund = needsRedemptionRefund(currentStatus, nextStatus);
          if (shouldRefund) {
            const [reward] = await tx
              .select()
              .from(rewards)
              .where(eq(rewards.id, redemption.rewardId))
              .limit(1);
            if (!reward) {
              throw new TRPCError({ code: "NOT_FOUND", message: "Ödül bulunamadı." });
            }
            const [balance] = await tx
              .select()
              .from(pointBalances)
              .where(eq(pointBalances.userId, redemption.userId))
              .limit(1);
            const refundKey = `refund:redemption:${redemption.id}`;
            const [existingRefund] = await tx
              .select({ id: pointLedger.id })
              .from(pointLedger)
              .where(eq(pointLedger.idempotencyKey, refundKey))
              .limit(1);
            if (!existingRefund) {
              const nextBalance = (balance?.availablePoints ?? 0) + redemption.pointsCost;
              await tx
                .update(pointBalances)
                .set({ availablePoints: nextBalance, lifetimeSpent: Math.max(0, (balance?.lifetimeSpent ?? 0) - redemption.pointsCost) })
                .where(eq(pointBalances.userId, redemption.userId));
              await tx.insert(pointLedger).values({
                idempotencyKey: refundKey,
                userId: redemption.userId,
                type: "reversal",
                amount: redemption.pointsCost,
                rewardRedemptionId: redemption.id,
                balanceAfter: nextBalance,
                reason: "Reddedilen veya iptal edilen ödül talebi iadesi",
                createdBy: ctx.user.id,
              });
              await tx
                .update(rewards)
                .set({ stock: reward.stock + 1 })
                .where(eq(rewards.id, reward.id));
            }
          }

          await tx
            .update(rewardRedemptions)
            .set({
              status: nextStatus,
              processedBy: ctx.user.id,
              processedAt: new Date(),
              fulfillmentData: { ...(redemption.fulfillmentData ?? {}), lastNote: input.note },
            })
            .where(eq(rewardRedemptions.id, redemption.id));
          await tx.insert(notifications).values({
            userId: redemption.userId,
            type: "reward_status_updated",
            title: "Ödül talebiniz güncellendi",
            body: input.note,
            destination: "/rewards",
          });
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: "redemption.status_changed",
            entityType: "reward_redemption",
            entityId: String(redemption.id),
            beforeState: { status: currentStatus },
            afterState: { status: nextStatus, refunded: shouldRefund, note: input.note },
          });
          return { success: true, refunded: shouldRefund };
        });
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
    updateRiskStatus: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          status: z.enum(["normal", "watch", "review", "restricted", "suspended"]),
          reason: z.string().trim().min(3).max(1000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "risk.write");
        const db = await databaseOrThrow();
        return db.transaction(async tx => {
          const [current] = await tx
            .select()
            .from(trustScores)
            .where(eq(trustScores.userId, input.userId))
            .limit(1);
          if (!current) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Kullanıcı risk kaydı bulunamadı." });
          }
          await tx
            .update(trustScores)
            .set({ status: input.status, updatedAt: new Date() })
            .where(eq(trustScores.userId, input.userId));
          await tx.insert(riskEvents).values({
            userId: input.userId,
            type: "admin_risk_status_change",
            severity: input.status === "suspended" ? "critical" : input.status === "restricted" ? "high" : input.status === "review" ? "medium" : "low",
            details: { from: current.status, to: input.status, reason: input.reason, actorUserId: ctx.user.id },
          });
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: "risk.status_changed",
            entityType: "trust_score",
            entityId: String(input.userId),
            beforeState: { status: current.status, score: current.score },
            afterState: { status: input.status, reason: input.reason },
          });
          await tx.insert(notifications).values({
            userId: input.userId,
            type: "account_risk_status_updated",
            title: "Hesap durumunuz güncellendi",
            body: input.status === "restricted" || input.status === "suspended" ? "Hesabınız için işlem kısıtlaması uygulanmıştır. Ayrıntılar için destek ile iletişime geçebilirsiniz." : "Hesap durumunuz gözden geçirildi.",
            destination: "/profile",
          });
          return { success: true };
        });
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
        const created = await db.insert(campaigns).values({
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
          youtubeChannelId: z.string().trim().regex(/^UC[a-zA-Z0-9_-]{10,}$/).optional(),
          requiresYoutubeSubscription: z.boolean().default(false),
          requiresYoutubeLike: z.boolean().default(false),
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
          requiredWatchSeconds: z.number().int().min(5).max(86_400).default(30),
          secretCodeDisplaySeconds: z.number().int().min(3).max(120).default(12),
          secretCodeRandomMinSeconds: z.number().int().min(5).max(86_400).default(30),
          secretCodeRandomMaxSeconds: z.number().int().min(5).max(86_400).default(60),
          instructions: z.array(z.string().min(1).max(500)).min(1).max(12),
          eligibilityRules: eligibilityRuleInput.optional(),
          startsAt: z.date().optional(),
          endsAt: z.date().optional(),
          priority: z.number().int().min(-10).max(10).default(0),
        }        )
          .refine(
            value => value.secretCodeRandomMaxSeconds >= value.secretCodeRandomMinSeconds,
            { path: ["secretCodeRandomMaxSeconds"], message: "Secret Code rastgele bitişi başlangıçtan küçük olamaz." },
          )
          .refine(
            value => value.requiredWatchSeconds <= value.sessionDurationSeconds,
            { path: ["requiredWatchSeconds"], message: "Minimum izleme süresi oturum süresini aşamaz." },
          )
          .refine(
            value => value.secretCodeRandomMaxSeconds <= value.sessionDurationSeconds,
            { path: ["secretCodeRandomMaxSeconds"], message: "Secret Code gösterim zamanı oturum süresini aşamaz." },
          )
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "tasks.write");
        if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Görev bitişi başlangıçtan sonra olmalı.",
          });
        const db = await databaseOrThrow();
        let youtubeChannelId = input.youtubeChannelId;
        if (input.platform === "youtube" && input.targetUrl && !youtubeChannelId) {
          try {
            const { accessToken } = await getYoutubeAccessToken(db, ctx.user.id);
            youtubeChannelId = (await resolveYoutubeChannel(accessToken, input.targetUrl)).channelId;
          } catch (error) {
            if (input.requiresYoutubeSubscription) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: error instanceof Error ? error.message : "YouTube kanal kimliği otomatik çözümlenemedi.",
              });
            }
          }
        }
        if (input.platform === "youtube" && input.requiresYoutubeSubscription && !youtubeChannelId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Abonelik zorunlu görev için YouTube kanal kimliği gerekli.",
          });
        }
        const status =
          input.startsAt && input.startsAt > new Date()
            ? "scheduled"
            : "active";
        return db.transaction(async tx => {
          const created = await tx
            .insert(tasks)
            .values({ ...input, youtubeChannelId, status, createdBy: ctx.user.id });
          const taskId = Number(created[0].insertId);
          const [createdTask] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
          // Yeni görevler varsayılan olarak `open` kalır. Böylece görev
          // oluşturulduktan sonra kayıt olan kullanıcılar da görev penceresi
          // açık olduğu sürece görevi görebilir ve başlatabilir. Hedefli
          // assignment gerekiyorsa admin bunu ayrıca başlatabilir.
          const assignedCount = 0;
          await tx.insert(auditLogs).values({
            actorUserId: ctx.user.id,
            action: "task.created",
            entityType: "task",
            entityId: String(taskId),
            afterState: {
              title: input.title,
              verificationMethod: input.verificationMethod,
              autoAssignedUserCount: assignedCount,
            },
          });
          return { id: createdTask?.id ?? taskId, status, assignedCount };
        });
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
        await db.insert(auditLogs).values({
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
        await db.insert(auditLogs).values({
          actorUserId: ctx.user.id,
          action: "comment_pool.comment_added",
          entityType: "comment",
          entityId: String(commentId),
          afterState: { poolId: input.poolId },
        });
        return { id: commentId };
      }),
    listComments: adminProcedure
      .input(z.object({ poolId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await requireAdminCapability(ctx.user, "comment_pools.read");
        const db = await databaseOrThrow();
        return db
          .select()
          .from(comments)
          .where(eq(comments.poolId, input.poolId))
          .orderBy(desc(comments.createdAt));
      }),
    verificationQueue: adminProcedure.query(async ({ ctx }) => {
      await requireAdminCapability(ctx.user, "verification.decide");
      const db = await databaseOrThrow();
      const reviews = await db
        .select({
          id: manualReviews.id,
          verificationAttemptId: manualReviews.verificationAttemptId,
          status: manualReviews.status,
          createdAt: manualReviews.createdAt,
          taskId: verificationAttempts.taskId,
          userId: verificationAttempts.userId,
          taskTitle: tasks.title,
          rewardPoints: tasks.rewardPoints,
          platform: tasks.platform,
          targetUrl: tasks.targetUrl,
          youtubeChannelId: tasks.youtubeChannelId,
          requiresYoutubeSubscription: tasks.requiresYoutubeSubscription,
          requiresYoutubeLike: tasks.requiresYoutubeLike,
          username: userProfiles.username,
          displayName: userProfiles.displayName,
          attemptReason: verificationAttempts.reason,
          attemptScore: verificationAttempts.score,
        })
        .from(manualReviews)
        .innerJoin(verificationAttempts, eq(verificationAttempts.id, manualReviews.verificationAttemptId))
        .innerJoin(tasks, eq(tasks.id, verificationAttempts.taskId))
        .leftJoin(userProfiles, eq(userProfiles.userId, verificationAttempts.userId))
        .where(eq(manualReviews.status, "pending"))
        .orderBy(desc(manualReviews.createdAt));
      if (!reviews.length) return [];
      const attemptIds = reviews.map(review => review.verificationAttemptId);
      const signalRows = await db
        .select({ verificationAttemptId: verificationSignals.verificationAttemptId, key: verificationSignals.key, value: verificationSignals.value })
        .from(verificationSignals)
        .where(inArray(verificationSignals.verificationAttemptId, attemptIds));
      const signalsByAttempt = new Map<number, Map<string, unknown>>();
      for (const row of signalRows) {
        const values = signalsByAttempt.get(row.verificationAttemptId) ?? new Map<string, unknown>();
        values.set(row.key, row.value);
        signalsByAttempt.set(row.verificationAttemptId, values);
      }
      const booleanSignal = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";
      return reviews.map(review => {
        const signals = signalsByAttempt.get(review.verificationAttemptId);
        const isYoutubeTask = review.platform === "youtube" && (review.requiresYoutubeSubscription || review.requiresYoutubeLike);
        return {
          ...review,
          youtubeEvidence: isYoutubeTask
            ? {
                videoId: extractYoutubeVideoId(review.targetUrl),
                channelId: review.youtubeChannelId,
                requiredSubscription: review.requiresYoutubeSubscription,
                requiredLike: review.requiresYoutubeLike,
                subscribed: booleanSignal(signals?.get("youtubeSubscribed")),
                liked: booleanSignal(signals?.get("youtubeLiked")),
                checkedAt: typeof signals?.get("youtubeCheckedAt") === "number" ? signals?.get("youtubeCheckedAt") : null,
              }
            : null,
        };
      });
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
          const [task] = await tx
            .select()
            .from(tasks)
            .where(eq(tasks.id, attempt.taskId))
            .limit(1);
          if (!task)
            throw new TRPCError({ code: "NOT_FOUND", message: "Görev bulunamadı." });
          const [balance] = await tx
            .select()
            .from(pointBalances)
            .where(eq(pointBalances.userId, attempt.userId))
            .limit(1);
          if (balance) {
            await tx
              .update(pointBalances)
              .set({ pendingPoints: Math.max(0, balance.pendingPoints - task.rewardPoints) })
              .where(eq(pointBalances.userId, attempt.userId));
          }
          if (input.decision === "approved") {
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
            await tx.insert(notifications).values({
              userId: attempt.userId,
              type: "points_earned",
              title: "Görev onaylandı, puanınız cüzdanınıza eklendi",
              body: `Yönetici onayıyla +${task.rewardPoints} puan kazandınız.`,
              destination: "/",
            });
          } else {
            await tx
              .update(verificationAttempts)
              .set({
                status: input.decision === "retry_requested" ? "manual_review" : "fail",
                reason: input.reason,
                completedAt: new Date(),
              })
              .where(eq(verificationAttempts.id, attempt.id));
            if (input.decision !== "retry_requested") {
              await tx
                .update(taskSessions)
                .set({ status: "rejected", verificationState: "failed", completedAt: new Date() })
                .where(eq(taskSessions.id, attempt.sessionId));
              await tx.insert(notifications).values({
                userId: attempt.userId,
                type: "task_verification_rejected",
                title: "Görev doğrulaması reddedildi",
                body: input.reason,
                destination: `/tasks/${attempt.taskId}`,
              });
            } else {
              await tx.insert(notifications).values({
                userId: attempt.userId,
                type: "task_verification_retry",
                title: "Görev doğrulaması yeniden isteniyor",
                body: input.reason,
                destination: `/tasks/${attempt.taskId}`,
              });
            }
          }
          await tx.insert(auditLogs).values({
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

import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { eq } from "drizzle-orm";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { registerStorageProxy } from "./storageProxy.js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "../db.js";
import { pointBalances, userProfiles, users, youtubeConnections } from "../../drizzle/schema.js";
import { sdk } from "./sdk.js";
import { encryptYoutubeToken, exchangeYoutubeCode, googleUserInfo, youtubeAuthorizeUrl } from "../youtube.js";
import { COOKIE_NAME } from "../../shared/const.js";
import { getSessionCookieOptions } from "./cookies.js";

const APP_URL = "https://6loryapp-pernhdey.manus.space";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function signState(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + OAUTH_STATE_TTL_MS })).toString("base64url");
  const signature = createHmac("sha256", process.env.JWT_SECRET ?? "").update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyState(rawState: string) {
  const [encoded, signature] = rawState.split(".");
  const expected = createHmac("sha256", process.env.JWT_SECRET ?? "").update(encoded ?? "").digest("base64url");
  if (!encoded || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Geçersiz OAuth state");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { mode?: string; userId?: number; expiresAt?: number };
  if (!payload.expiresAt || payload.expiresAt < Date.now()) throw new Error("OAuth bağlantı süresi doldu");
  return payload;
}

async function saveYoutubeConnection(db: Awaited<ReturnType<typeof getDb>>, userId: number, token: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }) {
  if (!db) throw new Error("Veritabanı kullanılamıyor.");
  await db.insert(youtubeConnections).values({ userId, accessTokenCiphertext: encryptYoutubeToken(token.access_token), refreshTokenCiphertext: token.refresh_token ? encryptYoutubeToken(token.refresh_token) : null, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, scopes: token.scope?.split(" ") ?? [] }).onDuplicateKeyUpdate({ set: { accessTokenCiphertext: encryptYoutubeToken(token.access_token), refreshTokenCiphertext: token.refresh_token ? encryptYoutubeToken(token.refresh_token) : undefined, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : undefined, scopes: token.scope?.split(" ") ?? [] } });
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  const youtubeCallback = `${APP_URL}/api/social-oauth/youtube/callback`;

  // Older cached clients may still return to the removed Manus OAuth route.
  // Keep that callback backward-compatible: never show a 404, and send the
  // user to the current login surface where the new flow is available.
  app.get("/api/oauth/callback", (_req, res) => {
    return res.redirect(`${APP_URL}/?auth=retry&legacy=1`);
  });

  app.get("/api/social-oauth/youtube/start", async (req, res) => {
    const mode = req.query.mode === "login" ? "login" : "youtube";
    const user = mode === "youtube" ? await sdk.authenticateRequest(req).catch(() => null) : null;
    if (mode === "youtube" && !user) return res.status(401).send("Önce 6lory hesabınızla giriş yapın.");
    const state = signState(mode === "login" ? { mode } : { mode, userId: user?.id });
    return res.redirect(youtubeAuthorizeUrl(state, youtubeCallback));
  });

  app.get("/api/social-oauth/youtube/callback", async (req, res) => {
    if (req.query.error === "access_denied") {
      let mode = "youtube";
      try {
        mode = String(verifyState(String(req.query.state ?? "")).mode ?? "youtube");
      } catch {
        // A denied OAuth request may omit a valid state; the safe fallback is the profile flow.
      }
      return res.redirect(mode === "login" ? `${APP_URL}/?oauth=denied` : `${APP_URL}/profile?youtube=denied`);
    }
    try {
      const state = verifyState(String(req.query.state ?? ""));
      const token = await exchangeYoutubeCode(String(req.query.code ?? ""), youtubeCallback);
      const db = await getDb();
      if (!db) throw new Error("Veritabanı kullanılamıyor.");
      let userId = state.userId;
      if (state.mode === "login") {
        const identity = await googleUserInfo(token.access_token);
        if (!identity.email) throw new Error("Google hesabında doğrulanmış e-posta bulunamadı.");
        const email = identity.email.trim().toLowerCase();
        const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existing[0] && existing[0].accountStatus !== "active") throw new Error("Bu hesap aktif değil veya erişimi engellenmiş.");
        if (existing[0]) {
          userId = existing[0].id;
          await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId!));
        } else {
          const openId = `google_${identity.sub}`;
          const username = `google_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
          await db.transaction(async tx => {
            await tx.insert(users).values({ openId, name: identity.name ?? email.split("@")[0], email, loginMethod: "google", role: "user" });
            const [created] = await tx.select().from(users).where(eq(users.openId, openId)).limit(1);
            if (!created) throw new Error("Google hesabı oluşturulamadı.");
            userId = created.id;
            await tx.insert(userProfiles).values({ userId: created.id, username, displayName: identity.name ?? email.split("@")[0], avatarUrl: identity.picture, onboardingStatus: "pending" });
            await tx.insert(pointBalances).values({ userId: created.id });
          });
        }
        await saveYoutubeConnection(db, userId!, token);
        const [sessionUser] = await db.select({ openId: users.openId, name: users.name }).from(users).where(eq(users.id, userId!)).limit(1);
        if (!sessionUser) throw new Error("Google kullanıcı oturumu oluşturulamadı.");
        const sessionToken = await sdk.createSessionToken(sessionUser.openId, { expiresInMs: 1000 * 60 * 60 * 24 * 30, name: sessionUser.name ?? identity.name ?? email });
        res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: 1000 * 60 * 60 * 24 * 30 });
        return res.redirect(`${APP_URL}/profile?google=connected&youtube=connected`);
      }
      if (!userId) throw new Error("OAuth kullanıcı bağlantısı bulunamadı.");
      await saveYoutubeConnection(db, userId, token);
      return res.redirect(`${APP_URL}/profile?youtube=connected`);
    } catch (error) {
      return res.status(400).send(`Google/YouTube bağlantısı tamamlanamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`);
    }
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}

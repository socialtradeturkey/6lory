import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { registerStorageProxy } from "./storageProxy.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "../db.js";
import { youtubeConnections } from "../../drizzle/schema.js";
import { sdk } from "./sdk.js";
import { encryptYoutubeToken, exchangeYoutubeCode, youtubeAuthorizeUrl } from "../youtube.js";

/**
 * Builds the API application without binding a port. The managed runtime can
 * attach it to an HTTP server, while Vercel can export it as a Function.
 */
export function createApiApp(): Express {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  const youtubeCallback = (_req: express.Request) => {
    // Google Cloud’da yalnızca bu kalıcı yayın adresi yetkilidir; preview hostları geçicidir.
    return "https://6loryapp-pernhdey.manus.space/api/social-oauth/youtube/callback";
  };
  app.get("/api/social-oauth/youtube/start", async (req, res) => {
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) return res.status(401).send("Önce 6lory hesabınızla giriş yapın.");
    const payload = Buffer.from(`${user.id}:${Date.now() + 10 * 60 * 1000}`).toString("base64url");
    const signature = createHmac("sha256", process.env.JWT_SECRET ?? "").update(payload).digest("base64url");
    return res.redirect(youtubeAuthorizeUrl(`${payload}.${signature}`, youtubeCallback(req)));
  });
  app.get("/api/social-oauth/youtube/callback", async (req, res) => {
    try {
      const rawState = String(req.query.state ?? "");
      const [payload, signature] = rawState.split(".");
      const expected = createHmac("sha256", process.env.JWT_SECRET ?? "").update(payload ?? "").digest("base64url");
      if (!payload || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Geçersiz OAuth state");
      const [userIdText, expiresText] = Buffer.from(payload, "base64url").toString().split(":");
      if (Number(expiresText) < Date.now()) throw new Error("OAuth bağlantı süresi doldu");
      const token = await exchangeYoutubeCode(String(req.query.code ?? ""), youtubeCallback(req));
      const db = await getDb();
      if (!db) throw new Error("Veritabanı kullanılamıyor.");
      await db.insert(youtubeConnections).values({ userId: Number(userIdText), accessTokenCiphertext: encryptYoutubeToken(token.access_token), refreshTokenCiphertext: token.refresh_token ? encryptYoutubeToken(token.refresh_token) : null, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, scopes: token.scope?.split(" ") ?? [] }).onDuplicateKeyUpdate({ set: { accessTokenCiphertext: encryptYoutubeToken(token.access_token), refreshTokenCiphertext: token.refresh_token ? encryptYoutubeToken(token.refresh_token) : undefined, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : undefined, scopes: token.scope?.split(" ") ?? [] } });
      return res.send("<script>window.location.href='/profile?youtube=connected'</script>YouTube hesabı bağlandı.");
    } catch (error) {
      return res.status(400).send(`YouTube bağlantısı tamamlanamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`);
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}

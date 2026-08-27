import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? "";
const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube.force-ssl"];
export const YOUTUBE_PROOF_TTL_MS = 5 * 60 * 1000;

type YoutubeProofPayload = {
  userId: number;
  videoId: string;
  channelId: string;
  subscribed: boolean;
  liked: boolean;
  checkedAt: number;
};

function key() {
  return createHash("sha256").update(process.env.JWT_SECRET ?? "").digest();
}

export function encryptYoutubeToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptYoutubeToken(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("YouTube tokenı geçersiz.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function youtubeAuthorizeUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: SCOPES.join(" "), state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeYoutubeCode(code: string, redirectUri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  if (!response.ok) throw new Error("YouTube OAuth token değişimi başarısız.");
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>;
}

export async function refreshYoutubeAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "refresh_token" }) });
  if (!response.ok) throw new Error("YouTube OAuth oturumu yenilenemedi.");
  return response.json() as Promise<{ access_token: string; expires_in?: number; scope?: string }>;
}

export async function revokeYoutubeToken(token: string) {
  const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } });
  if (!response.ok && response.status !== 400) throw new Error("Google yetkisi iptal edilemedi.");
}

export async function googleUserInfo(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error("Google kullanıcı bilgileri alınamadı.");
  return response.json() as Promise<{ sub: string; email?: string; name?: string; picture?: string }>;
}

export async function youtubeApi(accessToken: string, path: string, params: Record<string, string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`YouTube API doğrulaması başarısız (${response.status}).`);
  return response.json() as Promise<any>;
}

export async function youtubeVerification(accessToken: string, videoId: string, channelId: string) {
  const [subscription, rating] = await Promise.all([
    youtubeApi(accessToken, "subscriptions", { part: "snippet", mine: "true", forChannelId: channelId, maxResults: "1" }),
    youtubeApi(accessToken, "videos/getRating", { id: videoId }),
  ]);
  return { subscribed: (subscription.items?.length ?? 0) > 0, liked: rating.items?.[0]?.rating === "like" };
}

function encodeProof(payload: YoutubeProofPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function createYoutubeProof(payload: YoutubeProofPayload) {
  const encoded = encodeProof(payload);
  const signature = createHmac("sha256", key()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyYoutubeProof(proof: string, expected: { userId: number; videoId: string; channelId: string }) {
  const [encoded, signature] = proof.split(".");
  if (!encoded || !signature) return null;
  const expectedSignature = createHmac("sha256", key()).update(encoded).digest("base64url");
  if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as YoutubeProofPayload;
    if (payload.userId !== expected.userId || payload.videoId !== expected.videoId || payload.channelId !== expected.channelId) return null;
    if (!Number.isInteger(payload.checkedAt) || Date.now() - payload.checkedAt > YOUTUBE_PROOF_TTL_MS || payload.checkedAt > Date.now() + 30_000) return null;
    if (typeof payload.subscribed !== "boolean" || typeof payload.liked !== "boolean") return null;
    return payload;
  } catch {
    return null;
  }
}

export type { YoutubeProofPayload };

export function youtubeRequirementsSatisfied(
  requirements: { requiresSubscription: boolean; requiresLike: boolean },
  proof: Pick<YoutubeProofPayload, "subscribed" | "liked"> | null,
) {
  if (!requirements.requiresSubscription && !requirements.requiresLike) return true;
  return Boolean(proof && (!requirements.requiresSubscription || proof.subscribed) && (!requirements.requiresLike || proof.liked));
}

export function extractYoutubeVideoId(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).match(/^[a-zA-Z0-9_-]{6,}$/)?.[0] ?? null;
    if (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v")?.match(/^[a-zA-Z0-9_-]{6,}$/)?.[0] ?? null;
      const embedded = url.pathname.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{6,})/);
      return embedded?.[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeClientConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

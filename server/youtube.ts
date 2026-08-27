import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? "";
const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube.force-ssl"];

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

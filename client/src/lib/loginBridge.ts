import { normalizePostLoginPath } from "./loginOrigin";

export const POST_LOGIN_PATH_KEY = "6lory:post-login-path";

export type LoginBridgeRequest = {
  cleanPath: string;
  postLoginPath: string | null;
};

export function consumeLoginBridgeUrl(href: string): LoginBridgeRequest | null {
  const url = new URL(href);
  const requestedLogin =
    url.searchParams.get("login") === "1" ||
    url.searchParams.get("auth") === "vercel";

  if (!requestedLogin) return null;

  const postLoginPath = normalizePostLoginPath(url.searchParams.get("next"));
  url.searchParams.delete("login");
  url.searchParams.delete("auth");
  url.searchParams.delete("next");
  return {
    cleanPath: `${url.pathname}${url.search}${url.hash}`,
    postLoginPath,
  };
}

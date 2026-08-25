import {
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  encodeOAuthState,
} from "@shared/const";
import {
  getManagedLoginStartUrl,
  normalizePostLoginPath,
  resolveLoginOrigin,
} from "@/lib/loginOrigin";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

let loginNavigationStarted = false;

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
export const startLogin = () => {
  // A protected query and a user click can occur in the same render turn.
  // Only the first navigation may mint the one-time nonce; a second nonce
  // would invalidate the state already sent to the OAuth provider.
  if (loginNavigationStarted) return;
  loginNavigationStarted = true;

  const managedLoginStartUrl = getManagedLoginStartUrl(
    window.location.origin,
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  if (managedLoginStartUrl) {
    // Do not send an unallowlisted Vercel callback URI to Manus OAuth. The
    // provider rejects it before authentication, and a cross-origin session
    // cookie could not be shared back securely in any case.
    window.location.assign(managedLoginStartUrl);
    return;
  }

  const loginOrigin = resolveLoginOrigin(window.location.origin);

  // The callback is intentionally fixed to a safe application route. Preserve
  // only the admin entry target in a host-only cookie, so the server can
  // complete the return even when sessionStorage is unavailable or cleared by
  // the external OAuth navigation.
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const postLoginPath = normalizePostLoginPath(currentPath);
  document.cookie = `${OAUTH_RETURN_TO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  if (postLoginPath === "/admin") {
    document.cookie = `${OAUTH_RETURN_TO_COOKIE}=/admin; Path=/; Max-Age=600; SameSite=Lax; Secure`;
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${loginOrigin}/api/oauth/callback`;

  const nonce = crypto.randomUUID();
  // The provider returns with a top-level GET navigation. Lax preserves this
  // host-only CSRF binding in privacy-restrictive browsers without making the
  // nonce available to third-party subrequests.
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=Lax; Secure`;
  if (
    !document.cookie
      .split(";")
      .some(cookie => cookie.trim().startsWith(`${OAUTH_STATE_COOKIE}=`))
  ) {
    loginNavigationStarted = false;
    window.alert(
      "Güvenli giriş başlatılamadı. Tarayıcınızda bu site için çerezlere izin verip yeniden deneyin."
    );
    return;
  }
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  window.location.href = url.toString();
};

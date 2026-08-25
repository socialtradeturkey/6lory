import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import { startLogin } from "./const";
import { consumeLoginBridgeUrl, POST_LOGIN_PATH_KEY } from "./lib/loginBridge";

function showLoginBridgeStatus() {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <main aria-live="polite" aria-busy="true" style="display:grid;min-height:100dvh;place-items:center;padding:24px;background:#f8fafc;color:#172438;font-family:DM Sans,system-ui,sans-serif">
      <section style="width:min(100%,440px);border:1px solid #dce7e8;border-radius:24px;background:#fff;padding:32px;text-align:center;box-shadow:0 16px 40px rgba(15,23,42,.08)">
        <div style="width:40px;height:40px;margin:0 auto 16px;border:3px solid #c9f1e9;border-top-color:#0f766e;border-radius:999px;animation:login-bridge-spin .8s linear infinite"></div>
        <p style="margin:0;font-weight:800;font-size:18px">Güvenli girişe yönlendiriliyorsunuz</p>
        <p style="margin:8px 0 0;color:#526173;font-size:14px;line-height:1.55">Google veya Manus hesap seçimi açılacak. Bu pencere kapanmadan bekleyin.</p>
      </section>
      <style>@keyframes login-bridge-spin{to{transform:rotate(360deg)}}</style>
    </main>`;
}

const bridgeTarget = consumeLoginBridgeUrl(window.location.href);
if (bridgeTarget) {
  // This runs before React mounts, ensuring a Vercel bridge request cannot
  // remain on the landing page because of render or hydration timing.
  try {
    if (bridgeTarget.postLoginPath) {
      sessionStorage.setItem(POST_LOGIN_PATH_KEY, bridgeTarget.postLoginPath);
    }
  } catch {
    // Session storage may be unavailable; OAuth still proceeds safely.
  }
  window.history.replaceState(null, "", bridgeTarget.cleanPath);
  // Allow the visible status region to paint before leaving for the external
  // provider. This prevents a slow network or external account chooser from
  // appearing as a broken, blank application page.
  showLoginBridgeStatus();
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(startLogin);
  });
}

const queryClient = new QueryClient();

const reportAuthorizationError = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (isUnauthorized) {
    console.info(
      "[Auth] Giriş gerekli; kullanıcı tarafından başlatılan OAuth akışı bekleniyor."
    );
    return;
  }
  console.error("[API Error]", error);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    reportAuthorizationError(error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    reportAuthorizationError(error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

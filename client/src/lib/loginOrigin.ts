export const MANAGED_AUTH_ORIGIN = "https://6loryapp-pernhdey.manus.space";

export function resolveLoginOrigin(currentOrigin: string): string {
  const current = new URL(currentOrigin);

  // Manus OAuth only accepts the managed project domain for this app. A Vercel
  // deployment is therefore a public entry point, not an independent session
  // issuer; sending its callback URI would fail at the provider allowlist.
  if (current.hostname === "6lory.vercel.app" || current.hostname.endsWith(".vercel.app")) {
    return MANAGED_AUTH_ORIGIN;
  }

  return current.origin;
}

export function getManagedLoginStartUrl(currentOrigin: string): string | null {
  const managedOrigin = resolveLoginOrigin(currentOrigin);
  if (managedOrigin === new URL(currentOrigin).origin) return null;

  return `${managedOrigin}/?login=1`;
}

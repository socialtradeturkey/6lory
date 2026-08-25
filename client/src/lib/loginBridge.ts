export function consumeLoginBridgeUrl(href: string): string | null {
  const url = new URL(href);
  const requestedLogin =
    url.searchParams.get("login") === "1" ||
    url.searchParams.get("auth") === "vercel";

  if (!requestedLogin) return null;

  url.searchParams.delete("login");
  url.searchParams.delete("auth");
  return `${url.pathname}${url.search}${url.hash}`;
}

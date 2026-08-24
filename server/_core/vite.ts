import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, _server: Server) {
  // A prior PWA service worker may cache Vite modules in the proxy-backed
  // preview. Clear only browser storage/cache in development; auth cookies
  // are intentionally untouched.
  app.use((_req, res, next) => {
    res.setHeader("Clear-Site-Data", '"cache", "storage"');
    next();
  });
  const serverOptions = {
    ...viteConfig.server,
    middlewareMode: true,
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  // The managed preview proxy does not keep Vite's WebSocket channel open.
  // Vite-transformed modules still import a small set of helpers from
  // /@vite/client, so provide compatible no-op HMR and CSS helpers without
  // starting a browser WebSocket connection. Production never uses setupVite.
  app.get("/@vite/client", (_req, res) => {
    res.type("application/javascript").send(`
const styles = new Map();
export function createHotContext() {
  return { data: {}, accept() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} };
}
export function updateStyle(id, css) {
  let style = styles.get(id);
  if (!style) { style = document.createElement("style"); style.setAttribute("data-vite-dev-id", id); document.head.appendChild(style); styles.set(id, style); }
  style.textContent = css;
}
export function removeStyle(id) { const style = styles.get(id); style?.remove(); styles.delete(id); }
`);
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

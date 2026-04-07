import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { buildIndex } from "./lib/pageIndex.ts";
import { buildSearchIndex } from "./lib/search.ts";
import pagesApi from "./api/pages.ts";

const app = new Hono();

// 開発時のCORS許可（Vite dev server用）
app.use("/api/*", cors({ origin: "http://localhost:5173" }));

// API
app.route("/api/pages", pagesApi);

// 本番: ビルド済みSPAを配信
app.use("/*", serveStatic({ root: "./web/dist" }));
// SPAのフォールバック（リロード時）
app.get("/*", serveStatic({ path: "./web/dist/index.html" }));

// 起動時インデックス構築
console.log("Building page index...");
await buildIndex();
await buildSearchIndex();
console.log(`Loaded ${(await import("./lib/pageIndex.ts")).pages.size} pages`);

const PORT = parseInt(process.env.PORT ?? "3001");
console.log(`Server running on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};

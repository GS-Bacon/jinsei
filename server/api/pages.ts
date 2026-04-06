import { Hono } from "hono";
import { readFile, writeFile, unlink } from "fs/promises";
import {
  pages,
  linksTo,
  indexPage,
  removePage,
  getRelatedPages,
  getPageFilePath,
  savePins,
  titleAsSlug,
} from "../lib/pageIndex.ts";
import { renderScrapbox } from "../lib/renderer.ts";
import { updateSearchEntry, removeSearchEntry, searchPages } from "../lib/search.ts";

const app = new Hono();

// スラグバリデーション（パストラバーサル防止）
function validateSlug(slug: string): boolean {
  return slug.length > 0 &&
    slug.length <= 200 &&
    !slug.includes("..") &&
    !slug.includes("/") &&
    !slug.includes("\\") &&
    !slug.includes("\0");
}

// ページ一覧
app.get("/", (c) => {
  const sort = c.req.query("sort") ?? "updated";
  const all = [...pages.values()];

  all.sort((a, b) => {
    // ピン留め優先
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === "title") return a.title.localeCompare(b.title, "ja");
    if (sort === "created") return b.created.getTime() - a.created.getTime();
    return b.updated.getTime() - a.updated.getTime(); // default: updated
  });

  return c.json(
    all.map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      pinned: p.pinned,
      created: p.created.toISOString(),
      updated: p.updated.toISOString(),
    }))
  );
});

// 検索
app.get("/search", (c) => {
  const q = c.req.query("q") ?? "";
  const results = searchPages(q);
  return c.json(results);
});

// ページ取得
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!validateSlug(slug)) return c.json({ error: "invalid slug" }, 400);

  const meta = pages.get(slug);
  if (!meta) return c.json({ error: "not found" }, 404);

  const filePath = getPageFilePath(slug);
  const raw = await readFile(filePath, "utf-8").catch(() => "");
  const html = renderScrapbox(raw);
  const related = getRelatedPages(slug);
  const backlinks = [...(linksTo.get(slug) ?? [])].map((s) => ({
    slug: s,
    title: pages.get(s)?.title ?? s,
  }));

  return c.json({
    slug: meta.slug,
    title: meta.title,
    html,
    raw,
    pinned: meta.pinned,
    tags: [...meta.tags],
    created: meta.created.toISOString(),
    updated: meta.updated.toISOString(),
    related,
    backlinks,
  });
});

// ページ作成
app.post("/", async (c) => {
  const body = await c.req.json<{ title: string; body: string }>();
  if (!body.title?.trim()) return c.json({ error: "title required" }, 400);

  const slug = titleAsSlug(body.title.trim());
  if (!validateSlug(slug)) return c.json({ error: "invalid title" }, 400);
  if (pages.has(slug)) return c.json({ error: "already exists" }, 409);

  const content = `${body.title.trim()}\n${body.body ?? ""}`;
  const filePath = getPageFilePath(slug);
  await writeFile(filePath, content, "utf-8");
  await indexPage(slug);

  const meta = pages.get(slug)!;
  updateSearchEntry(slug, meta.title, meta.excerpt);

  return c.json({ slug, title: meta.title }, 201);
});

// ページ更新
app.put("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!validateSlug(slug)) return c.json({ error: "invalid slug" }, 400);
  if (!pages.has(slug)) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{ body: string }>();
  const meta = pages.get(slug)!;
  const content = `${meta.title}\n${body.body ?? ""}`;
  const filePath = getPageFilePath(slug);
  await writeFile(filePath, content, "utf-8");
  await indexPage(slug);

  const updated = pages.get(slug)!;
  updateSearchEntry(slug, updated.title, updated.excerpt);

  return c.json({ slug, title: updated.title });
});

// ページ削除
app.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!validateSlug(slug)) return c.json({ error: "invalid slug" }, 400);
  if (!pages.has(slug)) return c.json({ error: "not found" }, 404);

  const filePath = getPageFilePath(slug);
  await unlink(filePath).catch(() => {});
  removePage(slug);
  removeSearchEntry(slug);

  return c.json({ ok: true });
});

// ピン留めトグル
app.put("/:slug/pin", async (c) => {
  const slug = c.req.param("slug");
  if (!validateSlug(slug)) return c.json({ error: "invalid slug" }, 400);
  const meta = pages.get(slug);
  if (!meta) return c.json({ error: "not found" }, 404);

  meta.pinned = !meta.pinned;

  const pinnedSlugs = new Set(
    [...pages.values()].filter((p) => p.pinned).map((p) => p.slug)
  );
  await savePins(pinnedSlugs);

  return c.json({ slug, pinned: meta.pinned });
});

export default app;

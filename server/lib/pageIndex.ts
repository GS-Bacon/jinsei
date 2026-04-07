import { readdir, readFile, stat, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";
import { parse } from "@progfay/scrapbox-parser";

export interface PageMeta {
  slug: string;
  title: string;
  excerpt: string;
  links: Set<string>;
  tags: Set<string>;
  pinned: boolean;
  created: Date;
  updated: Date;
}

const PAGES_DIR = join(import.meta.dir, "../../pages");
const PIN_FILE = join(import.meta.dir, "../../pages/.pins.json");

// リンクグラフ
export const pages = new Map<string, PageMeta>();
export const linksFrom = new Map<string, Set<string>>(); // slug → リンク先slugs
export const linksTo = new Map<string, Set<string>>();   // slug → 被リンク元slugs

// タイトルからスラグへの逆引き（リンク解決用）
const titleToSlug = new Map<string, string>();

export function titleAsSlug(title: string): string {
  // ファイル名として使えない文字だけ除去。日本語はそのまま保持。
  return title.trim().replace(/[/\\:*?"<>|]/g, "_");
}

function extractLinks(body: string): { links: Set<string>; tags: Set<string> } {
  const links = new Set<string>();
  const tags = new Set<string>();

  // @progfay/scrapbox-parserでパース
  const blocks = parse(body);
  for (const block of blocks) {
    if (block.type !== "line") continue;
    for (const node of block.nodes) {
      if (node.type === "link" && node.pathType === "root") {
        // [ページ名] 形式の内部リンク
        links.add(node.href.replace(/^\/[^/]+\//, ""));
      } else if (node.type === "link" && node.pathType === "relative") {
        links.add(node.href);
      } else if (node.type === "hashTag") {
        tags.add(node.href);
        links.add(node.href);
      }
    }
  }
  return { links, tags };
}

function extractExcerpt(body: string): string {
  const lines = body.split("\n").slice(1); // 1行目はタイトルなので除外
  const textLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // コードブロック行をスキップ
    if (trimmed.startsWith("code:")) continue;
    textLines.push(trimmed);
    if (textLines.length >= 3) break;
  }
  return textLines.join(" ").slice(0, 120);
}

// ピン留め順序（挿入順を保持する配列）
export let pinsList: string[] = [];

async function loadPins(): Promise<string[]> {
  try {
    const raw = await readFile(PIN_FILE, "utf-8");
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function savePins(slugs: string[]): Promise<void> {
  pinsList = slugs;
  await writeFile(PIN_FILE, JSON.stringify(slugs));
}

function updateGraph(slug: string, meta: PageMeta): void {
  // 旧エッジを削除
  const old = linksFrom.get(slug);
  if (old) {
    for (const target of old) {
      linksTo.get(target)?.delete(slug);
    }
  }
  // 新エッジを追加
  linksFrom.set(slug, new Set(meta.links));
  for (const target of meta.links) {
    if (!linksTo.has(target)) linksTo.set(target, new Set());
    linksTo.get(target)!.add(slug);
  }
}

async function loadPage(filePath: string, pins: string[]): Promise<PageMeta | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const s = await stat(filePath);
    const slug = basename(filePath, ".sb");
    const lines = raw.split("\n");
    const title = lines[0] ?? slug;
    const { links, tags } = extractLinks(raw);
    const excerpt = extractExcerpt(raw);

    titleToSlug.set(title, slug);

    return {
      slug,
      title,
      excerpt,
      links,
      tags,
      pinned: pins.includes(slug),
      created: s.birthtime.getTime() > 0 ? s.birthtime : s.mtime,
      updated: s.mtime,
    };
  } catch {
    return null;
  }
}

export async function buildIndex(): Promise<void> {
  pages.clear();
  linksFrom.clear();
  linksTo.clear();
  titleToSlug.clear();

  try {
    await mkdir(PAGES_DIR, { recursive: true });
  } catch { /* already exists */ }

  const pins = await loadPins();
  pinsList = pins;
  let files: string[];
  try {
    files = await readdir(PAGES_DIR);
  } catch {
    files = [];
  }

  const sbFiles = files.filter((f) => f.endsWith(".sb"));
  await Promise.all(
    sbFiles.map(async (f) => {
      const meta = await loadPage(join(PAGES_DIR, f), pins);
      if (meta) pages.set(meta.slug, meta);
    })
  );

  // リンクグラフ構築（タイトル→スラグ解決後）
  for (const [slug, meta] of pages) {
    // リンク先をスラグに正規化
    const resolvedLinks = new Set<string>();
    for (const link of meta.links) {
      const resolved = titleToSlug.get(link) ?? titleAsSlug(link);
      resolvedLinks.add(resolved);
    }
    meta.links = resolvedLinks;
    updateGraph(slug, meta);
  }
}

export async function indexPage(slug: string): Promise<void> {
  const filePath = join(PAGES_DIR, `${slug}.sb`);
  const pins = await loadPins();
  const meta = await loadPage(filePath, pins);
  if (!meta) return;

  // リンク解決
  const resolvedLinks = new Set<string>();
  for (const link of meta.links) {
    const resolved = titleToSlug.get(link) ?? titleAsSlug(link);
    resolvedLinks.add(resolved);
  }
  meta.links = resolvedLinks;
  titleToSlug.set(meta.title, slug);

  pages.set(slug, meta);
  updateGraph(slug, meta);
}

export function removePage(slug: string): void {
  const meta = pages.get(slug);
  if (!meta) return;

  const outLinks = linksFrom.get(slug) ?? new Set();
  for (const target of outLinks) {
    linksTo.get(target)?.delete(slug);
  }
  linksFrom.delete(slug);
  pages.delete(slug);
  for (const [title, s] of titleToSlug) {
    if (s === slug) { titleToSlug.delete(title); break; }
  }
}

export function getRelatedPages(slug: string): Array<{ slug: string; title: string; excerpt: string; sharedLinks: number }> {
  const meta = pages.get(slug);
  if (!meta) return [];

  const direct = new Set<string>();
  // 1-hop: このページからのリンク先
  for (const target of meta.links) {
    if (target !== slug && pages.has(target)) direct.add(target);
  }
  // 1-hop: このページへのリンク元
  const inbound = linksTo.get(slug) ?? new Set();
  for (const src of inbound) {
    if (src !== slug && pages.has(src)) direct.add(src);
  }

  // 2-hop: 直接リンク先が持つリンク先/元で未表示のもの
  const twoHop = new Map<string, number>(); // slug → 共通リンク数
  for (const d of direct) {
    const dMeta = pages.get(d);
    if (!dMeta) continue;
    for (const t of dMeta.links) {
      if (t !== slug && !direct.has(t) && pages.has(t)) {
        twoHop.set(t, (twoHop.get(t) ?? 0) + 1);
      }
    }
    const dInbound = linksTo.get(d) ?? new Set();
    for (const t of dInbound) {
      if (t !== slug && !direct.has(t) && pages.has(t)) {
        twoHop.set(t, (twoHop.get(t) ?? 0) + 1);
      }
    }
  }

  const result: Array<{ slug: string; title: string; excerpt: string; sharedLinks: number }> = [];

  for (const s of direct) {
    const p = pages.get(s)!;
    result.push({ slug: s, title: p.title, excerpt: p.excerpt, sharedLinks: 999 });
  }
  for (const [s, count] of [...twoHop.entries()].sort((a, b) => b[1] - a[1])) {
    const p = pages.get(s)!;
    result.push({ slug: s, title: p.title, excerpt: p.excerpt, sharedLinks: count });
  }

  return result.slice(0, 20);
}

export function getPageFilePath(slug: string): string {
  return join(PAGES_DIR, `${slug}.sb`);
}

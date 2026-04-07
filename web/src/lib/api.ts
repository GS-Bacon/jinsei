const BASE = "/api/pages";

export interface RenderedBlock {
  type: "line" | "codeBlock" | "table";
  raw: string;
  html: string;
  indent: number;
}

export interface PageSummary {
  slug: string;
  title: string;
  excerpt: string;
  pinned: boolean;
  created: string;
  updated: string;
}

export interface PageDetail {
  slug: string;
  title: string;
  html: string;
  raw: string;
  blocks: RenderedBlock[];
  pinned: boolean;
  tags: string[];
  created: string;
  updated: string;
  related: RelatedPage[];
  backlinks: { slug: string; title: string }[];
}

export interface RelatedPage {
  slug: string;
  title: string;
  excerpt: string;
  sharedLinks: number;
}

export async function listPages(sort: "updated" | "created" | "title" = "updated"): Promise<PageSummary[]> {
  const res = await fetch(`${BASE}?sort=${sort}`);
  if (!res.ok) throw new Error("Failed to list pages");
  return res.json();
}

export async function getPage(slug: string): Promise<PageDetail> {
  const res = await fetch(`${BASE}/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("Page not found");
  return res.json();
}

export async function createPage(title: string, body: string): Promise<{ slug: string; title: string }> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new Error("Failed to create page");
  return res.json();
}

export async function updatePage(slug: string, body: string): Promise<{ slug: string; title: string }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error("Failed to update page");
  return res.json();
}

export async function deletePage(slug: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(slug)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete page");
}

export async function togglePin(slug: string): Promise<{ slug: string; pinned: boolean }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(slug)}/pin`, { method: "PUT" });
  if (!res.ok) throw new Error("Failed to toggle pin");
  return res.json();
}

export async function searchPages(q: string): Promise<Array<{ slug: string; title: string; excerpt: string }>> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

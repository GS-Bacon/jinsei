import { Document } from "flexsearch";
import { pages } from "./pageIndex.ts";

const index = new Document({
  document: {
    id: "slug",
    index: ["title", "excerpt"],
    store: ["title", "excerpt", "slug"],
  },
  tokenize: "full",
});

export async function buildSearchIndex(): Promise<void> {
  for (const meta of pages.values()) {
    index.add({ slug: meta.slug, title: meta.title, excerpt: meta.excerpt });
  }
}

export function updateSearchEntry(slug: string, title: string, excerpt: string): void {
  index.update({ slug, title, excerpt });
}

export function removeSearchEntry(slug: string): void {
  index.remove(slug);
}

export function searchPages(query: string): Array<{ slug: string; title: string; excerpt: string }> {
  if (!query.trim()) return [];

  const results = index.search(query, { limit: 20, enrich: true });
  const seen = new Set<string>();
  const out: Array<{ slug: string; title: string; excerpt: string }> = [];

  for (const field of results) {
    for (const item of field.result) {
      const slug = item.id as string;
      if (seen.has(slug)) continue;
      seen.add(slug);
      const doc = item.doc as { slug: string; title: string; excerpt: string };
      out.push({ slug: doc.slug, title: doc.title, excerpt: doc.excerpt });
    }
  }

  return out;
}

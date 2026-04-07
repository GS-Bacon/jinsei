import { parse } from "@progfay/scrapbox-parser";
import type { Node } from "@progfay/scrapbox-parser";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderNode(node: Node, existingSlugs: Set<string>): string {
  switch (node.type) {
    case "plain":
      return esc(node.text);

    case "link": {
      if (node.pathType === "absolute" || (node.pathType === "relative" && node.href.startsWith("http"))) {
        return `<a href="${esc(node.href)}" class="external-link" target="_blank" rel="noopener noreferrer">${esc(node.content || node.href)}</a>`;
      }
      const title = node.href.replace(/^\/[^/]+\//, "");
      const slug = title.trim().replace(/[/\\:*?"<>|]/g, "_");
      const exists = existingSlugs.has(slug);
      const href = encodeURIComponent(slug);
      return `<a href="/${href}" class="wiki-link${exists ? "" : " new"}" data-exists="${exists}">${esc(title)}</a>`;
    }

    case "hashTag": {
      const slug = node.href.trim().replace(/[/\\:*?"<>|]/g, "_");
      const exists = existingSlugs.has(slug);
      const href = encodeURIComponent(slug);
      return `<a href="/${href}" class="wiki-link tag${exists ? "" : " new"}" data-exists="${exists}">#${esc(node.href)}</a>`;
    }

    case "strong":
      return `<strong>${node.nodes.map((n) => renderNode(n, existingSlugs)).join("")}</strong>`;

    case "code":
      return `<code>${esc(node.text)}</code>`;

    case "quote":
      return `<span class="quote">${node.nodes.map((n) => renderNode(n, existingSlugs)).join("")}</span>`;

    case "image":
    case "strongImage": {
      const src = esc(node.src);
      if ("link" in node && node.link) {
        return `<a href="${esc(node.link)}" target="_blank" rel="noopener noreferrer"><img src="${src}" alt="" loading="lazy" /></a>`;
      }
      return `<img src="${src}" alt="" loading="lazy" />`;
    }

    case "formula":
      return `<span class="formula">${esc(node.formula)}</span>`;

    case "decoration": {
      const inner = node.nodes.map((n) => renderNode(n, existingSlugs)).join("");
      let result = inner;
      const decos = node.decos;
      if (decos.some((d) => d.startsWith("*"))) result = `<strong>${result}</strong>`;
      if (decos.includes("/")) result = `<em>${result}</em>`;
      if (decos.includes("-")) result = `<del>${result}</del>`;
      return result;
    }

    case "icon":
    case "strongIcon":
      return `<span class="icon">${esc(node.path)}</span>`;

    default:
      return esc((node as { text?: string }).text ?? "");
  }
}

// rawBlock: the raw Scrapbox text for a single block (1 line for "line", multi-line for code/table)
// Returns rendered HTML string
export function renderRawBlock(
  type: "line" | "codeBlock" | "table",
  raw: string,
  existingSlugs: Set<string>
): string {
  // Prepend a dummy title so the parser treats everything after as body
  const pageSrc = `_\n${raw}`;
  const blocks = parse(pageSrc);
  const contentBlocks = blocks.filter((b) => b.type !== "title");

  if (contentBlocks.length === 0) return "<br />";

  const block = contentBlocks[0];

  switch (block.type) {
    case "line": {
      if (block.nodes[0]?.type === "quote") {
        const inner = block.nodes.slice(1).map((n) => renderNode(n, existingSlugs)).join("");
        return `<div class="line-quote">${inner}</div>`;
      }
      const inner = block.nodes.map((n) => renderNode(n, existingSlugs)).join("");
      if (!inner.trim()) return "<br />";
      if (block.indent > 0) {
        const pl = block.indent * 1.5;
        const bl = (block.indent - 1) * 1.5 + 0.25;
        return `<div class="line-indent" style="padding-left:${pl}rem"><span class="line-bullet" aria-hidden="true" style="left:${bl}rem">•</span>${inner}</div>`;
      }
      return `<p>${inner}</p>`;
    }
    case "codeBlock": {
      const lang = esc(block.fileName.replace(/.*\./, "") || block.fileName);
      const code = esc(block.content);
      return `<pre><code class="language-${lang}">${code}</code></pre>`;
    }
    case "table": {
      const rows = block.cells
        .map((row) => {
          const cells = row
            .map((cell) => `<td>${cell.map((n) => renderNode(n, existingSlugs)).join("")}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table><tbody>${rows}</tbody></table>`;
    }
    default:
      return "<br />";
  }
}

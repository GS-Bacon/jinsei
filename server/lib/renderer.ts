import { parse } from "@progfay/scrapbox-parser";
import type { Node, Line, Block } from "@progfay/scrapbox-parser";
import { pages } from "./pageIndex.ts";

// ホワイトリスト方式でHTMLをエスケープ
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
        // 外部リンク
        return `<a href="${esc(node.href)}" class="external-link" target="_blank" rel="noopener noreferrer">${esc(node.content || node.href)}</a>`;
      }
      // 内部リンク（titleAsSlugと同じ変換でスラグ生成）
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

    case "italic":
      return `<em>${node.nodes.map((n) => renderNode(n, existingSlugs)).join("")}</em>`;

    case "strikeThrough":
      return `<del>${node.nodes.map((n) => renderNode(n, existingSlugs)).join("")}</del>`;

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
      // [* bold] [/ italic] [- strikethrough] の組み合わせ
      const inner = node.nodes.map((n) => renderNode(n, existingSlugs)).join("");
      let result = inner;
      const decos = node.decos;
      if (decos.includes("*-1") || decos.some((d) => d.startsWith("*"))) {
        result = `<strong>${result}</strong>`;
      }
      if (decos.includes("/")) result = `<em>${result}</em>`;
      if (decos.includes("-")) result = `<del>${result}</del>`;
      return result;
    }

    case "icon":
    case "strongIcon":
      return `<span class="icon">${esc(node.path)}</span>`;

    default:
      // 未知ノードはテキストとして表示（型安全のフォールバック）
      return esc((node as { text?: string }).text ?? "");
  }
}

function renderLine(line: Line, indent: number, existingSlugs: Set<string>): string {
  const inner = line.nodes.map((n) => renderNode(n, existingSlugs)).join("");
  if (!inner.trim()) return `<br />`;
  if (indent > 0) return `<li>${inner}</li>`;
  return `<p>${inner}</p>`;
}

export function renderScrapbox(rawBody: string): string {
  const existingSlugs = new Set(pages.keys());
  const blocks: Block[] = parse(rawBody);
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "title":
        // 1行目タイトルはUIで表示するのでスキップ
        break;

      case "codeBlock": {
        const lang = esc(block.fileName.replace(/.*\./, "") || block.fileName);
        const code = esc(block.content);
        parts.push(`<pre><code class="language-${lang}">${code}</code></pre>`);
        break;
      }

      case "table": {
        const rows = block.cells
          .map((row) => {
            const cells = row
              .map((cell) => {
                const cellHtml = cell.map((n) => renderNode(n, existingSlugs)).join("");
                return `<td>${cellHtml}</td>`;
              })
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        parts.push(`<table><tbody>${rows}</tbody></table>`);
        break;
      }

      case "line": {
        const indent = block.indent;
        const lineHtml = renderLine(block, indent, existingSlugs);

        // インデントをリスト化
        if (indent > 0) {
          // 前のpartがリストかチェック
          const last = parts[parts.length - 1] ?? "";
          if (last.endsWith("</li>") || last.endsWith("</ul>")) {
            parts[parts.length - 1] = last.replace(/<\/ul>\s*$/, "") + lineHtml + "</ul>";
          } else {
            parts.push(`<ul>${lineHtml}</ul>`);
          }
        } else {
          // 引用行
          if (block.nodes[0]?.type === "quote") {
            const inner = block.nodes.slice(1).map((n) => renderNode(n, existingSlugs)).join("");
            parts.push(`<blockquote>${inner}</blockquote>`);
          } else {
            parts.push(lineHtml);
          }
        }
        break;
      }
    }
  }

  return parts.join("\n");
}

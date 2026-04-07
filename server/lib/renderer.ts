import { parse } from "@progfay/scrapbox-parser";
import type { Node, Line, Block, CodeBlock, Table } from "@progfay/scrapbox-parser";
import { pages } from "./pageIndex.ts";

export interface RenderedBlock {
  type: "line" | "codeBlock" | "table";
  raw: string;
  html: string;
  indent: number;
}

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
      if (decos.some((d) => d.startsWith("*"))) {
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

function renderLineBlockHtml(block: Line, existingSlugs: Set<string>): string {
  const indent = block.indent;
  if (block.nodes[0]?.type === "quote") {
    const inner = block.nodes.slice(1).map((n) => renderNode(n, existingSlugs)).join("");
    return `<div class="line-quote">${inner}</div>`;
  }
  const inner = block.nodes.map((n) => renderNode(n, existingSlugs)).join("");
  if (!inner.trim()) return `<br />`;
  if (indent > 0) {
    const pl = indent * 1.5;
    const bl = (indent - 1) * 1.5 + 0.25;
    return `<div class="line-indent" style="padding-left:${pl}rem"><span class="line-bullet" aria-hidden="true" style="left:${bl}rem">•</span>${inner}</div>`;
  }
  return `<p>${inner}</p>`;
}

function renderCodeBlockHtml(block: CodeBlock): string {
  const lang = esc(block.fileName.replace(/.*\./, "") || block.fileName);
  const code = esc(block.content);
  return `<pre><code class="language-${lang}">${code}</code></pre>`;
}

function renderTableHtml(block: Table, existingSlugs: Set<string>): string {
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

export function renderScrapboxBlocks(rawBody: string): RenderedBlock[] {
  const existingSlugs = new Set(pages.keys());
  const allBlocks = parse(rawBody);
  const rawLines = rawBody.split("\n");
  const result: RenderedBlock[] = [];
  let lineIdx = 0;

  for (const block of allBlocks) {
    switch (block.type) {
      case "title":
        lineIdx++;
        break;
      case "line": {
        const raw = rawLines[lineIdx] ?? "";
        result.push({
          type: "line",
          raw,
          html: renderLineBlockHtml(block, existingSlugs),
          indent: block.indent,
        });
        lineIdx++;
        break;
      }
      case "codeBlock": {
        const contentLines = block.content === "" ? 0 : block.content.split("\n").length;
        const raw = rawLines.slice(lineIdx, lineIdx + 1 + contentLines).join("\n");
        result.push({
          type: "codeBlock",
          raw,
          html: renderCodeBlockHtml(block),
          indent: block.indent,
        });
        lineIdx += 1 + contentLines;
        break;
      }
      case "table": {
        const rowCount = block.cells.length;
        const raw = rawLines.slice(lineIdx, lineIdx + 1 + rowCount).join("\n");
        result.push({
          type: "table",
          raw,
          html: renderTableHtml(block, existingSlugs),
          indent: block.indent,
        });
        lineIdx += 1 + rowCount;
        break;
      }
    }
  }

  return result;
}

export function renderScrapboxFull(rawBody: string): { html: string; blocks: RenderedBlock[] } {
  const existingSlugs = new Set(pages.keys());
  const allBlocks = parse(rawBody);
  const rawLines = rawBody.split("\n");
  const renderedBlocks: RenderedBlock[] = [];
  const parts: string[] = [];
  let lineIdx = 0;

  for (const block of allBlocks) {
    switch (block.type) {
      case "title":
        lineIdx++;
        break;
      case "line": {
        const raw = rawLines[lineIdx] ?? "";
        renderedBlocks.push({
          type: "line",
          raw,
          html: renderLineBlockHtml(block, existingSlugs),
          indent: block.indent,
        });
        const indent = block.indent;
        const lineHtml = renderLine(block, indent, existingSlugs);
        if (indent > 0) {
          const last = parts[parts.length - 1] ?? "";
          if (last.endsWith("</li>") || last.endsWith("</ul>")) {
            parts[parts.length - 1] = last.replace(/<\/ul>\s*$/, "") + lineHtml + "</ul>";
          } else {
            parts.push(`<ul>${lineHtml}</ul>`);
          }
        } else {
          if (block.nodes[0]?.type === "quote") {
            const inner = block.nodes.slice(1).map((n) => renderNode(n, existingSlugs)).join("");
            parts.push(`<blockquote>${inner}</blockquote>`);
          } else {
            parts.push(lineHtml);
          }
        }
        lineIdx++;
        break;
      }
      case "codeBlock": {
        const contentLines = block.content === "" ? 0 : block.content.split("\n").length;
        const raw = rawLines.slice(lineIdx, lineIdx + 1 + contentLines).join("\n");
        const html = renderCodeBlockHtml(block);
        renderedBlocks.push({ type: "codeBlock", raw, html, indent: block.indent });
        parts.push(html);
        lineIdx += 1 + contentLines;
        break;
      }
      case "table": {
        const rowCount = block.cells.length;
        const raw = rawLines.slice(lineIdx, lineIdx + 1 + rowCount).join("\n");
        const html = renderTableHtml(block, existingSlugs);
        renderedBlocks.push({ type: "table", raw, html, indent: block.indent });
        parts.push(html);
        lineIdx += 1 + rowCount;
        break;
      }
    }
  }

  return { html: parts.join("\n"), blocks: renderedBlocks };
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

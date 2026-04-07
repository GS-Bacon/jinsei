import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { createPage, updatePage, getPage, listPages } from "../lib/api.ts";
import type { RenderedBlock } from "../lib/api.ts";
import { renderRawBlock } from "../lib/clientRenderer.ts";

/* ── Link suggestion popup ── */
interface SuggestionState {
  items: string[];
  selected: number;
  // Position of the opening '[' in the textarea value
  bracketPos: number;
}

function LinkSuggestions({
  items,
  selected,
  onSelect,
}: {
  items: string[];
  selected: number;
  onSelect: (item: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <ul
      ref={listRef}
      className="absolute left-0 z-50 mt-1 max-h-48 w-64 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
    >
      {items.map((item, i) => (
        <li
          key={item}
          className={`cursor-pointer truncate px-3 py-1.5 text-sm ${
            i === selected ? "bg-blue-100 text-blue-900" : "text-gray-700 hover:bg-gray-100"
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // don't blur textarea
            onSelect(item);
          }}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

interface EditorBlock {
  id: string;
  type: "line" | "codeBlock" | "table";
  raw: string;
  html: string;       // last server-rendered HTML
  localHtml: string | null; // client-rendered (null = use html)
  indent: number;
}

interface LineEditorProps {
  slug: string;
  isNew: boolean;
  initialBlocks: EditorBlock[];
}

function toEditorBlocks(blocks: RenderedBlock[]): EditorBlock[] {
  return blocks.map((b) => ({
    id: generateId(),
    type: b.type,
    raw: b.raw,
    html: b.html,
    localHtml: null,
    indent: b.indent,
  }));
}

function generateId(): string {
  return crypto.getRandomValues(new Uint32Array(4)).reduce(
    (s, v) => s + v.toString(16).padStart(8, "0"), ""
  );
}

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Find the opening '[' for a suggestion context at the given cursor position.
 *  Returns the index of '[' or -1 if cursor is not inside an open bracket pair. */
function findOpenBracket(value: string, cursorPos: number): number {
  // Walk backwards from cursor to find an unmatched '['
  for (let i = cursorPos - 1; i >= 0; i--) {
    if (value[i] === "]") return -1; // hit a close bracket first
    if (value[i] === "\n") return -1;
    if (value[i] === "[") return i;
  }
  return -1;
}

/** Estimate cursor position from a click's x-offset on a rendered block. */
function estimateCursorPos(raw: string, clickX: number, blockEl: HTMLElement): number {
  // Create a hidden measurement span with the same font as the block
  const span = document.createElement("span");
  const style = window.getComputedStyle(blockEl);
  span.style.font = style.font;
  span.style.letterSpacing = style.letterSpacing;
  span.style.visibility = "hidden";
  span.style.position = "absolute";
  span.style.whiteSpace = "pre";
  document.body.appendChild(span);

  // Strip leading spaces (indented lines render with list markers, not spaces)
  const stripped = raw.replace(/^ +/, "");
  const indentChars = raw.length - stripped.length;

  let best = indentChars;
  let bestDist = Math.abs(clickX);
  for (let i = 0; i <= stripped.length; i++) {
    span.textContent = stripped.slice(0, i);
    const dist = Math.abs(span.offsetWidth - clickX);
    if (dist < bestDist) {
      bestDist = dist;
      best = indentChars + i;
    }
  }
  document.body.removeChild(span);
  return best;
}

export function toInitialBlocks(serverBlocks: RenderedBlock[]): EditorBlock[] {
  if (serverBlocks.length === 0) {
    return [{ id: generateId(), type: "line", raw: "", html: "<br />", localHtml: null, indent: 0 }];
  }
  return toEditorBlocks(serverBlocks);
}

export default function LineEditor({ slug, isNew: initialIsNew, initialBlocks }: LineEditorProps) {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<EditorBlock[]>(initialBlocks);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [existingSlugs, setExistingSlugs] = useState<Set<string>>(new Set([slug]));

  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);

  const isNewRef = useRef(initialIsNew);
  const cursorXRef = useRef(0);
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const blockDivRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Refs that track latest values so debouncedSave closure always reads current state
  const blocksRef = useRef(initialBlocks);
  const focusedIndexRef = useRef<number | null>(null);

  function setFocused(val: number | null) {
    focusedIndexRef.current = val;
    setFocusedIndex(val);
  }

  // Keeps blocksRef in sync and re-renders; use instead of setBlocks for user edits
  function updateBlocks(updater: (prev: EditorBlock[]) => EditorBlock[]) {
    setBlocks((prev) => {
      const next = updater(prev);
      blocksRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    listPages().then((pages) => {
      setExistingSlugs(new Set(pages.map((p) => p.slug)));
    });
  }, []);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function setCursorPos(el: HTMLTextAreaElement, pos: number) {
    el.setSelectionRange(pos, pos);
  }

  function focusBlock(index: number, cursorPos?: number) {
    setFocused(index);
    // Use rAF to wait for the textarea to be rendered
    requestAnimationFrame(() => {
      const el = textareaRefs.current.get(index);
      if (!el) return;
      el.focus();
      autoResize(el);
      if (cursorPos !== undefined) {
        const pos = Math.min(cursorPos, el.value.length);
        setCursorPos(el, pos);
      }
    });
  }

  /** Update suggestion popup based on current textarea state */
  const updateSuggestion = useCallback(
    (value: string, cursorPos: number) => {
      const bp = findOpenBracket(value, cursorPos);
      if (bp === -1) {
        setSuggestion(null);
        return;
      }
      const query = value.slice(bp + 1, cursorPos).toLowerCase();
      if (query.length === 0) {
        setSuggestion(null);
        return;
      }
      // Filter: don't suggest for decoration syntax like [* or [/ or [- or [**
      if (/^[*/-]/.test(query)) {
        setSuggestion(null);
        return;
      }
      const items = Array.from(existingSlugs)
        .filter((s) => decodeURIComponent(s).toLowerCase().includes(query))
        .slice(0, 12);
      if (items.length === 0) {
        setSuggestion(null);
        return;
      }
      setSuggestion((prev) => ({
        items,
        selected: prev ? Math.min(prev.selected, items.length - 1) : 0,
        bracketPos: bp,
      }));
    },
    [existingSlugs],
  );

  function renderBlockLocally(index: number, raw: string, type: EditorBlock["type"]) {
    const html = renderRawBlock(type, raw, existingSlugs);
    updateBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, raw, localHtml: html } : b))
    );
  }

  // Reads from blocksRef/focusedIndexRef to avoid stale closure values
  const debouncedSave = useMemo(
    () =>
      debounce(async () => {
        try {
          const currentBlocks = blocksRef.current;
          const body = currentBlocks.map((b) => b.raw).join("\n");
          if (isNewRef.current) {
            const title = decodeURIComponent(slug);
            await createPage(title, body).catch((err) => {
              // 409 = already exists, switch to update
              if (err.message?.includes("409")) {
                isNewRef.current = false;
                return updatePage(slug, body);
              }
              throw err;
            });
            isNewRef.current = false;
          } else {
            await updatePage(slug, body);
          }

          // Re-fetch server-rendered blocks (updates link colors etc.)
          const fresh = await getPage(slug);
          setBlocks((prev) => {
            const next = prev.map((block, i) => {
              const freshBlock = fresh.blocks[i];
              if (!freshBlock) return block;
              return {
                ...block,
                html: freshBlock.html,
                localHtml: null,
                // Don't overwrite raw of the currently-focused block
                raw: i === focusedIndexRef.current ? block.raw : freshBlock.raw,
              };
            });
            blocksRef.current = next;
            return next;
          });

        } catch {
          // save failed silently
        }
      }, 1500),
    [slug] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function handleBlur(index: number) {
    const block = blocks[index];
    renderBlockLocally(index, block.raw, block.type);
  }

  function handleChange(index: number, value: string) {
    updateBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b;
        if (b.type !== "line") {
          return { ...b, raw: value, localHtml: renderRawBlock(b.type, value, existingSlugs) };
        }
        return { ...b, raw: value };
      })
    );
    const el = textareaRefs.current.get(index);
    if (el) {
      autoResize(el);
      // Update suggestions after React state update
      requestAnimationFrame(() => updateSuggestion(value, el.selectionStart));
    }
    debouncedSave();
  }

  /** Apply a selected suggestion: replace text from '[' to cursor with '[pageTitle]' */
  function applySuggestion(index: number, item: string) {
    if (!suggestion) return;
    const block = blocks[index];
    const title = decodeURIComponent(item);
    const before = block.raw.slice(0, suggestion.bracketPos);
    const el = textareaRefs.current.get(index);
    const cursorPos = el ? el.selectionStart : suggestion.bracketPos + 1;
    const after = block.raw.slice(cursorPos);
    const newRaw = before + "[" + title + "]" + after;
    const newCursor = before.length + 1 + title.length + 1; // after ']'
    handleChange(index, newRaw);
    setSuggestion(null);
    requestAnimationFrame(() => {
      const el2 = textareaRefs.current.get(index);
      if (el2) {
        el2.focus();
        setCursorPos(el2, newCursor);
      }
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    const el = e.currentTarget;
    const { value, selectionStart, selectionEnd } = el;
    const block = blocks[index];

    // ── Suggestion popup keyboard handling ──
    if (suggestion && suggestion.items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestion((s) => s && { ...s, selected: Math.min(s.selected + 1, s.items.length - 1) });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestion((s) => s && { ...s, selected: Math.max(s.selected - 1, 0) });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySuggestion(index, suggestion.items[suggestion.selected]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestion(null);
        return;
      }
    }

    // codeBlock and table: only handle ↑↓ at boundaries, everything else native
    if (block.type !== "line") {
      if (e.key === "ArrowUp" && selectionStart === 0) {
        e.preventDefault();
        if (index > 0) {
          cursorXRef.current = 0;
          focusBlock(index - 1, 0);
        }
      } else if (e.key === "ArrowDown" && selectionStart === value.length) {
        e.preventDefault();
        if (index < blocks.length - 1) {
          cursorXRef.current = 0;
          focusBlock(index + 1, 0);
        }
      }
      return;
    }

    // ── Bracket auto-completion ──
    if (e.key === "[" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const newRaw = value.slice(0, selectionStart) + "[]" + value.slice(selectionEnd);
      const newCursor = selectionStart + 1;
      handleChange(index, newRaw);
      requestAnimationFrame(() => {
        const el2 = textareaRefs.current.get(index);
        if (el2) setCursorPos(el2, newCursor);
      });
      return;
    }

    // Skip over ']' if cursor is right before one (don't double-insert)
    if (e.key === "]" && !e.ctrlKey && !e.metaKey && value[selectionStart] === "]") {
      e.preventDefault();
      requestAnimationFrame(() => setCursorPos(el, selectionStart + 1));
      return;
    }

    // line block key handling
    switch (e.key) {
      case "Enter": {
        e.preventDefault();
        const before = value.slice(0, selectionStart);
        const after = value.slice(selectionStart);
        // Preserve indent of current line for new line
        const indentMatch = value.match(/^( *)/);
        const indent = indentMatch ? indentMatch[1] : "";
        const newBlock: EditorBlock = {
          id: generateId(),
          type: "line",
          raw: indent + after,
          html: "<br />",
          localHtml: null,
          indent: indent.length,
        };
        updateBlocks((prev) => [
          ...prev.slice(0, index),
          { ...prev[index], raw: before },
          newBlock,
          ...prev.slice(index + 1),
        ]);
        debouncedSave();
        requestAnimationFrame(() => focusBlock(index + 1, indent.length));
        break;
      }

      case "Backspace": {
        if (selectionStart === 0 && selectionEnd === 0) {
          if (index === 0) break;
          const prev = blocks[index - 1];
          if (prev.type !== "line") break; // can't merge into code/table block
          e.preventDefault();
          const mergedRaw = prev.raw + value;
          const cursorPos = prev.raw.length;
          updateBlocks((prev2) => [
            ...prev2.slice(0, index - 1),
            { ...prev, raw: mergedRaw },
            ...prev2.slice(index + 1),
          ]);
          debouncedSave();
          requestAnimationFrame(() => focusBlock(index - 1, cursorPos));
        }
        break;
      }

      case "Tab": {
        e.preventDefault();
        if (e.shiftKey) {
          // Outdent: remove leading space
          const newRaw = value.startsWith(" ") ? value.slice(1) : value;
          const newCursor = Math.max(0, selectionStart - (value.startsWith(" ") ? 1 : 0));
          updateBlocks((prev) =>
            prev.map((b, i) => (i === index ? { ...b, raw: newRaw } : b))
          );
          debouncedSave();
          requestAnimationFrame(() => {
            const el2 = textareaRefs.current.get(index);
            if (el2) setCursorPos(el2, newCursor);
          });
        } else {
          // Indent: insert space at cursor
          const newRaw = value.slice(0, selectionStart) + " " + value.slice(selectionEnd);
          const newCursor = selectionStart + 1;
          updateBlocks((prev) =>
            prev.map((b, i) => (i === index ? { ...b, raw: newRaw } : b))
          );
          debouncedSave();
          requestAnimationFrame(() => {
            const el2 = textareaRefs.current.get(index);
            if (el2) setCursorPos(el2, newCursor);
          });
        }
        break;
      }

      case "ArrowUp": {
        if (selectionStart === 0) {
          e.preventDefault();
          if (index > 0) {
            cursorXRef.current = selectionStart;
            focusBlock(index - 1, cursorXRef.current);
          }
        }
        break;
      }

      case "ArrowDown": {
        if (selectionStart === value.length) {
          e.preventDefault();
          if (index < blocks.length - 1) {
            cursorXRef.current = selectionStart;
            focusBlock(index + 1, cursorXRef.current);
          }
        }
        break;
      }
    }
  }

  // Handle click on rendered block (not on a wikilink)
  function handleBlockClick(e: React.MouseEvent<HTMLDivElement>, index: number) {
    const target = e.target as HTMLElement;
    const link = target.closest("a");
    if (link) {
      const href = link.getAttribute("href");
      if (href && href.startsWith("/") && !link.classList.contains("external-link")) {
        e.preventDefault();
        navigate(href);
      }
      return; // don't focus on link click
    }
    // Estimate cursor position from click x-offset
    const blockEl = blockDivRefs.current.get(index);
    const block = blocks[index];
    if (blockEl && block.type === "line") {
      const rect = blockEl.getBoundingClientRect();
      // Account for padding from indent (ul/li adds ~1rem per indent level)
      const textContent = blockEl.querySelector("li, p, blockquote");
      const textRect = textContent ? textContent.getBoundingClientRect() : rect;
      const clickX = e.clientX - textRect.left;
      const cursorPos = estimateCursorPos(block.raw, Math.max(0, clickX), blockEl);
      focusBlock(index, cursorPos);
    } else {
      focusBlock(index);
    }
  }

  return (
    <div className="line-editor">
      {blocks.map((block, index) => {
        const displayHtml = block.localHtml ?? block.html;

        if (focusedIndex === index) {
          const isMultiLine = block.type !== "line";
          const indent = block.type === "line" ? (block.raw.match(/^( *)/)![1].length) : 0;
          return (
            <div key={block.id} className={`editor-block editor-block--focused editor-block--${block.type} relative`}>
              {indent > 0 && (
                <span
                  className="editor-bullet"
                  style={{ left: `${(indent - 1) * 1.5 + 0.25}rem` }}
                >
                  •
                </span>
              )}
              <textarea
                ref={(el) => {
                  if (el) {
                    textareaRefs.current.set(index, el);
                    autoResize(el);
                  } else {
                    textareaRefs.current.delete(index);
                  }
                }}
                value={block.raw}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onBlur={() => {
                  setFocused(null);
                  handleBlur(index);
                  setSuggestion(null);
                }}
                className={`editor-textarea${isMultiLine ? " editor-textarea--multiline" : ""}`}
                rows={isMultiLine ? undefined : 1}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
              {suggestion && suggestion.items.length > 0 && (
                <LinkSuggestions
                  items={suggestion.items.map((s) => decodeURIComponent(s))}
                  selected={suggestion.selected}
                  onSelect={(title) => {
                    const slug = encodeURIComponent(title.replace(/[/\\:*?"<>|]/g, "_"));
                    applySuggestion(index, slug);
                  }}
                />
              )}
            </div>
          );
        }

        return (
          <div
            key={block.id}
            ref={(el) => {
              if (el) blockDivRefs.current.set(index, el);
              else blockDivRefs.current.delete(index);
            }}
            className={`editor-block editor-block--${block.type} page-body`}
            onClick={(e) => handleBlockClick(e, index)}
            dangerouslySetInnerHTML={{ __html: displayHtml }}
          />
        );
      })}

      {/* Click empty area below blocks to add a new line */}
      <div
        className="editor-empty-area"
        onClick={() => {
          const lastIndex = blocks.length - 1;
          const last = blocks[lastIndex];
          if (last?.type === "line") {
            focusBlock(lastIndex, last.raw.length);
          } else {
            updateBlocks((prev) => [
              ...prev,
              { id: generateId(), type: "line", raw: "", html: "<br />", localHtml: null, indent: 0 },
            ]);
            debouncedSave();
            requestAnimationFrame(() => focusBlock(blocks.length, 0));
          }
        }}
      />
    </div>
  );
}

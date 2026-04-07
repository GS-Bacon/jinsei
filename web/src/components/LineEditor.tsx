import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { createPage, updatePage, getPage, listPages } from "../lib/api.ts";
import type { RenderedBlock } from "../lib/api.ts";
import { renderRawBlock } from "../lib/clientRenderer.ts";

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

  const isNewRef = useRef(initialIsNew);
  const cursorXRef = useRef(0);
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
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
    if (el) autoResize(el);
    debouncedSave();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    const el = e.currentTarget;
    const { value, selectionStart, selectionEnd } = el;
    const block = blocks[index];

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
    focusBlock(index);
  }

  return (
    <div className="line-editor">
      {blocks.map((block, index) => {
        const displayHtml = block.localHtml ?? block.html;

        if (focusedIndex === index) {
          const isMultiLine = block.type !== "line";
          return (
            <div key={block.id} className={`editor-block editor-block--focused editor-block--${block.type}`}>
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
                }}
                className={`editor-textarea${isMultiLine ? " editor-textarea--multiline" : ""}`}
                rows={isMultiLine ? undefined : 1}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>
          );
        }

        return (
          <div
            key={block.id}
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

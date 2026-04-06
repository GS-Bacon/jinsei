import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PageSummary } from "../lib/api.ts";

interface Props {
  pages: PageSummary[];
  onTogglePin: (slug: string) => void;
}

const SIZE_CLASSES = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

const CARD_WIDTH_CLASSES = {
  sm: "w-36",
  md: "w-48",
  lg: "w-64",
};

type Size = "sm" | "md" | "lg";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function PageCard({ page, size, onPin }: { page: PageSummary; size: Size; onPin: () => void }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/${page.slug}`)}
      className={`${CARD_WIDTH_CLASSES[size]} bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all duration-150 relative ${page.pinned ? "border-yellow-300 bg-yellow-50" : ""}`}
    >
      {page.pinned && (
        <span className="absolute top-1.5 right-1.5 text-yellow-500 text-xs">📌</span>
      )}
      <div className={`font-semibold text-gray-900 truncate ${SIZE_CLASSES[size]} leading-tight`}>
        {page.title}
      </div>
      {size !== "sm" && page.excerpt && (
        <div className={`text-gray-500 mt-1 ${size === "md" ? "text-xs line-clamp-2" : "text-sm line-clamp-3"}`}>
          {page.excerpt}
        </div>
      )}
      <div className="text-gray-400 text-xs mt-2">{formatDate(page.updated)}</div>
      <button
        onClick={(e) => { e.stopPropagation(); onPin(); }}
        className="absolute bottom-1.5 right-1.5 text-gray-300 hover:text-yellow-500 text-xs transition-colors"
        title={page.pinned ? "ピン解除" : "ピン留め"}
      >
        {page.pinned ? "★" : "☆"}
      </button>
    </div>
  );
}

export default function CardGrid({ pages, onTogglePin }: Props) {
  const [size, setSize] = useState<Size>("md");

  return (
    <div>
      {/* サイズ変更スライダー */}
      <div className="flex items-center gap-2 mb-4 justify-end">
        <span className="text-xs text-gray-500">カードサイズ</span>
        <div className="flex gap-1">
          {(["sm", "md", "lg"] as Size[]).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                size === s
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-300"
              }`}
            >
              {s === "sm" ? "小" : s === "md" ? "中" : "大"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {pages.map((page) => (
          <PageCard
            key={page.slug}
            page={page}
            size={size}
            onPin={() => onTogglePin(page.slug)}
          />
        ))}
      </div>

      {pages.length === 0 && (
        <div className="text-center text-gray-400 py-20">
          <div className="text-4xl mb-3">📝</div>
          <div>ページがまだありません</div>
        </div>
      )}
    </div>
  );
}

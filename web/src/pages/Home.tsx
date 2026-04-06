import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CardGrid from "../components/CardGrid.tsx";
import SearchBar from "../components/SearchBar.tsx";
import { listPages, togglePin } from "../lib/api.ts";
import type { PageSummary } from "../lib/api.ts";

type SortKey = "updated" | "created" | "title";

export default function Home() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [sort, setSort] = useState<SortKey>("updated");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    listPages(sort)
      .then(setPages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sort]);

  async function handleTogglePin(slug: string) {
    const res = await togglePin(slug).catch(() => null);
    if (!res) return;
    setPages((prev) =>
      prev
        .map((p) => (p.slug === slug ? { ...p, pinned: res.pinned } : p))
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          if (sort === "title") return a.title.localeCompare(b.title, "ja");
          if (sort === "created") return new Date(b.created).getTime() - new Date(a.created).getTime();
          return new Date(b.updated).getTime() - new Date(a.updated).getTime();
        })
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <h1
            onClick={() => navigate("/")}
            className="text-lg font-bold text-gray-900 cursor-pointer hover:text-blue-600 flex-shrink-0"
          >
            人生レポジトリ
          </h1>
          <div className="flex-1">
            <SearchBar />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* ソートコントロール */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-gray-500">ソート:</span>
          {(["updated", "created", "title"] as SortKey[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-300"
              }`}
            >
              {s === "updated" ? "更新日" : s === "created" ? "作成日" : "タイトル"}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">{pages.length} ページ</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <CardGrid pages={pages} onTogglePin={handleTogglePin} />
        )}
      </main>
    </div>
  );
}

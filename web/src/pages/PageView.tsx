import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import RelatedPages from "../components/RelatedPages.tsx";
import { getPage, togglePin } from "../lib/api.ts";
import type { PageDetail } from "../lib/api.ts";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PageView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(false);
    getPage(slug)
      .then(setPage)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleTogglePin() {
    if (!page) return;
    const res = await togglePin(page.slug).catch(() => null);
    if (res) setPage((p) => p ? { ...p, pinned: res.pinned } : p);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-xl font-bold text-gray-700 mb-2">ページが見つかりません</h1>
        <p className="text-gray-500 text-sm mb-6">「{decodeURIComponent(slug ?? "")}」はまだ存在しません</p>
        <button onClick={() => navigate("/")} className="text-blue-500 hover:underline text-sm">
          ← ホームに戻る
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            ホーム
          </button>
          <div className="flex-1" />
          <button
            onClick={handleTogglePin}
            className={`text-sm transition-colors ${page.pinned ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"}`}
            title={page.pinned ? "ピン解除" : "ピン留め"}
          >
            {page.pinned ? "★ ピン留め中" : "☆ ピン留め"}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* タイトル */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{page.title}</h1>

        {/* メタ情報 */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-6">
          <span>作成: {formatDate(page.created)}</span>
          <span>更新: {formatDate(page.updated)}</span>
          {page.tags.length > 0 && (
            <span className="flex gap-1 flex-wrap">
              {page.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => navigate(`/${encodeURIComponent(tag)}`)}
                  className="text-purple-600 hover:underline"
                >
                  #{tag}
                </button>
              ))}
            </span>
          )}
        </div>

        {/* 本文 */}
        <div
          className="page-body"
          dangerouslySetInnerHTML={{ __html: page.html }}
          onClick={(e) => {
            // WikiLink内部リンクのクリックをReact Routerで処理
            const target = e.target as HTMLElement;
            const link = target.closest("a");
            if (!link) return;
            const href = link.getAttribute("href");
            if (href && href.startsWith("/") && !link.classList.contains("external-link")) {
              e.preventDefault();
              navigate(href);
            }
          }}
        />

        {/* 関連ページ */}
        <RelatedPages related={page.related} />

        {/* バックリンク（Phase 2で本格化するが一覧は表示） */}
        {page.backlinks.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">このページへのリンク</h2>
            <div className="flex flex-wrap gap-2">
              {page.backlinks.map((b) => (
                <button
                  key={b.slug}
                  onClick={() => navigate(`/${b.slug}`)}
                  className="text-sm text-blue-500 hover:underline"
                >
                  {b.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

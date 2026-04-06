import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { searchPages } from "../lib/api.ts";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ slug: string; title: string; excerpt: string }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await searchPages(query).catch(() => []);
      setResults(res);
      setOpen(res.length > 0);
      setLoading(false);
    }, 200);
  }, [query]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <div className="flex items-center bg-white border border-gray-300 rounded-full px-4 py-2 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <svg className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ページを検索..."
          className="flex-1 outline-none text-sm bg-transparent"
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
      </div>

      {open && (
        <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {results.map((r) => (
            <button
              key={r.slug}
              onClick={() => { navigate(`/${r.slug}`); setOpen(false); setQuery(""); }}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0"
            >
              <div className="font-medium text-sm text-gray-900 truncate">{r.title}</div>
              {r.excerpt && <div className="text-xs text-gray-500 truncate mt-0.5">{r.excerpt}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

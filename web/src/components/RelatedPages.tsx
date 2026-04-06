import { useNavigate } from "react-router-dom";
import type { RelatedPage } from "../lib/api.ts";

interface Props {
  related: RelatedPage[];
}

export default function RelatedPages({ related }: Props) {
  const navigate = useNavigate();
  if (related.length === 0) return null;

  return (
    <div className="mt-12 border-t border-gray-200 pt-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">関連ページ</h2>
      <div className="flex flex-wrap gap-2">
        {related.map((r) => (
          <button
            key={r.slug}
            onClick={() => navigate(`/${r.slug}`)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm hover:border-blue-300 hover:shadow-sm transition-all text-left max-w-xs"
          >
            <div className="font-medium text-gray-800 truncate">{r.title}</div>
            {r.excerpt && (
              <div className="text-xs text-gray-500 truncate mt-0.5">{r.excerpt}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

# 人生レポジトリ

LLMが書き人間が閲覧する個人Wiki。Scrapbox体験（フラット構造、カードグリッド、`[リンク]`双方向リンク、`#タグ`=リンク、2-hop関連ページ）を再現。Dell R810 + Tailscaleでホスト。

## アクセス

`http://serversmith:3000`（Tailscale MagicDNS）または `http://100.84.170.32:3000`

## ロードマップ

```
Phase 1 ✅  API + ページ閲覧 + カードグリッド + 検索 + wikilink + 2-hop関連ページ
Phase 2     タグページ自動生成 + New Links（未リンクページ一覧）
Phase 3     グラフビュー(D3.js) + ポップオーバープレビュー
Phase 4     認証(Tailscale identity header) + バックアップ
```

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| ランタイム | Bun |
| API | Hono |
| 記法パーサー | @progfay/scrapbox-parser |
| AST→HTML | 自前（ホワイトリスト方式） |
| フロント | React + Vite + Tailwind + shadcn/ui |
| 検索 | FlexSearch |
| データ | `.sb`ファイル on disk（フラット） |

## API

```
GET    /api/pages              # 一覧（?sort=updated|created|title）
GET    /api/pages/:slug        # 取得（HTML + 関連ページ + バックリンク）
POST   /api/pages              # 作成 { title, body }
PUT    /api/pages/:slug        # 更新 { body }
DELETE /api/pages/:slug        # 削除
GET    /api/pages/search?q=    # 全文検索
PUT    /api/pages/:slug/pin    # ピン留めトグル
```

## デプロイ・運用

詳細は [DEPLOY.md](DEPLOY.md) を参照。

```bash
# サービス状態確認
sudo systemctl status jinsei

# ログ確認
sudo journalctl -u jinsei -f

# フロント更新後
cd web && bun run build
sudo systemctl restart jinsei
```

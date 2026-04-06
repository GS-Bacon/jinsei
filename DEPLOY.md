# デプロイ手順（Dell R810）

## セットアップ

```bash
# Bunインストール（未インストールの場合）
curl -fsSL https://bun.sh/install | bash

# 依存インストール
cd /home/bacon/jinsei
bun install
cd web && bun install && cd ..

# フロントエンドビルド
bun run build
```

## systemdサービス登録

```bash
sudo cp jinsei.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable jinsei
sudo systemctl start jinsei
sudo systemctl status jinsei
```

## 動作確認

```bash
# ローカル確認
curl http://localhost:3000/api/pages

# Tailscale経由（他の端末から）
curl http://<tailscale-ip>:3000/api/pages
```

## MCP接続設定（Claude Code）

`~/.claude/mcp_settings.json` に追加:

```json
{
  "mcpServers": {
    "jinsei": {
      "command": "bun",
      "args": ["run", "/path/to/jinsei-mcp/index.ts"],
      "env": {
        "JINSEI_API": "http://localhost:3000"
      }
    }
  }
}
```

## 更新時

```bash
# フロントエンド再ビルド
bun run build

# サービス再起動
sudo systemctl restart jinsei
```

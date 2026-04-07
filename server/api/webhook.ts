import { Hono } from "hono";

const app = new Hono();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";

app.post("/gitea", async (c) => {
  // シークレット検証
  const secret = c.req.header("X-Gitea-Signature-256");
  if (WEBHOOK_SECRET) {
    if (!secret) return c.json({ error: "missing signature" }, 401);
    const body = await c.req.text();
    const expected = await hmacSha256(WEBHOOK_SECRET, body);
    if (!timingSafeEqual(secret.replace("sha256=", ""), expected)) {
      return c.json({ error: "invalid signature" }, 401);
    }
  }

  // pushイベントのみ処理
  const event = c.req.header("X-Gitea-Event");
  if (event !== "push") return c.json({ ok: true, skipped: true });

  // mainブランチへのpushのみ
  const payload = await c.req.json<{ ref?: string }>();
  if (payload.ref !== "refs/heads/main") return c.json({ ok: true, skipped: true });

  // デプロイスクリプトをdetachedで実行
  Bun.spawn(["bash", "/home/bacon/jinsei/scripts/deploy.sh"], {
    detached: true,
    stdout: Bun.file("/tmp/deploy.log"),
    stderr: Bun.file("/tmp/deploy.log"),
  });

  return c.json({ ok: true });
});

async function hmacSha256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export default app;

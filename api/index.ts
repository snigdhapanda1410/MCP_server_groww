import { loadTokens } from "../src/auth";

export const maxDuration = 10;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const isAuthReady = Boolean(loadTokens());
  const baseUrl = `${url.protocol}//${url.host}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Google Workspace MCP Server (Vercel)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    code { background: #f6f8fa; padding: 2px 6px; border-radius: 4px; font-size: 85%; }
    pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; }
    .badge-ok { background: #e6f4ea; color: #137333; }
    .badge-warn { background: #fef7e0; color: #b06000; }
    .card { border: 1px solid #e1e4e8; border-radius: 8px; padding: 20px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>Google Workspace MCP Server</h1>
  <p>Deployed as a Serverless Service on <strong>Vercel</strong>.</p>
  
  <div class="card">
    <h3>Service Status</h3>
    <p><strong>Platform:</strong> Vercel Serverless Functions</p>
    <p><strong>Authentication:</strong> ${isAuthReady ? '<span class="badge badge-ok">Authorized</span>' : '<span class="badge badge-warn">Missing Token</span>'}</p>
    <p><strong>MCP Endpoint:</strong> <code>${baseUrl}/mcp</code></p>
    <p><strong>Health Check:</strong> <a href="/health"><code>/health</code></a></p>
  </div>

  <div class="card">
    <h3>Client Configuration</h3>
    <p>Add to your MCP host client config (Cursor, Antigravity, Claude):</p>
    <pre><code>{
  "mcpServers": {
    "google-workspace": {
      "url": "${baseUrl}/mcp"
    }
  }
}</code></pre>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}


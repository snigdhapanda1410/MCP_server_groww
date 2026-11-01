import * as http from "http";
import * as url from "url";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import {
  createOAuth2Client,
  saveTokens,
  loadCredentials,
  REQUIRED_SCOPES,
  loadTokens,
} from "./auth";
import { logger } from "./logger";

/**
 * Converts a Node.js IncomingMessage to a Web Standard Request object.
 */
async function nodeRequestToWebRequest(
  req: http.IncomingMessage,
  hostUrl: string
): Promise<Request> {
  const reqUrl = new URL(req.url || "/", hostUrl);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, value);
      }
    }
  }

  // MCP Streamable HTTP requires client to accept application/json and text/event-stream
  const accept = headers.get("accept");
  if (!accept || accept === "*/*") {
    headers.set("accept", "application/json, text/event-stream");
  } else if (!accept.includes("text/event-stream")) {
    headers.set("accept", `${accept}, text/event-stream`);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let bodyBuffer: Buffer | undefined;

  if (hasBody) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    bodyBuffer = Buffer.concat(chunks);
  }

  return new Request(reqUrl.toString(), {
    method: req.method,
    headers,
    body: hasBody ? bodyBuffer : undefined,
    duplex: "half",
  } as RequestInit);
}

/**
 * Streams a Web Standard Response back through a Node.js ServerResponse.
 */
async function sendWebResponseToNodeResponse(
  webRes: Response,
  nodeRes: http.ServerResponse
): Promise<void> {
  nodeRes.statusCode = webRes.status;
  webRes.headers.forEach((val, key) => {
    nodeRes.setHeader(key, val);
  });

  if (!webRes.body) {
    nodeRes.end();
    return;
  }

  const reader = webRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      nodeRes.write(value);
    }
  } finally {
    nodeRes.end();
  }
}

/**
 * Starts the HTTP server for Render or remote cloud deployment.
 */
export function startHttpServer(
  port: number,
  serverFactory: () => McpServer
): http.Server {
  const mcpHandler = createMcpHandler(serverFactory, {
    legacy: "stateless",
  });

  const server = http.createServer(async (req, res) => {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host || `localhost:${port}`;
    const baseUrl = `${protocol}://${host}`;
    const parsedUrl = new url.URL(req.url || "/", baseUrl);

    // -------------------------------------------------------------------------
    // Route 1: Health check (Render requirement)
    // -------------------------------------------------------------------------
    if (parsedUrl.pathname === "/health") {
      const isAuthReady = Boolean(loadTokens());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "google-workspace-mcp",
          version: "1.0.0",
          authenticated: isAuthReady,
          tools: ["send_email", "append_to_google_doc"],
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // -------------------------------------------------------------------------
    // Route 2: Web-based OAuth trigger for Render
    // -------------------------------------------------------------------------
    if (parsedUrl.pathname === "/auth") {
      try {
        const callbackUrl = `${baseUrl}/oauth2callback`;
        const oauth2Client = createOAuth2Client(callbackUrl);
        const authUrl = oauth2Client.generateAuthUrl({
          access_type: "offline",
          prompt: "consent",
          scope: REQUIRED_SCOPES,
        });

        res.writeHead(302, { Location: authUrl });
        res.end();
        return;
      } catch (authErr) {
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h2 style="color: #c62828;">OAuth Configuration Error</h2>
              <p>${(authErr as Error).message}</p>
              <p>Please configure <code>GOOGLE_OAUTH_CREDENTIALS_JSON</code> in your Render Environment Variables.</p>
            </body>
          </html>
        `);
        return;
      }
    }

    // -------------------------------------------------------------------------
    // Route 3: Hosted OAuth callback handler
    // -------------------------------------------------------------------------
    if (parsedUrl.pathname === "/oauth2callback") {
      try {
        const errorParam = parsedUrl.searchParams.get("error");
        if (errorParam) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h2 style="color: #c62828;">Authorization Denied</h2>
                <p>Google reported: <code>${errorParam}</code></p>
              </body>
            </html>
          `);
          return;
        }

        const code = parsedUrl.searchParams.get("code");
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing authorization code.");
          return;
        }

        const callbackUrl = `${baseUrl}/oauth2callback`;
        const oauth2Client = createOAuth2Client(callbackUrl);
        const { tokens } = await oauth2Client.getToken(code);
        saveTokens(tokens);

        const tokenJson = JSON.stringify(tokens);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; padding: 40px; max-width: 700px; margin: 0 auto; line-height: 1.6;">
              <h2 style="color: #2e7d32;">Authorization Successful!</h2>
              <p>Your Google Workspace credentials have been verified and loaded into server memory.</p>
              <div style="background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <h3 style="margin-top: 0;">Persisting on Render:</h3>
                <p>To retain authorization across Render deploys or restarts, copy this JSON and set it as the <code>GOOGLE_OAUTH_TOKEN_JSON</code> environment variable in your Render dashboard:</p>
                <textarea style="width: 100%; height: 110px; font-family: monospace; font-size: 12px; padding: 8px;" readonly>${tokenJson}</textarea>
              </div>
              <p><a href="/health">Check Server Health</a> | <a href="/">Return to Dashboard</a></p>
            </body>
          </html>
        `);
        return;
      } catch (cbErr) {
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h2 style="color: #c62828;">Token Exchange Failed</h2>
              <p>${(cbErr as Error).message}</p>
            </body>
          </html>
        `);
        return;
      }
    }

    // -------------------------------------------------------------------------
    // Route 4: Root landing dashboard
    // -------------------------------------------------------------------------
    if (parsedUrl.pathname === "/" && req.method === "GET") {
      const isAuthReady = Boolean(loadTokens());
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Workspace MCP Server</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #24292e; }
              code { background: #f6f8fa; padding: 2px 6px; border-radius: 4px; font-size: 85%; }
              pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
              .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; }
              .badge-ok { background: #e6f4ea; color: #137333; }
              .badge-warn { background: #fef7e0; color: #b06000; }
              .card { border: 1px solid #e1e4e8; border-radius: 8px; padding: 20px; margin: 20px 0; }
              a.btn { display: inline-block; background: #1a73e8; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 500; }
            </style>
          </head>
          <body>
            <h1>Google Workspace MCP Server</h1>
            <p>Model Context Protocol server deployed on Render providing Google Workspace integration.</p>
            
            <div class="card">
              <h3>Server Status</h3>
              <p><strong>Deployment:</strong> Render Web Service</p>
              <p><strong>Authentication:</strong> ${isAuthReady ? '<span class="badge badge-ok">Authorized</span>' : '<span class="badge badge-warn">Not Authorized</span>'}</p>
              <p><strong>MCP Endpoint:</strong> <code>${baseUrl}/mcp</code></p>
              <p><strong>Health Check:</strong> <a href="/health"><code>/health</code></a></p>
              ${!isAuthReady ? `<p><a class="btn" href="/auth">Authorize with Google Account</a></p>` : `<p><a href="/auth" style="color: #5f6368; font-size: 14px;">Re-authenticate with Google Account</a></p>`}
            </div>

            <div class="card">
              <h3>Exposed Tools</h3>
              <ul>
                <li><code>send_email</code>: Sends plain-text email via Gmail.</li>
                <li><code>append_to_google_doc</code>: Appends plain-text to an existing Google Doc.</li>
              </ul>
            </div>

            <div class="card">
              <h3>Client Configuration</h3>
              <p>Add to your MCP host configuration (e.g. Cursor <code>.cursor/mcp.json</code> or Antigravity <code>.agents/mcp_config.json</code>):</p>
              <pre><code>{
  "mcpServers": {
    "google-workspace": {
      "url": "${baseUrl}/mcp"
    }
  }
}</code></pre>
            </div>
          </body>
        </html>
      `);
      return;
    }

    // -------------------------------------------------------------------------
    // Route 5: MCP Streamable HTTP / SSE Protocol Route (/mcp or fallback)
    // -------------------------------------------------------------------------
    try {
      const webReq = await nodeRequestToWebRequest(req, baseUrl);
      const webRes = await mcpHandler.fetch(webReq);
      await sendWebResponseToNodeResponse(webRes, res);
    } catch (mcpErr) {
      logger.error(`HTTP MCP handler error: ${(mcpErr as Error).message}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: `Internal server error: ${(mcpErr as Error).message}`,
          },
          id: null,
        })
      );
    }
  });

  server.listen(port, () => {
    logger.info(`Google Workspace MCP HTTP server listening on port ${port}`);
    logger.info(`Health check available at http://localhost:${port}/health`);
    logger.info(`MCP endpoint available at http://localhost:${port}/mcp`);
  });

  // Handle graceful cloud process termination
  const shutdown = () => {
    logger.info("Received termination signal, shutting down HTTP server...");
    mcpHandler.close().catch(() => {});
    server.close(() => {
      logger.info("HTTP server closed cleanly.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return server;
}


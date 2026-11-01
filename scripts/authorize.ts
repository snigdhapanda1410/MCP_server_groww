import * as http from "http";
import * as url from "url";
import { exec } from "child_process";
import {
  createOAuth2Client,
  loadCredentials,
  saveTokens,
  REQUIRED_SCOPES,
  getTokenPath,
} from "../src/auth";

/**
 * Attempts to launch the system default browser with the specified URL.
 */
function openBrowser(targetUrl: string): void {
  const platform = process.platform;
  let cmd = "";

  if (platform === "win32") {
    // Windows: start "" "url"
    cmd = `start "" "${targetUrl}"`;
  } else if (platform === "darwin") {
    // macOS: open "url"
    cmd = `open "${targetUrl}"`;
  } else {
    // Linux / BSD: xdg-open "url"
    cmd = `xdg-open "${targetUrl}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.log("\nCould not automatically launch the browser. Please copy and open the URL manually.");
    }
  });
}

/**
 * Main interactive authorization workflow.
 */
async function main() {
  console.log("=================================================");
  console.log(" Google Workspace MCP Server - Account Setup");
  console.log("=================================================\n");

  let config;
  try {
    config = loadCredentials();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const parsedRedirect = new url.URL(config.redirectUri);
  const port = parseInt(parsedRedirect.port, 10) || 3000;
  const pathname = parsedRedirect.pathname || "/oauth2callback";

  const oauth2Client = createOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Force consent to ensure refresh token is issued
    scope: REQUIRED_SCOPES,
  });

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new url.URL(req.url || "", `http://localhost:${port}`);

      if (reqUrl.pathname !== pathname && reqUrl.pathname !== "/") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const errorParam = reqUrl.searchParams.get("error");
      if (errorParam) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2 style="color: #d32f2f;">Authorization Cancelled or Denied</h2>
              <p>Google reported the following error: <code>${errorParam}</code></p>
              <p>Please check your Google Cloud consent screen test user configuration and try again.</p>
            </body>
          </html>
        `);
        console.error(`\nAuthorization was denied by Google: ${errorParam}`);
        server.close();
        process.exit(1);
        return;
      }

      const code = reqUrl.searchParams.get("code");
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing authorization code.");
        return;
      }

      // Exchange authorization code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      saveTokens(tokens);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h2 style="color: #2e7d32;">Authorization Successful!</h2>
            <p>Your Google Workspace credentials have been securely stored.</p>
            <p>You can now close this browser tab and return to your terminal.</p>
          </body>
        </html>
      `);

      console.log("\nAuthorization completed successfully!");
      console.log(`Tokens stored at: ${getTokenPath()}`);
      console.log("You can now build and run the MCP server with: npm run build && npm start");

      setTimeout(() => {
        server.close(() => {
          process.exit(0);
        });
      }, 1000);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Internal error: ${(err as Error).message}`);
      console.error(`Error during token exchange: ${(err as Error).message}`);
      server.close();
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`Listening for authorization response on port ${port}...`);
    console.log("\nIf your browser does not open automatically, visit this URL:\n");
    console.log(authUrl);
    console.log("\nWaiting for user consent in browser...\n");
    openBrowser(authUrl);
  });

  server.on("error", (err) => {
    console.error(`Failed to start loopback server on port ${port}: ${(err as Error).message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(`Unexpected authorization error: ${(err as Error).message}`);
  process.exit(1);
});


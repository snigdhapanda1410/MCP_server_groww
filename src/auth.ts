import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { google } from "googleapis";
import { OAuth2Client, Credentials } from "google-auth-library";
import { logger } from "./logger";

// Load environment variables from .env file if present
dotenv.config();

/**
 * Required OAuth 2.0 scopes for the Google Workspace MCP Server.
 * Minimal functional permissions:
 * - Gmail: Send plain-text emails only (no read, delete, or modify)
 * - Docs: Edit documents (append text)
 */
export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/documents",
];

export interface OAuthCredentialsConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// In-memory token cache for cloud deployments (e.g. Vercel, Render) where disk may be ephemeral or read-only
let inMemoryTokens: Credentials | null = null;

/**
 * Clears in-memory token cache (useful for tests).
 */
export function resetTokenCache(): void {
  inMemoryTokens = null;
}

/**
 * Safely parses JSON strings that may have surrounding quotes or escaped characters from env vars.
 */
function parseSafeJson<T>(raw: string): T {
  let text = raw.trim();

  // Strip accidental outer single-quotes: '{"installed":...}'
  if (text.startsWith("'") && text.endsWith("'")) {
    text = text.slice(1, -1).trim();
  }

  // Handle double-stringified JSON: "\"{\\\"installed\\\":...}\""
  if (text.startsWith('"') && text.endsWith('"') && text.includes('\\"')) {
    try {
      const unescaped = JSON.parse(text);
      if (typeof unescaped === "string") {
        text = unescaped.trim();
      } else {
        return unescaped as T;
      }
    } catch {
      // Continue to parse text
    }
  }

  return JSON.parse(text) as T;
}

/**
 * Resolves the path to the Google Cloud OAuth credentials JSON file.
 */
export function getCredentialsPath(): string {
  const envPath = process.env.GOOGLE_OAUTH_CREDENTIALS_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), "secrets", "credentials.json");
}

/**
 * Resolves the path to the stored local user tokens JSON file.
 */
export function getTokenPath(): string {
  const envPath = process.env.GOOGLE_OAUTH_TOKEN_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), ".tokens", "token.json");
}

/**
 * Reads and parses Google Cloud OAuth client credentials.
 *
 * Supports:
 * 1. Cloud environment variable: GOOGLE_OAUTH_CREDENTIALS_JSON (or GOOGLE_CREDENTIALS_JSON / GOOGLE_CREDENTIALS)
 * 2. Cloud discrete env vars: GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET
 * 3. Local disk credentials file (secrets/credentials.json or GOOGLE_OAUTH_CREDENTIALS_PATH)
 *
 * Supports credentials downloaded directly from the Google Cloud Console:
 * - Desktop application: { "installed": { "client_id": "...", "client_secret": "...", ... } }
 * - Web application: { "web": { "client_id": "...", "client_secret": "...", ... } }
 * - Direct object: { "client_id": "...", "client_secret": "...", ... }
 *
 * @throws {Error} With actionable setup instructions if neither env vars nor file are found.
 */
export function loadCredentials(): OAuthCredentialsConfig {
  let rawData: string | null = null;

  // 1. Check cloud environment variables first (for Vercel / Render deployments)
  const envCreds =
    process.env.GOOGLE_OAUTH_CREDENTIALS_JSON ||
    process.env.GOOGLE_CREDENTIALS_JSON ||
    process.env.GOOGLE_CREDENTIALS ||
    process.env.GOOGLE_OAUTH_CREDENTIALS;

  if (envCreds) {
    rawData = envCreds;
  }
  // 2. Check discrete environment variables
  else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
      redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000",
    };
  }
  // 3. Check disk file (local development)
  else {
    const credsPath = getCredentialsPath();
    if (fs.existsSync(credsPath)) {
      try {
        rawData = fs.readFileSync(credsPath, "utf-8");
      } catch (readErr) {
        throw new Error(`Failed to read credentials file at ${credsPath}: ${(readErr as Error).message}`);
      }
    }
  }

  if (!rawData) {
    const credsPath = getCredentialsPath();
    throw new Error(
      `Google OAuth client credentials not found.\n` +
      `Local setup: Save credentials JSON to '${credsPath}' (or set GOOGLE_OAUTH_CREDENTIALS_PATH in .env).\n` +
      `Vercel / Cloud setup: Add the GOOGLE_OAUTH_CREDENTIALS_JSON environment variable in your Vercel project settings.`
    );
  }

  try {
    const parsed = parseSafeJson<Record<string, unknown>>(rawData);
    const clientData = (parsed.installed || parsed.web || parsed) as {
      client_id?: string;
      client_secret?: string;
      redirect_uris?: string[];
    };

    const clientId = clientData.client_id;
    const clientSecret = clientData.client_secret;
    const redirectUris: string[] = clientData.redirect_uris || [];

    if (!clientId || !clientSecret) {
      throw new Error("Missing client_id or client_secret in credentials JSON.");
    }

    // For Desktop OAuth clients, Google Cloud Console defaults to ["http://localhost"] without a port.
    // Ensure a loopback port (default 3000) is present so the local redirect listener receives the callback.
    let redirectUri = process.env.GOOGLE_REDIRECT_URI || redirectUris[0] || "http://localhost:3000";
    try {
      const parsedUrl = new URL(redirectUri);
      if (!parsedUrl.port && parsedUrl.hostname === "localhost") {
        parsedUrl.port = "3000";
        redirectUri = parsedUrl.toString().replace(/\/$/, "");
      }
    } catch {
      redirectUri = "http://localhost:3000";
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("client_id")) {
      throw err;
    }
    throw new Error(`Failed to parse Google OAuth credentials: ${(err as Error).message}`);
  }
}

/**
 * Creates an unauthenticated OAuth2Client instance using the credentials configuration.
 *
 * @param customRedirectUri Optional custom redirect URI override (e.g. for Render/Vercel hosted callback).
 */
export function createOAuth2Client(customRedirectUri?: string): OAuth2Client {
  const config = loadCredentials();
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    customRedirectUri || config.redirectUri
  );
}

/**
 * Saves refreshed or newly issued OAuth credentials.
 * Updates in-memory token cache and attempts to persist to disk if filesystem is writable.
 */
export function saveTokens(tokens: Credentials): void {
  inMemoryTokens = tokens;

  const tokenPath = getTokenPath();
  const dir = path.dirname(tokenPath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), {
      encoding: "utf-8",
      mode: 0o600, // Read/write for owner only
    });

    logger.info(`Authentication tokens securely saved to ${tokenPath}`);
  } catch (err) {
    // In serverless cloud environments (like Vercel), disk writes outside /tmp are read-only
    logger.warn(`Could not persist tokens to disk (${tokenPath}): ${(err as Error).message}. Retaining in memory.`);
  }
}

/**
 * Loads stored OAuth credentials from:
 * 1. In-memory cache
 * 2. Cloud environment variable: GOOGLE_OAUTH_TOKEN_JSON (or GOOGLE_TOKEN_JSON / GOOGLE_TOKEN)
 * 3. Cloud environment variable: GOOGLE_REFRESH_TOKEN (or REFRESH_TOKEN)
 * 4. Local disk token file (.tokens/token.json or GOOGLE_OAUTH_TOKEN_PATH)
 *
 * @returns Parsed Credentials object or null if no token source is available.
 */
export function loadTokens(): Credentials | null {
  // 1. In-memory cache
  if (inMemoryTokens) {
    return inMemoryTokens;
  }

  // 2. Cloud environment variable: GOOGLE_OAUTH_TOKEN_JSON
  const envToken =
    process.env.GOOGLE_OAUTH_TOKEN_JSON ||
    process.env.GOOGLE_TOKEN_JSON ||
    process.env.GOOGLE_TOKEN ||
    process.env.GOOGLE_OAUTH_TOKEN;

  if (envToken) {
    try {
      const parsed = parseSafeJson<Credentials>(envToken);
      inMemoryTokens = parsed;
      return parsed;
    } catch (parseErr) {
      logger.warn(`Failed to parse GOOGLE_OAUTH_TOKEN_JSON env var: ${(parseErr as Error).message}`);
    }
  }

  // 3. Cloud environment variable: GOOGLE_REFRESH_TOKEN
  const envRefreshToken = process.env.GOOGLE_REFRESH_TOKEN || process.env.REFRESH_TOKEN;
  if (envRefreshToken) {
    const creds: Credentials = {
      refresh_token: envRefreshToken.trim(),
    };
    inMemoryTokens = creds;
    return creds;
  }

  // 4. Local disk token storage
  const tokenPath = getTokenPath();
  if (fs.existsSync(tokenPath)) {
    try {
      const data = fs.readFileSync(tokenPath, "utf-8");
      const parsed = JSON.parse(data) as Credentials;
      inMemoryTokens = parsed;
      return parsed;
    } catch (err) {
      logger.warn(`Failed to read stored tokens from ${tokenPath}: ${(err as Error).message}`);
    }
  }

  return null;
}

/**
 * Returns an authenticated and configured OAuth2Client instance.
 * Automatically checks and refreshes expired tokens, updating local storage and memory when refreshed.
 *
 * @throws {Error} With actionable instructions if no token is found or if token refresh fails.
 */
export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const oauth2Client = createOAuth2Client();
  const tokens = loadTokens();

  if (!tokens) {
    throw new Error(
      "Authentication required: No local or cloud OAuth token found.\n" +
      "For local use: Run 'npm run auth' in your terminal.\n" +
      "For Vercel/Cloud: Set GOOGLE_OAUTH_TOKEN_JSON or GOOGLE_REFRESH_TOKEN in your Vercel Project Environment Variables."
    );
  }

  oauth2Client.setCredentials(tokens);

  // Automatically persist refreshed tokens
  oauth2Client.on("tokens", (newTokens) => {
    try {
      const current = loadTokens() || {};
      const merged: Credentials = { ...current, ...newTokens };
      saveTokens(merged);
      logger.info("Refreshed OAuth access token and updated token store.");
    } catch (saveErr) {
      logger.error(`Failed to save refreshed tokens: ${(saveErr as Error).message}`);
    }
  });

  // Verify token validity or trigger refresh if expired
  try {
    await oauth2Client.getAccessToken();
  } catch (refreshErr: unknown) {
    const errMsg = (refreshErr as Error).message || "";
    logger.error(`OAuth token refresh failed: ${errMsg}`);
    throw new Error(
      "Authentication expired or revoked: Failed to refresh Google OAuth token.\n" +
      "Please re-authenticate your Google account."
    );
  }

  return oauth2Client;
}

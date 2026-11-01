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
 * Reads and parses the Google Cloud OAuth client credentials from disk.
 *
 * Supports credentials downloaded directly from the Google Cloud Console:
 * - Desktop application: { "installed": { "client_id": "...", "client_secret": "...", ... } }
 * - Web application: { "web": { "client_id": "...", "client_secret": "...", ... } }
 * - Direct object: { "client_id": "...", "client_secret": "...", ... }
 *
 * @throws {Error} With actionable setup instructions if the file is absent or malformed.
 */
export function loadCredentials(): OAuthCredentialsConfig {
  const credsPath = getCredentialsPath();

  if (!fs.existsSync(credsPath)) {
    throw new Error(
      `Google OAuth client credentials file not found at: ${credsPath}\n` +
      "Setup Instructions:\n" +
      "1. Create an OAuth 2.0 Desktop Application Client in the Google Cloud Console.\n" +
      "2. Download the JSON credentials file.\n" +
      `3. Save it to '${credsPath}' (or set GOOGLE_OAUTH_CREDENTIALS_PATH in .env).\n` +
      "4. Ensure this credentials file is kept out of source control (.gitignore)."
    );
  }

  try {
    const rawData = fs.readFileSync(credsPath, "utf-8");
    const parsed = JSON.parse(rawData);

    const clientData = parsed.installed || parsed.web || parsed;

    const clientId = clientData.client_id;
    const clientSecret = clientData.client_secret;
    const redirectUris: string[] = clientData.redirect_uris || [];

    if (!clientId || !clientSecret) {
      throw new Error("Missing client_id or client_secret in credentials JSON.");
    }

    // For Desktop OAuth clients, Google Cloud Console defaults to ["http://localhost"] without a port.
    // Ensure a loopback port (default 3000) is present so the local redirect listener receives the callback.
    let redirectUri = redirectUris[0] || "http://localhost:3000";
    try {
      const parsed = new URL(redirectUri);
      if (!parsed.port) {
        parsed.port = "3000";
        redirectUri = parsed.toString().replace(/\/$/, "");
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
    if (err instanceof Error && err.message.startsWith("Google OAuth client credentials file not found")) {
      throw err;
    }
    throw new Error(
      `Failed to parse Google OAuth credentials file at ${credsPath}: ${(err as Error).message}`
    );
  }
}

/**
 * Creates an unauthenticated OAuth2Client instance using the credentials configuration.
 *
 * @param customRedirectUri Optional custom redirect URI override (e.g. for Render hosted callback).
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
 * Saves refreshed or newly issued OAuth credentials to local storage.
 * Automatically creates parent directories and applies restricted file permissions.
 */
export function saveTokens(tokens: Credentials): void {
  const tokenPath = getTokenPath();
  const dir = path.dirname(tokenPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), {
    encoding: "utf-8",
    mode: 0o600, // Read/write for owner only
  });

  logger.info(`Authentication tokens securely saved to ${tokenPath}`);
}

/**
 * Loads stored OAuth credentials from local storage.
 *
 * @returns Parsed Credentials object or null if no token file exists.
 */
export function loadTokens(): Credentials | null {
  const tokenPath = getTokenPath();

  if (!fs.existsSync(tokenPath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(tokenPath, "utf-8");
    return JSON.parse(data) as Credentials;
  } catch (err) {
    logger.warn(`Failed to read stored tokens from ${tokenPath}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Returns an authenticated and configured OAuth2Client instance.
 * Automatically checks and refreshes expired tokens, updating local storage when refreshed.
 *
 * @throws {Error} With actionable instructions if no token is found or if token refresh fails.
 */
export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const oauth2Client = createOAuth2Client();
  const tokens = loadTokens();

  if (!tokens) {
    throw new Error(
      "Authentication required: No local OAuth token found.\n" +
      "Please execute 'npm run auth' in your terminal to complete the one-time Google account authorization."
    );
  }

  oauth2Client.setCredentials(tokens);

  // Automatically persist refreshed tokens to disk
  oauth2Client.on("tokens", (newTokens) => {
    try {
      const current = loadTokens() || {};
      const merged: Credentials = { ...current, ...newTokens };
      saveTokens(merged);
      logger.info("Refreshed OAuth access token and updated local token store.");
    } catch (saveErr) {
      logger.error(`Failed to save refreshed tokens: ${(saveErr as Error).message}`);
    }
  });

  // Verify token validity or trigger refresh if expired
  try {
    // getAccessToken will proactively refresh the token if expired using the refresh_token
    await oauth2Client.getAccessToken();
  } catch (refreshErr: unknown) {
    const errMsg = (refreshErr as Error).message || "";
    logger.error(`OAuth token refresh failed: ${errMsg}`);
    throw new Error(
      "Authentication expired or revoked: Failed to refresh Google OAuth token.\n" +
      "Please re-authorize your account by running 'npm run auth' in your terminal."
    );
  }

  return oauth2Client;
}


import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  getCredentialsPath,
  getTokenPath,
  saveTokens,
  loadTokens,
  loadCredentials,
  getAuthenticatedClient,
  resetTokenCache,
} from "../src/auth";

describe("Auth Layer", () => {
  const originalEnv = process.env;
  const testDir = path.resolve(process.cwd(), "tests", "temp_auth_test");
  const testTokenPath = path.join(testDir, "test_token.json");
  const testCredsPath = path.join(testDir, "test_creds.json");

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetTokenCache();
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    resetTokenCache();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Path Resolution", () => {
    it("resolves default credentials path when env is unset", () => {
      delete process.env.GOOGLE_OAUTH_CREDENTIALS_PATH;
      expect(getCredentialsPath()).toContain("secrets");
    });

    it("respects GOOGLE_OAUTH_CREDENTIALS_PATH env variable", () => {
      process.env.GOOGLE_OAUTH_CREDENTIALS_PATH = testCredsPath;
      expect(getCredentialsPath()).toBe(testCredsPath);
    });

    it("resolves default token path when env is unset", () => {
      delete process.env.GOOGLE_OAUTH_TOKEN_PATH;
      expect(getTokenPath()).toContain(".tokens");
    });

    it("respects GOOGLE_OAUTH_TOKEN_PATH env variable", () => {
      process.env.GOOGLE_OAUTH_TOKEN_PATH = testTokenPath;
      expect(getTokenPath()).toBe(testTokenPath);
    });
  });

  describe("Token Storage", () => {
    it("saves and loads tokens correctly", () => {
      process.env.GOOGLE_OAUTH_TOKEN_PATH = testTokenPath;

      const sampleTokens = {
        access_token: "test_access_token",
        refresh_token: "test_refresh_token",
        scope: "https://www.googleapis.com/auth/gmail.send",
        token_type: "Bearer",
        expiry_date: 1800000000000,
      };

      saveTokens(sampleTokens);
      expect(fs.existsSync(testTokenPath)).toBe(true);

      const loaded = loadTokens();
      expect(loaded).toEqual(sampleTokens);
    });

    it("returns null when token file does not exist", () => {
      resetTokenCache();
      process.env.GOOGLE_OAUTH_TOKEN_PATH = path.join(testDir, "non_existent.json");
      delete process.env.GOOGLE_OAUTH_TOKEN_JSON;
      delete process.env.GOOGLE_REFRESH_TOKEN;
      expect(loadTokens()).toBeNull();
    });

    it("loads tokens from GOOGLE_OAUTH_TOKEN_JSON env var", () => {
      resetTokenCache();
      const cloudTokens = {
        access_token: "cloud_access_token",
        refresh_token: "cloud_refresh_token",
      };
      process.env.GOOGLE_OAUTH_TOKEN_JSON = JSON.stringify(cloudTokens);
      delete process.env.GOOGLE_OAUTH_TOKEN_PATH;

      const loaded = loadTokens();
      expect(loaded).toEqual(cloudTokens);
    });

    it("loads tokens from GOOGLE_REFRESH_TOKEN env var", () => {
      resetTokenCache();
      process.env.GOOGLE_REFRESH_TOKEN = "test_refresh_token_string";
      delete process.env.GOOGLE_OAUTH_TOKEN_JSON;
      delete process.env.GOOGLE_OAUTH_TOKEN_PATH;

      const loaded = loadTokens();
      expect(loaded).toEqual({ refresh_token: "test_refresh_token_string" });
    });
  });

  describe("Credentials Loading & Auth Errors", () => {
    it("loads credentials from GOOGLE_OAUTH_CREDENTIALS_JSON env var", () => {
      process.env.GOOGLE_OAUTH_CREDENTIALS_JSON = JSON.stringify({
        installed: {
          client_id: "env_client_id.apps.googleusercontent.com",
          client_secret: "env_secret",
          redirect_uris: ["http://localhost:3000"],
        },
      });

      const creds = loadCredentials();
      expect(creds.clientId).toBe("env_client_id.apps.googleusercontent.com");
      expect(creds.clientSecret).toBe("env_secret");
    });

    it("throws helpful error when credentials file is missing", () => {
      delete process.env.GOOGLE_OAUTH_CREDENTIALS_JSON;
      delete process.env.GOOGLE_CREDENTIALS_JSON;
      delete process.env.GOOGLE_CREDENTIALS;
      delete process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_OAUTH_CREDENTIALS_PATH = path.join(testDir, "missing_creds.json");
      expect(() => loadCredentials()).toThrow(/Google OAuth client credentials not found/);
    });

    it("throws clear error when attempting to get authenticated client without tokens", async () => {
      resetTokenCache();
      process.env.GOOGLE_OAUTH_TOKEN_PATH = path.join(testDir, "missing_token.json");
      delete process.env.GOOGLE_OAUTH_TOKEN_JSON;
      delete process.env.GOOGLE_REFRESH_TOKEN;

      // Provide valid creds so it gets past credentials loading
      fs.writeFileSync(
        testCredsPath,
        JSON.stringify({
          installed: {
            client_id: "test_client_id.apps.googleusercontent.com",
            client_secret: "test_secret",
            redirect_uris: ["http://localhost:3000/oauth2callback"],
          },
        })
      );
      process.env.GOOGLE_OAUTH_CREDENTIALS_PATH = testCredsPath;

      await expect(getAuthenticatedClient()).rejects.toThrow(
        /Authentication required: No local or cloud OAuth token found/
      );
    });
  });
});

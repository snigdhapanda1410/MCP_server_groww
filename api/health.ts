import { loadTokens } from "../src/auth";

export const maxDuration = 10;

export async function GET(): Promise<Response> {
  const isAuthReady = Boolean(loadTokens());

  const envCheck = {
    hasCredentialsJson: Boolean(
      process.env.GOOGLE_OAUTH_CREDENTIALS_JSON ||
      process.env.GOOGLE_CREDENTIALS_JSON ||
      process.env.GOOGLE_CREDENTIALS ||
      process.env.GOOGLE_OAUTH_CREDENTIALS
    ),
    hasTokenJson: Boolean(
      process.env.GOOGLE_OAUTH_TOKEN_JSON ||
      process.env.GOOGLE_TOKEN_JSON ||
      process.env.GOOGLE_TOKEN ||
      process.env.GOOGLE_OAUTH_TOKEN
    ),
    hasRefreshToken: Boolean(
      process.env.GOOGLE_REFRESH_TOKEN ||
      process.env.REFRESH_TOKEN
    ),
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
  };

  return new Response(
    JSON.stringify({
      status: "ok",
      service: "google-workspace-mcp",
      platform: "vercel-serverless",
      version: "1.0.0",
      authenticated: isAuthReady,
      envCheck,
      tools: ["send_email", "append_to_google_doc"],
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}

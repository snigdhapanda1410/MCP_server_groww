import { loadTokens } from "../src/auth";

export const maxDuration = 10;

export async function GET(): Promise<Response> {
  const isAuthReady = Boolean(loadTokens());

  return new Response(
    JSON.stringify({
      status: "ok",
      service: "google-workspace-mcp",
      platform: "vercel-serverless",
      version: "1.0.0",
      authenticated: isAuthReady,
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


import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/index";

export const maxDuration = 30;

const handler = createMcpHandler(() => createServer(), {
  legacy: "stateless",
});

export async function POST(request: Request): Promise<Response> {
  return handler.fetch(request);
}

export async function GET(request: Request): Promise<Response> {
  return handler.fetch(request);
}


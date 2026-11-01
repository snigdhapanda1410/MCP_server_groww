import { describe, it, expect, afterAll, beforeAll } from "vitest";
import * as http from "http";
import { startHttpServer } from "../src/http";
import { createServer } from "../src/index";

describe("HTTP Web Service Transport (Render Deployment)", () => {
  let server: http.Server;
  const testPort = 13579;
  const baseUrl = `http://localhost:${testPort}`;

  beforeAll(() => {
    server = startHttpServer(testPort, createServer);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("serves GET /health with 200 OK and service metadata", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.service).toBe("google-workspace-mcp");
    expect(data.version).toBe("1.0.0");
    expect(data.tools).toEqual(["send_email", "append_to_google_doc"]);
  });

  it("serves GET / with 200 OK and HTML dashboard", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("Google Workspace MCP Server");
    expect(html).toContain("send_email");
    expect(html).toContain("append_to_google_doc");
    expect(html).toContain("/mcp");
  });

  it("handles POST /mcp initialize request with MCP protocol framing", async () => {
    const initPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "vitest-client", version: "1.0.0" },
        capabilities: {},
      },
    };

    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(initPayload),
    });

    expect(res.status).toBe(200);
    const bodyText = await res.text();
    expect(bodyText).toContain("google-workspace");
    expect(bodyText).toContain("2024-11-05");
  });
});

import { describe, it, expect } from "vitest";
import { GET as healthHandler } from "../api/health";
import { GET as indexHandler } from "../api/index";
import { POST as mcpPostHandler } from "../api/mcp";

describe("Vercel Serverless Function Endpoints", () => {
  it("api/health returns 200 OK with serverless metadata", async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.service).toBe("google-workspace-mcp");
    expect(data.platform).toBe("vercel-serverless");
    expect(data.tools).toEqual(["send_email", "append_to_google_doc"]);
  });

  it("api/index returns 200 OK with HTML landing page", async () => {
    const req = new Request("https://my-deployment.vercel.app/");
    const res = await indexHandler(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("Google Workspace MCP Server");
    expect(html).toContain("Vercel");
    expect(html).toContain("/mcp");
  });

  it("api/mcp handles MCP initialize request over Web Standard fetch", async () => {
    const initPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "vercel-test-client", version: "1.0.0" },
        capabilities: {},
      },
    };

    const req = new Request("https://my-deployment.vercel.app/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(initPayload),
    });

    const res = await mcpPostHandler(req);
    expect(res.status).toBe(200);

    const bodyText = await res.text();
    expect(bodyText).toContain("google-workspace");
    expect(bodyText).toContain("2024-11-05");
  });

  it("api/mcp handles tools/list request", async () => {
    const listPayload = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    };

    const req = new Request("https://my-deployment.vercel.app/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(listPayload),
    });

    const res = await mcpPostHandler(req);
    expect(res.status).toBe(200);

    const bodyText = await res.text();
    expect(bodyText).toContain("send_email");
    expect(bodyText).toContain("append_to_google_doc");
  });
});

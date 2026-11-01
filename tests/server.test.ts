import { describe, it, expect } from "vitest";
import { createServer } from "../src/index";

describe("MCP Server Core", () => {
  it("registers exactly the two required tools: send_email and append_to_google_doc", () => {
    const server = createServer();
    // @ts-expect-error Accessing private registered tools for verification
    const registeredTools = server._registeredTools;

    expect(registeredTools).toBeDefined();
    const toolNames = Object.keys(registeredTools);

    expect(toolNames).toHaveLength(2);
    expect(toolNames).toContain("send_email");
    expect(toolNames).toContain("append_to_google_doc");
  });

  it("verifies tool schemas match functional requirements", () => {
    const server = createServer();
    // @ts-expect-error Accessing private registered tools for verification
    const sendEmailTool = server._registeredTools["send_email"];
    // @ts-expect-error Accessing private registered tools for verification
    const appendDocTool = server._registeredTools["append_to_google_doc"];

    expect(sendEmailTool.description).toContain("plain-text email");
    expect(sendEmailTool.description).toContain("confirmation");

    expect(appendDocTool.description.toLowerCase()).toContain("append");
    expect(appendDocTool.description).toContain("confirmation");
  });
});

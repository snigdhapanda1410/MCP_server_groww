#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { sendEmail } from "./gmail";
import { appendToGoogleDoc } from "./docs";
import { startHttpServer } from "./http";
import { logger } from "./logger";

/**
 * Creates and configures the Google Workspace MCP Server instance.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "google-workspace",
    version: "1.0.0",
  });

  // ---------------------------------------------------------------------------
  // Tool 1: send_email
  // ---------------------------------------------------------------------------
  server.registerTool(
    "send_email",
    {
      description:
        "Send one plain-text email from the Google account that the user has explicitly authorized. " +
        "IMPORTANT: This operation sends a real email. Before invoking this tool, you MUST present " +
        "the recipient ('to'), subject, and message body to the user and obtain explicit confirmation.",
      inputSchema: {
        to: z
          .string()
          .describe("The recipient's email address (e.g., alex@example.com)"),
        subject: z
          .string()
          .describe("The subject line of the email (must not contain newlines)"),
        body: z
          .string()
          .describe("The plain-text message body to send"),
      },
    },
    async (args) => {
      logger.info(`Received tool invocation: send_email to ${args.to}`);
      const result = await sendEmail(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 2: append_to_google_doc
  // ---------------------------------------------------------------------------
  server.registerTool(
    "append_to_google_doc",
    {
      description:
        "Append plain text to the end of the body of an existing Google Doc without deleting or replacing " +
        "any existing content. IMPORTANT: This modifies a real document. Before invoking this tool, you MUST " +
        "present the target document identifier/URL and exact text to the user and obtain explicit confirmation.",
      inputSchema: {
        documentId: z
          .string()
          .describe(
            "The Google Doc document ID or full URL (e.g., https://docs.google.com/document/d/DOC_ID/edit)"
          ),
        content: z
          .string()
          .describe("The plain-text content to append to the document"),
      },
    },
    async (args) => {
      logger.info(`Received tool invocation: append_to_google_doc`);
      const result = await appendToGoogleDoc(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
      };
    }
  );

  return server;
}

/**
 * Main server startup function.
 * Automatically selects transport mode:
 * - HTTP mode: When PORT or TRANSPORT=http is detected (e.g. Render cloud deployment)
 * - stdio mode: When running locally inside Cursor, Antigravity, or Claude host
 */
export function main(): void {
  // Catch any unexpected uncaught exceptions and direct them to stderr
  process.on("uncaughtException", (err) => {
    logger.error(`Uncaught exception in MCP server: ${err.message}`, err.stack);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error(`Unhandled rejection in MCP server: ${String(reason)}`);
  });

  const isHttpMode =
    Boolean(process.env.PORT) ||
    process.env.TRANSPORT === "http" ||
    process.env.TRANSPORT === "sse";

  if (isHttpMode) {
    const port = parseInt(process.env.PORT || "3000", 10);
    logger.info(`Starting Google Workspace MCP server in HTTP mode on port ${port}...`);
    startHttpServer(port, createServer);
  } else {
    const server = createServer();
    logger.info("Starting Google Workspace MCP server on stdio transport...");
    serveStdio(() => server);
    logger.info("Google Workspace MCP server initialized and ready to receive requests.");
  }
}

// Start the server when executed directly
if (require.main === module) {
  main();
}

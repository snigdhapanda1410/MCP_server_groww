/**
 * Diagnostic logger for Google Workspace MCP Server.
 *
 * CRITICAL PROTOCOL REQUIREMENT:
 * The standard input and standard output streams (stdin/stdout) are reserved exclusively
 * for Model Context Protocol (MCP) JSON-RPC messages.
 * Under NO circumstances should any logging, debugging, or diagnostic output be written
 * to stdout. All log messages must be directed strictly to stderr.
 */

export const logger = {
  info: (message: string, ...args: unknown[]): void => {
    process.stderr.write(`[INFO] ${new Date().toISOString()} - ${message} ${args.length ? JSON.stringify(args) : ""}\n`);
  },
  warn: (message: string, ...args: unknown[]): void => {
    process.stderr.write(`[WARN] ${new Date().toISOString()} - ${message} ${args.length ? JSON.stringify(args) : ""}\n`);
  },
  error: (message: string, ...args: unknown[]): void => {
    process.stderr.write(`[ERROR] ${new Date().toISOString()} - ${message} ${args.length ? JSON.stringify(args) : ""}\n`);
  },
  debug: (message: string, ...args: unknown[]): void => {
    if (process.env.DEBUG) {
      process.stderr.write(`[DEBUG] ${new Date().toISOString()} - ${message} ${args.length ? JSON.stringify(args) : ""}\n`);
    }
  },
};


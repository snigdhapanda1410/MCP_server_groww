# Google Workspace MCP Server

A lightweight, secure Model Context Protocol (MCP) server that connects local AI coding assistants (such as **Google Antigravity**, **Cursor**, **Claude Code**, and **Claude Desktop**) to your Google account over standard `stdio`.

This server exposes exactly two write tools:
- `send_email`: Dispatches a plain-text email via Gmail.
- `append_to_google_doc`: Appends plain text to the end of an existing Google Doc without modifying or overwriting prior content.

---

## Features & Architectural Guarantees

- **StdIO Transport Isolation:** Standard input and output (`stdin`/`stdout`) are reserved strictly for MCP JSON-RPC messages. Operational and diagnostic logs are routed exclusively to `stderr`.
- **Human-in-the-Loop Confirmation:** Both tools perform remote write actions. Tool definitions mandate that the client assistant preview the full payload and prompt for explicit user approval before execution.
- **Out-of-Band OAuth 2.0:** One-time browser authorization command (`npm run auth`) with automatic, transparent local access token refreshing.
- **Least-Privilege Scopes:** Minimal functional scopes requested (`gmail.send` and `documents`). No permissions to read, search, or delete emails or drive files.
- **Header Injection & Prompt Defense:** Strict input sanitization via Zod rejecting CR/LF characters in email recipient and subject lines.
- **At-Most-Once Delivery:** No blind retries on ambiguous network timeouts to prevent duplicate emails or duplicate document writes.

---

## Quick Start

### 1. Prerequisites
- **Node.js** >= 20.x
- **npm** >= 10.x
- A Google Cloud Platform account with Gmail and Google Docs enabled.

### 2. Installation
Clone or navigate to the project directory and install dependencies:
```bash
git clone <repo-url> google-workspace-mcp
cd google-workspace-mcp
npm install
```

### 3. Google Cloud Setup
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Google Cloud project or select an existing one.
3. In **APIs & Services > Library**, search for and **enable**:
   - **Gmail API**
   - **Google Docs API**
4. Configure the **OAuth Consent Screen** (**APIs & Services > OAuth consent screen**):
   - Choose User Type (**External** for personal accounts or **Internal** for Workspace organizations).
   - Fill in application details (e.g., App Name: `Google Workspace MCP Server`).
   - Add the following required scopes:
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/documents`
   - If in **Testing** mode, add your Google account email under **Test Users**.
5. Create OAuth Credentials (**APIs & Services > Credentials**):
   - Click **Create Credentials > OAuth client ID**.
   - Select **Application type:** `Desktop app`.
   - Set the name to `Google Workspace MCP Desktop Client`.
   - Click **Create**, then download the OAuth client JSON file.
6. Place the downloaded JSON file in the project directory as:
   ```
   secrets/credentials.json
   ```
   *(Alternatively, copy `.env.example` to `.env` and configure `GOOGLE_OAUTH_CREDENTIALS_PATH` with the absolute path).*

### 4. Interactive Authorization
Run the one-time interactive OAuth authorization CLI:
```bash
npm run auth
```
- A local browser tab will open requesting your consent for the Gmail send and Google Docs edit scopes.
- Upon approval, the server exchanges the authorization code for refreshable credentials and stores them locally at `.tokens/token.json` (excluded from source control).

### 5. Build and Test
Build the TypeScript project and execute the automated test suite:
```bash
npm run build
npm test
```

---

## MCP Host Client Configurations

All clients point to the compiled `dist/index.js` executable. Replace `/ABSOLUTE/PATH/google-workspace-mcp` (or Windows `C:\\Projects\\MCPserver`) with the actual path on your workstation.

### 1. Cursor
Configure `.cursor/mcp.json` in your project or `~/.cursor/mcp.json` globally:
```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["C:/Projects/MCPserver/dist/index.js"]
    }
  }
}
```

### 2. Google Antigravity
Configure your workspace's `.agents/mcp_config.json` or the global `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["C:/Projects/MCPserver/dist/index.js"]
    }
  }
}
```
*In the Antigravity IDE, navigate to **MCP Servers → Manage MCP Servers → View raw config**, paste the configuration, and refresh the MCP server status.*

### 3. Claude Code
Register the server from your terminal:
```bash
claude mcp add google-workspace -- node C:/Projects/MCPserver/dist/index.js
```
Run `/mcp` in Claude Code to verify connection status.

### 4. Claude Desktop
Add the configuration to `claude_desktop_config.json`:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["C:/Projects/MCPserver/dist/index.js"]
    }
  }
}
```

---

## Available Tools & Schema

### `send_email`
Sends a plain-text email from the authenticated user's Gmail account.

**Parameters:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `to` | `string` | Yes | Recipient email address (e.g., `alex@example.com`). CR/LF prohibited. |
| `subject` | `string` | Yes | Non-empty subject line (max 500 chars). CR/LF prohibited. |
| `body` | `string` | Yes | Plain-text email body. Line breaks preserved. |

**Example Invocation:**
```json
{
  "to": "alex@example.com",
  "subject": "Sprint Milestone Update",
  "body": "Hi Alex,\n\nThe first milestone has been completed successfully."
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Email sent successfully",
  "messageId": "189283749283472",
  "threadId": "189283749283472"
}
```

---

### `append_to_google_doc`
Appends plain-text content to the end of an existing Google Doc without overwriting existing content.

**Parameters:**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `documentId` | `string` | Yes | Full Google Docs URL or direct document ID. |
| `content` | `string` | Yes | Plain-text content to append. |

**Example Invocation:**
```json
{
  "documentId": "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
  "content": "### Weekly Progress\n- Completed MCP server implementation.\n- Verified stdio and test coverage."
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Content appended successfully",
  "documentId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "documentUrl": "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
}
```

---

## Deploying to Render (Cloud Web Service)

The server natively supports cloud deployment as a Web Service on **Render** using Server-Sent Events (SSE) / Streamable HTTP.

### Option A: 1-Click Blueprint Deployment
1. Push your repository to GitHub or GitLab (ensure `.tokens/` and `secrets/` are not committed).
2. In the [Render Dashboard](https://dashboard.render.com/), click **New > Blueprint**.
3. Select your repository. Render will automatically read `render.yaml` and configure the web service.
4. Set the required Environment Variables in the Render Dashboard (see below).

### Option B: Manual Web Service Deployment
1. In Render, select **New > Web Service**.
2. Configure settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
3. Add the following **Environment Variables**:
   - `NODE_ENV`: `production`
   - `TRANSPORT`: `http`
   - `GOOGLE_OAUTH_CREDENTIALS_JSON`: The raw JSON content of your `secrets/credentials.json`.
   - `GOOGLE_OAUTH_TOKEN_JSON`: The raw JSON content of your `.tokens/token.json`.

### Connecting Remote Clients to Render
Once deployed, Render provides a public HTTPS URL (e.g. `https://your-service.onrender.com`). Configure your MCP client:

```json
{
  "mcpServers": {
    "google-workspace": {
      "url": "https://your-service.onrender.com/mcp"
    }
  }
}
```

---

## Project Structure

```
google-workspace-mcp/
├── src/
│   ├── index.ts                 # MCP stdio server and tool registration
│   ├── auth.ts                  # OAuth client, token persistence and auto-refresh
│   ├── gmail.ts                 # send_email implementation (MIME + Gmail API)
│   ├── docs.ts                  # append_to_google_doc implementation (batchUpdate)
│   ├── validation.ts            # Zod validation schemas & doc ID parsing
│   └── logger.ts                # Stderr-only diagnostic logger
├── scripts/
│   └── authorize.ts             # One-time interactive OAuth setup CLI
├── tests/
│   ├── validation.test.ts       # Validation layer unit tests
│   ├── gmail.test.ts            # Gmail tool tests (mocked Google API)
│   ├── docs.test.ts             # Google Docs tool tests (mocked Google API)
│   ├── auth.test.ts             # OAuth and token storage unit tests
│   └── server.test.ts           # MCP server registration & schema tests
├── .env.example                 # Non-secret path/config placeholders
├── .gitignore                   # Excludes tokens, credentials, and dist
├── package.json
├── tsconfig.json
├── architecture.md              # System architecture documentation
├── problemstatement.md          # Problem statement specification
└── README.md
```

---

## Security Best Practices
1. **Never commit secrets:** `secrets/credentials.json`, `.tokens/token.json`, and `.env` are excluded via `.gitignore`.
2. **File Permissions:** Local token files are saved with restricted `0600` permissions (owner read/write).
3. **Audit Confirmation:** Agents are configured to require human-in-the-loop review before dispatching tool calls.
4. **Stderr Diagnostics:** No debugging or stack traces are ever emitted on `stdout`, preventing JSON-RPC frame corruption.

---

## License
MIT


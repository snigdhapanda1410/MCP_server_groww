import { describe, it, expect, vi, beforeEach } from "vitest";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { sendEmail, createBase64urlMimeMessage } from "../src/gmail";

// Mock googleapis
vi.mock("googleapis", () => {
  const mockSend = vi.fn();
  return {
    google: {
      gmail: vi.fn().mockReturnValue({
        users: {
          messages: {
            send: mockSend,
          },
        },
      }),
    },
    mockSend,
  };
});

describe("Gmail Service", () => {
  const fakeOAuth2Client = {} as OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createBase64urlMimeMessage", () => {
    it("generates a valid Base64url encoded MIME email", async () => {
      const input = {
        to: "alex@example.com",
        subject: "Project Update",
        body: "First milestone complete.",
      };

      const base64url = await createBase64urlMimeMessage(input);
      expect(typeof base64url).toBe("string");
      expect(base64url.length).toBeGreaterThan(0);

      // Decode base64url to verify MIME headers and contents
      const decoded = Buffer.from(base64url, "base64url").toString("utf-8");
      expect(decoded).toContain("To: alex@example.com");
      expect(decoded).toContain("Subject: Project Update");
      expect(decoded).toContain("First milestone complete.");
      expect(decoded).toContain("Content-Type: text/plain");
    });
  });

  describe("sendEmail", () => {
    it("rejects invalid inputs without invoking Gmail API", async () => {
      const invalidInput = {
        to: "bad-email",
        subject: "Hello",
        body: "Test body",
      };

      const result = await sendEmail(invalidInput, fakeOAuth2Client);
      expect(result.success).toBe(false);
      expect(result.error).toBe("VALIDATION_ERROR");

      const gmail = google.gmail({ version: "v1" });
      expect(gmail.users.messages.send).not.toHaveBeenCalled();
    });

    it("successfully dispatches an email through Gmail API", async () => {
      const gmail = google.gmail({ version: "v1" });
      vi.mocked(gmail.users.messages.send).mockResolvedValueOnce({
        data: {
          id: "GMAIL_MSG_001",
          threadId: "GMAIL_THREAD_001",
        },
      } as never);

      const input = {
        to: "developer@example.com",
        subject: "Sprint Kickoff",
        body: "Starting sprint today.",
      };

      const result = await sendEmail(input, fakeOAuth2Client);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("GMAIL_MSG_001");
      expect(result.threadId).toBe("GMAIL_THREAD_001");
      expect(gmail.users.messages.send).toHaveBeenCalledTimes(1);
      expect(gmail.users.messages.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "me",
          requestBody: {
            raw: expect.any(String),
          },
        })
      );
    });

    it("handles Gmail 403 Permission Denied with an actionable message", async () => {
      const gmail = google.gmail({ version: "v1" });
      vi.mocked(gmail.users.messages.send).mockRejectedValueOnce({
        code: 403,
        message: "Request had insufficient authentication scopes.",
      });

      const input = {
        to: "developer@example.com",
        subject: "Sprint Kickoff",
        body: "Starting sprint today.",
      };

      const result = await sendEmail(input, fakeOAuth2Client);

      expect(result.success).toBe(false);
      expect(result.error).toBe("GMAIL_PERMISSION_DENIED");
      expect(result.message).toContain("permission to send emails");
    });

    it("handles unexpected Gmail API failure without reporting false success", async () => {
      const gmail = google.gmail({ version: "v1" });
      vi.mocked(gmail.users.messages.send).mockRejectedValueOnce(
        new Error("Network connection dropped")
      );

      const input = {
        to: "developer@example.com",
        subject: "Sprint Kickoff",
        body: "Starting sprint today.",
      };

      const result = await sendEmail(input, fakeOAuth2Client);

      expect(result.success).toBe(false);
      expect(result.error).toBe("GMAIL_API_ERROR");
      expect(result.message).toContain("Network connection dropped");
    });
  });
});


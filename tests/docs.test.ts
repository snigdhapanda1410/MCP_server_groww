import { describe, it, expect, vi, beforeEach } from "vitest";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { appendToGoogleDoc } from "../src/docs";

// Mock googleapis
vi.mock("googleapis", () => {
  const mockBatchUpdate = vi.fn();
  return {
    google: {
      docs: vi.fn().mockReturnValue({
        documents: {
          batchUpdate: mockBatchUpdate,
        },
      }),
    },
    mockBatchUpdate,
  };
});

describe("Google Docs Service", () => {
  const fakeOAuth2Client = {} as OAuth2Client;
  const sampleDocId = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("appendToGoogleDoc", () => {
    it("rejects invalid document identifier without calling Google Docs API", async () => {
      const invalidInput = {
        documentId: "not-a-valid-id",
        content: "Some notes",
      };

      const result = await appendToGoogleDoc(invalidInput, fakeOAuth2Client);
      expect(result.success).toBe(false);
      expect(result.error).toBe("VALIDATION_ERROR");

      const docs = google.docs({ version: "v1" });
      expect(docs.documents.batchUpdate).not.toHaveBeenCalled();
    });

    it("successfully appends content and adds leading newline when absent", async () => {
      const docs = google.docs({ version: "v1" });
      vi.mocked(docs.documents.batchUpdate).mockResolvedValueOnce({} as never);

      const input = {
        documentId: sampleDocId,
        content: "### Meeting Notes\nDiscussion about release.",
      };

      const result = await appendToGoogleDoc(input, fakeOAuth2Client);

      expect(result.success).toBe(true);
      expect(result.documentId).toBe(sampleDocId);
      expect(result.documentUrl).toBe(`https://docs.google.com/document/d/${sampleDocId}/edit`);
      expect(docs.documents.batchUpdate).toHaveBeenCalledTimes(1);

      expect(docs.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: sampleDocId,
        requestBody: {
          requests: [
            {
              insertText: {
                endOfSegmentLocation: {},
                text: "\n### Meeting Notes\nDiscussion about release.",
              },
            },
          ],
        },
      });
    });

    it("extracts document ID correctly from full URL and avoids double newline", async () => {
      const docs = google.docs({ version: "v1" });
      vi.mocked(docs.documents.batchUpdate).mockResolvedValueOnce({} as never);

      const fullUrl = `https://docs.google.com/document/d/${sampleDocId}/edit?usp=sharing`;
      const input = {
        documentId: fullUrl,
        content: "\nAlready has leading newline.",
      };

      const result = await appendToGoogleDoc(input, fakeOAuth2Client);

      expect(result.success).toBe(true);
      expect(result.documentId).toBe(sampleDocId);
      expect(docs.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: sampleDocId,
        requestBody: {
          requests: [
            {
              insertText: {
                endOfSegmentLocation: {},
                text: "\nAlready has leading newline.",
              },
            },
          ],
        },
      });
    });

    it("handles 404 Doc Not Found error with clear message", async () => {
      const docs = google.docs({ version: "v1" });
      vi.mocked(docs.documents.batchUpdate).mockRejectedValueOnce({
        code: 404,
        message: "Requested entity was not found.",
      });

      const input = {
        documentId: sampleDocId,
        content: "New content",
      };

      const result = await appendToGoogleDoc(input, fakeOAuth2Client);

      expect(result.success).toBe(false);
      expect(result.error).toBe("DOC_NOT_FOUND");
      expect(result.message).toContain("was not found");
    });

    it("handles 403 Permission Denied with clear guidance", async () => {
      const docs = google.docs({ version: "v1" });
      vi.mocked(docs.documents.batchUpdate).mockRejectedValueOnce({
        code: 403,
        message: "The caller does not have permission.",
      });

      const input = {
        documentId: sampleDocId,
        content: "New content",
      };

      const result = await appendToGoogleDoc(input, fakeOAuth2Client);

      expect(result.success).toBe(false);
      expect(result.error).toBe("DOC_PERMISSION_DENIED");
      expect(result.message).toContain("does not have edit permissions");
    });
  });
});


import { describe, it, expect } from "vitest";
import {
  SendEmailSchema,
  AppendToDocSchema,
  extractDocumentId,
} from "../src/validation";

describe("Validation Layer", () => {
  describe("extractDocumentId", () => {
    it("extracts ID from standard Google Docs URL", () => {
      const url = "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit";
      expect(extractDocumentId(url)).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
    });

    it("extracts ID from Google Docs URL with query parameters and hash", () => {
      const url = "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?tab=t.0#heading=h.123";
      expect(extractDocumentId(url)).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
    });

    it("extracts ID from URL without https protocol", () => {
      const url = "docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit";
      expect(extractDocumentId(url)).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
    });

    it("accepts a raw Google Docs ID directly", () => {
      const id = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
      expect(extractDocumentId(id)).toBe(id);
    });

    it("throws an error for invalid URLs or IDs", () => {
      expect(() => extractDocumentId("https://google.com/not-a-doc")).toThrow(/Invalid Google Doc identifier/);
      expect(() => extractDocumentId("short_id")).toThrow(/Invalid Google Doc identifier/);
      expect(() => extractDocumentId("")).toThrow(/non-empty string/);
    });
  });

  describe("SendEmailSchema", () => {
    it("validates valid email inputs", () => {
      const valid = {
        to: "alex@example.com",
        subject: "Project Update",
        body: "Hello Alex,\nThe milestone is done.",
      };
      const result = SendEmailSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects invalid recipient email address", () => {
      const invalid = {
        to: "not-an-email",
        subject: "Hello",
        body: "World",
      };
      const result = SendEmailSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/Invalid recipient email/);
      }
    });

    it("rejects CR/LF injection in recipient address", () => {
      const injection = {
        to: "alex@example.com\r\nBcc: evil@attacker.com",
        subject: "Hello",
        body: "World",
      };
      const result = SendEmailSchema.safeParse(injection);
      expect(result.success).toBe(false);
    });

    it("rejects CR/LF injection in subject line", () => {
      const injection = {
        to: "alex@example.com",
        subject: "Hello\nInjected-Header: evil",
        body: "World",
      };
      const result = SendEmailSchema.safeParse(injection);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/header injection/);
      }
    });

    it("rejects empty subject", () => {
      const emptySubject = {
        to: "alex@example.com",
        subject: "",
        body: "World",
      };
      const result = SendEmailSchema.safeParse(emptySubject);
      expect(result.success).toBe(false);
    });

    it("rejects empty body", () => {
      const emptyBody = {
        to: "alex@example.com",
        subject: "Hello",
        body: "",
      };
      const result = SendEmailSchema.safeParse(emptyBody);
      expect(result.success).toBe(false);
    });
  });

  describe("AppendToDocSchema", () => {
    it("validates valid doc append input with URL", () => {
      const valid = {
        documentId: "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
        content: "### Weekly update\nCompleted tasks.",
      };
      const result = AppendToDocSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("validates valid doc append input with raw ID", () => {
      const valid = {
        documentId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        content: "Some new notes.",
      };
      const result = AppendToDocSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects empty content", () => {
      const invalid = {
        documentId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        content: "",
      };
      const result = AppendToDocSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid document identifier", () => {
      const invalid = {
        documentId: "invalid-id",
        content: "Some content",
      };
      const result = AppendToDocSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});


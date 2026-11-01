import { z } from "zod";

/**
 * Regex matching standard Google Docs URL patterns.
 * Extracts the document ID segment immediately following "/document/d/".
 */
export const GOOGLE_DOCS_URL_REGEX =
  /(?:https?:\/\/)?docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/;

/**
 * Regex matching direct Google Docs document IDs (typically alphanumeric with '-' or '_', 20+ characters).
 */
export const GOOGLE_DOCS_ID_REGEX = /^[a-zA-Z0-9_-]{20,}$/;

/**
 * Safely extracts and validates a Google Docs document ID from either
 * a full Google Docs URL or a raw document ID.
 *
 * @throws {Error} If the input cannot be parsed into a valid document ID.
 */
export function extractDocumentId(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Document identifier must be a non-empty string.");
  }

  const trimmed = input.trim();

  // Try extracting from full URL
  const urlMatch = GOOGLE_DOCS_URL_REGEX.exec(trimmed);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Check if raw ID format
  if (GOOGLE_DOCS_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  throw new Error(
    `Invalid Google Doc identifier: "${input}". Please provide either a full URL (e.g., https://docs.google.com/document/d/DOC_ID/edit) or a valid 20+ character Google Docs ID.`
  );
}

/**
 * Input schema for send_email tool.
 */
export const SendEmailSchema = z.object({
  to: z
    .string()
    .trim()
    .min(1, "Recipient email address ('to') is required")
    .email("Invalid recipient email address format")
    .refine((val) => !/[\r\n]/.test(val), {
      message: "Recipient address must not contain CR/LF newline characters (header injection protection)",
    }),
  subject: z
    .string()
    .trim()
    .min(1, "Subject line is required and cannot be empty")
    .max(500, "Subject line exceeds maximum allowed length of 500 characters")
    .refine((val) => !/[\r\n]/.test(val), {
      message: "Subject line must not contain CR/LF newline characters (header injection protection)",
    }),
  body: z
    .string()
    .min(1, "Email body is required and cannot be empty")
    .max(100000, "Email body exceeds maximum permitted size of 100KB"),
});

export type SendEmailInput = z.infer<typeof SendEmailSchema>;

/**
 * Input schema for append_to_google_doc tool.
 */
export const AppendToDocSchema = z.object({
  documentId: z
    .string()
    .trim()
    .min(1, "documentId or Google Doc URL is required")
    .refine(
      (val) => {
        try {
          extractDocumentId(val);
          return true;
        } catch {
          return false;
        }
      },
      {
        message:
          "Invalid Google Docs identifier. Provide a valid document ID or https://docs.google.com/document/d/... URL.",
      }
    ),
  content: z
    .string()
    .min(1, "Content to append cannot be empty")
    .max(200000, "Content exceeds maximum permitted size of 200KB"),
});

export type AppendToDocInput = z.infer<typeof AppendToDocSchema>;

/**
 * Standard structured response types.
 */
export interface SendEmailResponse {
  success: boolean;
  message: string;
  messageId?: string;
  threadId?: string;
  error?: string;
}

export interface AppendToDocResponse {
  success: boolean;
  message: string;
  documentId?: string;
  documentUrl?: string;
  error?: string;
}


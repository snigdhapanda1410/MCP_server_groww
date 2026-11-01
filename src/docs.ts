import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { getAuthenticatedClient } from "./auth";
import {
  AppendToDocInput,
  AppendToDocResponse,
  AppendToDocSchema,
  extractDocumentId,
} from "./validation";
import { logger } from "./logger";

/**
 * Appends plain text to the end of an existing Google Doc using the Docs API batchUpdate.
 *
 * @param input Target document ID or URL and the plain text content to append.
 * @param clientOverride Optional OAuth2Client for unit testing/mocking.
 * @returns Structured AppendToDocResponse indicating success or failure.
 */
export async function appendToGoogleDoc(
  input: AppendToDocInput,
  clientOverride?: OAuth2Client
): Promise<AppendToDocResponse> {
  // 1. Strict schema validation
  const validationResult = AppendToDocSchema.safeParse(input);
  if (!validationResult.success) {
    const errorDetails = validationResult.error.issues
      .map((issue) => issue.message)
      .join("; ");
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: `Invalid document parameters: ${errorDetails}`,
    };
  }

  const { documentId: rawDocId, content } = validationResult.data;

  let cleanDocId: string;
  try {
    cleanDocId = extractDocumentId(rawDocId);
  } catch (extractErr) {
    return {
      success: false,
      error: "INVALID_DOCUMENT_ID",
      message: (extractErr as Error).message,
    };
  }

  const documentUrl = `https://docs.google.com/document/d/${cleanDocId}/edit`;

  try {
    // 2. Obtain authenticated Google OAuth client
    const authClient = clientOverride || (await getAuthenticatedClient());

    // 3. Format text: ensure paragraph separation so appended text starts cleanly
    const formattedText = content.startsWith("\n") ? content : `\n${content}`;

    // 4. Dispatch batchUpdate with insertText at endOfSegmentLocation
    const docs = google.docs({ version: "v1", auth: authClient });

    await docs.documents.batchUpdate({
      documentId: cleanDocId,
      requestBody: {
        requests: [
          {
            insertText: {
              endOfSegmentLocation: {},
              text: formattedText,
            },
          },
        ],
      },
    });

    logger.info(`Successfully appended content to Google Doc: ${cleanDocId}`);

    return {
      success: true,
      message: "Content appended successfully",
      documentId: cleanDocId,
      documentUrl,
    };
  } catch (err: unknown) {
    const error = err as { code?: number | string; status?: number; message?: string };
    const statusCode = error.code || error.status;
    const errorMessage = error.message || String(err);

    logger.error(`Failed to append to Google Doc ${cleanDocId}: ${errorMessage}`);

    // Actionable error mapping
    if (statusCode === 404 || statusCode === "404") {
      return {
        success: false,
        error: "DOC_NOT_FOUND",
        message: `The specified Google Doc was not found (${cleanDocId}). Please check the document ID or URL.`,
        documentId: cleanDocId,
        documentUrl,
      };
    }

    if (statusCode === 403 || statusCode === "403") {
      return {
        success: false,
        error: "DOC_PERMISSION_DENIED",
        message:
          "The authenticated Google account does not have edit permissions for this document. Request edit access or verify account.",
        documentId: cleanDocId,
        documentUrl,
      };
    }

    if (statusCode === 401 || statusCode === "401") {
      return {
        success: false,
        error: "AUTH_REQUIRED",
        message:
          "Authentication credentials expired or invalid. Please re-run 'npm run auth' to authenticate.",
        documentId: cleanDocId,
        documentUrl,
      };
    }

    if (statusCode === 429 || statusCode === "429") {
      return {
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        message:
          "Google Docs API rate limit reached. Please wait before retrying.",
        documentId: cleanDocId,
        documentUrl,
      };
    }

    return {
      success: false,
      error: "DOCS_API_ERROR",
      message: `Failed to append to Google Doc: ${errorMessage}`,
      documentId: cleanDocId,
      documentUrl,
    };
  }
}


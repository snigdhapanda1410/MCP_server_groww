import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import MailComposer from "nodemailer/lib/mail-composer";
import { getAuthenticatedClient } from "./auth";
import { SendEmailInput, SendEmailResponse, SendEmailSchema } from "./validation";
import { logger } from "./logger";

/**
 * Builds an RFC 5322 compliant UTF-8 plain-text MIME email message
 * and returns it as a Base64url-encoded string suitable for the Gmail API.
 *
 * @param input Validated email input containing recipient, subject, and body.
 * @returns Base64url encoded MIME message.
 */
export async function createBase64urlMimeMessage(input: SendEmailInput): Promise<string> {
  const mail = new MailComposer({
    to: input.to,
    subject: input.subject,
    text: input.body,
    encoding: "utf-8",
  });

  const buffer = await mail.compile().build();
  // Node.js Buffer natively supports base64url encoding (RFC 4648 §5)
  return buffer.toString("base64url");
}

/**
 * Sends a plain-text email using the authenticated user's Gmail account.
 *
 * @param input Recipient, subject, and body of the email.
 * @param clientOverride Optional OAuth2Client for unit testing/mocking.
 * @returns Structured SendEmailResponse indicating success or failure.
 */
export async function sendEmail(
  input: SendEmailInput,
  clientOverride?: OAuth2Client
): Promise<SendEmailResponse> {
  // 1. Strict schema validation
  const validationResult = SendEmailSchema.safeParse(input);
  if (!validationResult.success) {
    const errorDetails = validationResult.error.issues
      .map((issue) => issue.message)
      .join("; ");
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: `Invalid email parameters: ${errorDetails}`,
    };
  }

  const validatedData = validationResult.data;

  try {
    // 2. Obtain authenticated Google OAuth client
    const authClient = clientOverride || (await getAuthenticatedClient());

    // 3. Construct Base64url encoded MIME email
    const raw = await createBase64urlMimeMessage(validatedData);

    // 4. Dispatch email through Gmail API
    const gmail = google.gmail({ version: "v1", auth: authClient });
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
      },
    });

    const messageId = response.data.id || undefined;
    const threadId = response.data.threadId || undefined;

    logger.info(`Email successfully dispatched via Gmail API. messageId=${messageId}`);

    return {
      success: true,
      message: "Email sent successfully",
      messageId,
      threadId,
    };
  } catch (err: unknown) {
    const error = err as { code?: number | string; status?: number; message?: string };
    const statusCode = error.code || error.status;
    const errorMessage = error.message || String(err);

    logger.error(`Failed to send email via Gmail API: ${errorMessage}`);

    // Actionable error mapping
    if (statusCode === 403 || statusCode === "403") {
      return {
        success: false,
        error: "GMAIL_PERMISSION_DENIED",
        message:
          "The authenticated Google account does not have permission to send emails via the Gmail API. Check your project's OAuth scopes or test user permissions.",
      };
    }

    if (statusCode === 401 || statusCode === "401") {
      return {
        success: false,
        error: "AUTH_REQUIRED",
        message:
          "Authentication credentials expired or invalid. Please re-run 'npm run auth' to authenticate.",
      };
    }

    if (statusCode === 429 || statusCode === "429") {
      return {
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        message:
          "Gmail API rate limit reached. Please wait before retrying.",
      };
    }

    return {
      success: false,
      error: "GMAIL_API_ERROR",
      message: `Failed to send email: ${errorMessage}`,
    };
  }
}


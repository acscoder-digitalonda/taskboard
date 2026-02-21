/**
 * Gmail API helpers — server-side only.
 *
 * Uses a Google Service Account with domain-wide delegation
 * to send emails as the address configured in GMAIL_SEND_AS.
 *
 * Setup:
 *  1. GCP: Enable Gmail API, create Service Account, download JSON key
 *  2. Google Workspace Admin: Domain-wide delegation with gmail.send scope
 *  3. Set GOOGLE_SERVICE_ACCOUNT_JSON and GMAIL_SEND_AS in .env.local
 */

import { google } from "googleapis";

// L3: No hardcoded fallback — GMAIL_SEND_AS must be set in env
const SEND_AS = process.env.GMAIL_SEND_AS || "";

/**
 * Get an authenticated Gmail client.
 * Uses JWT auth with service account impersonating GMAIL_SEND_AS.
 */
function getGmailClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON env var not set. Gmail sending is disabled."
    );
  }

  const credentials = JSON.parse(raw);

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: SEND_AS,
  });

  return google.gmail({ version: "v1", auth });
}

/**
 * Build a raw RFC 2822 email message, base64url encoded.
 */
function buildRawEmail(options: {
  to: string;
  toName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const { to, toName, subject, bodyText, bodyHtml, inReplyTo, references } =
    options;

  const toField = toName ? `"${toName}" <${to}>` : to;
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const headers = [
    `From: ${SEND_AS}`,
    `To: ${toField}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
  ];

  // Threading headers for Gmail to group in same thread
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    headers.push(`References: ${references}`);
  }

  let body: string;

  if (bodyHtml) {
    headers.push(
      `Content-Type: multipart/alternative; boundary="${boundary}"`
    );
    body = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      bodyText,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      bodyHtml,
      ``,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    headers.push(`Content-Type: text/plain; charset="UTF-8"`);
    body = bodyText;
  }

  const fullMessage = headers.join("\r\n") + "\r\n\r\n" + body;

  // Base64url encode (required by Gmail API)
  return Buffer.from(fullMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send an email via Gmail API.
 *
 * Returns the Gmail message ID on success.
 * Throws on failure.
 */
export async function sendEmail(options: {
  to: string;
  toName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ messageId: string; threadId: string }> {
  const gmail = getGmailClient();

  const raw = buildRawEmail({
    to: options.to,
    toName: options.toName,
    subject: options.subject,
    bodyText: options.bodyText,
    bodyHtml: options.bodyHtml,
    inReplyTo: options.inReplyTo,
    references: options.references,
  });

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: options.threadId || undefined,
    },
  });

  if (!result.data.id) {
    throw new Error("Gmail API returned no message ID");
  }

  return {
    messageId: result.data.id,
    threadId: result.data.threadId || "",
  };
}

/**
 * Check if Gmail sending is configured.
 */
export function isGmailConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !!SEND_AS;
}

/**
 * Get the send-as email address.
 */
export function getSendAsEmail(): string {
  return SEND_AS;
}

import "server-only";

import { Resend } from "resend";

export type SendEmailWithAttachmentsResult =
  | { ok: true; messageId?: string; recipientCount: number }
  | {
      ok: false;
      reason: "not_configured" | "invalid_email" | "attachment_too_large" | "send_failed";
      message?: string;
    };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendEmailWithPdfAttachment(params: {
  fromName?: string;
  fromEmail?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  pdfBase64: string;
  fileName: string;
}): Promise<SendEmailWithAttachmentsResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "not_configured", message: "Missing RESEND_API_KEY" };
  }

  if (!params.to || params.to.length === 0) {
    return { ok: false, reason: "invalid_email", message: "At least one recipient (To) is required" };
  }

  if (!params.subject?.trim()) {
    return { ok: false, reason: "send_failed", message: "Subject is required" };
  }

  if (!params.pdfBase64) {
    return { ok: false, reason: "send_failed", message: "PDF attachment is required" };
  }

  if (!params.fileName) {
    return { ok: false, reason: "send_failed", message: "File name is required" };
  }

  const allEmails = [...params.to, ...(params.cc || []), ...(params.bcc || [])].map((e) => e.trim());
  const invalidEmails = allEmails.filter((e) => !EMAIL_REGEX.test(e));
  if (invalidEmails.length > 0) {
    return {
      ok: false,
      reason: "invalid_email",
      message: `Invalid email address(es): ${invalidEmails.join(", ")}`,
    };
  }

  // Resend limit is higher, but be conservative.
  const pdfSizeBytes = Buffer.from(params.pdfBase64, "base64").length;
  const maxSizeMB = 10;
  if (pdfSizeBytes > maxSizeMB * 1024 * 1024) {
    return {
      ok: false,
      reason: "attachment_too_large",
      message: `PDF attachment too large (max ${maxSizeMB}MB)`,
    };
  }

  const resend = new Resend(apiKey);
  const defaultFromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromEmail = params.fromEmail || defaultFromEmail;
  const fromName = params.fromName || "YMCA Attendance Tracker";
  const from = `${fromName} <${fromEmail}>`;

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      cc: params.cc && params.cc.length > 0 ? params.cc : undefined,
      bcc: params.bcc && params.bcc.length > 0 ? params.bcc : undefined,
      subject: params.subject,
      text: params.message,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
        <p style="white-space: pre-wrap;">${params.message.replace(/\n/g, "<br>")}</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">
          This email was sent from YMCA Attendance Tracker.<br>
          Please do not reply directly to this email.
        </p>
      </div>`,
      attachments: [{ filename: params.fileName, content: params.pdfBase64 }],
    });

    if (error) return { ok: false, reason: "send_failed", message: error.message };

    return { ok: true, messageId: data?.id, recipientCount: allEmails.length };
  } catch (err) {
    return {
      ok: false,
      reason: "send_failed",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}


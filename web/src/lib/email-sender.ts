import "server-only";

import { Resend } from "resend";

export type SendEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: "not_configured" | "send_failed"; message?: string };

export async function sendEmail(params: {
  fromName?: string;
  fromEmail?: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "not_configured", message: "Missing RESEND_API_KEY" };
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
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    if (error) {
      return { ok: false, reason: "send_failed", message: error.message };
    }

    return { ok: true, messageId: data?.id };
  } catch (err) {
    return {
      ok: false,
      reason: "send_failed",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}


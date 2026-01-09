import { NextResponse } from "next/server";
import { Resend } from "resend";

type SendPdfPayload = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  pdfBase64: string;
  fileName: string;
  fromEmail?: string;
  fromName?: string;
};

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email service not configured. Missing RESEND_API_KEY." },
      { status: 500 }
    );
  }

  const resend = new Resend(apiKey);

  let body: SendPdfPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to, cc, bcc, subject, message, pdfBase64, fileName, fromEmail, fromName } = body;

  // Validation
  if (!to || to.length === 0) {
    return NextResponse.json({ error: "At least one recipient (To) is required" }, { status: 400 });
  }

  if (!subject?.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  if (!pdfBase64) {
    return NextResponse.json({ error: "PDF attachment is required" }, { status: 400 });
  }

  if (!fileName) {
    return NextResponse.json({ error: "File name is required" }, { status: 400 });
  }

  // Validate email addresses
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const allEmails = [...to, ...(cc || []), ...(bcc || [])];
  const invalidEmails = allEmails.filter((e) => !emailRegex.test(e));
  if (invalidEmails.length > 0) {
    return NextResponse.json(
      { error: `Invalid email address(es): ${invalidEmails.join(", ")}` },
      { status: 400 }
    );
  }

  // Check PDF size (Resend has a 40MB limit, but let's be conservative)
  const pdfSizeBytes = Buffer.from(pdfBase64, "base64").length;
  const maxSizeMB = 10;
  if (pdfSizeBytes > maxSizeMB * 1024 * 1024) {
    return NextResponse.json(
      { error: `PDF attachment too large (max ${maxSizeMB}MB)` },
      { status: 400 }
    );
  }

  try {
    // Build the from address
    // Use RESEND_FROM_EMAIL env var if set, otherwise fall back to provided email or default
    const defaultFromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const from = fromName && fromEmail
      ? `${fromName} <${fromEmail}>`
      : `YMCA Attendance Tracker <${defaultFromEmail}>`;

    const { data, error } = await resend.emails.send({
      from,
      to,
      cc: cc && cc.length > 0 ? cc : undefined,
      bcc: bcc && bcc.length > 0 ? bcc : undefined,
      subject,
      text: message,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
        <p style="white-space: pre-wrap;">${message.replace(/\n/g, "<br>")}</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">
          This email was sent from YMCA Attendance Tracker.<br>
          Please do not reply directly to this email.
        </p>
      </div>`,
      attachments: [
        {
          filename: fileName,
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id,
      recipientCount: to.length + (cc?.length || 0) + (bcc?.length || 0),
    });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 }
    );
  }
}


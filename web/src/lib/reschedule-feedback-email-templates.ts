import "server-only";

function safeLine(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : "—";
}

function formatExpiresAtLabel(expiresAtIso: string): string | null {
  const d = new Date(expiresAtIso);
  if (!Number.isFinite(d.getTime())) return null;

  const date = d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${date} @ ${time}`;
}

export function buildRescheduleFeedbackRequestEmail(params: {
  branchName: string;
  scheduleLabel: string;
  instructorLabel: string;
  feedbackUrl: string;
  expiresAtIso: string; // ISO string
}): { subject: string; text: string; html: string } {
  const subject = `${params.branchName} — Reschedule Feedback Needed (${params.scheduleLabel})`;
  const expiresLabel = formatExpiresAtLabel(params.expiresAtIso);
  const expiresText = expiresLabel
    ? `The access token to use this link expires in 48 hours on ${expiresLabel}.`
    : "The access token to use this link expires in 48 hours.";

  const text = [
    `Hi ${safeLine(params.instructorLabel)},`,
    "",
    `Please review the proposed reschedule options for ${params.branchName} (${params.scheduleLabel}).`,
    "",
    `Open in browser: ${params.feedbackUrl}`,
    "",
    expiresText,
    "",
    "Thank you!",
  ].join("\n");

  const buttonStyle =
    "display:inline-block;background:#f6c400;color:#061013;text-decoration:none;" +
    "padding:12px 16px;border-radius:10px;font-weight:700;";

  const html = `
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">
    <p>Hi ${safeLine(params.instructorLabel)},</p>
    <p>
      Please review the proposed reschedule options for
      <strong>${safeLine(params.branchName)}</strong> (${safeLine(params.scheduleLabel)}).
    </p>
    <p>
      <a href="${params.feedbackUrl}" style="${buttonStyle}">Open in browser</a>
    </p>
    <p style="font-size: 12px; color: #444;">
      If your email client blocks the button, copy/paste this link into your browser:
      <br />
      <a href="${params.feedbackUrl}">${params.feedbackUrl}</a>
    </p>
    <p style="font-size: 12px; color: #444;">
      ${expiresLabel ? `The access token to use this link expires in <strong>48 hours</strong> on <strong>${expiresLabel}</strong>.` : "The access token to use this link expires in <strong>48 hours</strong>."}
    </p>
  </div>`;

  return { subject, text, html };
}

export function buildRescheduleFeedbackSubmittedEmail(params: {
  branchName: string;
  scheduleLabel: string;
  instructorLabel: string;
  selectedCount: number;
  feedbackReceivedAtIso: string;
}): { subject: string; text: string; html: string } {
  const subject = `${params.branchName} — Instructor feedback received (${params.scheduleLabel})`;
  const receivedLabel = new Date(params.feedbackReceivedAtIso).toLocaleString();

  const text = [
    `Instructor feedback received.`,
    "",
    `Branch: ${safeLine(params.branchName)}`,
    `Schedule: ${safeLine(params.scheduleLabel)}`,
    `Instructor: ${safeLine(params.instructorLabel)}`,
    `Selected: ${params.selectedCount}`,
    `Received: ${receivedLabel}`,
  ].join("\n");

  const html = `
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">
    <p><strong>Instructor feedback received.</strong></p>
    <p>
      Branch: <strong>${safeLine(params.branchName)}</strong><br />
      Schedule: <strong>${safeLine(params.scheduleLabel)}</strong><br />
      Instructor: <strong>${safeLine(params.instructorLabel)}</strong><br />
      Selected: <strong>${params.selectedCount}</strong><br />
      Received: <strong>${receivedLabel}</strong>
    </p>
  </div>`;

  return { subject, text, html };
}

export function buildSlotHelperReviewRequestEmail(params: {
  branchName: string;
  scheduleLabel: string;
  recipientLabel: string;
  reviewUrl: string;
  expiresAtIso: string;
  slotRows: Array<{ dateTime: string; className: string; location: string }>;
}): { subject: string; text: string; html: string } {
  const subject = `${params.branchName} — Slot Review Requested (${params.scheduleLabel})`;
  const expiresLabel = formatExpiresAtLabel(params.expiresAtIso);
  const expiresText = expiresLabel
    ? `The access token to use this link expires in 48 hours on ${expiresLabel}.`
    : "The access token to use this link expires in 48 hours.";

  const rowsForText = params.slotRows ?? [];
  const slotsText = rowsForText.length
    ? [
        "",
        "Proposed time slots:",
        "DATE & TIME (start / end) | CLASS NAME | LOCATION",
        ...rowsForText.map((r) => `${safeLine(r.dateTime)} | ${safeLine(r.className)} | ${safeLine(r.location)}`),
      ].join("\n")
    : "";

  const text = [
    `Hi ${safeLine(params.recipientLabel)},`,
    "",
    `Please review the proposed time slots for ${params.branchName} (${params.scheduleLabel}).`,
    slotsText,
    "",
    `Open in browser: ${params.reviewUrl}`,
    "",
    expiresText,
    "",
    "Thank you!",
  ].join("\n");

  const buttonStyle =
    "display:inline-block;background:#f6c400;color:#061013;text-decoration:none;" +
    "padding:12px 16px;border-radius:10px;font-weight:700;";

  const rowsForHtml = params.slotRows ?? [];
  const tableCellStyle = "border:1px solid #ddd;padding:8px;vertical-align:top;";
  const tableHeaderStyle = "border:1px solid #ddd;padding:8px;background:#f7f7f7;text-align:left;";
  const slotsHtml = rowsForHtml.length
    ? `
      <p><strong>Proposed time slots:</strong></p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;">
        <thead>
          <tr>
            <th style="${tableHeaderStyle}">DATE &amp; TIME (start / end)</th>
            <th style="${tableHeaderStyle}">CLASS NAME</th>
            <th style="${tableHeaderStyle}">LOCATION</th>
          </tr>
        </thead>
        <tbody>
          ${rowsForHtml
            .map(
              (r) => `
            <tr>
              <td style="${tableCellStyle}">${safeLine(r.dateTime)}</td>
              <td style="${tableCellStyle}">${safeLine(r.className)}</td>
              <td style="${tableCellStyle}">${safeLine(r.location)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    `
    : "";

  const html = `
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">
    <p>Hi ${safeLine(params.recipientLabel)},</p>
    <p>
      Please review the proposed time slots for
      <strong>${safeLine(params.branchName)}</strong> (${safeLine(params.scheduleLabel)}).
    </p>
    ${slotsHtml}
    <p>
      <a href="${params.reviewUrl}" style="${buttonStyle}">Open in browser</a>
    </p>
    <p style="font-size: 12px; color: #444;">
      If your email client blocks the button, copy/paste this link into your browser:
      <br />
      <a href="${params.reviewUrl}">${params.reviewUrl}</a>
    </p>
    <p style="font-size: 12px; color: #444;">
      ${expiresLabel ? `The access token to use this link expires in <strong>48 hours</strong> on <strong>${expiresLabel}</strong>.` : "The access token to use this link expires in <strong>48 hours</strong>."}
    </p>
  </div>`;

  return { subject, text, html };
}

export function buildSlotHelperReviewSubmittedEmail(params: {
  branchName: string;
  scheduleLabel: string;
  selectedCount: number;
  comment: string | null;
  feedbackReceivedAtIso: string;
}): { subject: string; text: string; html: string } {
  const subject = `${params.branchName} — Slot review response received (${params.scheduleLabel})`;
  const receivedLabel = new Date(params.feedbackReceivedAtIso).toLocaleString();
  const commentLine = params.comment?.trim() ? params.comment.trim() : null;

  const text = [
    `Slot review response received.`,
    "",
    `Branch: ${safeLine(params.branchName)}`,
    `Schedule: ${safeLine(params.scheduleLabel)}`,
    `Selected: ${params.selectedCount}`,
    `Received: ${receivedLabel}`,
    ...(commentLine ? ["", `Comment: ${commentLine}`] : []),
  ].join("\n");

  const html = `
  <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">
    <p><strong>Slot review response received.</strong></p>
    <p>
      Branch: <strong>${safeLine(params.branchName)}</strong><br />
      Schedule: <strong>${safeLine(params.scheduleLabel)}</strong><br />
      Selected: <strong>${params.selectedCount}</strong><br />
      Received: <strong>${receivedLabel}</strong>
    </p>
    ${
      commentLine
        ? `<p><strong>Comment:</strong><br />${safeLine(commentLine).replaceAll("\n", "<br />")}</p>`
        : ""
    }
  </div>`;

  return { subject, text, html };
}



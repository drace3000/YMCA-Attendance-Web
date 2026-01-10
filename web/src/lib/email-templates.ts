import "server-only";

export type OrgAssignment = {
  allianceName: string | null;
  associationName: string | null;
  branchName: string | null;
};

function safeLine(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : "—";
}

export function buildWelcomeEmail(params: {
  firstName: string | null;
  toEmail: string;
  assignment: OrgAssignment;
  tempPassword: string;
  appUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = "Welcome to YMCA Attendance & Scheduling";
  const greetingName = params.firstName?.trim() ? params.firstName.trim() : "there";

  const allianceLine = safeLine(params.assignment.allianceName);
  const associationLine = safeLine(params.assignment.associationName);
  const branchLine = safeLine(params.assignment.branchName);

  const text = [
    `Hi ${greetingName},`,
    "",
    "Your account has been created for the YMCA Attendance & Scheduling system.",
    "",
    "Your Assignment:",
    `  Alliance:    ${allianceLine}`,
    `  Association: ${associationLine}`,
    `  Branch:      ${branchLine}`,
    "",
    `Your temporary password: ${params.tempPassword}`,
    "",
    "To get started:",
    `1. Go to ${params.appUrl}`,
    "2. Enter your email and temporary password",
    "3. You will be prompted to create a new password",
    "",
    "The AWD Team",
  ].join("\n");

  const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">
    <p style="white-space: pre-wrap;">${text.replace(/\n/g, "<br>")}</p>
  </div>`;

  return { subject, text, html };
}

export function buildPasswordResetEmail(params: {
  firstName: string | null;
  toEmail: string;
  tempPassword: string;
  appUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = "Your YMCA Attendance Password Has Been Reset";
  const greetingName = params.firstName?.trim() ? params.firstName.trim() : "there";

  const text = [
    `Hi ${greetingName},`,
    "",
    "Your password has been reset by an administrator.",
    "",
    `Your new temporary password: ${params.tempPassword}`,
    "",
    "Please log in and create a new password at your earliest convenience:",
    params.appUrl,
    "",
    "If you did not request this reset, please contact AWD Support immediately.",
    "",
    "The AWD Team",
  ].join("\n");

  const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">
    <p style="white-space: pre-wrap;">${text.replace(/\n/g, "<br>")}</p>
  </div>`;

  return { subject, text, html };
}


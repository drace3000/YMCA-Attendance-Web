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
  appUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = "Welcome to YMCA Attendance & Scheduling";
  const greetingName = params.firstName?.trim() ? params.firstName.trim() : "there";
  const baseUrl = params.appUrl.replace(/\/$/, "");
  const otpLink = `${baseUrl}/?email=${encodeURIComponent(params.toEmail)}&mode=otp`;

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
    "To get started:",
    `1. Go to ${otpLink}`,
    "2. Click “Sign in with code”",
    "3. Click “Send code” and enter the 6-digit code emailed to you",
    "4. You will be prompted to create a new password",
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
  appUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = "Your YMCA Attendance Password Has Been Reset";
  const greetingName = params.firstName?.trim() ? params.firstName.trim() : "there";
  const baseUrl = params.appUrl.replace(/\/$/, "");
  const otpLink = `${baseUrl}/?email=${encodeURIComponent(params.toEmail)}&mode=otp`;

  const text = [
    `Hi ${greetingName},`,
    "",
    "Your password reset was requested by an administrator.",
    "",
    "To regain access and set a new password:",
    `1. Go to ${otpLink}`,
    "2. Click “Sign in with code”",
    "3. Click “Send code” and enter the 6-digit code emailed to you",
    "4. Create your new password when prompted",
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


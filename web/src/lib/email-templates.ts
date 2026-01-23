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

function formatSlotLine(dateIso: string, startHHmm: string, endHHmm: string): string {
  const date = (() => {
    const d = new Date(`${dateIso}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return dateIso;
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
  })();
  const formatTime = (t: string): string => {
    const [hRaw, mRaw] = t.split(":");
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };
  return `${date} • ${formatTime(startHHmm)}–${formatTime(endHHmm)}`;
}

export function buildSessionConfirmationEmail(params: {
  scheduleLabel: string;
  instructorLabel: string;
  className: string;
  locationName: string;
  instructorEmail: string;
  managerEmail: string;
  slots: Array<{ date: string; start_time: string; end_time: string }>;
}): { subject: string; text: string; html: string } {
  const subject = "Confirmation of assigned classes";
  const slotLines =
    params.slots.length === 0
      ? ["—"]
      : params.slots.map((slot) => formatSlotLine(slot.date, slot.start_time, slot.end_time));

  const detailRows: Array<[string, string]> = [
    ["Schedule", safeLine(params.scheduleLabel)],
    ["Instructor", safeLine(params.instructorLabel)],
    ["Class", safeLine(params.className)],
    ["Location", safeLine(params.locationName)],
    ["Manager Email", safeLine(params.managerEmail)],
  ];  const labelWidth = Math.max(...detailRows.map(([label]) => label.length), "Manager Email".length);
  const textDetailLines = detailRows.map(([label, value]) => `  ${label.padEnd(labelWidth)}  ${value}`);

  const introName = safeLine(params.instructorLabel);
  const introLines = [
    `Hello ${introName}`,
    "This is to confirm class sessions you have signed up for. Please notify us at your earliest convenience if you wish to make any changes. If none, then no need to reply.",
  ];

  const text = [
    ...introLines,
    "",
    "New Class Session Details",
    ...textDetailLines,
    "",
    "Session Time(s) Assigned",
    ...slotLines.map((line) => `  ${line}`),
    "",
    "The YMCA Scheduling Team",
  ].join("\n");

  const htmlRows = detailRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 12px 2px 0; font-weight:600; vertical-align:top;">${label}</td><td style="padding:2px 0; vertical-align:top;">${value}</td></tr>`,
    )
    .join("");

  const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">
  <p style="margin:0 0 6px 0;">${introLines[0]}</p>
  <p style="margin:0 0 12px 0;">${introLines[1]}</p>
  <div style="margin:12px 0 8px 0; font-weight:700;">New Class Session Details</div>
  <table style="border-collapse:collapse;">${htmlRows}</table>
  <div style="margin:12px 0 6px 0; font-weight:700; text-decoration:underline;">Session Time(s) Assigned</div>
  <div>${slotLines.map((line) => `<div>${line}</div>`).join("")}</div>
  <div style="margin-top:12px;">The YMCA Scheduling Team</div>
</div>`;

  return { subject, text, html };
}

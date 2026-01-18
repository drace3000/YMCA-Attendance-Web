import "server-only";

import { pdf } from "@react-pdf/renderer";
import { SchedulePDFDocument } from "@/components/schedule-pdf/SchedulePDFDocument";
import type { Session } from "@/app/scheduling/sessions-tab";

type BranchForPdf = {
  name: string;
  alliance_name?: string | null;
  association_name?: string | null;
  branch_manager_name?: string | null;
  website_url?: string | null;
  theme_color?: string | null;
};

type ScheduleForPdf = {
  name: string;
  month_start: string; // "YYYY-MM-DD"
};

type ProgramGroupForPdf = {
  name: string;
  code: string;
} | null;

function formatMonthYear(monthStart: string): string {
  const date = new Date(`${monthStart}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatEffectiveDate(monthStart: string): string {
  const date = new Date(`${monthStart}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "_");
}

export function generateSchedulePdfFilename(opts: { branchName: string; monthStart: string }): string {
  const monthYear = formatMonthYear(opts.monthStart).replace(" ", "_");
  return `${safeFilename(opts.branchName)}_Schedule_${monthYear}.pdf`;
}

export async function generateSchedulePdfBase64(opts: {
  branch: BranchForPdf;
  schedule: ScheduleForPdf;
  programGroup?: ProgramGroupForPdf;
  sessions: Session[];
  criteria?: string[];
}): Promise<{ pdfBase64: string; fileName: string }> {
  const groupLabel = opts.programGroup ? `${opts.programGroup.name} (${opts.programGroup.code})` : undefined;

  const doc = (
    <SchedulePDFDocument
      branchName={opts.branch.name}
      allianceName={opts.branch.alliance_name ?? undefined}
      associationName={opts.branch.association_name ?? undefined}
      groupName={groupLabel}
      branchManager={opts.branch.branch_manager_name ?? undefined}
      monthYear={formatMonthYear(opts.schedule.month_start)}
      effectiveDate={formatEffectiveDate(opts.schedule.month_start)}
      sessions={opts.sessions}
      criteria={opts.criteria}
      websiteUrl={opts.branch.website_url ?? undefined}
      themeColor={opts.branch.theme_color ?? undefined}
    />
  );

  // Node/server: generate a Buffer and base64-encode it for Resend.
  const raw = await pdf(doc).toBuffer();
  const buffer = Buffer.from(raw as any);
  const fileName = generateSchedulePdfFilename({
    branchName: opts.branch.name,
    monthStart: opts.schedule.month_start,
  });

  return { pdfBase64: buffer.toString("base64"), fileName };
}


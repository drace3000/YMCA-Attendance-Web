/**
 * Schedule PDF Generation Utilities
 * Client-side PDF generation using @react-pdf/renderer
 */

import { pdf } from "@react-pdf/renderer";
import { SchedulePDFDocument } from "@/components/schedule-pdf/SchedulePDFDocument";
import type { Session } from "@/app/scheduling/sessions-tab";
import { downloadPDFBlob, previewPDFBlob, printPDFBlob } from "./pdf-utils";

interface Branch {
  id: string;
  name: string;
  website_url?: string;
  theme_color?: string;
  branch_manager_name?: string;
}

interface Schedule {
  id: string;
  name: string;
  month_start: string;
}

interface ProgramGroup {
  id: string;
  code: string;
  name: string;
}

/**
 * Format month_start date to display format (e.g., "December 2025")
 */
function formatMonthYear(monthStart: string): string {
  const date = new Date(monthStart + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Format effective date (e.g., "December 1, 2025")
 */
function formatEffectiveDate(monthStart: string): string {
  const date = new Date(monthStart + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Generate filename for the PDF
 */
function generateFilename(branchName: string, monthStart: string): string {
  const monthYear = formatMonthYear(monthStart).replace(" ", "_");
  const safeBranchName = branchName.replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeBranchName}_Schedule_${monthYear}.pdf`;
}

/**
 * Generate PDF blob from schedule data
 */
export async function generateSchedulePDFBlob(
  branch: Branch,
  schedule: Schedule,
  sessions: Session[],
  programGroup?: ProgramGroup | null,
  criteria?: string[]
): Promise<Blob> {
  const groupLabel = programGroup
    ? `${programGroup.name} (${programGroup.code})`
    : undefined;
  const doc = (
    <SchedulePDFDocument
      branchName={branch.name}
      groupName={groupLabel}
      branchManager={branch.branch_manager_name}
      monthYear={formatMonthYear(schedule.month_start)}
      effectiveDate={formatEffectiveDate(schedule.month_start)}
      sessions={sessions}
      criteria={criteria}
      websiteUrl={branch.website_url}
      themeColor={branch.theme_color}
    />
  );

  const blob = await pdf(doc).toBlob();
  return blob;
}

/**
 * Generate and download PDF
 */
export async function downloadSchedulePDF(
  branch: Branch,
  schedule: Schedule,
  sessions: Session[],
  programGroup?: ProgramGroup | null,
  criteria?: string[]
): Promise<void> {
  const blob = await generateSchedulePDFBlob(branch, schedule, sessions, programGroup, criteria);
  const filename = generateFilename(branch.name, schedule.month_start);
  downloadPDFBlob(blob, filename);
}

/**
 * Generate PDF and open in new tab for preview
 */
export async function previewSchedulePDF(
  branch: Branch,
  schedule: Schedule,
  sessions: Session[],
  programGroup?: ProgramGroup | null,
  criteria?: string[]
): Promise<void> {
  const blob = await generateSchedulePDFBlob(branch, schedule, sessions, programGroup, criteria);
  previewPDFBlob(blob);
}

/**
 * Generate PDF and trigger browser print dialog
 */
export async function printSchedulePDF(
  branch: Branch,
  schedule: Schedule,
  sessions: Session[],
  programGroup?: ProgramGroup | null,
  criteria?: string[]
): Promise<void> {
  const blob = await generateSchedulePDFBlob(branch, schedule, sessions, programGroup, criteria);
  printPDFBlob(blob);
}
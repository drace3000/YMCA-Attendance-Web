/**
 * Schedule PDF Generation Utilities
 * Client-side PDF generation using @react-pdf/renderer
 */

import { pdf } from "@react-pdf/renderer";
import { SchedulePDFDocument } from "@/components/schedule-pdf/SchedulePDFDocument";
import type { Session } from "@/app/scheduling/sessions-tab";

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
  sessions: Session[]
): Promise<Blob> {
  const doc = (
    <SchedulePDFDocument
      branchName={branch.name}
      branchManager={branch.branch_manager_name}
      monthYear={formatMonthYear(schedule.month_start)}
      effectiveDate={formatEffectiveDate(schedule.month_start)}
      sessions={sessions}
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
  sessions: Session[]
): Promise<void> {
  const blob = await generateSchedulePDFBlob(branch, schedule, sessions);
  const filename = generateFilename(branch.name, schedule.month_start);
  
  // Create download link and trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate PDF and open in new tab for preview
 */
export async function previewSchedulePDF(
  branch: Branch,
  schedule: Schedule,
  sessions: Session[]
): Promise<void> {
  const blob = await generateSchedulePDFBlob(branch, schedule, sessions);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Note: URL will be revoked when tab is closed or after timeout
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Generate PDF and trigger browser print dialog
 */
export async function printSchedulePDF(
  branch: Branch,
  schedule: Schedule,
  sessions: Session[]
): Promise<void> {
  const blob = await generateSchedulePDFBlob(branch, schedule, sessions);
  const url = URL.createObjectURL(blob);
  
  // Open in new window and trigger print
  const printWindow = window.open(url, "_blank");
  if (printWindow) {
    printWindow.addEventListener("load", () => {
      printWindow.print();
    });
  }
  
  // Cleanup after delay
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
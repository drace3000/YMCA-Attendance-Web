/**
 * Attendance Report PDF Generation Utilities
 * Client-side PDF generation using @react-pdf/renderer
 */

import { pdf } from "@react-pdf/renderer";
import {
  AttendanceReportPDFDocument,
  type ReportData,
  type FilterInfo,
  type ReportSection,
} from "@/components/attendance-report-pdf/AttendanceReportPDFDocument";

/**
 * Generate filename for the PDF
 */
function generateFilename(filters: FilterInfo): string {
  const parts = ["Attendance_Report", filters.year];
  
  if (filters.month !== "all") {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const monthNum = parseInt(filters.month, 10);
    parts.push(monthNames[monthNum - 1] || filters.month);
  } else if (filters.quarter !== "all") {
    parts.push(`Q${filters.quarter}`);
  }
  
  if (filters.week !== "all") {
    parts.push(`Week${filters.week}`);
  }
  
  const timestamp = new Date().toISOString().slice(0, 10);
  parts.push(timestamp);
  
  return parts.join("_") + ".pdf";
}

/**
 * Generate PDF blob from report data
 */
export async function generateAttendanceReportPDFBlob(
  data: ReportData,
  filters: FilterInfo,
  selectedSections: ReportSection[]
): Promise<Blob> {
  const doc = (
    <AttendanceReportPDFDocument
      data={data}
      filters={filters}
      selectedSections={selectedSections}
    />
  );

  const blob = await pdf(doc).toBlob();
  return blob;
}

/**
 * Generate and download PDF
 */
export async function downloadAttendanceReportPDF(
  data: ReportData,
  filters: FilterInfo,
  selectedSections: ReportSection[]
): Promise<void> {
  const blob = await generateAttendanceReportPDFBlob(data, filters, selectedSections);
  const filename = generateFilename(filters);

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
export async function previewAttendanceReportPDF(
  data: ReportData,
  filters: FilterInfo,
  selectedSections: ReportSection[]
): Promise<void> {
  const blob = await generateAttendanceReportPDFBlob(data, filters, selectedSections);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Note: URL will be revoked when tab is closed or after timeout
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Generate PDF and trigger browser print dialog
 */
export async function printAttendanceReportPDF(
  data: ReportData,
  filters: FilterInfo,
  selectedSections: ReportSection[]
): Promise<void> {
  const blob = await generateAttendanceReportPDFBlob(data, filters, selectedSections);
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





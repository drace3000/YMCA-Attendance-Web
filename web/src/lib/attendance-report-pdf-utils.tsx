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
import { downloadPDFBlob, previewPDFBlob, printPDFBlob } from "./pdf-utils";

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
  downloadPDFBlob(blob, filename);
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
  previewPDFBlob(blob);
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
  printPDFBlob(blob);
}










/**
 * Trends Report PDF Generation Utilities
 * Client-side PDF generation using @react-pdf/renderer
 */

import { pdf } from "@react-pdf/renderer";
import {
  TrendsReportPDFDocument,
  type TrendsReportData,
} from "@/components/trends-report-pdf/TrendsReportPDFDocument";

/**
 * Generate filename for the PDF
 * Format: YYYY-MM-DD-Branch_Name_Trends_Report_YEAR[_Q#].pdf
 */
function generateFilename(data: TrendsReportData): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  
  // Convert branch name to filename-safe format (spaces to underscores)
  const branchPart = data.branchName 
    ? data.branchName.replace(/\s+/g, "_") 
    : "YMCA";
  
  const nameParts = [branchPart, "Trends_Report", String(data.year)];

  if (data.quarter) {
    nameParts.push(`Q${data.quarter}`);
  }

  return `${today}-${nameParts.join("_")}.pdf`;
}

/**
 * Generate PDF blob from report data
 */
export async function generateTrendsReportPDFBlob(
  data: TrendsReportData,
  chartImages?: {
    trendingUp?: string;
    trendingDown?: string;
  }
): Promise<Blob> {
  const doc = (
    <TrendsReportPDFDocument data={data} chartImages={chartImages} />
  );

  const blob = await pdf(doc).toBlob();
  return blob;
}

/**
 * Generate and download PDF
 */
export async function downloadTrendsReportPDF(
  data: TrendsReportData,
  chartImages?: {
    trendingUp?: string;
    trendingDown?: string;
  }
): Promise<void> {
  const blob = await generateTrendsReportPDFBlob(data, chartImages);
  const filename = generateFilename(data);

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
export async function previewTrendsReportPDF(
  data: TrendsReportData,
  chartImages?: {
    trendingUp?: string;
    trendingDown?: string;
  }
): Promise<void> {
  const blob = await generateTrendsReportPDFBlob(data, chartImages);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Note: URL will be revoked when tab is closed or after timeout
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Generate PDF and trigger browser print dialog
 */
export async function printTrendsReportPDF(
  data: TrendsReportData,
  chartImages?: {
    trendingUp?: string;
    trendingDown?: string;
  }
): Promise<void> {
  const blob = await generateTrendsReportPDFBlob(data, chartImages);
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



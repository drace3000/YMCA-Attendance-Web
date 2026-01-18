/**
 * Holiday Schedule PDF Generation Utilities
 * Client-side PDF generation using @react-pdf/renderer
 */

import { pdf } from "@react-pdf/renderer";
import {
  HolidaySchedulePDFDocument,
  type HolidayScheduleReportData,
} from "@/components/holiday-schedule-pdf/HolidaySchedulePDFDocument";
import { downloadPDFBlob, previewPDFBlob, printPDFBlob } from "@/lib/pdf-utils";

function generateFilename(data: HolidayScheduleReportData): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const branchPart = data.branchName ? data.branchName.replace(/\s+/g, "_") : "YMCA";
  return `${today}-${branchPart}_Holiday_Schedule_${data.year}.pdf`;
}

export async function generateHolidaySchedulePDFBlob(
  data: HolidayScheduleReportData,
): Promise<Blob> {
  const doc = <HolidaySchedulePDFDocument data={data} />;
  return await pdf(doc).toBlob();
}

export async function previewHolidaySchedulePDF(
  data: HolidayScheduleReportData,
): Promise<void> {
  const blob = await generateHolidaySchedulePDFBlob(data);
  previewPDFBlob(blob);
}

export async function printHolidaySchedulePDF(
  data: HolidayScheduleReportData,
): Promise<void> {
  const blob = await generateHolidaySchedulePDFBlob(data);
  printPDFBlob(blob);
}

export async function downloadHolidaySchedulePDF(
  data: HolidayScheduleReportData,
): Promise<void> {
  const blob = await generateHolidaySchedulePDFBlob(data);
  downloadPDFBlob(blob, generateFilename(data));
}


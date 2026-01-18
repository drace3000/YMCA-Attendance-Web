import { pdf } from "@react-pdf/renderer";

import { downloadPDFBlob, previewPDFBlob, printPDFBlob } from "@/lib/pdf-utils";
import {
  ScheduleCloneConstraintsPDFDocument,
  type ScheduleCloneConstraintReportGroup,
  type ScheduleCloneConstraintReportStats,
} from "@/components/schedule-clone-constraints-report/ScheduleCloneConstraintsPDFDocument";

function buildPdfFilename(title: string): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${dateStr}.${timeStr}.${safeTitle}.pdf`;
}

export async function generateScheduleCloneExceptionReportPDFBlob(args: {
  title: string;
  orgLine: string;
  stats: ScheduleCloneConstraintReportStats;
  groups: ScheduleCloneConstraintReportGroup[];
  logoSrc?: string | null;
}): Promise<Blob> {
  const doc = (
    <ScheduleCloneConstraintsPDFDocument
      title={args.title}
      orgLine={args.orgLine}
      printedOnLabel={new Date().toLocaleString()}
      stats={args.stats}
      groups={args.groups}
      logoSrc={args.logoSrc}
    />
  );
  return await pdf(doc).toBlob();
}

export async function previewScheduleCloneExceptionReportPDF(args: {
  title: string;
  orgLine: string;
  stats: ScheduleCloneConstraintReportStats;
  groups: ScheduleCloneConstraintReportGroup[];
  logoSrc?: string | null;
}): Promise<void> {
  const blob = await generateScheduleCloneExceptionReportPDFBlob(args);
  previewPDFBlob(blob);
}

export async function downloadScheduleCloneExceptionReportPDF(args: {
  title: string;
  orgLine: string;
  stats: ScheduleCloneConstraintReportStats;
  groups: ScheduleCloneConstraintReportGroup[];
  logoSrc?: string | null;
}): Promise<void> {
  const blob = await generateScheduleCloneExceptionReportPDFBlob(args);
  downloadPDFBlob(blob, buildPdfFilename(args.title));
}

export async function printScheduleCloneExceptionReportPDF(args: {
  title: string;
  orgLine: string;
  stats: ScheduleCloneConstraintReportStats;
  groups: ScheduleCloneConstraintReportGroup[];
  logoSrc?: string | null;
}): Promise<void> {
  const blob = await generateScheduleCloneExceptionReportPDFBlob(args);
  printPDFBlob(blob);
}


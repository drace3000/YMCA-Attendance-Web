import { pdf } from "@react-pdf/renderer";

import { downloadPDFBlob, previewPDFBlob, printPDFBlob } from "@/lib/pdf-utils";
import { ScheduleConflictsChecklistPDFDocument } from "@/components/scheduling-conflicts-report/ScheduleConflictsChecklistPDFDocument";
import type { ConflictChecklistGroup } from "@/lib/schedule-conflicts-checklist-utils";

function buildPdfFilename(): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `${dateStr}.${timeStr}.Schedule_Conflicts_Checklist.pdf`;
}

export async function generateScheduleConflictsChecklistPDFBlob({
  title,
  contextLabel,
  branchName,
  reportPeriod,
  groups,
}: {
  title: string;
  contextLabel?: string;
  branchName?: string;
  reportPeriod?: string;
  groups: ConflictChecklistGroup[];
}): Promise<Blob> {
  const doc = (
    <ScheduleConflictsChecklistPDFDocument
      title={title}
      printedOnLabel={new Date().toLocaleString()}
      contextLabel={contextLabel}
      branchName={branchName}
      reportPeriod={reportPeriod}
      groups={groups}
    />
  );
  return await pdf(doc).toBlob();
}

export async function previewScheduleConflictsChecklistPDF(args: {
  title: string;
  contextLabel?: string;
  branchName?: string;
  reportPeriod?: string;
  groups: ConflictChecklistGroup[];
}): Promise<void> {
  const blob = await generateScheduleConflictsChecklistPDFBlob(args);
  previewPDFBlob(blob);
}

export async function downloadScheduleConflictsChecklistPDF(args: {
  title: string;
  contextLabel?: string;
  branchName?: string;
  reportPeriod?: string;
  groups: ConflictChecklistGroup[];
}): Promise<void> {
  const blob = await generateScheduleConflictsChecklistPDFBlob(args);
  downloadPDFBlob(blob, buildPdfFilename());
}

export async function printScheduleConflictsChecklistPDF(args: {
  title: string;
  contextLabel?: string;
  branchName?: string;
  reportPeriod?: string;
  groups: ConflictChecklistGroup[];
}): Promise<void> {
  const blob = await generateScheduleConflictsChecklistPDFBlob(args);
  printPDFBlob(blob);
}



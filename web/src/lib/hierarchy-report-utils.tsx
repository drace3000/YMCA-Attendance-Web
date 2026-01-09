/**
 * Hierarchy Report Utility Functions
 * Functions for generating PDF and Excel exports of organization hierarchy
 */

import { pdf } from "@react-pdf/renderer";
import * as XLSX from "xlsx";
import { HierarchyPDFDocument } from "@/components/hierarchy-report-pdf";
import {
  downloadPDFBlob,
  previewPDFBlob,
  printPDFBlob,
} from "./pdf-utils";

interface Alliance {
  id: string;
  code: string;
  name: string;
  alliance_type: "state" | "regional";
  headquarters_state_code: string | null;
  is_active: boolean;
}

interface Association {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  alliance_id: string | null;
  state_code: string;
  region: string | null;
  is_active: boolean;
}

interface Branch {
  id: string;
  code: string;
  short_code: string | null;
  name: string;
  short_name: string | null;
  association_id: string;
  address: string | null;
  city: string | null;
  state_code: string | null;
  zip: string | null;
  phone: string | null;
  is_active: boolean;
  is_main_branch: boolean;
}

export interface HierarchyReportData {
  alliances: Alliance[];
  associations: Association[];
  branches: Branch[];
}

/**
 * Generate PDF blob from hierarchy data
 */
export async function generateHierarchyPDFBlob(
  data: HierarchyReportData,
  themeColor?: string
): Promise<Blob> {
  const doc = (
    <HierarchyPDFDocument
      alliances={data.alliances}
      associations={data.associations}
      branches={data.branches}
      generatedAt={new Date()}
      themeColor={themeColor}
    />
  );
  return await pdf(doc).toBlob();
}

/**
 * Preview hierarchy report PDF in new tab
 */
export async function previewHierarchyPDF(
  data: HierarchyReportData,
  themeColor?: string
): Promise<void> {
  const blob = await generateHierarchyPDFBlob(data, themeColor);
  previewPDFBlob(blob);
}

/**
 * Download hierarchy report as PDF
 */
export async function downloadHierarchyPDF(
  data: HierarchyReportData,
  themeColor?: string
): Promise<void> {
  const blob = await generateHierarchyPDFBlob(data, themeColor);
  const timestamp = new Date().toISOString().split("T")[0];
  downloadPDFBlob(blob, `ymca-hierarchy-report-${timestamp}.pdf`);
}

/**
 * Print hierarchy report PDF
 */
export async function printHierarchyPDF(
  data: HierarchyReportData,
  themeColor?: string
): Promise<void> {
  const blob = await generateHierarchyPDFBlob(data, themeColor);
  printPDFBlob(blob);
}

/**
 * Format name with proper YMCA casing
 */
function formatNameWithYMCA(name: string): string {
  return name
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "ymca") return "YMCA";
      if (lower === "ymcas") return "YMCAs";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Export hierarchy data to Excel with multiple sheets
 */
export function buildHierarchyExcelWorkbook(data: HierarchyReportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryData = [
    { Metric: "Total Alliances", Count: data.alliances.length },
    { Metric: "Total Associations", Count: data.associations.length },
    { Metric: "Total Branches", Count: data.branches.length },
    { Metric: "Generated At", Count: new Date().toLocaleString() },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 20 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // Sheet 2: Alliances
  const allianceRows = data.alliances
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({
      Code: a.code,
      Name: formatNameWithYMCA(a.name),
      Type: a.alliance_type === "state" ? "State" : "Regional",
      "HQ State": a.headquarters_state_code ?? "",
      Active: a.is_active ? "Yes" : "No",
    }));
  const allianceSheet = XLSX.utils.json_to_sheet(allianceRows);
  allianceSheet["!cols"] = [
    { wch: 10 },
    { wch: 40 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, allianceSheet, "Alliances");

  // Sheet 3: Associations
  const associationRows = data.associations
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => {
      const alliance = data.alliances.find((al) => al.id === a.alliance_id);
      return {
        Code: a.code,
        Name: formatNameWithYMCA(a.name),
        "Short Name": a.short_name ?? "",
        Alliance: alliance ? formatNameWithYMCA(alliance.name) : "",
        State: a.state_code,
        Region: a.region ?? "",
        Active: a.is_active ? "Yes" : "No",
      };
    });
  const associationSheet = XLSX.utils.json_to_sheet(associationRows);
  associationSheet["!cols"] = [
    { wch: 10 },
    { wch: 40 },
    { wch: 20 },
    { wch: 35 },
    { wch: 8 },
    { wch: 15 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, associationSheet, "Associations");

  // Sheet 4: Branches
  const branchRows = data.branches
    .sort((a, b) => (a.short_code ?? a.code).localeCompare(b.short_code ?? b.code))
    .map((b) => {
      const association = data.associations.find((a) => a.id === b.association_id);
      return {
        Code: b.short_code ?? b.code,
        Name: formatNameWithYMCA(b.name),
        "Short Name": b.short_name ?? "",
        Association: association ? formatNameWithYMCA(association.name) : "",
        Address: b.address ?? "",
        City: b.city ?? "",
        State: b.state_code ?? "",
        ZIP: b.zip ?? "",
        Phone: b.phone ?? "",
        "Main Branch": b.is_main_branch ? "Yes" : "No",
        Active: b.is_active ? "Yes" : "No",
      };
    });
  const branchSheet = XLSX.utils.json_to_sheet(branchRows);
  branchSheet["!cols"] = [
    { wch: 12 },
    { wch: 35 },
    { wch: 20 },
    { wch: 30 },
    { wch: 28 },
    { wch: 15 },
    { wch: 8 },
    { wch: 10 },
    { wch: 15 },
    { wch: 12 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, branchSheet, "Branches");

  // Sheet 5: Full Hierarchy (flattened view)
  const hierarchyRows: Array<{
    Alliance: string;
    "Alliance Code": string;
    Association: string;
    "Assoc Code": string;
    Branch: string;
    "Branch Code": string;
    Address: string;
    City: string;
    State: string;
    ZIP: string;
    Phone: string;
  }> = [];

  data.alliances
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach((alliance) => {
      const allianceAssocs = data.associations
        .filter((a) => a.alliance_id === alliance.id)
        .sort((a, b) => a.code.localeCompare(b.code));

      allianceAssocs.forEach((assoc) => {
        const assocBranches = data.branches
          .filter((b) => b.association_id === assoc.id)
          .sort((a, b) =>
            (a.short_code ?? a.code).localeCompare(b.short_code ?? b.code)
          );

        if (assocBranches.length === 0) {
          hierarchyRows.push({
            Alliance: formatNameWithYMCA(alliance.name),
            "Alliance Code": alliance.code,
            Association: formatNameWithYMCA(assoc.name),
            "Assoc Code": assoc.code,
            Branch: "",
            "Branch Code": "",
            Address: "",
            City: "",
            State: "",
            ZIP: "",
            Phone: "",
          });
        } else {
          assocBranches.forEach((branch) => {
            hierarchyRows.push({
              Alliance: formatNameWithYMCA(alliance.name),
              "Alliance Code": alliance.code,
              Association: formatNameWithYMCA(assoc.name),
              "Assoc Code": assoc.code,
              Branch: formatNameWithYMCA(branch.name),
              "Branch Code": branch.short_code ?? branch.code,
              Address: branch.address ?? "",
              City: branch.city ?? "",
              State: branch.state_code ?? "",
              ZIP: branch.zip ?? "",
              Phone: branch.phone ?? "",
            });
          });
        }
      });
    });

  const hierarchySheet = XLSX.utils.json_to_sheet(hierarchyRows);
  hierarchySheet["!cols"] = [
    { wch: 35 },
    { wch: 12 },
    { wch: 35 },
    { wch: 10 },
    { wch: 30 },
    { wch: 12 },
    { wch: 28 },
    { wch: 15 },
    { wch: 8 },
    { wch: 10 },
    { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(wb, hierarchySheet, "Full Hierarchy");

  return wb;
}

export function downloadHierarchyExcel(data: HierarchyReportData, fileName?: string): void {
  const wb = buildHierarchyExcelWorkbook(data);
  const timestamp = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, fileName ?? `ymca-hierarchy-report-${timestamp}.xlsx`);
}

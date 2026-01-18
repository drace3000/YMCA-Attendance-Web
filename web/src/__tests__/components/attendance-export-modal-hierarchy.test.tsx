import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { GenerateReportModal } from "@/components/attendance-report-pdf/GenerateReportModal";

// Avoid triggering PDF generation / email modal internals
vi.mock("@/lib/attendance-report-pdf-utils", () => ({
  downloadAttendanceReportPDF: vi.fn(),
  previewAttendanceReportPDF: vi.fn(),
  printAttendanceReportPDF: vi.fn(),
  generateAttendanceReportPDFBlob: vi.fn(async () => new Blob()),
}));

describe("Export Attendance Insights Report modal hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Alliance / Association / Branch lines in the report info block", () => {
    render(
      <GenerateReportModal
        isOpen
        onClose={() => {}}
        branchId="br-1"
        allianceName="Alliance of New York State YMCAs"
        associationName="YMCA of Greater Rochester"
        branchName="Eastside Family YMCA"
        data={{
          monthTotals: {
            totalAttendance: 0,
            overallAvg: 0,
            sessionsWithHeadcount: 0,
            locationAverages: [],
          },
          dayTotals: { perDay: [], total: 0, overallAvg: 0 },
          saturdayAverages: { locations: [], totalClassAvg: 0 },
          sundayAverages: { locations: [], totalClassAvg: 0 },
          monthClassTypeAverage: [],
          monthClassGroupAverage: [],
          weekTotals: [],
        }}
        filters={{
          year: "2025",
          quarter: "all",
          month: "all",
          week: "all",
          day: "all",
          instructor: "all",
        }}
        selectedSections={["monthTotals"]}
      />,
    );

    expect(screen.getByText(/export attendance insights report/i)).toBeInTheDocument();
    expect(screen.getByText(/alliance:/i)).toBeInTheDocument();
    expect(screen.getByText(/association:/i)).toBeInTheDocument();
    expect(screen.getByText(/branch:/i)).toBeInTheDocument();

    expect(screen.getByText(/Alliance of New York State YMCAs/)).toBeInTheDocument();
    expect(screen.getByText(/YMCA of Greater Rochester/)).toBeInTheDocument();
    expect(screen.getByText(/Eastside Family YMCA/)).toBeInTheDocument();
  });
});


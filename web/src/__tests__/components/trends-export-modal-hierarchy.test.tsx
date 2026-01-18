import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { GenerateTrendsReportModal } from "@/components/trends-report-pdf/GenerateTrendsReportModal";

// Avoid triggering PDF generation / email modal internals
vi.mock("@/lib/trends-report-pdf-utils", () => ({
  downloadTrendsReportPDF: vi.fn(),
  previewTrendsReportPDF: vi.fn(),
  printTrendsReportPDF: vi.fn(),
  generateTrendsReportPDFBlob: vi.fn(async () => new Blob()),
}));

describe("GenerateTrendsReportModal hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows hierarchy in the export popup", () => {
    render(
      <GenerateTrendsReportModal
        isOpen
        onClose={() => {}}
        branchId="br-1"
        data={{
          year: 2025,
          periodLabel: "2025 (Jan–Dec)",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          topUp: [],
          topDown: [],
          computedAt: new Date().toISOString(),
          allianceName: "Alliance of New York State YMCAs",
          associationName: "YMCA of Greater Rochester",
          branchName: "Eastside Family YMCA",
        }}
      />,
    );

    expect(screen.getByText(/export trends report/i)).toBeInTheDocument();
    expect(screen.getByText(/alliance:/i)).toBeInTheDocument();
    expect(screen.getByText(/association:/i)).toBeInTheDocument();
    expect(screen.getByText(/branch:/i)).toBeInTheDocument();
    expect(screen.getByText(/Alliance of New York State YMCAs/)).toBeInTheDocument();
    expect(screen.getByText(/YMCA of Greater Rochester/)).toBeInTheDocument();
    expect(screen.getByText(/Eastside Family YMCA/)).toBeInTheDocument();
  });
});


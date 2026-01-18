import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { GenerateHolidayScheduleModal } from "@/components/holiday-schedule-pdf/GenerateHolidayScheduleModal";

vi.mock("@/lib/holiday-schedule-pdf-utils", () => ({
  downloadHolidaySchedulePDF: vi.fn(),
  previewHolidaySchedulePDF: vi.fn(),
  printHolidaySchedulePDF: vi.fn(),
  generateHolidaySchedulePDFBlob: vi.fn(async () => new Blob()),
}));

describe("GenerateHolidayScheduleModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows hierarchy and year context in the export popup", () => {
    render(
      <GenerateHolidayScheduleModal
        isOpen
        onClose={() => {}}
        branchId="br-1"
        data={{
          year: "2026",
          generatedAtIso: new Date().toISOString(),
          allianceName: "Alliance of New York State YMCAs",
          associationName: "YMCA of Greater Rochester",
          branchName: "Eastside Family YMCA",
          holidays: [],
        }}
      />,
    );

    expect(screen.getByText(/export holiday schedule/i)).toBeInTheDocument();
    expect(screen.getByText(/alliance:/i)).toBeInTheDocument();
    expect(screen.getByText(/association:/i)).toBeInTheDocument();
    expect(screen.getByText(/branch:/i)).toBeInTheDocument();
    expect(screen.getByText(/year:/i)).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText(/Alliance of New York State YMCAs/)).toBeInTheDocument();
    expect(screen.getByText(/YMCA of Greater Rochester/)).toBeInTheDocument();
    expect(screen.getByText(/Eastside Family YMCA/)).toBeInTheDocument();
  });
});



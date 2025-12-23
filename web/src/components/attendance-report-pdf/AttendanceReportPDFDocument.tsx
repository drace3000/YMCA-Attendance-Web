/**
 * Attendance Report PDF Document Component
 * 8.5x11 (Letter) portrait format for professional reporting
 */

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const THEME_COLOR = "#01A490";

const ALL_SECTION_COUNT = 7;

const SECTION_LABELS: Record<ReportSection, string> = {
  saturdayAverages: "Saturday Averages",
  dayTotals: "Day Totals / Day Average",
  sundayAverages: "Sunday Averages",
  monthTotals: "Month Totals",
  monthClassTypeAverage: "Month Class Type Average",
  monthClassGroupAverage: "Month Class Group Average",
  weekTotals: "Week Totals",
};

export interface ReportData {
  monthTotals: {
    totalAttendance: number;
    overallAvg: number;
    sessionsWithHeadcount: number;
    locationAverages: { location: string; avg: number; sessions: number }[];
  };
  dayTotals: {
    perDay: { day: string; total: number; avg: number; sessions: number }[];
    total: number;
    overallAvg: number;
  };
  saturdayAverages: {
    locations: { location: string; avg: number; sessions: number }[];
    totalClassAvg: number;
  };
  sundayAverages: {
    locations: { location: string; avg: number; sessions: number }[];
    totalClassAvg: number;
  };
  monthClassTypeAverage: { name: string; avg: number }[];
  monthClassGroupAverage: { group: string; avg: number }[];
  weekTotals: { label: string; total: number }[];
}

export interface FilterInfo {
  year: string;
  quarter: string;
  month: string;
  week: string;
  day: string;
  instructor: string;
}

export type ReportSection =
  | "saturdayAverages"
  | "dayTotals"
  | "sundayAverages"
  | "monthTotals"
  | "monthClassTypeAverage"
  | "monthClassGroupAverage"
  | "weekTotals";

interface AttendanceReportPDFProps {
  data: ReportData;
  filters: FilterInfo;
  selectedSections: ReportSection[];
}

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    paddingVertical: 30,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
  },
  // Fixed header that repeats on each page (in normal flow, not absolute)
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    marginBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: THEME_COLOR,
  },
  pageHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 40,
    height: 40,
    marginRight: 10,
  },
  headerTitleBlock: {
    flexDirection: "column",
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: THEME_COLOR,
  },
  headerSubtitle: {
    fontSize: 8,
    color: "#666666",
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  reportType: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
  },
  reportPeriod: {
    fontSize: 8,
    color: "#666666",
    marginTop: 2,
  },
  // Content area - no special styling needed, page padding handles spacing
  content: {
  },
  // Filters bar
  filtersBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F5F5F5",
    padding: 8,
    marginBottom: 15,
    borderRadius: 4,
  },
  filterItem: {
    flexDirection: "row",
    marginRight: 15,
    marginBottom: 2,
  },
  filterLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
  },
  filterValue: {
    fontSize: 8,
    color: "#666666",
    marginLeft: 3,
  },
  // Report summary
  reportSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  summaryLeft: {
    flexDirection: "column",
  },
  summaryTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
  },
  summaryDetail: {
    fontSize: 8,
    color: "#666666",
    marginTop: 2,
  },
  summaryRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  sectionsList: {
    fontSize: 7,
    color: "#888888",
    maxWidth: 250,
    textAlign: "right",
  },
  // Two-column layout
  twoColumnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  halfWidthSection: {
    width: "48%",
  },
  // Section container
  section: {
    marginBottom: 15,
  },
  sectionCompact: {
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    backgroundColor: THEME_COLOR,
    padding: 6,
    marginBottom: 0,
  },
  // Table styles
  table: {
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderTopWidth: 0,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#E8E8E8",
    borderBottomWidth: 1,
    borderBottomColor: "#CCCCCC",
    minHeight: 22,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    minHeight: 20,
    alignItems: "center",
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    backgroundColor: "#FAFAFA",
    minHeight: 20,
    alignItems: "center",
  },
  tableCell: {
    fontSize: 9,
    padding: 5,
    flex: 1,
  },
  tableCellHeader: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    padding: 5,
    flex: 1,
    color: "#333333",
  },
  tableCellRight: {
    fontSize: 9,
    padding: 5,
    flex: 1,
    textAlign: "right",
  },
  tableCellHeaderRight: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    padding: 5,
    flex: 1,
    textAlign: "right",
    color: "#333333",
  },
  // Day matrix specific
  matrixHeader: {
    flexDirection: "row",
    backgroundColor: "#E8E8E8",
    borderBottomWidth: 1,
    borderBottomColor: "#CCCCCC",
    minHeight: 22,
  },
  matrixCell: {
    fontSize: 8,
    padding: 4,
    width: 52,
    textAlign: "center",
  },
  matrixCellHeader: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    padding: 4,
    width: 52,
    textAlign: "center",
    color: "#333333",
  },
  matrixLabelCell: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    padding: 4,
    width: 75,
    color: "#333333",
  },
  // Footer - positioned at bottom
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#CCCCCC",
  },
  footerText: {
    fontSize: 8,
    color: "#999999",
  },
});

function formatPrintDateTime(): string {
  const now = new Date();
  return (
    now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " at " +
    now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  );
}

function formatFilterDisplay(filters: FilterInfo): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  
  items.push({ label: "Year:", value: filters.year });
  
  if (filters.quarter !== "all") {
    items.push({ label: "Quarter:", value: `Q${filters.quarter}` });
  }
  if (filters.month !== "all") {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthNum = parseInt(filters.month, 10);
    items.push({ label: "Month:", value: monthNames[monthNum - 1] || filters.month });
  }
  if (filters.week !== "all") {
    items.push({ label: "Week:", value: `Week ${filters.week}` });
  }
  if (filters.day !== "all") {
    const dayName = filters.day.charAt(0) + filters.day.slice(1).toLowerCase();
    items.push({ label: "Day:", value: dayName });
  }
  if (filters.instructor !== "all") {
    items.push({ label: "Instructor:", value: "Filtered" });
  }
  
  return items;
}

function formatReportPeriod(filters: FilterInfo): string {
  const parts: string[] = [];
  
  if (filters.month !== "all") {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthNum = parseInt(filters.month, 10);
    parts.push(monthNames[monthNum - 1] || filters.month);
  } else if (filters.quarter !== "all") {
    parts.push(`Q${filters.quarter}`);
  } else if (filters.week !== "all") {
    parts.push(`Week ${filters.week}`);
  }
  
  parts.push(filters.year);
  
  if (filters.day !== "all") {
    const dayName = filters.day.charAt(0) + filters.day.slice(1).toLowerCase() + "s";
    parts.push(`(${dayName} only)`);
  }
  
  return parts.join(" ");
}

// Table component with page-aware title
function ReportTable({ 
  title, 
  columns, 
  rows,
  rightAlignLast = true,
  compact = false,
}: { 
  title: string;
  columns: string[];
  rows: string[][];
  rightAlignLast?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={compact ? styles.sectionCompact : styles.section}>
      {/* Section title - shows (continued) if not first occurrence on page */}
      <Text 
        style={styles.sectionTitle}
        render={({ subPageNumber }) => 
          subPageNumber && subPageNumber > 1 
            ? `${title} (continued)` 
            : title
        }
      />
      <View style={styles.table}>
        {/* Table header - repeats on each page */}
        <View style={styles.tableHeader} fixed>
          {columns.map((col, i) => (
            <Text 
              key={i} 
              style={rightAlignLast && i === columns.length - 1 
                ? styles.tableCellHeaderRight 
                : styles.tableCellHeader
              }
            >
              {col}
            </Text>
          ))}
        </View>
        {/* Table rows */}
        {rows.map((row, idx) => (
          <View 
            key={idx} 
            style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            wrap={false}
          >
            {row.map((cell, i) => (
              <Text 
                key={i} 
                style={rightAlignLast && i === row.length - 1 
                  ? styles.tableCellRight 
                  : styles.tableCell
                }
              >
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// Two-column row wrapper
function TwoColumnRow({ 
  left, 
  right 
}: { 
  left: React.ReactNode; 
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.twoColumnRow}>
      <View style={styles.halfWidthSection}>{left}</View>
      {right && <View style={styles.halfWidthSection}>{right}</View>}
    </View>
  );
}

// Report section components using the ReportTable
function SaturdayAveragesSection({ data, compact = false }: { data: ReportData; compact?: boolean }) {
  const rows = [
    ...data.saturdayAverages.locations.map((r) => [r.location, r.avg.toFixed(2)]),
    ["Total Class Avg", data.saturdayAverages.totalClassAvg.toFixed(2)],
  ];
  
  return (
    <ReportTable
      title="Saturday Averages"
      columns={["Location", "Average"]}
      rows={rows}
      compact={compact}
    />
  );
}

function SundayAveragesSection({ data, compact = false }: { data: ReportData; compact?: boolean }) {
  const rows = [
    ...data.sundayAverages.locations.map((r) => [r.location, r.avg.toFixed(2)]),
    ["Total Class Avg", data.sundayAverages.totalClassAvg.toFixed(2)],
  ];
  
  return (
    <ReportTable
      title="Sunday Averages"
      columns={["Location", "Average"]}
      rows={rows}
      compact={compact}
    />
  );
}

function DayTotalsSection({ data }: { data: ReportData }) {
  const days = data.dayTotals.perDay.length
    ? data.dayTotals.perDay
    : [
        { day: "MONDAY", total: 0, avg: 0, sessions: 0 },
        { day: "TUESDAY", total: 0, avg: 0, sessions: 0 },
        { day: "WEDNESDAY", total: 0, avg: 0, sessions: 0 },
        { day: "THURSDAY", total: 0, avg: 0, sessions: 0 },
        { day: "FRIDAY", total: 0, avg: 0, sessions: 0 },
        { day: "SATURDAY", total: 0, avg: 0, sessions: 0 },
        { day: "SUNDAY", total: 0, avg: 0, sessions: 0 },
      ];

  return (
    <View style={styles.section}>
      <Text 
        style={styles.sectionTitle}
        render={({ subPageNumber }) => 
          subPageNumber && subPageNumber > 1 
            ? "Day Totals / Day Average (continued)" 
            : "Day Totals / Day Average"
        }
      />
      <View style={styles.table}>
        <View style={styles.matrixHeader} fixed>
          <Text style={styles.matrixLabelCell}></Text>
          {days.map((d) => (
            <Text key={d.day} style={styles.matrixCellHeader}>
              {d.day.slice(0, 3)}
            </Text>
          ))}
          <Text style={styles.matrixCellHeader}>Total</Text>
          <Text style={styles.matrixCellHeader}>Avg</Text>
        </View>
        <View style={styles.tableRow} wrap={false}>
          <Text style={styles.matrixLabelCell}>Day Totals</Text>
          {days.map((d) => (
            <Text key={d.day} style={styles.matrixCell}>
              {d.total}
            </Text>
          ))}
          <Text style={styles.matrixCell}>{data.dayTotals.total}</Text>
          <Text style={styles.matrixCell}>{data.dayTotals.overallAvg.toFixed(2)}</Text>
        </View>
        <View style={styles.tableRowAlt} wrap={false}>
          <Text style={styles.matrixLabelCell}>Day Average</Text>
          {days.map((d) => (
            <Text key={d.day} style={styles.matrixCell}>
              {d.avg.toFixed(2)}
            </Text>
          ))}
          <Text style={styles.matrixCell}></Text>
          <Text style={styles.matrixCell}>{data.dayTotals.overallAvg.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
}

function MonthTotalsSection({ data, compact = false }: { data: ReportData; compact?: boolean }) {
  const rows = [
    ["All Classes", data.monthTotals.totalAttendance.toString()],
    ...data.monthTotals.locationAverages.map((r) => [`${r.location} Avg`, r.avg.toFixed(2)]),
    ["Total Class Avg", data.monthTotals.overallAvg.toFixed(2)],
  ];
  
  return (
    <ReportTable
      title="Month Totals"
      columns={["Metric", "Value"]}
      rows={rows}
      compact={compact}
    />
  );
}

function MonthClassTypeAverageSection({ data, compact = false }: { data: ReportData; compact?: boolean }) {
  const rows = data.monthClassTypeAverage.map((r) => [r.name, r.avg.toFixed(2)]);
  
  return (
    <ReportTable
      title="Month Class Type Average"
      columns={["Class Type", "Average"]}
      rows={rows}
      compact={compact}
    />
  );
}

function MonthClassGroupAverageSection({ data, compact = false }: { data: ReportData; compact?: boolean }) {
  const rows = data.monthClassGroupAverage.map((r) => [r.group, r.avg.toFixed(2)]);
  
  return (
    <ReportTable
      title="Month Class Group Average"
      columns={["Group", "Average"]}
      rows={rows}
      compact={compact}
    />
  );
}

function WeekTotalsSection({ data, compact = false }: { data: ReportData; compact?: boolean }) {
  const rows = data.weekTotals.map((r) => [r.label, r.total.toString()]);
  
  return (
    <ReportTable
      title="Week Totals"
      columns={["Week", "Total"]}
      rows={rows}
      compact={compact}
    />
  );
}

export function AttendanceReportPDFDocument({
  data,
  filters,
  selectedSections,
}: AttendanceReportPDFProps) {
  const printDateTime = formatPrintDateTime();
  const filterItems = formatFilterDisplay(filters);
  const reportPeriod = formatReportPeriod(filters);
  const isFullReport = selectedSections.length === ALL_SECTION_COUNT;
  const includedSectionNames = selectedSections.map(s => SECTION_LABELS[s]).join(", ");

  // Check which sections are selected
  const has = (section: ReportSection) => selectedSections.includes(section);
  
  // Render sections in optimized two-column layout
  const renderSections = () => {
    const elements: React.ReactNode[] = [];
    
    // Row 1: Saturday + Sunday Averages (side by side)
    if (has("saturdayAverages") || has("sundayAverages")) {
      if (has("saturdayAverages") && has("sundayAverages")) {
        elements.push(
          <TwoColumnRow
            key="row-sat-sun"
            left={<SaturdayAveragesSection data={data} compact />}
            right={<SundayAveragesSection data={data} compact />}
          />
        );
      } else if (has("saturdayAverages")) {
        elements.push(
          <TwoColumnRow
            key="row-sat"
            left={<SaturdayAveragesSection data={data} compact />}
          />
        );
      } else {
        elements.push(
          <TwoColumnRow
            key="row-sun"
            left={<SundayAveragesSection data={data} compact />}
          />
        );
      }
    }
    
    // Row 2: Day Totals (full width - wide matrix)
    if (has("dayTotals")) {
      elements.push(<DayTotalsSection key="dayTotals" data={data} />);
    }
    
    // Row 3: Month Totals | (Month Class Group Average + Week Totals stacked)
    if (has("monthTotals") || has("monthClassGroupAverage") || has("weekTotals")) {
      const rightColumn = (
        <>
          {has("monthClassGroupAverage") && <MonthClassGroupAverageSection data={data} compact />}
          {has("weekTotals") && <WeekTotalsSection data={data} compact />}
        </>
      );
      const hasRightContent = has("monthClassGroupAverage") || has("weekTotals");
      
      if (has("monthTotals")) {
        elements.push(
          <TwoColumnRow
            key="row-month-group-week"
            left={<MonthTotalsSection data={data} compact />}
            right={hasRightContent ? rightColumn : undefined}
          />
        );
      } else if (hasRightContent) {
        elements.push(
          <TwoColumnRow
            key="row-group-week"
            left={rightColumn}
          />
        );
      }
    }
    
    // Row 5: Month Class Type Average (full width - potentially many rows)
    if (has("monthClassTypeAverage")) {
      elements.push(<MonthClassTypeAverageSection key="monthClassType" data={data} />);
    }
    
    return elements;
  };

  return (
    <Document>
      <Page size="LETTER" orientation="portrait" style={styles.page}>
        {/* Page Header - on first page only */}
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderLeft}>
            <Image style={styles.logo} src="/assets/images/ymca-logo.v2.png" />
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>Attendance Insights Report</Text>
              <Text style={styles.headerSubtitle}>YMCA Attendance System</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.reportType}>
              {isFullReport ? "Full Report" : `Partial Report (${selectedSections.length} of ${ALL_SECTION_COUNT})`}
            </Text>
            <Text style={styles.reportPeriod}>{reportPeriod}</Text>
          </View>
        </View>

        {/* Content Area */}
        <View style={styles.content}>
          {/* Filters Bar */}
          <View style={styles.filtersBar}>
            {filterItems.map((item, idx) => (
              <View key={idx} style={styles.filterItem}>
                <Text style={styles.filterLabel}>{item.label}</Text>
                <Text style={styles.filterValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          {/* Report Summary */}
          <View style={styles.reportSummary}>
            <View style={styles.summaryLeft}>
              <Text style={styles.summaryTitle}>
                {isFullReport ? "Complete Attendance Report" : "Selected Reports Summary"}
              </Text>
              <Text style={styles.summaryDetail}>
                {selectedSections.length} report section{selectedSections.length !== 1 ? "s" : ""} included
              </Text>
            </View>
            {!isFullReport && (
              <View style={styles.summaryRight}>
                <Text style={styles.sectionsList}>
                  Includes: {includedSectionNames}
                </Text>
              </View>
            )}
          </View>

          {/* Report Sections - organized in two-column layout */}
          {renderSections()}
        </View>

        {/* Footer - fixed to show on all pages */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Printed: {printDateTime}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export default AttendanceReportPDFDocument;

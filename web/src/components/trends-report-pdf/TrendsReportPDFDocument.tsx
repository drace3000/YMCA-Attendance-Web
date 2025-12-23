/**
 * Trends Report PDF Document Component
 * 8.5x11 (Letter) portrait format for professional reporting
 * Two pages: Page 1 = Trending Up, Page 2 = Trending Down
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

// Colors matching chart legend
const SERIES_COLORS = ["#2563eb", "#16a34a", "#f97316", "#a855f7", "#ef4444"];

export interface TrendItem {
  classId: string;
  className: string;
  slope: number;
  delta: number;
  totalSessions: number;
  monthlyAvg: number[];
  monthSessions: number[];
}

export interface TrendsReportData {
  year: number;
  quarter?: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  topUp: TrendItem[];
  topDown: TrendItem[];
  computedAt: string;
  branchName?: string;
  branchManager?: string;
}

export interface TrendsReportPDFProps {
  data: TrendsReportData;
  chartImages?: {
    trendingUp?: string;
    trendingDown?: string;
  };
}

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    paddingVertical: 30,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
  },
  // Header
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
  // Context bar
  contextBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F5F5F5",
    padding: 8,
    marginBottom: 15,
    borderRadius: 4,
  },
  contextItem: {
    flexDirection: "row",
    marginRight: 20,
    marginBottom: 2,
  },
  contextLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
  },
  contextValue: {
    fontSize: 8,
    color: "#666666",
    marginLeft: 3,
  },
  // Chart section
  chartBlock: {
    marginBottom: 20,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: THEME_COLOR,
  },
  chartTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: THEME_COLOR,
  },
  chartSubtitle: {
    fontSize: 9,
    color: "#666666",
    marginLeft: 10,
  },
  chartImage: {
    width: "100%",
    height: 220,
    objectFit: "contain",
  },
  chartPlaceholder: {
    width: "100%",
    height: 220,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  chartPlaceholderText: {
    fontSize: 10,
    color: "#999999",
  },
  // Section
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    backgroundColor: THEME_COLOR,
    padding: 8,
    marginBottom: 0,
  },
  // Table - full width with wider columns
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
    minHeight: 28,
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    minHeight: 26,
    alignItems: "center",
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    backgroundColor: "#FAFAFA",
    minHeight: 26,
    alignItems: "center",
  },
  // Wide class name column
  tableCellClass: {
    fontSize: 10,
    padding: 6,
    width: 200,
  },
  tableCellClassHeader: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    padding: 6,
    width: 200,
    color: "#333333",
  },
  // Data columns - equal width
  tableCellData: {
    fontSize: 10,
    padding: 6,
    width: 70,
    textAlign: "right",
  },
  tableCellDataHeader: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    padding: 6,
    width: 70,
    textAlign: "right",
    color: "#333333",
  },
  // Footer
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
  // Page 2 header (smaller)
  page2Header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLOR,
  },
  page2Title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: THEME_COLOR,
  },
  page2Subtitle: {
    fontSize: 8,
    color: "#666666",
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

function calculatePercentChange(item: TrendItem): number {
  const firstIdx = item.monthSessions.findIndex((s) => (s ?? 0) > 0);
  const lastIdx =
    item.monthSessions.length -
    1 -
    [...item.monthSessions].reverse().findIndex((s) => (s ?? 0) > 0);
  if (
    firstIdx < 0 ||
    lastIdx < 0 ||
    firstIdx >= item.monthlyAvg.length ||
    lastIdx >= item.monthlyAvg.length
  ) {
    return 0;
  }
  const firstVal = item.monthlyAvg[firstIdx] ?? 0;
  const lastVal = item.monthlyAvg[lastIdx] ?? 0;
  if (firstVal === 0) return 0;
  return ((lastVal - firstVal) / firstVal) * 100;
}

function TrendTable({
  title,
  items,
  tone,
}: {
  title: string;
  items: TrendItem[];
  tone: "up" | "down";
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.tableCellClassHeader}>Class</Text>
          <Text style={styles.tableCellDataHeader}>Slope</Text>
          <Text style={styles.tableCellDataHeader}>Δ</Text>
          <Text style={styles.tableCellDataHeader}>%</Text>
          <Text style={styles.tableCellDataHeader}>Sessions</Text>
        </View>
        {items.map((item, idx) => {
          const pct = calculatePercentChange(item);
          const classColor = SERIES_COLORS[idx % SERIES_COLORS.length];
          return (
            <View
              key={item.classId}
              style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              wrap={false}
            >
              <Text style={[styles.tableCellClass, { color: classColor, fontFamily: "Helvetica-Bold" }]}>
                {item.className}
              </Text>
              <Text style={styles.tableCellData}>{item.slope.toFixed(3)}</Text>
              <Text
                style={[
                  styles.tableCellData,
                  { color: tone === "up" ? "#16a34a" : "#dc2626" },
                ]}
              >
                {item.delta >= 0 ? "+" : ""}
                {item.delta.toFixed(2)}
              </Text>
              <Text
                style={[
                  styles.tableCellData,
                  { color: pct >= 0 ? "#16a34a" : "#dc2626" },
                ]}
              >
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(1)}%
              </Text>
              <Text style={styles.tableCellData}>{item.totalSessions}</Text>
            </View>
          );
        })}
        {items.length === 0 && (
          <View style={styles.tableRow}>
            <Text style={[styles.tableCellClass, { width: "100%", textAlign: "center", color: "#999" }]}>
              No data available
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function TrendsReportPDFDocument({
  data,
  chartImages,
}: TrendsReportPDFProps) {
  const printDateTime = formatPrintDateTime();

  const contextItems = [
    ...(data.branchName ? [{ label: "Branch:", value: data.branchName }] : []),
    ...(data.branchManager ? [{ label: "Manager:", value: data.branchManager }] : []),
    { label: "Year:", value: String(data.year) },
    ...(data.quarter ? [{ label: "Quarter:", value: `Q${data.quarter}` }] : []),
    { label: "Period:", value: `${data.periodStart} to ${data.periodEnd}` },
  ];

  return (
    <Document>
      {/* PAGE 1: Trending Up */}
      <Page size="LETTER" orientation="portrait" style={styles.page}>
        {/* Header */}
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderLeft}>
            <Image style={styles.logo} src="/assets/images/ymca-logo.v2.png" />
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>Class Attendance Trends Report</Text>
              <Text style={styles.headerSubtitle}>YMCA Scheduling &amp; Attendance System</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {data.branchName && <Text style={styles.reportType}>{data.branchName}</Text>}
            {data.branchManager && <Text style={styles.reportPeriod}>Manager: {data.branchManager}</Text>}
            <Text style={styles.reportPeriod}>{data.periodLabel}</Text>
          </View>
        </View>

        {/* Context Bar */}
        <View style={styles.contextBar}>
          {contextItems.map((item, idx) => (
            <View key={idx} style={styles.contextItem}>
              <Text style={styles.contextLabel}>{item.label}</Text>
              <Text style={styles.contextValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Trending Up Chart */}
        <View style={styles.chartBlock}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Top 5 Trending Up</Text>
            <Text style={styles.chartSubtitle}>Classes with highest positive slope</Text>
          </View>
          {chartImages?.trendingUp ? (
            <Image style={styles.chartImage} src={chartImages.trendingUp} />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Text style={styles.chartPlaceholderText}>Chart not available</Text>
            </View>
          )}
        </View>

        {/* Trending Up Table */}
        <TrendTable title="Trending Up Statistics" items={data.topUp} tone="up" />

        {/* Footer */}
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

      {/* PAGE 2: Trending Down */}
      <Page size="LETTER" orientation="portrait" style={styles.page}>
        {/* Smaller header for page 2 */}
        <View style={styles.page2Header}>
          <View>
            <Text style={styles.page2Title}>Class Attendance Trends Report</Text>
            <Text style={styles.page2Subtitle}>{data.periodLabel}</Text>
          </View>
        </View>

        {/* Trending Down Chart */}
        <View style={styles.chartBlock}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Top 5 Trending Down</Text>
            <Text style={styles.chartSubtitle}>Classes with lowest negative slope</Text>
          </View>
          {chartImages?.trendingDown ? (
            <Image style={styles.chartImage} src={chartImages.trendingDown} />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Text style={styles.chartPlaceholderText}>Chart not available</Text>
            </View>
          )}
        </View>

        {/* Trending Down Table */}
        <TrendTable title="Trending Down Statistics" items={data.topDown} tone="down" />

        {/* Footer */}
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

export default TrendsReportPDFDocument;

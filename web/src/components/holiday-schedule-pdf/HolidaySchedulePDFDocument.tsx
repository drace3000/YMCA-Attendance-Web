import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const THEME_COLOR = "#01A490";

export type HolidayScheduleRow = {
  holiday_date: string; // YYYY-MM-DD
  observed_date: string | null; // YYYY-MM-DD
  name: string;
  notes: string | null;
  is_active: boolean;
  is_closed: boolean;
  closed_start_time: string | null; // HH:mm
  closed_end_time: string | null; // HH:mm
};

export type HolidayScheduleReportData = {
  year: string; // YYYY
  generatedAtIso: string;
  allianceName?: string;
  associationName?: string;
  branchName?: string;
  holidays: HolidayScheduleRow[];
};

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    paddingVertical: 30,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    color: "#111827",
  },
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
  hierarchyLine: {
    fontSize: 7,
    color: "#666666",
    marginTop: 2,
  },
  printedOn: {
    fontSize: 7,
    color: "#888888",
    marginTop: 3,
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
  content: {},
  table: {
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerRow: {
    backgroundColor: "#f9fafb",
  },
  // Column sizing tuned to avoid overlap while keeping names readable.
  // Total = 100%
  cellDate: { width: "18%", paddingRight: 8 },
  cellName: { width: "34%", paddingRight: 8 },
  cellObserved: { width: "16%", paddingRight: 8 },
  cellClosed: { width: "14%", paddingRight: 8 },
  cellNotes: { width: "18%" },
  cellText: { fontSize: 9, lineHeight: 1.25 },
  headerText: { fontWeight: "bold", fontSize: 9 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#6b7280",
    textAlign: "center",
  },
});

function formatClosed(row: HolidayScheduleRow): string {
  if (!row.is_closed) return "Not closed";
  const s = (row.closed_start_time ?? "").trim();
  const e = (row.closed_end_time ?? "").trim();
  if (s && e) return `Partial ${s}–${e}`;
  return "Closed";
}

function formatIsoDateMmDdYyyy(value: string | null | undefined): string {
  const v = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const yyyy = v.slice(0, 4);
  const mm = v.slice(5, 7);
  const dd = v.slice(8, 10);
  return `${mm}/${dd}/${yyyy}`;
}

function formatPrintDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " at " +
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  );
}

export function HolidaySchedulePDFDocument({
  data,
}: {
  data: HolidayScheduleReportData;
}) {
  const printDateTime = formatPrintDateTime(data.generatedAtIso);

  const rows = (data.holidays ?? [])
    .slice()
    .sort((a, b) => String(a.holiday_date).localeCompare(String(b.holiday_date)));

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Page Header (repeats on each page) */}
        <View style={styles.pageHeader} fixed>
          <View style={styles.pageHeaderLeft}>
            <Image style={styles.logo} src="/assets/images/ymca-logo.v2.png" />
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>Holiday Schedule Report</Text>
              <Text style={styles.headerSubtitle}>YMCA Scheduling & Attendance System</Text>

              {(data.branchName || data.allianceName || data.associationName) && (
                <Text
                  style={styles.hierarchyLine}
                  render={({ pageNumber }: { pageNumber: number }) => {
                    const branchLine = data.branchName ? `Branch: ${data.branchName}` : "";
                    if (pageNumber === 1) {
                      const lines = [
                        data.allianceName ? `Alliance: ${data.allianceName}` : null,
                        data.associationName ? `Association: ${data.associationName}` : null,
                        branchLine || null,
                      ].filter(Boolean) as string[];
                      return lines.join("\n");
                    }
                    return branchLine;
                  }}
                />
              )}

              <Text style={styles.printedOn}>Printed on: {printDateTime.replace(" at ", " @ ")}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.reportType}>Holiday Schedule ({rows.length})</Text>
            <Text style={styles.reportPeriod}>{data.year}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]} fixed>
            <Text style={[styles.cellDate, styles.headerText]}>Date</Text>
            <Text style={[styles.cellObserved, styles.headerText]}>Observed On</Text>
            <Text style={[styles.cellName, styles.headerText]}>Holiday</Text>
            <Text style={[styles.cellClosed, styles.headerText]}>Closed</Text>
            <Text style={[styles.cellNotes, styles.headerText]}>Notes</Text>
          </View>

          {rows.length === 0 ? (
            <View style={styles.row}>
              <Text>No holidays found for this year.</Text>
            </View>
          ) : (
            rows.map((r) => (
              <View key={`${r.holiday_date}-${r.name}`} style={styles.row} wrap={false}>
                <Text style={[styles.cellDate, styles.cellText]}>
                  {formatIsoDateMmDdYyyy(r.holiday_date) || r.holiday_date}
                </Text>
                <Text style={[styles.cellObserved, styles.cellText]}>
                  {r.observed_date ? formatIsoDateMmDdYyyy(r.observed_date) || r.observed_date : "—"}
                </Text>
                <Text style={[styles.cellName, styles.cellText]}>{r.name}</Text>
                <Text style={[styles.cellClosed, styles.cellText]}>{formatClosed(r)}</Text>
                <Text style={[styles.cellNotes, styles.cellText]}>{(r.notes ?? "").trim() || "—"}</Text>
              </View>
            ))
          )}
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Holiday Schedule • ${data.year} • Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}



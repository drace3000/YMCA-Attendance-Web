import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

export type ScheduleCloneConstraintReportRow = {
  id: string;
  source_session_id: string | null;
  target_session_date: string | null;
  target_day_of_week: string | null;
  target_start_time: string | null;
  target_end_time: string | null;
  class: { id: string; name: string | null } | null;
  location: { id: string; code: string | null; name: string | null } | null;
  details: Record<string, unknown>;
};

export type ScheduleCloneConstraintReportGroup = {
  event_type: string;
  label: string;
  count: number;
  suggested_resolution: string;
  rows: ScheduleCloneConstraintReportRow[];
};

export type ScheduleCloneConstraintReportStats = {
  created_sessions: number;
  skipped_sessions: number;
  modified_sessions: number;
};

const THEME_COLOR = "#01A490";

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    paddingVertical: 30,
    paddingHorizontal: 40,
    paddingBottom: 70,
    fontSize: 10,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 12,
    marginBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: THEME_COLOR,
  },
  pageHeaderLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexShrink: 1,
    minWidth: 0,
  },
  logo: {
    width: 40,
    height: 40,
    marginRight: 10,
  },
  headerTitleBlock: {
    flexDirection: "column",
    minWidth: 0,
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: THEME_COLOR,
  },
  orgLine: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#222222",
    marginTop: 4,
  },
  statsLine: {
    fontSize: 8,
    color: "#444444",
    marginTop: 2,
  },
  printedOn: {
    fontSize: 7,
    color: "#888888",
    marginTop: 4,
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
    flexShrink: 0,
    marginLeft: 12,
  },
  headerBadge: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
  },
  headerBadgeSub: {
    fontSize: 8,
    color: "#666666",
    marginTop: 2,
  },
  section: {
    marginTop: 14,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  sectionCount: {
    fontSize: 10,
    color: "#444444",
  },
  resolution: {
    fontSize: 8,
    color: "#555555",
    fontStyle: "italic",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  colLeft: {
    width: 130,
    paddingRight: 10,
  },
  colRight: {
    flex: 1,
    minWidth: 0,
  },
  dateLine: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  bodyLine: {
    fontSize: 9,
    color: "#333333",
    marginBottom: 2,
  },
  smallLine: {
    fontSize: 8,
    color: "#666666",
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 25,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    fontSize: 8,
    color: "#777777",
  },
  footerText: {
    fontSize: 8,
    color: "#777777",
    textAlign: "center",
  },
});

function formatWhen(row: ScheduleCloneConstraintReportRow): string {
  const date = row.target_session_date ?? "—";
  const dow = row.target_day_of_week ?? "—";
  const start = row.target_start_time ?? "—";
  const end = row.target_end_time ?? "—";
  return `${date} • ${dow} • ${start}-${end}`;
}

function formatClassLocation(row: ScheduleCloneConstraintReportRow): string {
  const className = row.class?.name ?? "—";
  const locCode = row.location?.code ?? "";
  const locName = row.location?.name ?? "";
  const loc = [locCode, locName].filter(Boolean).join(" - ") || "—";
  return `Class: ${className}   Location: ${loc}`;
}

function formatReason(details: Record<string, unknown>): string | null {
  const reason = typeof details?.reason === "string" ? details.reason.trim() : "";
  return reason ? `Reason: ${reason}` : null;
}

type InstructorDetail = {
  id: string;
  label?: string | null;
  nickname?: string | null;
  readable_id?: string | null;
};

function formatInstructorList(details: Record<string, unknown>, key: string): string | null {
  const raw = (details as any)?.[key];
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const labels = raw
    .map((v) => v as InstructorDetail)
    .map((i) => String(i?.label ?? i?.nickname ?? i?.readable_id ?? i?.id ?? "").trim())
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : null;
}

export function ScheduleCloneConstraintsPDFDocument({
  title,
  orgLine,
  printedOnLabel,
  stats,
  groups,
  logoSrc = "/assets/images/ymca-logo.v2.png",
}: {
  title: string;
  orgLine: string;
  printedOnLabel: string;
  stats: ScheduleCloneConstraintReportStats;
  groups: ScheduleCloneConstraintReportGroup[];
  logoSrc?: string | null;
}) {
  const totalExceptions = groups.reduce((sum, g) => sum + (g.count || 0), 0);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.pageHeader} fixed>
          <View style={styles.pageHeaderLeft}>
            {logoSrc ? <Image style={styles.logo} src={logoSrc} /> : null}
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.orgLine}>{orgLine}</Text>
              <Text style={styles.statsLine}>Created sessions: {stats.created_sessions}</Text>
              <Text style={styles.statsLine}>Skipped sessions: {stats.skipped_sessions}</Text>
              <Text style={styles.statsLine}>Modified sessions: {stats.modified_sessions}</Text>
              <Text style={styles.printedOn}>Printed on: {printedOnLabel.replace(" at ", " @ ")}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerBadge}>Exceptions</Text>
            <Text style={styles.headerBadgeSub}>{totalExceptions}</Text>
          </View>
        </View>

        {groups.map((g) => (
          <View key={g.event_type} style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>{g.label}</Text>
              <Text style={styles.sectionCount}>{g.count}</Text>
            </View>
            <Text style={styles.resolution}>Suggested resolution: {g.suggested_resolution}</Text>

            {g.rows.map((r) => {
              const reasonLine = formatReason(r.details);
              const dropped = formatInstructorList(r.details, "dropped_instructors");
              const kept = formatInstructorList(r.details, "kept_instructors");
              return (
                <View key={r.id} style={styles.row} wrap={false}>
                  <View style={styles.colLeft}>
                    <Text style={styles.dateLine}>{formatWhen(r)}</Text>
                    {r.source_session_id ? (
                      <Text style={styles.smallLine}>Source: {r.source_session_id}</Text>
                    ) : (
                      <Text style={styles.smallLine}>Source: —</Text>
                    )}
                  </View>
                  <View style={styles.colRight}>
                    <Text style={styles.bodyLine}>{formatClassLocation(r)}</Text>
                    {reasonLine ? <Text style={styles.smallLine}>{reasonLine}</Text> : null}
                    {dropped ? <Text style={styles.smallLine}>Dropped instructor(s): {dropped}</Text> : null}
                    {kept ? <Text style={styles.smallLine}>Kept instructor(s): {kept}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}


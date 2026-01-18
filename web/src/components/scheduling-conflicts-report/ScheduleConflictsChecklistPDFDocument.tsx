import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

import type { ConflictChecklistGroup } from "@/lib/schedule-conflicts-checklist-utils";

const THEME_COLOR = "#01A490";

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    paddingVertical: 30,
    paddingHorizontal: 40,
    paddingBottom: 90,
    fontSize: 10,
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
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
  contextLine: {
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
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  checkbox: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: "#111111",
    marginRight: 10,
    marginTop: 2,
  },
  colDate: {
    width: 76,
    fontFamily: "Helvetica-Bold",
  },
  colBody: {
    flex: 1,
  },
  conflictText: {
    marginBottom: 2,
  },
  sessionLine: {
    fontSize: 9,
    color: "#555555",
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 30,
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

export function ScheduleConflictsChecklistPDFDocument({
  title,
  printedOnLabel,
  contextLabel,
  branchName,
  reportPeriod,
  groups,
}: {
  title: string;
  printedOnLabel: string;
  contextLabel?: string;
  branchName?: string;
  reportPeriod?: string;
  groups: ConflictChecklistGroup[];
}) {
  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.pageHeader} fixed>
          <View style={styles.pageHeaderLeft}>
            <Image style={styles.logo} src="/assets/images/ymca-logo.v2.png" />
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.headerSubtitle}>YMCA Scheduling & Attendance System</Text>
              {branchName ? <Text style={styles.contextLine}>Branch: {branchName}</Text> : null}
              {contextLabel ? <Text style={styles.contextLine}>{contextLabel}</Text> : null}
              <Text style={styles.printedOn}>Printed on: {printedOnLabel.replace(" at ", " @ ")}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.reportType}>Checklist ({total})</Text>
            {reportPeriod ? <Text style={styles.reportPeriod}>{reportPeriod}</Text> : null}
          </View>
        </View>

        {groups.map((g) => (
          <View key={g.severity} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {g.severity === "MEDIUM" ? "MED" : g.severity} Conflicts
            </Text>

            {g.rows.map((r, idx) => (
              <View key={`${g.severity}-${idx}`} style={styles.row} wrap={false}>
                <View style={styles.checkbox} />
                <Text style={styles.colDate}>{r.date}</Text>
                <View style={styles.colBody}>
                  <Text style={styles.conflictText}>{r.conflict}</Text>
                  <Text style={styles.sessionLine}>A: {r.sessionA}</Text>
                  {r.sessionB !== "—" ? <Text style={styles.sessionLine}>B: {r.sessionB}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => {
            const pageLine = `Page ${pageNumber} of ${totalPages}`;
            return [
              "Key:",
              "Transition time: Instructor scheduled in different locations too close together to move between sessions.",
              "Turnover time: Same location scheduled back-to-back for different class types too close together to reset the room.",
              pageLine,
            ].join("\n");
          }}
          fixed
        />
      </Page>
    </Document>
  );
}



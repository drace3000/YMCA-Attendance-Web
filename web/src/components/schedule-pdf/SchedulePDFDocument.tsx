/**
 * Schedule PDF Document Component
 * 11x17 (Tabloid) landscape format matching Excel reference
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Session } from "@/app/scheduling/sessions-tab";

const DEFAULT_THEME_COLOR = "#01A490";
const LEFT_COLUMN_DAYS = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY"];
const RIGHT_COLUMN_DAYS = ["WEDNESDAY", "THURSDAY", "FRIDAY"];

interface SchedulePDFProps {
  branchName: string;
  groupName?: string;
  branchManager?: string;
  monthYear: string;
  effectiveDate: string;
  sessions: Session[];
  criteria?: string[];
  websiteUrl?: string;
  themeColor?: string;
}

interface GroupedSessions {
  [day: string]: Session[];
}

function createStyles(themeColor: string) {
  return StyleSheet.create({
    page: {
      flexDirection: "column",
      backgroundColor: "#FFFFFF",
      padding: 15,
      fontFamily: "Helvetica",
    },
    // Page header
    header: {
      alignItems: "center",
      marginBottom: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: "#CCCCCC",
    },
    title: {
      fontSize: 18,
      fontFamily: "Helvetica-Bold",
      color: themeColor,
      marginBottom: 4,
    },
    branchName: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: "#000000",
      marginBottom: 2,
    },
    groupName: {
      fontSize: 11,
      color: "#000000",
      marginBottom: 2,
    },
    monthYear: {
      fontSize: 12,
      color: "#000000",
    },
    effectiveDate: {
      fontSize: 9,
      fontStyle: "italic",
      color: "#666666",
      marginTop: 2,
    },
    criteriaContainer: {
      marginTop: 4,
      width: "100%",
      alignItems: "center",
    },
    criteriaLine: {
      fontSize: 7,
      color: "#333333",
      textAlign: "center",
    },
    // Grid layout
    gridContainer: {
      flexDirection: "row",
      flex: 1,
    },
    halfGrid: {
      flex: 1,
      paddingHorizontal: 2,
    },
    daySection: {
      marginBottom: 4,
    },
    dayHeader: {
      backgroundColor: themeColor,
      paddingVertical: 3,
      paddingHorizontal: 4,
    },
    dayHeaderText: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#FFFFFF",
      textAlign: "center",
    },
    sessionRow: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: "#CCCCCC",
      paddingVertical: 2,
      paddingHorizontal: 2,
      minHeight: 14,
      alignItems: "center",
    },
    colTime: {
      width: 95,
      fontSize: 9,
      color: "#000000",
    },
    colClass: {
      width: 140,
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: "#000000",
    },
    colLocation: {
      width: 35,
      fontSize: 9,
      color: "#666666",
      textAlign: "center",
    },
    colInstructor: {
      width: 85,
      fontSize: 9,
      color: "#000000",
      textAlign: "left",
    },
    noSessions: {
      fontSize: 9,
      color: "#999999",
      fontStyle: "italic",
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    // Footer styles
    footer: {
      marginTop: 8,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: "#CCCCCC",
    },
    locationKey: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 6,
    },
    locationKeyTitle: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: "#000000",
      marginRight: 8,
    },
    locationKeyItem: {
      fontSize: 8,
      color: "#000000",
      marginRight: 12,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7,
      color: "#666666",
    },
    footerText: {
      fontSize: 7,
      color: "#666666",
    },
    // Branch manager in header
    branchManager: {
      fontSize: 10,
      color: "#333333",
      marginTop: 2,
    },
  });
}
function formatTime(time: string): string {
  const parts = time.split(":");
  const hour = parseInt(parts[0], 10);
  const minutes = parts[1];
  const hour12 = hour % 12 || 12;
  return hour12 + ":" + minutes;
}

function formatTimeRange(start: string, end: string): string {
  const startParts = start.split(":");
  const endParts = end.split(":");
  const startHour = parseInt(startParts[0], 10);
  const endHour = parseInt(endParts[0], 10);
  const startAmPm = startHour >= 12 ? "pm" : "am";
  const endAmPm = endHour >= 12 ? "pm" : "am";
  // Format: "7:15-7:45am" or "11:30am-12:30pm"
  if (startAmPm === endAmPm) {
    return formatTime(start) + "-" + formatTime(end) + endAmPm;
  }
  return formatTime(start) + startAmPm + "-" + formatTime(end) + endAmPm;
}

function formatInstructors(instructors: Session["instructors"]): string {
  if (!instructors || instructors.length === 0) return "";
  return instructors
    .map(function(i) { 
      if (i.nickname) return i.nickname;
      if (i.first_name && i.last_name) return i.first_name + " " + i.last_name.charAt(0) + ".";
      return i.first_name || "";
    })
    .filter(Boolean)
    .join("/");
}

function groupSessionsByDay(sessions: Session[]): GroupedSessions {
  const grouped: GroupedSessions = {};
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const day = session.day_of_week.toUpperCase();
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(session);
  }
  const days = Object.keys(grouped);
  for (let i = 0; i < days.length; i++) {
    grouped[days[i]].sort(function(a, b) { return a.start_time.localeCompare(b.start_time); });
  }
  return grouped;
}

function extractLocations(sessions: Session[]): { code: string; name: string }[] {
  const locationMap = new Map<string, string>();
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (session.location) {
      locationMap.set(session.location.code, session.location.name);
    }
  }
  return Array.from(locationMap.entries())
    .map(function(entry) { return { code: entry[0], name: entry[1] }; })
    .sort(function(a, b) { return a.code.localeCompare(b.code); });
}

function formatPrintDateTime(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric", 
    year: "numeric" 
  }) + " " + now.toLocaleTimeString("en-US", { 
    hour: "numeric", 
    minute: "2-digit",
    hour12: true 
  });
}
function DaySection(props: { day: string; sessions: Session[]; styles: ReturnType<typeof createStyles> }) {
  const { day, sessions, styles } = props;
  return (
    <View style={styles.daySection}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderText}>{day}</Text>
      </View>
      {sessions.length === 0 ? (
        <Text style={styles.noSessions}>No classes scheduled</Text>
      ) : (
        sessions.map(function(session, idx) {
          return (
            <View key={session.id || idx} style={styles.sessionRow}>
              <Text style={styles.colTime}>{formatTimeRange(session.start_time, session.end_time)}</Text>
              <Text style={styles.colClass}>{session.class?.name || "Unknown"}</Text>
              <Text style={styles.colLocation}>({session.location?.code || "?"})</Text>
              <Text style={styles.colInstructor}>{formatInstructors(session.instructors)}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

function HalfGrid(props: { days: string[]; groupedSessions: GroupedSessions; styles: ReturnType<typeof createStyles> }) {
  const { days, groupedSessions, styles } = props;
  return (
    <View style={styles.halfGrid}>
      {days.map(function(day) {
        return <DaySection key={day} day={day} sessions={groupedSessions[day] || []} styles={styles} />;
      })}
    </View>
  );
}

export function SchedulePDFDocument(props: SchedulePDFProps) {
  const { branchName, groupName, branchManager, monthYear, effectiveDate, sessions, criteria, themeColor } = props;
  const color = themeColor || DEFAULT_THEME_COLOR;
  const styles = createStyles(color);
  const groupedSessions = groupSessionsByDay(sessions);
  const locations = extractLocations(sessions);
  const printDateTime = formatPrintDateTime();
  const titleText = groupName ? `${groupName} Schedule` : "Group Fitness Schedule";
  
  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{titleText}</Text>
          <Text style={styles.branchName}>{branchName}</Text>
          {branchManager && <Text style={styles.branchManager}>Branch Manager: {branchManager}</Text>}
          <Text style={styles.monthYear}>{monthYear}</Text>
          <Text style={styles.effectiveDate}>Effective: {effectiveDate}</Text>
          {criteria && criteria.length > 0 ? (
            <View style={styles.criteriaContainer}>
              {criteria.slice(0, 5).map((line, idx) => (
                <Text key={idx} style={styles.criteriaLine}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        
        {/* Schedule Grid */}
        <View style={styles.gridContainer}>
          <HalfGrid days={LEFT_COLUMN_DAYS} groupedSessions={groupedSessions} styles={styles} />
          <HalfGrid days={RIGHT_COLUMN_DAYS} groupedSessions={groupedSessions} styles={styles} />
        </View>
        
        {/* Footer */}
        <View style={styles.footer}>
          {/* Location Key */}
          <View style={styles.locationKey}>
            <Text style={styles.locationKeyTitle}>LOCATION KEY:</Text>
            {locations.map(function(loc) {
              return <Text key={loc.code} style={styles.locationKeyItem}>{loc.code} = {loc.name}</Text>;
            })}
          </View>
          {/* Print info and page number */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Printed: {printDateTime}</Text>
            <Text style={styles.footerText}>Page 1 of 1</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export default SchedulePDFDocument;
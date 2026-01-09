/**
 * Hierarchy Report PDF Document Component
 * Letter (8.5x11) portrait format showing Alliance > Association > Branch structure
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const DEFAULT_THEME_COLOR = "#01A490";

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
  city: string | null;
  state_code: string | null;
  zip: string | null;
  phone: string | null;
  is_active: boolean;
  is_main_branch: boolean;
}

export interface HierarchyPDFProps {
  alliances: Alliance[];
  associations: Association[];
  branches: Branch[];
  generatedAt?: Date;
  themeColor?: string;
}

function createStyles(themeColor: string) {
  return StyleSheet.create({
    page: {
      flexDirection: "column",
      backgroundColor: "#FFFFFF",
      paddingTop: 30,
      paddingHorizontal: 40,
      paddingBottom: 50,
      fontFamily: "Helvetica",
    },
    header: {
      marginBottom: 20,
      paddingBottom: 10,
      borderBottomWidth: 2,
      borderBottomColor: themeColor,
    },
    title: {
      fontSize: 20,
      fontFamily: "Helvetica-Bold",
      color: themeColor,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 10,
      color: "#666666",
    },
    statsRow: {
      flexDirection: "row",
      marginTop: 10,
      gap: 20,
    },
    statBox: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: "#f5f5f5",
      borderRadius: 4,
    },
    statLabel: {
      fontSize: 8,
      color: "#666666",
      textTransform: "uppercase",
    },
    statValue: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: themeColor,
    },
    allianceSection: {
      marginBottom: 16,
    },
    allianceHeader: {
      backgroundColor: themeColor,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 8,
    },
    allianceName: {
      fontSize: 12,
      fontFamily: "Helvetica-Bold",
      color: "#FFFFFF",
    },
    allianceCode: {
      fontSize: 9,
      color: "#FFFFFF",
      opacity: 0.8,
    },
    associationSection: {
      marginLeft: 15,
      marginBottom: 10,
    },
    associationHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
      paddingBottom: 3,
      borderBottomWidth: 1,
      borderBottomColor: "#dddddd",
    },
    associationCode: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: "#FFFFFF",
      backgroundColor: themeColor,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 3,
      marginRight: 8,
    },
    associationName: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#333333",
    },
    associationState: {
      fontSize: 8,
      color: "#666666",
      marginLeft: 8,
    },
    branchList: {
      marginLeft: 20,
      marginTop: 4,
    },
    branchRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 3,
      borderBottomWidth: 1,
      borderBottomColor: "#f0f0f0",
    },
    branchCode: {
      fontSize: 7,
      fontFamily: "Helvetica-Bold",
      color: themeColor,
      backgroundColor: "#f0f0f0",
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 2,
      marginRight: 8,
      width: 50,
      textAlign: "center",
    },
    branchName: {
      fontSize: 9,
      color: "#333333",
      flex: 1,
    },
    branchLocation: {
      fontSize: 8,
      color: "#666666",
      width: 120,
    },
    branchPhone: {
      fontSize: 8,
      color: "#666666",
      width: 80,
    },
    footer: {
      position: "absolute",
      bottom: 25,
      left: 40,
      right: 40,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: "#dddddd",
      paddingTop: 8,
    },
    footerText: {
      fontSize: 8,
      color: "#999999",
    },
    pageNumber: {
      fontSize: 8,
      color: "#999999",
    },
    emptyMessage: {
      fontSize: 10,
      color: "#999999",
      fontStyle: "italic",
      marginLeft: 20,
      marginTop: 4,
    },
  });
}

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

export function HierarchyPDFDocument({
  alliances,
  associations,
  branches,
  generatedAt = new Date(),
  themeColor = DEFAULT_THEME_COLOR,
}: HierarchyPDFProps) {
  const styles = createStyles(themeColor);

  // Sort alliances by code
  const sortedAlliances = [...alliances].sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>YMCA Organization Hierarchy</Text>
          <Text style={styles.subtitle}>
            Generated: {generatedAt.toLocaleDateString()} at{" "}
            {generatedAt.toLocaleTimeString()}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Alliances</Text>
              <Text style={styles.statValue}>{alliances.length}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Associations</Text>
              <Text style={styles.statValue}>{associations.length}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Branches</Text>
              <Text style={styles.statValue}>{branches.length}</Text>
            </View>
          </View>
        </View>

        {/* Hierarchy Content */}
        {sortedAlliances.map((alliance) => {
          const allianceAssociations = associations
            .filter((a) => a.alliance_id === alliance.id)
            .sort((a, b) => a.code.localeCompare(b.code));

          return (
            <View key={alliance.id} style={styles.allianceSection} wrap={false}>
              {/* Alliance Header */}
              <View style={styles.allianceHeader}>
                <Text style={styles.allianceName}>
                  {formatNameWithYMCA(alliance.name)}
                </Text>
                <Text style={styles.allianceCode}>
                  {alliance.code} • {alliance.alliance_type === "state" ? "State" : "Regional"} Alliance
                  {alliance.headquarters_state_code ? ` • ${alliance.headquarters_state_code}` : ""}
                </Text>
              </View>

              {/* Associations under this Alliance */}
              {allianceAssociations.length === 0 ? (
                <Text style={styles.emptyMessage}>No associations</Text>
              ) : (
                allianceAssociations.map((assoc) => {
                  const assocBranches = branches
                    .filter((b) => b.association_id === assoc.id)
                    .sort((a, b) =>
                      (a.short_code ?? a.code).localeCompare(b.short_code ?? b.code)
                    );

                  return (
                    <View key={assoc.id} style={styles.associationSection}>
                      {/* Association Header */}
                      <View style={styles.associationHeader}>
                        <Text style={styles.associationCode}>{assoc.code}</Text>
                        <Text style={styles.associationName}>
                          {formatNameWithYMCA(assoc.name)}
                        </Text>
                        <Text style={styles.associationState}>
                          {assoc.state_code}
                          {assoc.region ? ` • ${assoc.region}` : ""}
                        </Text>
                      </View>

                      {/* Branches under this Association */}
                      {assocBranches.length === 0 ? (
                        <Text style={styles.emptyMessage}>No branches</Text>
                      ) : (
                        <View style={styles.branchList}>
                          {assocBranches.map((branch) => (
                            <View key={branch.id} style={styles.branchRow}>
                              <Text style={styles.branchCode}>
                                {branch.short_code ?? branch.code}
                              </Text>
                              <Text style={styles.branchName}>
                                {formatNameWithYMCA(branch.name)}
                              </Text>
                              <Text style={styles.branchLocation}>
                                {[branch.city, branch.state_code, branch.zip]
                                  .filter(Boolean)
                                  .join(", ")}
                              </Text>
                              <Text style={styles.branchPhone}>
                                {branch.phone ?? ""}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>YMCA Organization Hierarchy Report</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

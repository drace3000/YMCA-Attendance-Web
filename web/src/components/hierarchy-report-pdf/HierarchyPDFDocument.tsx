/**
 * Hierarchy Report PDF Document Component
 * Letter (8.5x11) portrait format showing Alliance > Association > Branch structure
 * Readable, nested hierarchy layout: Alliance > Association > Branch
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
  address: string | null;
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
      paddingTop: 28,
      paddingHorizontal: 36,
      paddingBottom: 50,
      fontFamily: "Helvetica",
    },
    header: {
      marginBottom: 16,
      paddingBottom: 10,
      borderBottomWidth: 2,
      borderBottomColor: themeColor,
    },
    title: {
      fontSize: 18,
      fontFamily: "Helvetica-Bold",
      color: themeColor,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 9,
      color: "#666666",
    },
    statsRow: {
      flexDirection: "row",
      marginTop: 10,
    },
    statBox: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: "#f5f5f5",
      borderRadius: 4,
      marginRight: 12,
    },
    statLabel: {
      fontSize: 7,
      color: "#666666",
      textTransform: "uppercase",
    },
    statValue: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: themeColor,
    },
    // Alliance Section
    allianceSection: {
      marginBottom: 14,
    },
    allianceHeader: {
      backgroundColor: themeColor,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 6,
    },
    allianceName: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: "#FFFFFF",
    },
    allianceMeta: {
      fontSize: 8,
      color: "#FFFFFF",
      opacity: 0.85,
      marginTop: 2,
    },
    // Association Section
    associationSection: {
      marginLeft: 10,
      marginBottom: 10,
      paddingLeft: 10,
      borderLeftWidth: 2,
      borderLeftColor: "#e6e6e6",
    },
    associationHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingBottom: 4,
      marginBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: "#eaeaea",
    },
    associationCode: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: "#FFFFFF",
      backgroundColor: themeColor,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 2,
      marginRight: 8,
    },
    associationName: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: themeColor,
      flex: 1,
    },
    associationMeta: {
      fontSize: 8,
      color: "#888888",
    },
    // Branch list
    branchList: {
      marginTop: 4,
    },
    // Two-line branch entry - wrap={false} keeps it together
    branchEntry: {
      marginBottom: 8,
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: "#eeeeee",
    },
    branchTopRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 3,
    },
    branchCode: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: themeColor,
      backgroundColor: "#f0f0f0",
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 3,
      marginLeft: 8,
    },
    branchName: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#333333",
      flex: 1,
    },
    branchBottomRow: {
      marginLeft: 0,
    },
    branchDetails: {
      fontSize: 9,
      color: "#666666",
    },
    // Footer
    footer: {
      position: "absolute",
      bottom: 20,
      left: 36,
      right: 36,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: "#e0e0e0",
      paddingTop: 6,
    },
    footerText: {
      fontSize: 7,
      color: "#999999",
    },
    pageNumber: {
      fontSize: 7,
      color: "#999999",
    },
    emptyMessage: {
      fontSize: 9,
      color: "#999999",
      fontStyle: "italic",
      marginLeft: 10,
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

function formatBranchDetails(branch: Branch): string {
  // Street Address, City, State ZIP (one line)
  const cityState = [branch.city, branch.state_code].filter(Boolean).join(", ");
  const cityStateZip = `${cityState}${branch.zip ? ` ${branch.zip}` : ""}`.trim();

  return [branch.address, cityStateZip]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(", ");
}

function formatBranchPhone(branch: Branch): string {
  return (branch.phone ?? "").trim();
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
        {/* Header (repeats on each page) */}
        <View style={styles.header} fixed>
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

        {/* Hierarchy Content: Alliance > Association > Branch */}
        {sortedAlliances.map((alliance) => {
          const allianceAssociations = associations
            .filter((a) => a.alliance_id === alliance.id)
            .sort((a, b) => a.code.localeCompare(b.code));

          return (
            <View key={alliance.id} style={styles.allianceSection}>
              <View style={styles.allianceHeader} wrap={false}>
                <Text style={styles.allianceName}>
                  {formatNameWithYMCA(alliance.name)}
                </Text>
                <Text style={styles.allianceMeta}>
                  {alliance.code} •{" "}
                  {alliance.alliance_type === "state" ? "State" : "Regional"}{" "}
                  Alliance
                  {alliance.headquarters_state_code
                    ? ` • ${alliance.headquarters_state_code}`
                    : ""}
                </Text>
              </View>

              {allianceAssociations.length === 0 ? (
                <Text style={styles.emptyMessage}>No associations</Text>
              ) : (
                allianceAssociations.map((assoc) => {
                  const assocBranches = branches
                    .filter((b) => b.association_id === assoc.id)
                    .sort((a, b) =>
                      (a.name ?? "").localeCompare(b.name ?? "", undefined, {
                        sensitivity: "base",
                      })
                    );

                  return (
                    <View key={assoc.id} style={styles.associationSection}>
                      {/* Keep association header with first branch so it doesn't orphan at page bottom */}
                      {assocBranches.length === 0 ? (
                        <>
                          <View style={styles.associationHeader} wrap={false}>
                            <Text style={styles.associationCode}>
                              {assoc.code}
                            </Text>
                            <Text style={styles.associationName}>
                              {formatNameWithYMCA(assoc.name)}
                            </Text>
                            <Text style={styles.associationMeta}>
                              {assoc.state_code}
                              {assoc.region ? ` • ${assoc.region}` : ""}
                            </Text>
                          </View>
                          <Text style={styles.emptyMessage}>No branches</Text>
                        </>
                      ) : (
                        (() => {
                          const [first, ...rest] = assocBranches;
                          return (
                            <>
                              <View wrap={false}>
                                <View style={styles.associationHeader}>
                                  <Text style={styles.associationCode}>
                                    {assoc.code}
                                  </Text>
                                  <Text style={styles.associationName}>
                                    {formatNameWithYMCA(assoc.name)}
                                  </Text>
                                  <Text style={styles.associationMeta}>
                                    {assoc.state_code}
                                    {assoc.region ? ` • ${assoc.region}` : ""}
                                  </Text>
                                </View>
                                <View style={styles.branchList}>
                                  <View
                                    key={first.id}
                                    style={styles.branchEntry}
                                    wrap={false}
                                  >
                                    <View style={styles.branchTopRow}>
                                      <Text style={styles.branchName}>
                                        {formatNameWithYMCA(first.name)}
                                      </Text>
                                      <Text style={styles.branchCode}>
                                        {first.short_code ?? first.code}
                                      </Text>
                                    </View>
                                    <View style={styles.branchBottomRow}>
                                      <Text style={styles.branchDetails}>
                                        {formatBranchDetails(first)}
                                      </Text>
                                      {formatBranchPhone(first) ? (
                                        <Text style={styles.branchDetails}>
                                          {formatBranchPhone(first)}
                                        </Text>
                                      ) : null}
                                    </View>
                                  </View>
                                </View>
                              </View>

                              {rest.length > 0 ? (
                                <View style={styles.branchList}>
                                  {rest.map((branch) => (
                                    <View
                                      key={branch.id}
                                      style={styles.branchEntry}
                                      wrap={false}
                                    >
                                      <View style={styles.branchTopRow}>
                                        <Text style={styles.branchName}>
                                          {formatNameWithYMCA(branch.name)}
                                        </Text>
                                        <Text style={styles.branchCode}>
                                          {branch.short_code ?? branch.code}
                                        </Text>
                                      </View>
                                      <View style={styles.branchBottomRow}>
                                        <Text style={styles.branchDetails}>
                                          {formatBranchDetails(branch)}
                                        </Text>
                                        {formatBranchPhone(branch) ? (
                                          <Text style={styles.branchDetails}>
                                            {formatBranchPhone(branch)}
                                          </Text>
                                        ) : null}
                                      </View>
                                    </View>
                                  ))}
                                </View>
                              ) : null}
                            </>
                          );
                        })()
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

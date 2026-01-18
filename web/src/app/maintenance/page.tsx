"use client";

import { useEffect, useState } from "react";
import { Building2, CalendarDays, GraduationCap, HelpCircle, Layers3, Mail, MapPin, Network } from "lucide-react";
import { AdminHierarchySelectorBar } from "./admin-hierarchy-selector-bar";
import { InstructorsTab } from "./instructors-tab";
import { ClassesTab } from "./classes-tab";
import { LocationsTab } from "./locations-tab";
import { HolidaysTab } from "./holidays-tab";
import { RecipientsTab } from "./recipients-tab";
import { HelperTab } from "./helper-tab";
import { GroupsTab } from "./groups-tab";
import { OrganizationTab } from "./organization-tab";
import { useThemeSettings } from "@/components/theme-settings-provider";
import { useBranchAccess } from "@/hooks/useBranchAccess";
import { useAdminHierarchySelection } from "@/hooks/useAdminHierarchySelection";

type TabId = "instructors" | "classes" | "locations" | "holidays" | "groups" | "recipients" | "organization" | "helper";

type Tab = {
  id: TabId;
  label: string;
  icon: React.ReactNode;
};

const tabs: Tab[] = [
  { id: "instructors", label: "Instructors", icon: <GraduationCap className="h-4 w-4" /> },
  { id: "classes", label: "Classes", icon: <Building2 className="h-4 w-4" /> },
  { id: "locations", label: "Locations", icon: <MapPin className="h-4 w-4" /> },
  { id: "holidays", label: "Holidays", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "groups", label: "Groups", icon: <Layers3 className="h-4 w-4" /> },
  { id: "recipients", label: "Members", icon: <Mail className="h-4 w-4" /> },
  { id: "organization", label: "Organization", icon: <Network className="h-4 w-4" /> },
  { id: "helper", label: "Helper", icon: <HelpCircle className="h-4 w-4" /> },
];

export default function MaintenancePage() {
  const [activeTab, setActiveTab] = useState<TabId>("instructors");

  const { isAdmin } = useBranchAccess();
  const { hasSelection, isComplete } = useAdminHierarchySelection();
  const selectionIncomplete = isAdmin && !isComplete;

  const { branch } = useThemeSettings();
  const [branchDetails, setBranchDetails] = useState<{
    alliance_name?: string | null;
    association_name?: string | null;
    name?: string | null;
  } | null>(null);

  const toTitleCaseWithYmcaAndOf = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const lowerWords = new Set(["of"]);
    return value
      .split(" ")
      .filter(Boolean)
      .map((word, idx) => {
        const upper = word.toUpperCase();
        if (upper === "YMCA") return "YMCA";
        if (upper === "YMCAS") return "YMCAs";
        const lower = word.toLowerCase();
        if (idx !== 0 && lowerWords.has(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(" ");
  };

  // Fetch hierarchy names for the currently selected branch (admin selector / branch context)
  useEffect(() => {
    const fetchBranchDetails = async () => {
      try {
        const res = await fetch(`/api/branches/${encodeURIComponent(branch.id)}`);
        if (!res.ok) return;
        const details = (await res.json()) as {
          alliance_name?: string | null;
          association_name?: string | null;
          name?: string | null;
        };
        setBranchDetails(details);
      } catch {
        // ignore
      }
    };

    void fetchBranchDetails();
  }, [branch.id]);

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage instructors, classes, and locations for scheduling
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <AdminHierarchySelectorBar />
        </div>
        <div className="flex flex-wrap gap-1 rounded-t-2xl bg-[var(--brand-gradient-strong)] p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              disabled={selectionIncomplete}
              onClick={() => !selectionIncomplete && setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                selectionIncomplete
                  ? "cursor-not-allowed opacity-50"
                  : activeTab === tab.id
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5">
          <div className="min-h-[400px]">
            {selectionIncomplete ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-foreground/80">
                Select an <span className="font-semibold">Alliance</span>,{" "}
                <span className="font-semibold">Association</span>, and{" "}
                <span className="font-semibold">Branch</span> to enable Maintenance tools.
              </div>
            ) : (
              <>
                {activeTab === "instructors" && <InstructorsTab />}
                {activeTab === "classes" && <ClassesTab />}
                {activeTab === "locations" && <LocationsTab />}
                {activeTab === "holidays" && <HolidaysTab />}
                {activeTab === "groups" && <GroupsTab />}
                {activeTab === "recipients" && <RecipientsTab />}
                {activeTab === "organization" && <OrganizationTab />}
                {activeTab === "helper" && <HelperTab />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


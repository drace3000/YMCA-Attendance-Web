"use client";

import { useState } from "react";
import { Building2, GraduationCap, HelpCircle, Layers3, Mail, MapPin, Network, RotateCcw } from "lucide-react";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { InstructorsTab } from "./instructors-tab";
import { ClassesTab } from "./classes-tab";
import { LocationsTab } from "./locations-tab";
import { RecipientsTab } from "./recipients-tab";
import { HelperTab } from "./helper-tab";
import { GroupsTab } from "./groups-tab";
import { OrganizationTab } from "./organization-tab";

type TabId = "instructors" | "classes" | "locations" | "groups" | "recipients" | "organization" | "helper";

type Tab = {
  id: TabId;
  label: string;
  icon: React.ReactNode;
};

const tabs: Tab[] = [
  { id: "instructors", label: "Instructors", icon: <GraduationCap className="h-4 w-4" /> },
  { id: "classes", label: "Classes", icon: <Building2 className="h-4 w-4" /> },
  { id: "locations", label: "Locations", icon: <MapPin className="h-4 w-4" /> },
  { id: "groups", label: "Groups", icon: <Layers3 className="h-4 w-4" /> },
  { id: "recipients", label: "Recipients", icon: <Mail className="h-4 w-4" /> },
  { id: "organization", label: "Organization", icon: <Network className="h-4 w-4" /> },
  { id: "helper", label: "Helper", icon: <HelpCircle className="h-4 w-4" /> },
];

export default function MaintenancePage() {
  const [activeTab, setActiveTab] = useState<TabId>("instructors");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshPopoverOpen, setRefreshPopoverOpen] = useState(false);

  const handleRefresh = () => {
    if (activeTab !== "helper") {
      setRefreshKey((k) => k + 1);
      setRefreshPopoverOpen(false);
    }
  };

  const getRefreshMessage = () => {
    switch (activeTab) {
      case "instructors":
        return "Reload instructors list from the database";
      case "classes":
        return "Reload classes list from the database";
      case "locations":
        return "Reload locations list from the database";
      case "groups":
        return "Reload program groups list from the database";
      case "recipients":
        return "Reload email recipients list from the database";
      case "organization":
        return "Reload YMCA alliances, associations, and branches";
      default:
        return "";
    }
  };

  const isRefreshDisabled = activeTab === "helper";

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
          <Popover open={!isRefreshDisabled && refreshPopoverOpen} onOpenChange={() => {}}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={handleRefresh}
                onMouseEnter={() => !isRefreshDisabled && setRefreshPopoverOpen(true)}
                onMouseLeave={() => setRefreshPopoverOpen(false)}
                disabled={isRefreshDisabled}
                aria-label="Refresh data"
                className={`btn-pill inline-flex h-8 w-8 items-center justify-center shadow-sm ring-1 ring-black/10 transition ${
                  isRefreshDisabled
                    ? "cursor-not-allowed bg-gray-400/50 text-gray-500"
                    : "bg-[var(--cta)] text-[var(--cta-foreground)] hover:-translate-y-0.5 hover:shadow-md active:translate-y-px active:scale-[0.98]"
                }`}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
            >
              <PopoverArrow
                width={12}
                height={8}
                className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
              />
              {getRefreshMessage()}
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage instructors, classes, and locations for scheduling
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap gap-1 rounded-t-2xl bg-[var(--brand-gradient-strong)] p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
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
            {activeTab === "instructors" && <InstructorsTab key={`instructors-${refreshKey}`} />}
            {activeTab === "classes" && <ClassesTab key={`classes-${refreshKey}`} />}
            {activeTab === "locations" && <LocationsTab key={`locations-${refreshKey}`} />}
            {activeTab === "groups" && <GroupsTab key={`groups-${refreshKey}`} />}
            {activeTab === "recipients" && <RecipientsTab key={`recipients-${refreshKey}`} />}
            {activeTab === "organization" && <OrganizationTab key={`organization-${refreshKey}`} />}
            {activeTab === "helper" && <HelperTab />}
          </div>
        </div>
      </div>
    </div>
  );
}


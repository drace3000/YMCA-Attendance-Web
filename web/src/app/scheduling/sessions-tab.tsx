"use client";

import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo, useTransition } from "react";
import type * as React from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Mail,
  ChevronDown,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  Filter,
  Info,
  Loader2,
  OctagonAlert,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CalendarClock,
  Users,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { logError, getUserErrorMessage } from "@/lib/error-logger";
import { toTitleCaseWithYmcaAndOf } from "@/lib/toTitleCaseWithYmcaAndOf";
import {
  detectScheduleConflicts,
  getDefaultConflictEngineConfig,
  type ScheduleConflict,
  type InstructorAvailability,
  type SessionForConflicts,
} from "@/lib/scheduling/conflict-engine";
import { buildReschedulePreview, type ReschedulePreviewResult } from "@/lib/scheduling/reschedule-preview";
import {
  buildSlotHelperAvailability,
  type SlotHelperDayFilter,
  type SlotHelperHolidayClosure,
} from "@/lib/scheduling/slot-helper";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PopoverSelect } from "@/components/ui/popover-select";
import { PrintScheduleConflictsReportModal } from "@/components/scheduling-conflicts-report/PrintScheduleConflictsReportModal";

function ModalPortal({ children }: { children: React.ReactNode }): React.ReactPortal | null {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

type HeaderTooltipState = { text: string; el: HTMLElement };

function PortalTooltip({ text, rect }: { text: string; rect: DOMRect }): React.ReactPortal | null {
  if (typeof document === "undefined") return null;
  const left = rect.left + rect.width / 2;
  const top = rect.top;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left,
        top,
        transform: "translate(-50%, calc(-100% - 8px))",
      }}
      className="pointer-events-none z-[9999] whitespace-nowrap rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] px-3 py-2 text-xs font-semibold text-foreground shadow-xl backdrop-blur-md"
    >
      {text}
    </div>,
    document.body,
  );
}

export type Session = {
  id: string;
  branch_id: string;
  schedule_id: string;
  class_id: string;
  location_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  headcount: number | null;
  class: { id: string; name: string } | null;
  location: { id: string; code: string; name: string } | null;
  instructors: { id: string; nickname: string; first_name: string; last_name: string; readable_id?: string | null }[];
};

type ConflictSummary = { high: number; medium: number; low: number; total: number };

type ClassOption = { id: string; name: string };
type LocationOption = { id: string; code: string; name: string };
type InstructorOption = { id: string; nickname: string; first_name: string; last_name: string; readable_id?: string | null };

type AvailabilityRule = {
  id: string;
  instructor_id: string;
  schedule_month: string; // "YYYY-MM"
  day_of_week: string; // "MONDAY"..."SUNDAY"
  available_start: string; // "HH:mm"
  available_end: string; // "HH:mm"
};

type HolidayRule = {
  id: string;
  holiday_date: string; // "YYYY-MM-DD"
  observed_date?: string | null; // "YYYY-MM-DD"
  name: string;
  is_active: boolean;
  is_closed?: boolean;
  closed_start_time?: string | null; // "HH:mm" or "HH:mm:ss"
  closed_end_time?: string | null; // "HH:mm" or "HH:mm:ss"
};

type InstructorClassLocationDetail = {
  class_id: string;
  class_name: string | null;
  class_label?: string | null;
  instructor_id: string;
  instructor_nickname: string | null;
  instructor_label?: string | null;
  location_id: string;
  location_name: string | null;
  location_label?: string | null;
  minutes: number;
};

type SlotHelperOption = { id: string; label: string };

const SLOT_HELPER_DAY_PILLS = [
  { value: "SATURDAY", label: "SAT" },
  { value: "SUNDAY", label: "SUN" },
  { value: "MONDAY", label: "MON" },
  { value: "TUESDAY", label: "TUE" },
  { value: "WEDNESDAY", label: "WED" },
  { value: "THURSDAY", label: "THU" },
  { value: "FRIDAY", label: "FRI" },
] as const satisfies ReadonlyArray<{ value: Exclude<SlotHelperDayFilter, "ALL">; label: string }>;

type SlotHelperDayValue = (typeof SLOT_HELPER_DAY_PILLS)[number]["value"];

interface SlotHelperAppliedSelection {
  classId: string;
  locationId: string;
  instructorIds: string[];
  durationMinutes: number | null;
  transitionMinutes: number;
  turnoverMinutes: number;
  days: SlotHelperDayValue[];
}

interface SlotHelperClassIndex {
  instructorIds: string[];
  locationIds: string[];
  minutesAll: Set<number>;
  byInstructor: Map<
    string,
    {
      locationIds: Set<string>;
      minutesAll: Set<number>;
      minutesByLocation: Map<string, Set<number>>;
    }
  >;
  byLocation: Map<
    string,
    {
      instructorIds: Set<string>;
      minutesAll: Set<number>;
      minutesByInstructor: Map<string, Set<number>>;
    }
  >;
}

type SlotHelperReviewRequest = {
  id: string;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
  responded_at: string | null;
  completed_at: string | null;
  overridden_at: string | null;
  class_id: string | null;
  location_id: string | null;
  instructor_ids: string[];
};

type SlotHelperReviewHold = {
  id: string;
  request_id?: string;
  class_id?: string | null;
  location_id?: string | null;
  instructor_ids?: string[];
  slot_date: string;
  start_time: string;
  end_time: string;
  released_at?: string | null;
  consumed_at?: string | null;
  transition_minutes?: number;
  turnover_minutes?: number;
};

type SessionsTabProps = {
  scheduleId: string;
  branchId: string;
  programGroupId: string;
  refreshKey: number;
  scheduleApproved?: boolean;
  onApprovalBlockedAction?: (action: string) => void;
  onSessionsLoaded?: (sessions: Session[]) => void;
  onGridChange?: (payload: {
    sessions: Session[];
    criteria: string[];
    filteredCount: number;
    totalCount: number;
    conflictSummary: ConflictSummary;
  }) => void;
  filterDate?: string;
  filterDay?: string;
  filterWeekStart?: string;
  scheduleMonthYear?: { year: number; month: number } | null;
  branchName?: string;
  scheduleName?: string;
  availabilityTimeStart?: string;
  availabilityTimeEnd?: string;
};

type CreateFormData = {
  session_date: string;
  start_time: string;
  end_time: string;
  class_id: string;
  location_id: string;
  instructor_ids: string[];
  hold_id?: string | null;
};

type EditModalFormData = {
  session_date: string;
  start_time: string;
  end_time: string;
  class_id: string;
  location_id: string;
  instructor_ids: string[];
  headcount: number | null;
};

const DAY_OPTIONS = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

const DAY_ORDER: Record<string, number> = {
  SATURDAY: 0, SUNDAY: 1, MONDAY: 2, TUESDAY: 3, WEDNESDAY: 4, THURSDAY: 5, FRIDAY: 6,
};

const DAY_ABBREV: Record<string, string> = {
  SATURDAY: "SAT",
  SUNDAY: "SUN",
  MONDAY: "MON",
  TUESDAY: "TUE",
  WEDNESDAY: "WED",
  THURSDAY: "THU",
  FRIDAY: "FRI",
};
const SLOT_HELPER_ALL_DATES = "__ALL__";

function parseHHmmToMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function formatTimeAmPm(valueHHmm: string): string {
  const min = parseHHmmToMinutes(valueHHmm);
  if (min === null) return valueHHmm;
  let hh = Math.floor(min / 60);
  const mm = min % 60;
  const am = hh < 12;
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

function formatIsoDateForMessage(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  const year = d.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });
  return `${weekday} ${month} ${day} ${year}`.replace(/\s+/g, " ").trim();
}

function formatIsoDateMMDDYYYY(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const mm = isoDate.slice(5, 7);
  const dd = isoDate.slice(8, 10);
  const yyyy = isoDate.slice(0, 4);
  return `${mm}/${dd}/${yyyy}`;
}

function formatMonthShortYear(month: string): string {
  // month: YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const d = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  const m = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const y = d.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });
  return `${m} ${y}`;
}

type DragOffset = { x: number; y: number };

function isDragOffset(value: unknown): value is DragOffset {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number" &&
    Number.isFinite((value as { x: number }).x) &&
    Number.isFinite((value as { y: number }).y)
  );
}

type DraggableModal = {
  offset: DragOffset;
  setOffset: (next: DragOffset) => void;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
};

function useDraggableModal(
  isOpen: boolean,
  storageKey: string,
  onPersist?: (offset: DragOffset) => void,
): DraggableModal {
  const readStoredOffset = useCallback((): DragOffset | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "x" in parsed &&
        "y" in parsed &&
        typeof (parsed as { x?: unknown }).x === "number" &&
        typeof (parsed as { y?: unknown }).y === "number"
      ) {
        const x = (parsed as { x: number }).x;
        const y = (parsed as { y: number }).y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
      }
      return null;
    } catch {
      return null;
    }
  }, [storageKey]);

  const [offset, _setOffset] = useState<DragOffset>(() => readStoredOffset() ?? { x: 0, y: 0 });
  const offsetRef = useRef<DragOffset>(offset);
  const startRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const setOffset = useCallback((next: DragOffset) => {
    offsetRef.current = next;
    _setOffset(next);
  }, []);

  // On open, re-hydrate from localStorage (useful after page reload / different tab).
  useEffect(() => {
    if (!isOpen) return;
    const stored = readStoredOffset();
    if (!stored) return;
    setOffset(stored);
  }, [isOpen, readStoredOffset]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Left-click / primary touch only
      if ("button" in e && (e as unknown as { button: number }).button !== 0) return;
      e.preventDefault();
      startRef.current = {
        pointerId: e.pointerId,
        originX: offset.x,
        originY: offset.y,
        startClientX: e.clientX,
        startClientY: e.clientY,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [offset.x, offset.y],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    if (e.pointerId !== start.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - start.startClientX;
    const dy = e.clientY - start.startClientY;
    const next = { x: start.originX + dx, y: start.originY + dy };
    offsetRef.current = next;
    _setOffset(next);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    if (e.pointerId !== start.pointerId) return;
    e.preventDefault();
    startRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(offsetRef.current));
      } catch {
        // ignore storage failures (quota/private mode)
      }
    }
    try {
      onPersist?.(offsetRef.current);
    } catch {
      // never allow persistence callbacks to break dragging
    }
  }, [onPersist, storageKey]);

  return { offset, setOffset, handlePointerDown, handlePointerMove, handlePointerUp };
}

function dayOfWeekFromIsoDateUtc(isoDate: string): string | null {
  // Expect YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const name = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return String(name || "").trim().toUpperCase() || null;
}

type FilterField = "day" | "class" | "location" | "instructor";
type SearchMode = "narrow" | "find" | "smart";
type SortColumn = "class" | "location" | "instructor";
type SortDirection = "asc" | "desc";
type MediumConfirmContext =
  | { kind: "edit"; conflicts: ScheduleConflict[] }
  | { kind: "add"; conflicts: ScheduleConflict[] };

export function SessionsTab({
  scheduleId,
  branchId,
  programGroupId,
  refreshKey,
  scheduleApproved = true,
  onApprovalBlockedAction,
  onSessionsLoaded,
  onGridChange,
  filterDate,
  filterDay,
  filterWeekStart,
  scheduleMonthYear,
  branchName,
  scheduleName,
  availabilityTimeStart = "06:00",
  availabilityTimeEnd = "23:00",
}: SessionsTabProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConflicts, setSaveConflicts] = useState<ScheduleConflict[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictPopoverId, setConflictPopoverId] = useState<string | null>(null);

  // Edit session modal (replaces inline editing; inline edit UI will be removed in a later step)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalOpening, setEditModalOpening] = useState(false);
  const addDragStorageKey = useMemo(
    () => `ymca:scheduling:${branchId ?? "unknown"}:add-session-modal:offset`,
    [branchId],
  );
  const editDragStorageKey = useMemo(
    () => `ymca:scheduling:${branchId ?? "unknown"}:edit-session-modal:offset`,
    [branchId],
  );

  const persistUiOffset = useCallback(
    (
      key:
        | "add_session_modal_offset"
        | "edit_session_modal_offset"
        | "reschedule_preview_modal_offset"
        | "reschedule_email_modal_offset"
        | "slot_helper_modal_offset"
        | "slot_helper_review_email_modal_offset",
      offset: DragOffset,
    ) => {
      if (!branchId) return;
      if (process.env.NODE_ENV === "test") return;
      void (async () => {
        try {
          await fetch("/api/scheduling/ui-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ branch_id: branchId, key, value: offset }),
          });
        } catch {
          // best-effort only; localStorage still persists
        }
      })();
    },
    [branchId],
  );

  const editModalDrag = useDraggableModal(editModalOpen, editDragStorageKey, (offset) =>
    persistUiOffset("edit_session_modal_offset", offset),
  );
  const [editModalSessionId, setEditModalSessionId] = useState<string | null>(null);
  const [editModalForm, setEditModalForm] = useState<EditModalFormData>({
    session_date: "",
    start_time: "",
    end_time: "",
    class_id: "",
    location_id: "",
    instructor_ids: [],
    headcount: null,
  });
  const [editModalClassDropdownOpen, setEditModalClassDropdownOpen] = useState(false);
  const [editModalLocationDropdownOpen, setEditModalLocationDropdownOpen] = useState(false);
  const [editModalInstructorDropdownOpen, setEditModalInstructorDropdownOpen] = useState(false);

  // Add session modal
  const [addOpen, setAddOpen] = useState(false);
  const [addSessionOpening, setAddSessionOpening] = useState(false);
  const [isAddSessionTransitionPending, startAddSessionTransition] = useTransition();
  const addDrag = useDraggableModal(addOpen, addDragStorageKey, (offset) =>
    persistUiOffset("add_session_modal_offset", offset),
  );

  // Add Session Slot Helper (Phase I for Add flow)
  const [slotHelperOpen, setSlotHelperOpen] = useState(false);
  const slotHelperWeekdaysHydratedRef = useRef(false);
  const slotHelperWeekdaysBranchRef = useRef<string | null>(null);
  const slotHelperWeekdaysPersistKey = "slot_helper_weekdays";
  const slotHelperDateCollapsePersistKey = "slot_helper_date_collapse";
  const slotHelperAutoLocateHydratedRef = useRef(false);
  const slotHelperAutoLocateBranchRef = useRef<string | null>(null);
  const slotHelperAutoLocatePersistKey = "slot_helper_auto_locate";
  const slotHelperInstructorMultiSelectHydratedRef = useRef(false);
  const slotHelperInstructorMultiSelectPrevRef = useRef<boolean | null>(null);
  const slotHelperInstructorMultiSelectPersistKey = "slot_helper_instructor_multiselect";
  const slotHelperDragStorageKey = useMemo(
    () => `ymca:scheduling:${branchId ?? "unknown"}:slot-helper-modal:offset`,
    [branchId],
  );
  const slotHelperDrag = useDraggableModal(slotHelperOpen, slotHelperDragStorageKey, (offset) =>
    persistUiOffset("slot_helper_modal_offset", offset),
  );
  const slotHelperMultiDayDragStorageKey = useMemo(
    () => `ymca:scheduling:${branchId ?? "unknown"}:slot-helper-multi-day-modal:offset`,
    [branchId],
  );
  const [slotHelperClosing, setSlotHelperClosing] = useState(false);
  const slotHelperCloseSeq = useRef(0);
  const slotHelperSlotsScrollRef = useRef<HTMLDivElement | null>(null);
  const slotHelperAutoLocateAcceptedRef = useRef(false);
  const [slotHelperReviewOpen, setSlotHelperReviewOpen] = useState(false);
  const [slotHelperDurationMinutes, setSlotHelperDurationMinutes] = useState<number | null>(null);
  const [slotHelperTransitionMinutes, setSlotHelperTransitionMinutes] = useState(0);
  const [slotHelperTurnoverMinutes, setSlotHelperTurnoverMinutes] = useState(0);
  const [slotHelperSelectedDays, setSlotHelperSelectedDays] = useState<SlotHelperDayValue[]>(() =>
    SLOT_HELPER_DAY_PILLS.map((d) => d.value),
  );
  const slotHelperWeekdaysPrevRef = useRef<SlotHelperDayValue[] | null>(null);
  const slotHelperDateCollapsePrevRef = useRef<Record<string, boolean> | null>(null);
  const [slotHelperSelectedClassId, setSlotHelperSelectedClassId] = useState<string | null>(null);
  const [slotHelperSelectedSlotKeys, setSlotHelperSelectedSlotKeys] = useState<string[]>([]);
  const [slotHelperSelectedLocationId, setSlotHelperSelectedLocationId] = useState<string | null>(null);
  const [slotHelperSelectedInstructorIds, setSlotHelperSelectedInstructorIds] = useState<string[]>([]);
  const [slotHelperSelectedSlotsExpanded, setSlotHelperSelectedSlotsExpanded] = useState(true);
  const [slotHelperSelectedDates, setSlotHelperSelectedDates] = useState<string[]>([]);
  const [slotHelperCollapsedDates, setSlotHelperCollapsedDates] = useState<Record<string, boolean>>({});
  const slotHelperDateStateHydratedRef = useRef(false);
  const slotHelperDateStateBranchRef = useRef<string | null>(null);
  const [slotHelperClearSelectedOpen, setSlotHelperClearSelectedOpen] = useState(false);
  const [slotHelperDateFilterOpen, setSlotHelperDateFilterOpen] = useState(false);
  const [slotHelperAutoLocateEnabled, setSlotHelperAutoLocateEnabled] = useState(true);
  const slotHelperAutoLocatePrevRef = useRef<boolean | null>(null);
  const [slotHelperInstructorMultiSelect, setSlotHelperInstructorMultiSelect] = useState(false);
  const [slotHelperMultiDayOpen, setSlotHelperMultiDayOpen] = useState(false);
  const [slotHelperMultiDayDays, setSlotHelperMultiDayDays] = useState<SlotHelperDayValue[]>([]);
  const [slotHelperMultiDayOptions, setSlotHelperMultiDayOptions] = useState<
    Array<{ key: string; date: string; start_time: string; end_time: string; label: string; checked: boolean }>
  >([]);
  const slotHelperMultiDayDrag = useDraggableModal(slotHelperMultiDayOpen, slotHelperMultiDayDragStorageKey, (offset) =>
    persistUiOffset("slot_helper_multi_day_modal_offset", offset),
  );

  const slotHelperMultiDayCheckedCount = useMemo(() => {
    return slotHelperMultiDayOptions.filter((o) => o.checked).length;
  }, [slotHelperMultiDayOptions]);

  const slotHelperMultiDayAllChecked =
    slotHelperMultiDayOptions.length > 0 &&
    slotHelperMultiDayCheckedCount === slotHelperMultiDayOptions.length;

  const toggleSlotHelperMultiDaySelectAll = useCallback(() => {
    setSlotHelperMultiDayOptions((prev) => {
      if (prev.length === 0) return prev;
      const allChecked = prev.every((p) => p.checked);
      const nextChecked = !allChecked;
      return prev.map((p) => (p.checked === nextChecked ? p : { ...p, checked: nextChecked }));
    });
  }, []);
  const [slotHelperRulesPopoverOpen, setSlotHelperRulesPopoverOpen] = useState(false);
  const [slotHelperRulesTooltipOpen, setSlotHelperRulesTooltipOpen] = useState(false);
  const [slotHelperTotalTooltipOpen, setSlotHelperTotalTooltipOpen] = useState(false);
  useEffect(() => {
    slotHelperWeekdaysHydratedRef.current = false;
    slotHelperWeekdaysBranchRef.current = branchId ?? null;
    slotHelperDateStateHydratedRef.current = false;
    slotHelperDateStateBranchRef.current = branchId ?? null;
    slotHelperAutoLocateHydratedRef.current = false;
    slotHelperAutoLocateBranchRef.current = branchId ?? null;
    slotHelperInstructorMultiSelectHydratedRef.current = false;
    slotHelperInstructorMultiSelectPrevRef.current = null;
  }, [branchId]);

  // Slot helper multi-day popup position: load from DB on-demand if localStorage doesn't have it yet.
  useEffect(() => {
    if (!slotHelperMultiDayOpen) return;
    if (!branchId) return;
    if (process.env.NODE_ENV === "test") return;
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(slotHelperMultiDayDragStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isDragOffset(parsed)) return; // already cached
      }
    } catch {
      // continue to fetch
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/scheduling/ui-state?branch_id=${encodeURIComponent(branchId)}`);
        if (!res.ok) return;
        const json = (await res.json()) as { slotHelperMultiDayOffset?: unknown };
        if (cancelled) return;

        if (isDragOffset(json.slotHelperMultiDayOffset)) {
          try {
            window.localStorage.setItem(
              slotHelperMultiDayDragStorageKey,
              JSON.stringify(json.slotHelperMultiDayOffset),
            );
          } catch {
            // ignore
          }
          slotHelperMultiDayDrag.setOffset(json.slotHelperMultiDayOffset);
        }
      } catch {
        // best-effort only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, slotHelperMultiDayDrag, slotHelperMultiDayDragStorageKey, slotHelperMultiDayOpen]);

  useEffect(() => {
    if (!slotHelperOpen) {
      setSlotHelperMultiDayOpen(false);
      setSlotHelperMultiDayOptions([]);
      setSlotHelperMultiDayDays([]);
    }
  }, [slotHelperOpen]);

  const normalizeSlotHelperWeekdays = useCallback((values: string[]): SlotHelperDayValue[] => {
    const allowed = new Set(SLOT_HELPER_DAY_PILLS.map((d) => d.value));
    const order = new Map(SLOT_HELPER_DAY_PILLS.map((x, idx) => [x.value, idx] as const));
    const seen = new Set<string>();
    const filtered = values.filter((v) => {
      if (!allowed.has(v)) return false;
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    }) as SlotHelperDayValue[];
    return filtered.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  }, []);

  const normalizeSlotHelperDatesRaw = useCallback((values: string[]): string[] => {
    if (values.includes(SLOT_HELPER_ALL_DATES)) return [SLOT_HELPER_ALL_DATES];
    const seen = new Set<string>();
    const filtered = values
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .filter((v) => {
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      });
    return filtered.slice().sort((a, b) => a.localeCompare(b));
  }, []);
useEffect(() => {
  if (!slotHelperOpen) return;
  if (!branchId) return;
  if (process.env.NODE_ENV === "test") return;
  if (typeof window === "undefined") return;
  if (slotHelperWeekdaysHydratedRef.current && slotHelperWeekdaysBranchRef.current === branchId) return;
  slotHelperWeekdaysHydratedRef.current = true;
  slotHelperWeekdaysBranchRef.current = branchId;
  let cancelled = false;
  void (async () => {
    try {
      const res = await fetch(`/api/scheduling/ui-state?branch_id=${encodeURIComponent(branchId)}`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        slotHelperWeekdays?: unknown;
        slotHelperDateFilter?: unknown;
        slotHelperDateCollapse?: unknown;
        slotHelperAutoLocate?: unknown;
        slotHelperInstructorMultiSelect?: unknown;
      };
      if (cancelled) return;
      const normalized = Array.isArray(json.slotHelperWeekdays)
        ? normalizeSlotHelperWeekdays(json.slotHelperWeekdays as string[])
        : [];
      const nextDays =
        normalized.length > 0 ? normalized : (SLOT_HELPER_DAY_PILLS.map((d) => d.value) as SlotHelperDayValue[]);
      slotHelperWeekdaysPrevRef.current = nextDays;
      setSlotHelperSelectedDays(nextDays);

      if (!slotHelperDateStateHydratedRef.current) {
        const rawCollapse =
          typeof json.slotHelperDateCollapse === "object" && json.slotHelperDateCollapse !== null
            ? (json.slotHelperDateCollapse as Record<string, unknown>)
            : {};
        const nextCollapse: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(rawCollapse)) {
          if (typeof v === "boolean") nextCollapse[k] = v;
        }
        slotHelperDateCollapsePrevRef.current = nextCollapse;
        setSlotHelperCollapsedDates(nextCollapse);

        slotHelperDateStateHydratedRef.current = true;
        slotHelperDateStateBranchRef.current = branchId;
      }

      // Auto Locate (default ON) - hydrate per user+branch
      if (!slotHelperAutoLocateHydratedRef.current) {
        const raw = json.slotHelperAutoLocate;
        const next = typeof raw === "boolean" ? raw : true;
        slotHelperAutoLocatePrevRef.current = next;
        setSlotHelperAutoLocateEnabled(next);
        slotHelperAutoLocateHydratedRef.current = true;
        slotHelperAutoLocateBranchRef.current = branchId;
      }

      if (!slotHelperInstructorMultiSelectHydratedRef.current) {
        const raw = json.slotHelperInstructorMultiSelect;
        const next = typeof raw === "boolean" ? raw : false;
        slotHelperInstructorMultiSelectPrevRef.current = next;
        setSlotHelperInstructorMultiSelect(next);
        slotHelperInstructorMultiSelectHydratedRef.current = true;
      }
    } catch {
      // best effort; fallback remains current state
    }
  })();
  return () => {
    cancelled = true;
  };
}, [branchId, normalizeSlotHelperDatesRaw, normalizeSlotHelperWeekdays, slotHelperOpen]);

useEffect(() => {
  if (!slotHelperOpen) return;
  if (!branchId) return;
  if (process.env.NODE_ENV === "test") return;
  if (!slotHelperAutoLocateHydratedRef.current) return;
  const prev = slotHelperAutoLocatePrevRef.current;
  if (prev !== null && prev === slotHelperAutoLocateEnabled) return;
  slotHelperAutoLocatePrevRef.current = slotHelperAutoLocateEnabled;
  void (async () => {
    try {
      await fetch("/api/scheduling/ui-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          key: slotHelperAutoLocatePersistKey,
          value: slotHelperAutoLocateEnabled,
        }),
      });
    } catch {
      // best effort
    }
  })();
}, [branchId, slotHelperAutoLocateEnabled, slotHelperAutoLocatePersistKey, slotHelperOpen]);
useEffect(() => {
  if (!slotHelperOpen) return;
  if (!branchId) return;
  if (process.env.NODE_ENV === "test") return;
  if (!slotHelperInstructorMultiSelectHydratedRef.current) return;
  const prev = slotHelperInstructorMultiSelectPrevRef.current;
  if (prev !== null && prev === slotHelperInstructorMultiSelect) return;
  slotHelperInstructorMultiSelectPrevRef.current = slotHelperInstructorMultiSelect;
  void (async () => {
    try {
      await fetch("/api/scheduling/ui-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          key: slotHelperInstructorMultiSelectPersistKey,
          value: slotHelperInstructorMultiSelect,
        }),
      });
    } catch {
      // best effort
    }
  })();
}, [branchId, slotHelperInstructorMultiSelect, slotHelperInstructorMultiSelectPersistKey, slotHelperOpen]);
useEffect(() => {
  if (!slotHelperOpen) return;
  if (!branchId) return;
  if (process.env.NODE_ENV === "test") return;
  if (!slotHelperWeekdaysHydratedRef.current) return;
  const normalized = normalizeSlotHelperWeekdays(slotHelperSelectedDays);
  const prev = slotHelperWeekdaysPrevRef.current;
  if (prev && prev.length === normalized.length && prev.every((v, i) => v === normalized[i])) return;
  slotHelperWeekdaysPrevRef.current = normalized;
  void (async () => {
    try {
      await fetch("/api/scheduling/ui-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          key: slotHelperWeekdaysPersistKey,
          value: normalized,
        }),
      });
    } catch {
      // best effort
    }
  })();
}, [branchId, normalizeSlotHelperWeekdays, slotHelperOpen, slotHelperSelectedDays, slotHelperWeekdaysPersistKey]);

useEffect(() => {
  if (!slotHelperOpen) return;
  if (!branchId) return;
  if (process.env.NODE_ENV === "test") return;
  if (!slotHelperDateStateHydratedRef.current) return;

  const collapseMap = slotHelperCollapsedDates;
  const prevCollapse = slotHelperDateCollapsePrevRef.current;
  const collapseChanged =
    !prevCollapse ||
    Object.keys(collapseMap).length !== Object.keys(prevCollapse).length ||
    Object.entries(collapseMap).some(([k, v]) => prevCollapse[k] !== v);

  if (collapseChanged) {
    slotHelperDateCollapsePrevRef.current = collapseMap;
    void (async () => {
      try {
        await fetch("/api/scheduling/ui-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: branchId,
            key: slotHelperDateCollapsePersistKey,
            value: collapseMap,
          }),
        });
      } catch {
        // best effort
      }
    })();
  }
}, [
  branchId,
  slotHelperCollapsedDates,
  slotHelperDateCollapsePersistKey,
  slotHelperOpen,
]);
  const slotHelperSelectionScrollRef = useRef<HTMLDivElement | null>(null);
  const slotHelperBottomRefreshRef = useRef<HTMLButtonElement | null>(null);
  const [slotHelperBottomRefreshVisible, setSlotHelperBottomRefreshVisible] = useState(true);
  const [slotHelperApplied, setSlotHelperApplied] = useState<SlotHelperAppliedSelection | null>(null);
  const [slotHelperRefreshing, setSlotHelperRefreshing] = useState(false);
  const [slotHelperClassDropdownOpen, setSlotHelperClassDropdownOpen] = useState(false);
  const [slotHelperLocationDropdownOpen, setSlotHelperLocationDropdownOpen] = useState(false);
  const slotHelperLocationDropdownOpenRef = useRef(false);
  const slotHelperWasRefreshingRef = useRef(false);
  const [slotHelperInstructorDropdownOpen, setSlotHelperInstructorDropdownOpen] = useState(false);
  const [slotHelperMappingRows, setSlotHelperMappingRows] = useState<InstructorClassLocationDetail[]>([]);
  const [slotHelperMappingLoading, setSlotHelperMappingLoading] = useState(false);
  const [slotHelperMappingError, setSlotHelperMappingError] = useState<string | null>(null);
  const [slotHelperHierarchyLabel, setSlotHelperHierarchyLabel] = useState<{
    allianceName: string | null;
    associationName: string | null;
    branchName: string | null;
  }>({ allianceName: null, associationName: null, branchName: branchName ?? null });
  const [slotHelperReviewEmailModalOpen, setSlotHelperReviewEmailModalOpen] = useState(false);
  const [slotHelperReviewEmailSending, setSlotHelperReviewEmailSending] = useState(false);
  const [slotHelperReviewEmailError, setSlotHelperReviewEmailError] = useState<string | null>(null);
  const [slotHelperReviewEmailSuccess, setSlotHelperReviewEmailSuccess] = useState(false);
  const [slotHelperReviewRequests, setSlotHelperReviewRequests] = useState<SlotHelperReviewRequest[]>([]);
  const [slotHelperReviewRequestsLoading, setSlotHelperReviewRequestsLoading] = useState(false);
  const [slotHelperReviewRequestsError, setSlotHelperReviewRequestsError] = useState<string | null>(null);
  const [slotHelperReviewRequestId, setSlotHelperReviewRequestId] = useState<string | null>(null);
  const slotHelperReviewRequestIdRef = useRef<string | null>(null);
  const [slotHelperReviewRequestDetail, setSlotHelperReviewRequestDetail] = useState<{
    expired: boolean;
    request: SlotHelperReviewRequest & {
      response_selected_hold_ids?: string[];
      response_comment?: string | null;
      completed_at?: string | null;
      overridden_at?: string | null;
    };
    email?: { sent_at: string; from_email: string; to_email: string; subject: string; message_id: string | null } | null;
    holds: SlotHelperReviewHold[];
  } | null>(null);
  const slotHelperSkipClassResetRef = useRef(false);
  const slotHelperLastPrefilledRequestIdRef = useRef<string | null>(null);
  const slotHelperSkipSelectedSlotClearRef = useRef(false);
  const [slotHelperReviewRequestDetailLoading, setSlotHelperReviewRequestDetailLoading] = useState(false);
  const [slotHelperReviewRequestActionLoading, setSlotHelperReviewRequestActionLoading] = useState(false);
  const [slotHelperReviewRequestActionError, setSlotHelperReviewRequestActionError] = useState<string | null>(null);
  const [slotHelperActiveHolds, setSlotHelperActiveHolds] = useState<SlotHelperReviewHold[]>([]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c] as const)), [classes]);
  const instructorById = useMemo(() => new Map(instructors.map((i) => [i.id, i] as const)), [instructors]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l] as const)), [locations]);

  const slotHelperReviewEmailDragStorageKey = useMemo(
    () => `ymca:scheduling:${branchId ?? "unknown"}:slot-helper-review-email-modal:offset`,
    [branchId],
  );
  const slotHelperReviewEmailDrag = useDraggableModal(
    slotHelperReviewEmailModalOpen,
    slotHelperReviewEmailDragStorageKey,
    (offset) => persistUiOffset("slot_helper_review_email_modal_offset", offset),
  );

  // Reschedule (Phase I) preview modal
  const [reschedulePreviewOpen, setReschedulePreviewOpen] = useState(false);
  const [reschedulePreviewComputing, setReschedulePreviewComputing] = useState(false);
  const [reschedulePreviewError, setReschedulePreviewError] = useState<string | null>(null);
  const [reschedulePreviewResults, setReschedulePreviewResults] = useState<ReschedulePreviewResult[] | null>(
    null,
  );
  const [rescheduleSelectedSessionIds, setRescheduleSelectedSessionIds] = useState<string[]>([]);
  const [rescheduleTargetInstructorId, setRescheduleTargetInstructorId] = useState<string | null>(null);
  const [rescheduleEmailModalOpen, setRescheduleEmailModalOpen] = useState(false);
  const [rescheduleEmailSending, setRescheduleEmailSending] = useState(false);
  const [rescheduleEmailError, setRescheduleEmailError] = useState<string | null>(null);
  const [rescheduleEmailSuccess, setRescheduleEmailSuccess] = useState(false);
  const [rescheduleAdditionalInstructorEmails, setRescheduleAdditionalInstructorEmails] = useState<string>("");
  const [rescheduleStatusLoading, setRescheduleStatusLoading] = useState(false);
  const [rescheduleStatus, setRescheduleStatus] = useState<{
    email: { sent_at: string; from_email: string; to_email: string; subject: string; message_id: string | null } | null;
    request: { responded_at: string | null; response_selected_session_ids: string[]; created_at: string; expires_at: string } | null;
    instructor_email: string | null;
  } | null>(null);
  const reschedulePreviewDragStorageKey = useMemo(
    () => `ymca:scheduling:${branchId ?? "unknown"}:reschedule-preview-modal:offset`,
    [branchId],
  );
  const reschedulePreviewDrag = useDraggableModal(reschedulePreviewOpen, reschedulePreviewDragStorageKey, (offset) =>
    persistUiOffset("reschedule_preview_modal_offset", offset),
  );

  const rescheduleEmailDragStorageKey = useMemo(
    () => `ymca:scheduling:${branchId ?? "unknown"}:reschedule-email-modal:offset`,
    [branchId],
  );
  const rescheduleEmailDrag = useDraggableModal(rescheduleEmailModalOpen, rescheduleEmailDragStorageKey, (offset) =>
    persistUiOffset("reschedule_email_modal_offset", offset),
  );

  const rescheduleSelectableSessionIds = useMemo((): string[] => {
    const rows = reschedulePreviewResults ?? [];
    return rows
      .filter((r) => r && r.session_id && r.proposal && !("reason" in r.proposal))
      .map((r) => r.session_id);
  }, [reschedulePreviewResults]);

  const rescheduleFeedbackRequestPayload = useMemo(() => {
    const rows = (reschedulePreviewResults ?? []).map((row) => {
      const s = sessions.find((x) => x.id === row.session_id) ?? null;
      const currentDate = s?.session_date ? formatIsoDateForMessage(s.session_date) : "-";
      const currentStart = s?.start_time ? formatTimeAmPm(s.start_time.slice(0, 5)) : "-";
      const currentEnd = s?.end_time ? formatTimeAmPm(s.end_time.slice(0, 5)) : "-";
      const currentClass = s?.class?.name || "-";
      const currentLocation = s?.location ? `${s.location.code} - ${s.location.name}` : "-";

      const proposed =
        "reason" in row.proposal
          ? null
          : {
              date: formatIsoDateForMessage(row.proposal.date),
              start: formatTimeAmPm(row.proposal.start_time),
              end: formatTimeAmPm(row.proposal.end_time),
            };

      return {
        session_id: row.session_id,
        current: { date: currentDate, start: currentStart, end: currentEnd, class: currentClass, location: currentLocation },
        proposed: proposed ?? undefined,
      };
    });
    return { rows };
  }, [reschedulePreviewResults, sessions]);

  const instructorSelectedSessionIds = useMemo((): string[] => {
    const ids = rescheduleStatus?.request?.response_selected_session_ids ?? [];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && x.trim()) : [];
  }, [rescheduleStatus]);

  const instructorSelectedSet = useMemo(() => new Set(instructorSelectedSessionIds), [instructorSelectedSessionIds]);

  const rescheduleInstructorLabel = useMemo((): string => {
    // Avoid referencing the availability VM before it's declared; derive from edit modal data (already available).
    const selectedId = (editModalForm.instructor_ids?.[0] ?? "").trim();
    if (!selectedId) return "Instructor";
    const inst = instructors.find((i) => i.id === selectedId) ?? null;
    const label = (inst?.nickname ?? "").trim() || `${inst?.first_name ?? ""} ${inst?.last_name ?? ""}`.trim();
    return label || "Instructor";
  }, [editModalForm.instructor_ids, instructors]);

  const rescheduleExpiresLabel = useMemo((): string | null => {
    const iso = rescheduleStatus?.request?.expires_at ?? null;
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(((d.getHours() + 11) % 12) + 1).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    return `${mm}/${dd}/${yy} @ ${hh}:${min} ${ampm}`;
  }, [rescheduleStatus?.request?.expires_at]);

  const rescheduleSelectedSet = useMemo(
    () => new Set<string>(rescheduleSelectedSessionIds),
    [rescheduleSelectedSessionIds],
  );

  const rescheduleSelectAllChecked = useMemo((): boolean => {
    if (rescheduleSelectableSessionIds.length === 0) return false;
    return rescheduleSelectableSessionIds.every((id) => rescheduleSelectedSet.has(id));
  }, [rescheduleSelectableSessionIds, rescheduleSelectedSet]);

  const toggleRescheduleSelectAll = useCallback(() => {
    setRescheduleSelectedSessionIds((prev) => {
      const prevSet = new Set(prev);
      const allSelected =
        rescheduleSelectableSessionIds.length > 0 &&
        rescheduleSelectableSessionIds.every((id) => prevSet.has(id));
      return allSelected ? [] : [...rescheduleSelectableSessionIds];
    });
  }, [rescheduleSelectableSessionIds]);

  const toggleRescheduleSelected = useCallback((sessionId: string) => {
    setRescheduleSelectedSessionIds((prev) => {
      const has = prev.includes(sessionId);
      return has ? prev.filter((x) => x !== sessionId) : [...prev, sessionId];
    });
  }, []);

  const applyInstructorSelections = useCallback(() => {
    const allowed = new Set(rescheduleSelectableSessionIds);
    const selected = instructorSelectedSessionIds.filter((id) => allowed.has(id));
    setRescheduleSelectedSessionIds(selected);
  }, [instructorSelectedSessionIds, rescheduleSelectableSessionIds]);

  // If the instructor has already responded, auto-check the selected rows so managers don't have to
  // manually re-select them. This is additive (union) and does not remove any manager selections.
  useEffect(() => {
    if (!reschedulePreviewOpen) return;
    if (instructorSelectedSessionIds.length === 0) return;
    if (rescheduleSelectableSessionIds.length === 0) return;

    setRescheduleSelectedSessionIds((prev) => {
      const allowed = new Set(rescheduleSelectableSessionIds);
      const next = new Set(prev);
      let changed = false;

      for (const id of instructorSelectedSessionIds) {
        if (!allowed.has(id)) continue;
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }

      return changed ? Array.from(next) : prev;
    });
  }, [instructorSelectedSessionIds, reschedulePreviewOpen, rescheduleSelectableSessionIds]);

  const refreshRescheduleStatus = useCallback(async (): Promise<void> => {
    if (!branchId || !scheduleId) return;
    if (!rescheduleTargetInstructorId) return;

    setRescheduleStatusLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branchId);
      params.set("schedule_id", scheduleId);
      params.set("instructor_id", rescheduleTargetInstructorId);
      const res = await fetch(`/api/scheduling/reschedule-feedback/status?${params.toString()}`);
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setRescheduleStatus(null);
        return;
      }
      setRescheduleStatus({
        email: json?.email ?? null,
        request: json?.request ?? null,
        instructor_email: typeof json?.instructor_email === "string" ? json.instructor_email : null,
      });
    } catch {
      setRescheduleStatus(null);
    } finally {
      setRescheduleStatusLoading(false);
    }
  }, [branchId, rescheduleTargetInstructorId, scheduleId]);

  const sendRescheduleFeedbackEmail = useCallback(async (): Promise<void> => {
    if (!branchId || !scheduleId) return;
    if (!rescheduleTargetInstructorId) return;

    setRescheduleEmailSending(true);
    setRescheduleEmailError(null);
    setRescheduleEmailSuccess(false);
    try {
      const extrasRaw = rescheduleAdditionalInstructorEmails.trim();
      const extras = extrasRaw
        ? Array.from(
            new Set(
              extrasRaw
                .split(/[,;\n]+/)
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean),
            ),
          )
        : [];
      const res = await fetch(`/api/scheduling/reschedule-feedback/send?branch_id=${encodeURIComponent(branchId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: scheduleId,
          instructor_id: rescheduleTargetInstructorId,
          request_payload: rescheduleFeedbackRequestPayload,
          ...(extras.length > 0 ? { additional_emails: extras } : null),
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setRescheduleEmailError(json?.error || "Failed to send email");
        return;
      }
      setRescheduleEmailSuccess(true);
      await refreshRescheduleStatus();
    } catch (err) {
      setRescheduleEmailError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setRescheduleEmailSending(false);
    }
  }, [
    branchId,
    refreshRescheduleStatus,
    rescheduleAdditionalInstructorEmails,
    rescheduleFeedbackRequestPayload,
    rescheduleTargetInstructorId,
    scheduleId,
  ]);
  const [addForm, setAddForm] = useState<CreateFormData>({
    session_date: "",
    start_time: "",
    end_time: "",
    class_id: "",
    location_id: "",
    instructor_ids: [],
    hold_id: null,
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addConflicts, setAddConflicts] = useState<ScheduleConflict[] | null>(null);
  const [mediumConfirm, setMediumConfirm] = useState<MediumConfirmContext | null>(null);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null);
  const [deleteConfirmError, setDeleteConfirmError] = useState<string | null>(null);

  const deleteConfirmSession = useMemo((): Session | null => {
    if (!deleteConfirmSessionId) return null;
    return sessions.find((s) => s.id === deleteConfirmSessionId) ?? null;
  }, [deleteConfirmSessionId, sessions]);

  const deleteConfirmMonthLabel = useMemo((): string | null => {
    if (scheduleMonthYear?.year && scheduleMonthYear?.month) {
      return formatMonthShortYear(
        `${scheduleMonthYear.year}-${String(scheduleMonthYear.month).padStart(2, "0")}`,
      );
    }
    if (deleteConfirmSession?.session_date) {
      return formatMonthShortYear(deleteConfirmSession.session_date.slice(0, 7));
    }
    return null;
  }, [deleteConfirmSession?.session_date, scheduleMonthYear]);

  const deleteConfirmInstructorLabel = useMemo((): string => {
    const list = deleteConfirmSession?.instructors ?? [];
    if (list.length === 0) return "-";
    return list
      .map((i) => i.nickname || `${i.first_name ?? ""} ${i.last_name ?? ""}`.trim())
      .filter(Boolean)
      .join(", ") || "-";
  }, [deleteConfirmSession?.instructors]);

  // When user clicks a session row to edit, show a wait cursor immediately until the modal appears.
  const editWaitCursorPrevRef = useRef<string | null>(null);
  const editWaitCursorPrevTagRef = useRef<string | null>(null);

  // Load DB-backed UI offsets (best-effort) and seed localStorage so the drag hook picks them up.
  useEffect(() => {
    if (!branchId) return;
    if (process.env.NODE_ENV === "test") return;
    if (typeof window === "undefined") return;

    // Optimization: if we already have both offsets cached for this branch, skip the server read.
    // This avoids a DB-backed GET on most reloads while still persisting changes on drag end.
    const hasCachedOffsets = (() => {
      try {
        const addRaw = window.localStorage.getItem(addDragStorageKey);
        const editRaw = window.localStorage.getItem(editDragStorageKey);
        if (!addRaw || !editRaw) return false;

        const addParsed = JSON.parse(addRaw) as unknown;
        const editParsed = JSON.parse(editRaw) as unknown;
        return isDragOffset(addParsed) && isDragOffset(editParsed);
      } catch {
        return false;
      }
    })();

    if (hasCachedOffsets) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/scheduling/ui-state?branch_id=${encodeURIComponent(branchId)}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          addOffset?: unknown;
          editOffset?: unknown;
        };
        if (cancelled) return;

        if (isDragOffset(json.addOffset)) {
          try {
            window.localStorage.setItem(addDragStorageKey, JSON.stringify(json.addOffset));
          } catch {
            // ignore
          }
        }
        if (isDragOffset(json.editOffset)) {
          try {
            window.localStorage.setItem(editDragStorageKey, JSON.stringify(json.editOffset));
          } catch {
            // ignore
          }
        }
      } catch {
        // best-effort only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addDragStorageKey, branchId, editDragStorageKey]);

  // Reschedule preview modal position: load from DB on-demand if localStorage doesn't have it yet.
  useEffect(() => {
    if (!reschedulePreviewOpen) return;
    if (!branchId) return;
    if (process.env.NODE_ENV === "test") return;
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(reschedulePreviewDragStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isDragOffset(parsed)) return; // already cached
      }
    } catch {
      // continue to fetch
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/scheduling/ui-state?branch_id=${encodeURIComponent(branchId)}`);
        if (!res.ok) return;
        const json = (await res.json()) as { rescheduleOffset?: unknown };
        if (cancelled) return;

        if (isDragOffset(json.rescheduleOffset)) {
          try {
            window.localStorage.setItem(
              reschedulePreviewDragStorageKey,
              JSON.stringify(json.rescheduleOffset),
            );
          } catch {
            // ignore
          }
          reschedulePreviewDrag.setOffset(json.rescheduleOffset);
        }
      } catch {
        // best-effort only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, reschedulePreviewDrag, reschedulePreviewDragStorageKey, reschedulePreviewOpen]);

  // Reschedule email modal position: load from DB on-demand if localStorage doesn't have it yet.
  useEffect(() => {
    if (!rescheduleEmailModalOpen) return;
    if (!branchId) return;
    if (process.env.NODE_ENV === "test") return;
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(rescheduleEmailDragStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isDragOffset(parsed)) return; // already cached
      }
    } catch {
      // continue to fetch
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/scheduling/ui-state?branch_id=${encodeURIComponent(branchId)}`);
        if (!res.ok) return;
        const json = (await res.json()) as { rescheduleEmailOffset?: unknown };
        if (cancelled) return;

        if (isDragOffset(json.rescheduleEmailOffset)) {
          try {
            window.localStorage.setItem(
              rescheduleEmailDragStorageKey,
              JSON.stringify(json.rescheduleEmailOffset),
            );
          } catch {
            // ignore
          }
          rescheduleEmailDrag.setOffset(json.rescheduleEmailOffset);
        }
      } catch {
        // best-effort only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, rescheduleEmailDrag, rescheduleEmailDragStorageKey, rescheduleEmailModalOpen]);

  // Slot helper review email modal position: load from DB on-demand if localStorage doesn't have it yet.
  useEffect(() => {
    if (!slotHelperReviewEmailModalOpen) return;
    if (!branchId) return;
    if (process.env.NODE_ENV === "test") return;
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(slotHelperReviewEmailDragStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isDragOffset(parsed)) return; // already cached
      }
    } catch {
      // continue to fetch
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/scheduling/ui-state?branch_id=${encodeURIComponent(branchId)}`);
        if (!res.ok) return;
        const json = (await res.json()) as { slotHelperReviewEmailOffset?: unknown };
        if (cancelled) return;

        if (isDragOffset(json.slotHelperReviewEmailOffset)) {
          try {
            window.localStorage.setItem(
              slotHelperReviewEmailDragStorageKey,
              JSON.stringify(json.slotHelperReviewEmailOffset),
            );
          } catch {
            // ignore
          }
          slotHelperReviewEmailDrag.setOffset(json.slotHelperReviewEmailOffset);
        }
      } catch {
        // best-effort only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    branchId,
    slotHelperReviewEmailDrag,
    slotHelperReviewEmailDragStorageKey,
    slotHelperReviewEmailModalOpen,
  ]);

  const shouldStartModalDrag = useCallback((target: EventTarget | null): boolean => {
    const el = target instanceof Element ? target : null;
    if (!el) return true;
    // Don't start dragging when the user is trying to interact with controls.
    if (
      el.closest(
        [
          "button",
          "a",
          "input",
          "textarea",
          "select",
          "[role='button']",
          "[role='menuitem']",
          "[contenteditable='true']",
          "[data-no-drag='true']",
        ].join(", "),
      )
    ) {
      return false;
    }
    return true;
  }, []);

  useEffect(() => {
    if (editModalOpening) {
      if (typeof document === "undefined") return;
      if (editWaitCursorPrevRef.current === null) {
        editWaitCursorPrevRef.current = document.body.style.cursor || "";
        editWaitCursorPrevTagRef.current = document.body.dataset.ymcaWaitCursor ?? null;
      }
      document.body.dataset.ymcaWaitCursor = "edit-open";
      document.body.style.cursor = "wait";
      return;
    }

    if (typeof document === "undefined") return;
    if (document.body.dataset.ymcaWaitCursor === "edit-open") {
      document.body.style.cursor = editWaitCursorPrevRef.current ?? "";
      const prev = editWaitCursorPrevTagRef.current;
      if (prev) document.body.dataset.ymcaWaitCursor = prev;
      else delete document.body.dataset.ymcaWaitCursor;
    }
    editWaitCursorPrevRef.current = null;
    editWaitCursorPrevTagRef.current = null;
  }, [editModalOpening]);

  useEffect(() => {
    // As soon as the modal is actually open/rendering, stop the wait cursor.
    if (editModalOpen) setEditModalOpening(false);
  }, [editModalOpen]);

  const resolveInstructorLabel = useCallback(
    (instructorId: string, sessionId?: string | null): string | null => {
      const opt = instructors.find((i) => i.id === instructorId) ?? null;
      const fromOpt =
        (opt?.nickname || `${opt?.first_name ?? ""} ${opt?.last_name ?? ""}`.trim()).trim() || null;
      if (fromOpt) return fromOpt;

      if (!sessionId) return null;
      const session = sessions.find((s) => s.id === sessionId) ?? null;
      const inst = session?.instructors.find((x) => x.id === instructorId) ?? null;
      const fromSession =
        (inst?.nickname || `${inst?.first_name ?? ""} ${inst?.last_name ?? ""}`.trim()).trim() || null;
      return fromSession;
    },
    [instructors, sessions],
  );

  const formatInstructorOutsideAvailabilityMessage = useCallback(
    (
      c: ScheduleConflict,
      sessionId: string,
      ctx?: { isoDate?: string | null; startHHmm?: string | null; endHHmm?: string | null },
    ): string => {
      const meta = c.meta as Record<string, unknown> | undefined;
      const instructorId = meta && typeof meta.instructor_id === "string" ? meta.instructor_id : null;
      const instructorLabel = instructorId ? resolveInstructorLabel(instructorId, sessionId) : null;

      const session = sessions.find((s) => s.id === sessionId) ?? null;
      const isoDate = (ctx?.isoDate || session?.session_date || c.date || "").trim();
      const startRaw = (ctx?.startHHmm ||
        (session?.start_time ? session.start_time.slice(0, 5) : "") ||
        "").trim();
      const endRaw = (ctx?.endHHmm || (session?.end_time ? session.end_time.slice(0, 5) : "") || "").trim();

      const dateLabel = isoDate ? formatIsoDateForMessage(isoDate) : "this date";
      const startLabel = startRaw ? formatTimeAmPm(startRaw) : "-";
      const endLabel = endRaw ? formatTimeAmPm(endRaw) : "-";

      const prefix = instructorLabel ? `Instructor ${instructorLabel}` : "Instructor";
      return `${prefix} is not available on ${dateLabel} from ${startLabel} to ${endLabel}.`;
    },
    [resolveInstructorLabel, sessions],
  );

  // Instructor availability (Month-scoped allow-list)
  const [availability, setAvailability] = useState<AvailabilityRule[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  // Holidays (Phase 5)
  const [holidays, setHolidays] = useState<HolidayRule[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [holidaysError, setHolidaysError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterField, setFilterField] = useState<FilterField>("class");
  const [searchMode, setSearchMode] = useState<SearchMode>("find");
  const [popoverOpen, setPopoverOpen] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [headerTooltip, setHeaderTooltip] = useState<HeaderTooltipState | null>(null);
  const [headerTooltipRect, setHeaderTooltipRect] = useState<DOMRect | null>(null);
  // Sorting and filtering state
  const [sortOrder, setSortOrder] = useState<{ column: SortColumn; direction: SortDirection }[]>([]);
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [instructorFilter, setInstructorFilter] = useState<string[]>([]);
  const [classFilterOpen, setClassFilterOpen] = useState(false);
  const [locationFilterOpen, setLocationFilterOpen] = useState(false);
  const [instructorFilterOpen, setInstructorFilterOpen] = useState(false);

  // Dropdown states for edit mode

  // Dropdown states for add mode
  const [addClassDropdownOpen, setAddClassDropdownOpen] = useState(false);
  const [addLocationDropdownOpen, setAddLocationDropdownOpen] = useState(false);
  const [addInstructorDropdownOpen, setAddInstructorDropdownOpen] = useState(false);
  

  const fetchReferenceData = useCallback(async () => {
    if (!branchId || !programGroupId) return;
    try {
      const [classesRes, locationsRes, instructorsRes] = await Promise.all([
        fetch(
          `/api/maintenance/classes?include_inactive=true&branch_id=${encodeURIComponent(
            branchId
          )}&program_group_id=${encodeURIComponent(programGroupId)}`
        ),
        fetch(
          `/api/maintenance/locations?include_inactive=true&branch_id=${encodeURIComponent(
            branchId
          )}`
        ),
        fetch(
          `/api/maintenance/instructors?include_inactive=true&branch_id=${encodeURIComponent(
            branchId
          )}`
        ),
      ]);
      let nextClasses: ClassOption[] = [];
      let nextLocations: LocationOption[] = [];
      let nextInstructors: InstructorOption[] = [];
      if (classesRes.ok) {
        const data = await classesRes.json();
        nextClasses = Array.isArray(data) ? data : (data.classes || []);
        setClasses(nextClasses);
      }
      if (locationsRes.ok) {
        const data = await locationsRes.json();
        nextLocations = Array.isArray(data) ? data : (data.locations || []);
        setLocations(nextLocations);
      }
      if (instructorsRes.ok) {
        const data = await instructorsRes.json();
        nextInstructors = Array.isArray(data) ? data : (data.instructors || []);
        setInstructors(nextInstructors);
      }
    } catch (err) {
      // PRODUCTION ERROR HANDLING - Do not remove
      const error = err instanceof Error ? err : new Error(String(err));
      const errorCode = await logError(
        error,
        "API_ERROR",
        {
          page: "scheduling",
          action: "fetchReferenceData",
          module: "Scheduler UI",
          criticality: "High",
          description: error.message,
        }
      );
      console.error(`[${errorCode}] Error fetching reference data:`, err);
    }
  }, [branchId, programGroupId]);

  const fetchSessions = useCallback(async () => {
    if (!scheduleId || !branchId) return;
    setLoading(true);
    setError(null);
    try {
      const url = "/api/scheduling/sessions?schedule_id=" + scheduleId + "&branch_id=" + branchId;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      const loadedSessions = data.sessions || [];
      setSessions(loadedSessions);
      onSessionsLoaded?.(loadedSessions);
    } catch (err) {
      // PRODUCTION ERROR HANDLING - Do not remove
      const error = err instanceof Error ? err : new Error(String(err));
      const errorCode = await logError(
        error,
        "API_ERROR",
        { 
          page: "scheduling", 
          action: "fetchSessions",
          module: "Scheduler UI",
          branchId,
          params: { scheduleId },
          criticality: "High",
          description: error.message,
        }
      );
      setError(getUserErrorMessage(errorCode));
    } finally {
      setLoading(false);
    }
  }, [scheduleId, branchId, onSessionsLoaded]);

  useEffect(() => { fetchReferenceData(); }, [fetchReferenceData]);
  
  // Clear sessions and refetch when branch or schedule changes
  useEffect(() => {
    setSessions([]); // Clear stale data immediately
    void fetchSessions();
  }, [fetchSessions, refreshKey]);

  // Callback refs to scroll to selected item when dropdown content mounts
  const scrollToSelected = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setTimeout(() => {
        const selected = node.querySelector('[data-selected="true"]');
        if (
          selected &&
          typeof (selected as unknown as { scrollIntoView?: unknown }).scrollIntoView === "function"
        ) {
          (selected as HTMLElement).scrollIntoView({ block: "nearest" });
        }
      }, 10);
    }
  }, []);

  const requireApproved = useCallback(
    (action: string): boolean => {
      if (scheduleApproved) return true;
      onApprovalBlockedAction?.(action);
      return false;
    },
    [onApprovalBlockedAction, scheduleApproved],
  );

  const handleEdit = useCallback((session: Session) => {
    if (!requireApproved("edit sessions")) return;
    setEditModalOpening(true);
    setSaveError(null);
    setSaveConflicts(null);
    setEditModalSessionId(session.id);
    setEditModalForm({
      session_date: session.session_date,
      start_time: session.start_time.slice(0, 5),
      end_time: session.end_time.slice(0, 5),
      class_id: session.class_id,
      location_id: session.location_id,
      instructor_ids: session.instructors.map((i) => i.id),
      headcount: session.headcount,
    });
    setEditModalOpen(true);
  }, [requireApproved, setEditModalForm]);

  const closeEditModal = () => {
    setSaveError(null);
    setSaveConflicts(null);
    setEditModalOpening(false);
    setEditModalOpen(false);
    setReschedulePreviewOpen(false);
    setReschedulePreviewComputing(false);
    setReschedulePreviewError(null);
    setReschedulePreviewResults(null);
    setEditModalSessionId(null);
    setEditModalForm({
      session_date: "",
      start_time: "",
      end_time: "",
      class_id: "",
      location_id: "",
      instructor_ids: [],
      headcount: null,
    });
    setEditModalClassDropdownOpen(false);
    setEditModalLocationDropdownOpen(false);
    setEditModalInstructorDropdownOpen(false);
  };

  const closeReschedulePreview = () => {
    setReschedulePreviewOpen(false);
    setReschedulePreviewComputing(false);
    setReschedulePreviewError(null);
    setReschedulePreviewResults(null);
    setRescheduleSelectedSessionIds([]);
    setRescheduleTargetInstructorId(null);
    setRescheduleEmailModalOpen(false);
    setRescheduleEmailSending(false);
    setRescheduleEmailError(null);
    setRescheduleEmailSuccess(false);
    setRescheduleAdditionalInstructorEmails("");
    setRescheduleStatus(null);
    setRescheduleStatusLoading(false);
  };

  // Back-compat name (inline edit UI will be removed in a later step)
  const handleCancelEdit = closeEditModal;

  const handleSaveEdit = async (opts?: { skipMediumConfirm?: boolean }) => {
    if (!editModalSessionId) return;
    setSaveError(null);
    setSaveConflicts(null);

    if (editModalBlockingConflicts.length > 0) {
      setSaveError("Fix HIGH conflicts before saving this session.");
      setSaveConflicts(editModalBlockingConflicts);
      return;
    }

    const medium = (editModalCandidateConflicts ?? []).filter((c) => c.severity === "MEDIUM");
    if (!opts?.skipMediumConfirm && medium.length > 0) {
      setMediumConfirm({ kind: "edit", conflicts: medium });
      return;
    }

    if (!editModalForm.session_date || !editModalForm.start_time || !editModalForm.end_time || !editModalForm.class_id || !editModalForm.location_id) {
      setSaveError("Please fill Date, Start, End, Class, and Location.");
      return;
    }

    const day = dayOfWeekFromIsoDateUtc(editModalForm.session_date);
    if (!day) {
      setSaveError("Invalid date.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/scheduling/sessions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editModalSessionId,
          session_date: editModalForm.session_date,
          day_of_week: day,
          start_time: editModalForm.start_time,
          end_time: editModalForm.end_time,
          class_id: editModalForm.class_id,
          location_id: editModalForm.location_id,
          instructor_ids: editModalForm.instructor_ids,
          headcount: editModalForm.headcount,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (res.status === 409 && json && Array.isArray(json.conflicts)) {
          setSaveError(json.error || "Schedule conflict(s) detected.");
          setSaveConflicts(json.conflicts as ScheduleConflict[]);
          return;
        }
        throw new Error(json?.error || "Failed to update session");
      }
      await fetchSessions();
      closeEditModal();
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const code = await logError(errorObj, "API_ERROR", {
        page: "scheduling",
        action: "updateSession",
        module: "Scheduler UI",
        branchId,
        params: { scheduleId, sessionId: editModalSessionId },
      });
      console.error(`[${code}] Error updating session:`, err);
      setSaveError(getUserErrorMessage(code));
    } finally {
      setSaving(false);
    }
  };

  const openAddSessionDirect = useCallback(
    (prefill?: Partial<CreateFormData>) => {
      if (!requireApproved("add sessions")) return;
      setAddError(null);
      setAddConflicts(null);
      setAddForm({
        session_date: filterDate || "",
        start_time: "",
        end_time: "",
        class_id: "",
        location_id: "",
        instructor_ids: [],
        hold_id: null,
        ...(prefill ?? {}),
      });
      setAddOpen(true);
    },
    [filterDate, requireApproved],
  );

  const openAddSession = useCallback(() => {
    if (!requireApproved("add sessions")) return;
    slotHelperCloseSeq.current += 1; // cancel any pending close deferrals
    setSlotHelperClosing(false);
    setSlotHelperReviewOpen(false);
    setSlotHelperReviewEmailModalOpen(false);
    setSlotHelperReviewEmailSending(false);
    setSlotHelperReviewEmailError(null);
    setSlotHelperReviewEmailSuccess(false);
    setSlotHelperSelectedSlotKeys([]);
    setSlotHelperSelectedClassId(null);
    setSlotHelperSelectedLocationId(null);
    setSlotHelperSelectedInstructorIds([]);
    setSlotHelperDurationMinutes(null);
    setSlotHelperTransitionMinutes(0);
    setSlotHelperTurnoverMinutes(0);
    setSlotHelperApplied(null);
    setSlotHelperRefreshing(false);
    setSlotHelperClassDropdownOpen(false);
    setSlotHelperLocationDropdownOpen(false);
    setSlotHelperInstructorDropdownOpen(false);
    setSlotHelperOpen(true);
  }, [requireApproved]);

  const handleAddSessionClick = useCallback(() => {
    if (!requireApproved("add sessions")) return;
    setAddSessionOpening(true);
    startAddSessionTransition(() => {
      openAddSession();
    });
  }, [openAddSession, requireApproved, startAddSessionTransition]);

  const closeAddSession = () => {
    setAddOpen(false);
    setAddError(null);
    setAddConflicts(null);
    setAddClassDropdownOpen(false);
    setAddLocationDropdownOpen(false);
    setAddInstructorDropdownOpen(false);
  };

  const closeSlotHelper = () => {
    const seq = (slotHelperCloseSeq.current += 1);
    setSlotHelperClosing(true);
    setSlotHelperReviewOpen(false);
    setSlotHelperReviewEmailModalOpen(false);
    setSlotHelperOpen(false);

    const defer = (): void => {
      // If the helper reopened before this ran, skip the reset.
      if (slotHelperCloseSeq.current !== seq) return;

      setSlotHelperSelectedSlotKeys([]);
      setSlotHelperSelectedLocationId(null);
      setSlotHelperSelectedInstructorIds([]);
      setSlotHelperApplied(null);
      setSlotHelperRefreshing(false);
      setSlotHelperLocationDropdownOpen(false);
      setSlotHelperInstructorDropdownOpen(false);

      // Keep the "Loading sessions..." spinner visible briefly so the user gets feedback
      // while the sessions table remounts and paints.
      setTimeout(() => {
        if (slotHelperCloseSeq.current !== seq) return;
        setSlotHelperClosing(false);
      }, 150);
    };

    if (process.env.NODE_ENV === "test") {
      setTimeout(defer, 0);
      return;
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => defer());
    } else {
      setTimeout(defer, 0);
    }
  };

  const toggleAddInstructor = (id: string) => {
    setAddForm((prev) => {
      const has = prev.instructor_ids.includes(id);
      return { ...prev, instructor_ids: has ? prev.instructor_ids.filter((x) => x !== id) : [...prev.instructor_ids, id] };
    });
  };

  const toggleEditModalInstructor = (id: string) => {
    setEditModalForm((prev) => {
      const has = prev.instructor_ids.includes(id);
      return { ...prev, instructor_ids: has ? prev.instructor_ids.filter((x) => x !== id) : [...prev.instructor_ids, id] };
    });
  };

  const handleCreateSession = async (opts?: { skipMediumConfirm?: boolean }) => {
    setAddError(null);
    setAddConflicts(null);
    if (!scheduleId || !branchId) return;

    if (!addForm.session_date || !addForm.start_time || !addForm.end_time || !addForm.class_id || !addForm.location_id) {
      setAddError("Please fill Date, Start, End, Class, and Location.");
      return;
    }

    if (addBlockingConflicts.length > 0) {
      setAddError("Fix HIGH conflicts before creating this session.");
      setAddConflicts(addBlockingConflicts);
      return;
    }

    const medium = (addCandidateConflicts ?? []).filter((c) => c.severity === "MEDIUM");
    if (!opts?.skipMediumConfirm && medium.length > 0) {
      setMediumConfirm({ kind: "add", conflicts: medium });
      return;
    }

    const day = dayOfWeekFromIsoDateUtc(addForm.session_date);
    if (!day) {
      setAddError("Invalid date.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/scheduling/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          schedule_id: scheduleId,
          class_id: addForm.class_id,
          location_id: addForm.location_id,
          day_of_week: day,
          start_time: addForm.start_time,
          end_time: addForm.end_time,
          session_date: addForm.session_date,
          instructor_ids: addForm.instructor_ids ?? [],
          hold_id: addForm.hold_id ?? null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (res.status === 409 && json && Array.isArray(json.conflicts)) {
          setAddError(json.error || "Schedule conflict(s) detected.");
          setAddConflicts(json.conflicts as ScheduleConflict[]);
          return;
        }
        throw new Error(json?.error || "Failed to create session");
      }

      await fetchSessions();
      await refreshSlotHelperActiveHolds();
      closeAddSession();
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const code = await logError(errorObj, "API_ERROR", {
        page: "scheduling",
        action: "createSession",
        module: "Scheduler UI",
        branchId,
        params: { scheduleId },
      });
      console.error(`[${code}] Error creating session:`, err);
      setAddError(getUserErrorMessage(code));
    } finally {
      setSaving(false);
    }
  };

  // Instructor availability is managed in Maintenance → Instructors.

  const openDeleteConfirm = useCallback((sessionId: string) => {
    setDeleteConfirmError(null);
    setDeleteConfirmSessionId(sessionId);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmError(null);
    setDeleteConfirmSessionId(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmSessionId) return;
    setDeleteConfirmError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/scheduling/sessions?id=" + encodeURIComponent(deleteConfirmSessionId), {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to delete session");

      await fetchSessions();
      if (editModalSessionId === deleteConfirmSessionId) {
        closeEditModal();
      }
      closeDeleteConfirm();
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const code = await logError(errorObj, "API_ERROR", {
        page: "scheduling",
        action: "deleteSession",
        module: "Scheduler UI",
        branchId,
        params: { scheduleId, sessionId: deleteConfirmSessionId },
      });
      console.error(`[${code}] Error deleting session:`, err);
      setDeleteConfirmError(getUserErrorMessage(code));
    } finally {
      setSaving(false);
    }
  }, [
    branchId,
    closeDeleteConfirm,
    closeEditModal,
    deleteConfirmSessionId,
    editModalSessionId,
    fetchSessions,
    scheduleId,
  ]);

  const handleDelete = useCallback(
    (sessionId: string) => {
      if (!requireApproved("delete sessions")) return;
      openDeleteConfirm(sessionId);
    },
    [openDeleteConfirm, requireApproved],
  );

  const formatInstructors = useCallback((list: Session["instructors"]): string => {
    if (!list || list.length === 0) return "-";
    return list.map((i) => i.nickname || (i.first_name + " " + i.last_name).trim()).join(", ");
  }, []);

  const formatInstructorIds = useCallback((list: Session["instructors"]): string => {
    if (!list || list.length === 0) return "-";
    const ids = list
      .map((i) => (i.readable_id || "").trim())
      .filter(Boolean);
    if (ids.length === 0) return "-";
    return ids.join(", ");
  }, []);

  const formatLocation = useCallback((loc: Session["location"]): string => {
    if (!loc) return "-";
    return loc.code + " - " + loc.name;
  }, []);

  // Unique values for column filters
  const uniqueClassValues = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.class?.name) set.add(s.class.name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const uniqueLocationValues = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      const loc = formatLocation(s.location);
      if (loc && loc !== "-") set.add(loc);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const uniqueInstructorValues = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      s.instructors.forEach((i) => {
        const name = i.nickname || `${i.first_name} ${i.last_name}`.trim();
        if (name) set.add(name);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const isNarrowingColumnFilterActive = useCallback((selected: string[], allValues: string[]): boolean => {
    // Active only when the filter narrows results (not when it effectively represents "all").
    if (selected.includes("__NONE__")) return true;
    if (selected.length === 0) return false; // UI treats empty as "all"
    if (allValues.length === 0) return true; // stale selection still narrows to none/unknown

    const selectedSet = new Set(selected);
    const allSet = new Set(allValues);
    if (selectedSet.size !== allSet.size) return true;
    for (const v of allSet) {
      if (!selectedSet.has(v)) return true;
    }
    return false; // equal sets => not narrowing
  }, []);

  const isClassFilterActive = isNarrowingColumnFilterActive(classFilter, uniqueClassValues);
  const isLocationFilterActive = isNarrowingColumnFilterActive(locationFilter, uniqueLocationValues);
  const isInstructorFilterActive = isNarrowingColumnFilterActive(instructorFilter, uniqueInstructorValues);

  useEffect(() => {
    if (!headerTooltip) {
      setHeaderTooltipRect(null);
      return;
    }

    const update = () => {
      try {
        setHeaderTooltipRect(headerTooltip.el.getBoundingClientRect());
      } catch {
        // noop
      }
    };

    update();

    const tableEl = tableContainerRef.current;
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    tableEl?.addEventListener("scroll", update, { passive: true });

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      tableEl?.removeEventListener("scroll", update);
    };
  }, [headerTooltip]);

  useEffect(() => {
    // If the available instructor values change, drop any stale selections (except __NONE__).
    // This prevents older combined values from lingering after we normalize the dropdown to individual instructors.
    setInstructorFilter((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((v) => v === "__NONE__" || uniqueInstructorValues.includes(v));
      if (next.length === prev.length) return prev;
      return next.length === 0 ? [] : next;
    });
  }, [uniqueInstructorValues]);

  // Fuzzy match helper for Smart mode
  const fuzzyMatch = useCallback((text: string, pattern: string): boolean => {
    if (!pattern) return true;
    let patternIdx = 0;
    for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
      if (text[i] === pattern[patternIdx]) patternIdx++;
    }
    return patternIdx === pattern.length;
  }, []);

  const getSortDirection = (column: SortColumn): SortDirection | null => {
    const entry = sortOrder.find((s) => s.column === column);
    return entry ? entry.direction : null;
  };

  const toggleSort = (column: SortColumn) => {
    setSortOrder((prev) => {
      const current = prev.find((s) => s.column === column);
      let nextDirection: SortDirection | null = null;
      if (!current) nextDirection = "asc";
      else if (current.direction === "asc") nextDirection = "desc";
      else nextDirection = null; // cycle back to none
      if (!nextDirection) return []; // no sort
      return [{ column, direction: nextDirection }]; // single-column sort only
    });
  };

  const toggleFilterValue = (value: string, selected: string[], setter: (vals: string[]) => void) => {
    if (!value) return;
    if (selected.includes(value)) setter(selected.filter((v) => v !== value));
    else setter([...selected, value]);
  };

  const setAllFilters = (values: string[], setter: (vals: string[]) => void) => {
    setter(values);
  };

  const unselectAllFilters = (setter: (vals: string[]) => void) => {
    setter(["__NONE__"]); // Special marker that won't match any real value
  };

  const clearFilters = (setter: (vals: string[]) => void) => {
    setter([]);
  };

  const clearSortAndFilters = () => {
    setSortOrder([]);
    setClassFilter([]);
    setLocationFilter([]);
    setInstructorFilter([]);
  };

  const filteredSessions = useMemo(() => {
    let result = sessions;

    // Column filters (unique-value style)
    if (classFilter.length > 0) {
      result = result.filter((s) => (s.class?.name ? classFilter.includes(s.class.name) : false));
    }
    if (locationFilter.length > 0) {
      result = result.filter((s) => {
        const loc = formatLocation(s.location);
        return loc !== "-" && locationFilter.includes(loc);
      });
    }
    if (instructorFilter.length > 0) {
      // Match sessions where any selected instructor participates.
      result = result.filter((s) =>
        s.instructors.some((i) => {
          const name = i.nickname || `${i.first_name} ${i.last_name}`.trim();
          return instructorFilter.includes(name);
        }),
      );
    }

    // Week filter
    if (filterWeekStart && scheduleMonthYear) {
      const weekStartDate = new Date(filterWeekStart + "T00:00:00");
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6); // Friday (6 days after Saturday)

      const weekStartStr = filterWeekStart;
      const weekEndStr = weekEndDate.toISOString().split("T")[0];

      result = result.filter((s) => {
        if (s.session_date < weekStartStr || s.session_date > weekEndStr) return false;
        const [sYear, sMonth] = s.session_date.split("-").map(Number);
        return sYear === scheduleMonthYear.year && sMonth === scheduleMonthYear.month;
      });
    }

    // Date filter
    if (filterDate) {
      result = result.filter((s) => s.session_date === filterDate);
    }

    // Day filter
    if (filterDay) {
      result = result.filter((s) => s.day_of_week === filterDay);
    }

    // Search filter
    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase();
    return result.filter((s) => {
      let value = "";
      switch (filterField) {
        case "day": value = s.day_of_week.toLowerCase(); break;
        case "class": value = (s.class?.name || "").toLowerCase(); break;
        case "location": value = formatLocation(s.location).toLowerCase(); break;
        case "instructor": value = formatInstructors(s.instructors).toLowerCase(); break;
      }
      switch (searchMode) {
        case "narrow": return value === term;
        case "find": return value.includes(term);
        case "smart": return fuzzyMatch(value, term);
        default: return value.includes(term);
      }
    });
  }, [
    sessions,
    searchTerm,
    filterField,
    searchMode,
    fuzzyMatch,
    filterDate,
    filterDay,
    filterWeekStart,
    scheduleMonthYear,
    classFilter,
    locationFilter,
    instructorFilter,
  ]);

  const scheduleMonth = useMemo((): string | undefined => {
    if (!scheduleMonthYear?.year || !scheduleMonthYear?.month) return undefined;
    return `${scheduleMonthYear.year}-${String(scheduleMonthYear.month).padStart(2, "0")}`;
  }, [scheduleMonthYear]);

  const scheduleMonthLabel = useMemo((): string | null => {
    return scheduleMonth ? formatMonthShortYear(scheduleMonth) : null;
  }, [scheduleMonth]);

  const slotHelperAvailabilityRangeLabel = useMemo((): string => {
    return `${formatTimeAmPm(availabilityTimeStart)}–${formatTimeAmPm(availabilityTimeEnd)}`;
  }, [availabilityTimeStart, availabilityTimeEnd]);

  const slotHelperHierarchyChain = useMemo((): string => {
    const parts = [
      slotHelperHierarchyLabel.allianceName,
      slotHelperHierarchyLabel.associationName,
      slotHelperHierarchyLabel.branchName,
    ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return parts.join(" -> ");
  }, [slotHelperHierarchyLabel]);

  const slotHelperTotalCheckedLabel = useMemo((): string | null => {
    if (slotHelperDurationMinutes === null) return null;
    const d = slotHelperDurationMinutes;
    const t = slotHelperTransitionMinutes;
    const r = slotHelperTurnoverMinutes;
    const total = d + t + r;
    return `${d} + ${t} + ${r} = ${total} min`;
  }, [slotHelperDurationMinutes, slotHelperTransitionMinutes, slotHelperTurnoverMinutes]);

  const fetchAvailability = useCallback(async () => {
    if (!branchId) return;
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      let url = `/api/scheduling/instructor-availability?branch_id=${encodeURIComponent(branchId)}`;
      if (scheduleMonth) url += `&month=${encodeURIComponent(scheduleMonth)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch instructor availability");
      const json = await res.json();
      const rows = Array.isArray(json?.availability) ? json.availability : [];

      const mapped: AvailabilityRule[] = rows
        .map((r: any) => ({
          id: String(r.id),
          instructor_id: String(r.instructor_id),
          schedule_month: String(r.schedule_month),
          day_of_week: String(r.day_of_week),
          available_start: String(r.available_start).slice(0, 5),
          available_end: String(r.available_end).slice(0, 5),
        }))
        .filter((r: AvailabilityRule) => !!r.id && !!r.instructor_id && !!r.schedule_month);

      setAvailability(mapped);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const code = await logError(errorObj, "API_ERROR", {
        page: "scheduling",
        action: "fetchInstructorAvailability",
        module: "Scheduler UI",
        branchId,
        params: { scheduleMonth: scheduleMonth ?? null },
      });
      console.error(`[${code}] Error fetching instructor availability:`, err);
      setAvailabilityError(getUserErrorMessage(code));
      setAvailability([]);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [branchId, scheduleMonth]);

  const fetchHolidays = useCallback(async () => {
    if (!branchId) return;
    setHolidaysLoading(true);
    setHolidaysError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branchId);
      params.set("include_inactive", "false");
      if (scheduleMonth) params.set("month", scheduleMonth);
      const res = await fetch(`/api/maintenance/holidays?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch holidays");
      const json = await res.json();
      const rows = Array.isArray(json) ? json : [];
      const mapped: HolidayRule[] = rows
        .map((r: any) => ({
          id: String(r.id),
          holiday_date: String(r.holiday_date),
          observed_date: r.observed_date ? String(r.observed_date).slice(0, 10) : null,
          name: String(r.name ?? ""),
          is_active: !!r.is_active,
          is_closed: !!r.is_closed,
          closed_start_time: r.closed_start_time ? String(r.closed_start_time).slice(0, 5) : null,
          closed_end_time: r.closed_end_time ? String(r.closed_end_time).slice(0, 5) : null,
        }))
        .filter((r: HolidayRule) => !!r.id && !!r.holiday_date);
      setHolidays(mapped);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const code = await logError(errorObj, "API_ERROR", {
        page: "scheduling",
        action: "fetchHolidays",
        module: "Scheduler UI",
        branchId,
        params: { scheduleMonth: scheduleMonth ?? null },
      });
      console.error(`[${code}] Error fetching holidays:`, err);
      setHolidaysError(getUserErrorMessage(code));
      setHolidays([]);
    } finally {
      setHolidaysLoading(false);
    }
  }, [branchId, scheduleMonth]);

  useEffect(() => {
    void fetchAvailability();
  }, [fetchAvailability, refreshKey]);

  useEffect(() => {
    void fetchHolidays();
  }, [fetchHolidays, refreshKey]);

  useEffect(() => {
    // Resolve Alliance -> Association -> Branch for the helper header (matches global header behavior).
    if (!slotHelperOpen) return;
    if (!branchId) {
      setSlotHelperHierarchyLabel({ allianceName: null, associationName: null, branchName: branchName ?? null });
      return;
    }

    const controller = new AbortController();

    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/branches/${encodeURIComponent(branchId)}`, { signal: controller.signal });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || controller.signal.aborted) {
          setSlotHelperHierarchyLabel({ allianceName: null, associationName: null, branchName: branchName ?? branchId });
          return;
        }

        const asRecord = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null);

        const associationObj = asRecord(json.association);
        const associationFromObj =
          typeof associationObj?.name === "string" && associationObj.name.trim() ? associationObj.name.trim() : null;
        const associationFromFlat =
          typeof json.association_name === "string" && json.association_name.trim() ? json.association_name.trim() : null;
        const associationRaw = associationFromObj ?? associationFromFlat;

        const allianceObj = asRecord(associationObj?.alliance);
        const allianceFromObj =
          typeof allianceObj?.name === "string" && allianceObj.name.trim() ? allianceObj.name.trim() : null;
        const allianceFromFlat =
          typeof json.alliance_name === "string" && json.alliance_name.trim() ? json.alliance_name.trim() : null;
        const allianceRaw = allianceFromObj ?? allianceFromFlat;

        const branchRaw = typeof json.name === "string" && json.name.trim() ? json.name.trim() : branchName ?? branchId;

        setSlotHelperHierarchyLabel({
          allianceName: toTitleCaseWithYmcaAndOf(allianceRaw),
          associationName: toTitleCaseWithYmcaAndOf(associationRaw),
          branchName: toTitleCaseWithYmcaAndOf(branchRaw) ?? branchName ?? branchId,
        });
      } catch {
        if (controller.signal.aborted) return;
        setSlotHelperHierarchyLabel({ allianceName: null, associationName: null, branchName: branchName ?? branchId });
      }
    };

    void load();
    return () => controller.abort();
  }, [slotHelperOpen, branchId, branchName]);

  useEffect(() => {
    if (!slotHelperOpen) return;
    if (!branchId) return;

    let cancelled = false;
    setSlotHelperMappingLoading(true);
    setSlotHelperMappingError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/scheduling/instructor-class-location-details?branch_id=${encodeURIComponent(branchId)}`,
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch mapping (${res.status})`);
        }
        const json = (await res.json()) as { rows?: unknown };
        const rows = Array.isArray(json?.rows) ? (json.rows as unknown[]) : [];
        const mapped: InstructorClassLocationDetail[] = rows
          .map((r) => r as Record<string, unknown>)
          .map((r) => ({
            class_id: String(r.class_id ?? ""),
            class_name: r.class_name ? String(r.class_name) : null,
            class_label: r.class_label ? String(r.class_label) : null,
            instructor_id: String(r.instructor_id ?? ""),
            instructor_nickname: r.instructor_nickname ? String(r.instructor_nickname) : null,
            instructor_label: r.instructor_label ? String(r.instructor_label) : null,
            location_id: String(r.location_id ?? ""),
            location_name: r.location_name ? String(r.location_name) : null,
            location_label: r.location_label ? String(r.location_label) : null,
            minutes: Number(r.minutes),
          }))
          .filter(
            (r) =>
              !!r.class_id &&
              !!r.instructor_id &&
              !!r.location_id &&
              Number.isFinite(r.minutes) &&
              r.minutes > 0,
          );

        if (cancelled) return;
        setSlotHelperMappingRows(mapped);
      } catch (err) {
        if (cancelled) return;
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setSlotHelperMappingError(errorObj.message);
        setSlotHelperMappingRows([]);
      } finally {
        if (!cancelled) setSlotHelperMappingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slotHelperOpen, branchId]);

  const availabilityForEngine = useMemo((): InstructorAvailability[] => {
    return availability.map((r) => ({
      instructor_id: r.instructor_id,
      schedule_month: r.schedule_month,
      day_of_week: r.day_of_week,
      available_start: r.available_start,
      available_end: r.available_end,
    }));
  }, [availability]);

  const holidaysForEngine = useMemo(() => {
    return holidays
      .filter((h) => h.is_active)
      .map((h) => ({
        holiday_date: String(h.holiday_date),
        observed_date: h.observed_date ?? null,
        name: String(h.name ?? ""),
        is_closed: h.is_closed === true,
        closed_start_time: h.closed_start_time ?? null,
        closed_end_time: h.closed_end_time ?? null,
      }))
      .filter((h) => !!h.holiday_date);
  }, [holidays]);

  const slotHelperHolidayClosures = useMemo((): SlotHelperHolidayClosure[] => {
    return (holidaysForEngine ?? [])
      .filter((h) => h.is_closed === true)
      .map((h) => ({
        date: (h.observed_date ?? h.holiday_date).slice(0, 10),
        is_closed: true,
        closed_start_time: h.closed_start_time ?? null,
        closed_end_time: h.closed_end_time ?? null,
      }))
      .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date));
  }, [holidaysForEngine]);

  const conflictEngineConfig = useMemo(() => {
    const base = getDefaultConflictEngineConfig();
    return {
      ...base,
      scheduleMonth,
      instructorAvailability: availabilityForEngine,
      holidays: holidaysForEngine,
    };
  }, [scheduleMonth, availabilityForEngine, holidaysForEngine]);

  const engineSessions = useMemo((): SessionForConflicts[] => {
    const base = sessions.map((s) => ({
      id: s.id,
      day_of_week: (s.day_of_week || "").toUpperCase(),
      session_date: s.session_date,
      start_time: (s.start_time || "").slice(0, 5),
      end_time: (s.end_time || "").slice(0, 5),
      class_name: s.class?.name ?? null,
      location_code: s.location?.code ?? null,
      location_id: s.location_id,
      instructor_ids: s.instructors?.map((i) => i.id) ?? [],
    }));

    const holdSessions = slotHelperActiveHolds.map((h) => ({
      id: `hold:${h.id}`,
      day_of_week: dayOfWeekFromIsoDateUtc(h.slot_date) ?? "",
      session_date: h.slot_date,
      start_time: (h.start_time || "").slice(0, 5),
      end_time: (h.end_time || "").slice(0, 5),
      class_name: h.class_id ? classById.get(h.class_id)?.name ?? "Slot hold" : "Slot hold",
      location_code: h.location_id ? locationById.get(h.location_id)?.code ?? null : null,
      location_id: h.location_id ?? null,
      instructor_ids: h.instructor_ids ?? [],
    }));

    return [...base, ...holdSessions];
  }, [sessions, slotHelperActiveHolds, classById, locationById]);

  const slotHelperDraftNormalized = useMemo((): SlotHelperAppliedSelection => {
    const instIds = Array.from(new Set(slotHelperSelectedInstructorIds.map((x) => String(x ?? "").trim()).filter(Boolean))).sort();
    const daySet = new Set(slotHelperSelectedDays);
    const days = Array.from(daySet).sort((a, b) => (DAY_ORDER[a] ?? 0) - (DAY_ORDER[b] ?? 0));
    return {
      classId: String(slotHelperSelectedClassId ?? ""),
      locationId: String(slotHelperSelectedLocationId ?? ""),
      instructorIds: instIds,
      durationMinutes: slotHelperDurationMinutes === null ? null : Number(slotHelperDurationMinutes),
      transitionMinutes: Number(slotHelperTransitionMinutes),
      turnoverMinutes: Number(slotHelperTurnoverMinutes),
      days,
    };
  }, [
    slotHelperSelectedClassId,
    slotHelperSelectedLocationId,
    slotHelperSelectedInstructorIds,
    slotHelperDurationMinutes,
    slotHelperTransitionMinutes,
    slotHelperTurnoverMinutes,
    slotHelperSelectedDays,
  ]);

  const slotHelperDraftDurationAllowedForAll = useMemo((): boolean => {
    if (!slotHelperSelectedClassId) return false;
    if (!slotHelperSelectedLocationId) return false;
    if (slotHelperSelectedInstructorIds.length === 0) return false;
    if (slotHelperDurationMinutes === null) return false;
    return slotHelperSelectedInstructorIds.every((instId) =>
      slotHelperMappingRows.some(
        (r) =>
          r.class_id === slotHelperSelectedClassId &&
          r.instructor_id === instId &&
          r.location_id === slotHelperSelectedLocationId &&
          r.minutes === slotHelperDurationMinutes,
      ),
    );
  }, [
    slotHelperSelectedClassId,
    slotHelperSelectedLocationId,
    slotHelperSelectedInstructorIds,
    slotHelperDurationMinutes,
    slotHelperMappingRows,
  ]);

  const slotHelperSelectionsReady = useMemo((): boolean => {
    return (
      !!slotHelperDraftNormalized.classId &&
      !!slotHelperDraftNormalized.locationId &&
      slotHelperDraftNormalized.instructorIds.length > 0 &&
      slotHelperDraftNormalized.days.length > 0 &&
      slotHelperDraftDurationAllowedForAll
    );
  }, [slotHelperDraftNormalized, slotHelperDraftDurationAllowedForAll]);

  const slotHelperAllSingletons = useMemo((): boolean => {
    const classId = slotHelperDraftNormalized.classId;
    if (!classId) return false;

    const instructorIds = new Set<string>();
    for (const r of slotHelperMappingRows) {
      if (r.class_id !== classId) continue;
      instructorIds.add(r.instructor_id);
      if (instructorIds.size > 1) return false;
    }
    if (instructorIds.size !== 1) return false;
    const onlyInstructorId = Array.from(instructorIds)[0] ?? null;
    if (!onlyInstructorId) return false;

    const locationIds = new Set<string>();
    for (const r of slotHelperMappingRows) {
      if (r.class_id !== classId) continue;
      if (r.instructor_id !== onlyInstructorId) continue;
      locationIds.add(r.location_id);
      if (locationIds.size > 1) return false;
    }
    if (locationIds.size !== 1) return false;
    const onlyLocationId = Array.from(locationIds)[0] ?? null;
    if (!onlyLocationId) return false;

    const durations = new Set<number>();
    for (const r of slotHelperMappingRows) {
      if (r.class_id !== classId) continue;
      if (r.instructor_id !== onlyInstructorId) continue;
      if (r.location_id !== onlyLocationId) continue;
      durations.add(r.minutes);
      if (durations.size > 1) return false;
    }
    return durations.size === 1;
  }, [slotHelperDraftNormalized.classId, slotHelperMappingRows]);

  const slotHelperRefreshNeeded = useMemo((): boolean => {
    if (!slotHelperOpen) return false;
    if (!slotHelperSelectionsReady) return false;
    if (!slotHelperApplied) return !slotHelperAllSingletons;
    const appliedKey = JSON.stringify(slotHelperApplied);
    const draftKey = JSON.stringify(slotHelperDraftNormalized);
    return appliedKey !== draftKey;
  }, [slotHelperOpen, slotHelperApplied, slotHelperSelectionsReady, slotHelperAllSingletons, slotHelperDraftNormalized]);

  useEffect(() => {
    // Auto-search once when selections first become complete.
    if (!slotHelperOpen) return;
    if (slotHelperApplied !== null) return;
    if (!slotHelperSelectionsReady) return;
    if (!slotHelperAllSingletons) return;

    let cancelled = false;
    void (async () => {
      setSlotHelperRefreshing(true);
      setSlotHelperClassDropdownOpen(false);
      setSlotHelperInstructorDropdownOpen(false);
      setSlotHelperLocationDropdownOpen(false);
      await new Promise<void>((resolve) => {
        if (process.env.NODE_ENV === "test") {
          setTimeout(() => resolve(), 0);
          return;
        }
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => resolve());
        } else {
          setTimeout(() => resolve(), 0);
        }
      });
      if (cancelled) return;
      setSlotHelperApplied(slotHelperDraftNormalized);
    })();

    return () => {
      cancelled = true;
    };
  }, [slotHelperOpen, slotHelperApplied, slotHelperSelectionsReady, slotHelperAllSingletons, slotHelperDraftNormalized]);

  useEffect(() => {
    // End refresh state after applied selection commits.
    if (!slotHelperRefreshing) return;
    if (!slotHelperApplied) return;
    if (slotHelperRefreshNeeded) return;
    setSlotHelperRefreshing(false);
  }, [slotHelperRefreshing, slotHelperApplied, slotHelperRefreshNeeded]);

  const handleSlotHelperRefresh = useCallback(async (): Promise<void> => {
    if (!slotHelperRefreshNeeded) return;
    if (slotHelperRefreshing) return;

    setSlotHelperRefreshing(true);
    setSlotHelperSelectedSlotKeys([]);
    setSlotHelperClassDropdownOpen(false);
    setSlotHelperInstructorDropdownOpen(false);
    setSlotHelperLocationDropdownOpen(false);

    await new Promise<void>((resolve) => {
      if (process.env.NODE_ENV === "test") {
        setTimeout(() => resolve(), 0);
        return;
      }
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(() => resolve(), 0);
      }
    });

    setSlotHelperApplied(slotHelperDraftNormalized);
  }, [slotHelperRefreshNeeded, slotHelperRefreshing, slotHelperDraftNormalized]);

  const refreshSlotHelperReviewRequests = useCallback(async (): Promise<void> => {
    if (!branchId || !scheduleId) return;
    setSlotHelperReviewRequestsLoading(true);
    setSlotHelperReviewRequestsError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branchId);
      params.set("schedule_id", scheduleId);
      const res = await fetch(`/api/scheduling/slot-helper-review/requests?${params.toString()}`);
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok || !json || typeof json !== "object") {
        setSlotHelperReviewRequests([]);
        return;
      }
      const obj = json as Record<string, unknown>;
      const rows = Array.isArray(obj.requests) ? (obj.requests as SlotHelperReviewRequest[]) : [];
      setSlotHelperReviewRequests(rows);
      if (rows.length > 0) {
        const current = slotHelperReviewRequestId;
        const exists = current ? rows.some((r) => r.id === current) : false;
        if (current && !exists) setSlotHelperReviewRequestId(null);
      } else if (slotHelperReviewRequestId) {
        setSlotHelperReviewRequestId(null);
      }
    } catch (err) {
      setSlotHelperReviewRequests([]);
      setSlotHelperReviewRequestsError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setSlotHelperReviewRequestsLoading(false);
    }
  }, [branchId, scheduleId, slotHelperReviewRequestId]);

  const refreshSlotHelperReviewRequestDetail = useCallback(
    async (requestId: string): Promise<void> => {
      if (!branchId || !requestId) return;
      setSlotHelperReviewRequestDetailLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("branch_id", branchId);
        params.set("request_id", requestId);
        const res = await fetch(`/api/scheduling/slot-helper-review/request-detail?${params.toString()}`);
        const json: unknown = await res.json().catch(() => null);
        if (slotHelperReviewRequestIdRef.current !== requestId) return;
        if (!res.ok || !json || typeof json !== "object") {
          setSlotHelperReviewRequestDetail(null);
          return;
        }
        const obj = json as Record<string, unknown>;
        const request = obj.request as SlotHelperReviewRequest;
        const email =
          obj.email && typeof obj.email === "object"
            ? (obj.email as {
                sent_at: string;
                from_email: string;
                to_email: string;
                subject: string;
                message_id: string | null;
              })
            : null;
        const holds = Array.isArray(obj.holds) ? (obj.holds as SlotHelperReviewHold[]) : [];
        const expired = Boolean(obj.expired);
        if (request?.id) {
          setSlotHelperReviewRequestDetail({ request, holds, expired, email });
        } else {
          setSlotHelperReviewRequestDetail(null);
        }
      } catch (err) {
        if (slotHelperReviewRequestIdRef.current !== requestId) return;
        setSlotHelperReviewRequestDetail(null);
      } finally {
        if (slotHelperReviewRequestIdRef.current !== requestId) return;
        setSlotHelperReviewRequestDetailLoading(false);
      }
    },
    [branchId],
  );

  const refreshSlotHelperActiveHolds = useCallback(async (): Promise<void> => {
    if (!branchId || !scheduleId) return;
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branchId);
      params.set("schedule_id", scheduleId);
      const res = await fetch(`/api/scheduling/slot-helper-review/holds?${params.toString()}`);
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok || !json || typeof json !== "object") {
        setSlotHelperActiveHolds([]);
        return;
      }
      const obj = json as Record<string, unknown>;
      const holds = Array.isArray(obj.holds) ? (obj.holds as SlotHelperReviewHold[]) : [];
      setSlotHelperActiveHolds(
        holds.map((h) => ({
          id: h.id,
          request_id: h.request_id,
          class_id: h.class_id ?? null,
          location_id: h.location_id ?? null,
          instructor_ids: h.instructor_ids ?? [],
          slot_date: h.slot_date,
          start_time: h.start_time,
          end_time: h.end_time,
          transition_minutes: h.transition_minutes ?? 0,
          turnover_minutes: h.turnover_minutes ?? 0,
        })),
      );
    } catch {
      setSlotHelperActiveHolds([]);
    }
  }, [branchId, scheduleId]);

  useEffect(() => {
    if (!slotHelperOpen) return;
    void refreshSlotHelperReviewRequests();
    void refreshSlotHelperActiveHolds();
  }, [refreshSlotHelperReviewRequests, refreshSlotHelperActiveHolds, slotHelperOpen]);

  useEffect(() => {
    void refreshSlotHelperActiveHolds();
  }, [refreshSlotHelperActiveHolds]);

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;
    if (!slotHelperOpen) return;
    if (!slotHelperReviewRequestDetail?.email?.sent_at) return;
    if (slotHelperReviewRequestDetail?.request?.responded_at) return;

    const id = window.setInterval(() => {
      if (!slotHelperReviewRequestId) return;
      void refreshSlotHelperReviewRequestDetail(slotHelperReviewRequestId);
    }, 15000);
    return () => window.clearInterval(id);
  }, [
    refreshSlotHelperReviewRequestDetail,
    slotHelperOpen,
    slotHelperReviewRequestDetail?.email?.sent_at,
    slotHelperReviewRequestDetail?.request?.responded_at,
    slotHelperReviewRequestId,
  ]);

  useEffect(() => {
    if (!slotHelperOpen) return;
    const prevRequestId = slotHelperReviewRequestIdRef.current;
    slotHelperReviewRequestIdRef.current = slotHelperReviewRequestId;
    if (!slotHelperReviewRequestId) {
      setSlotHelperReviewRequestDetail(null);
      setSlotHelperReviewRequestActionError(null);
      slotHelperLastPrefilledRequestIdRef.current = null;
      return;
    }
    if (!slotHelperReviewRequestDetail || slotHelperReviewRequestDetail.request.id !== slotHelperReviewRequestId) {
      setSlotHelperReviewRequestDetail(null);
    }
    void refreshSlotHelperReviewRequestDetail(slotHelperReviewRequestId);
  }, [slotHelperReviewRequestId, refreshSlotHelperReviewRequestDetail, slotHelperOpen]);

  useEffect(() => {
    if (!slotHelperOpen) return;
    if (!slotHelperReviewRequestId || !slotHelperReviewRequestDetail) return;
    if (slotHelperReviewRequestDetail.request.id !== slotHelperReviewRequestId) {
      return;
    }
    if (slotHelperLastPrefilledRequestIdRef.current === slotHelperReviewRequestId) {
      return;
    }

    const request = slotHelperReviewRequestDetail.request;
    const holds = slotHelperReviewRequestDetail.holds ?? [];
    const fallbackHold = holds[0] ?? null;
    const classId = request.class_id ?? fallbackHold?.class_id ?? null;
    const locationId = request.location_id ?? fallbackHold?.location_id ?? null;
    const instructorIds =
      (request.instructor_ids ?? []).length > 0
        ? request.instructor_ids
        : (fallbackHold?.instructor_ids ?? []).filter((id) => !!id);

    const durationMinutes = (() => {
      if (!fallbackHold?.start_time || !fallbackHold?.end_time) return null;
      const start = parseHHmmToMinutes(fallbackHold.start_time.slice(0, 5));
      const end = parseHHmmToMinutes(fallbackHold.end_time.slice(0, 5));
      if (start === null || end === null) return null;
      const delta = end - start;
      return delta > 0 ? delta : null;
    })();

    const daySet = new Set<SlotHelperDayValue>();
    for (const hold of holds) {
      const day = dayOfWeekFromIsoDateUtc(hold.slot_date ?? "");
      if (day && day in DAY_ORDER) {
        daySet.add(day as SlotHelperDayValue);
      }
    }
    const days = Array.from(daySet).sort((a, b) => (DAY_ORDER[a] ?? 0) - (DAY_ORDER[b] ?? 0));

    const selectedHoldIds = new Set(request.response_selected_hold_ids ?? []);
    const responseSelectedKeys = holds
      .filter((h) => selectedHoldIds.has(h.id))
      .map((h) => {
        const start = (h.start_time || "").slice(0, 5);
        const end = (h.end_time || "").slice(0, 5);
        return `${h.slot_date}|${start}|${end}`;
      });

    slotHelperSkipClassResetRef.current = Boolean(classId);
    slotHelperLastPrefilledRequestIdRef.current = slotHelperReviewRequestId;

    setSlotHelperSelectedClassId(classId ?? null);
    setSlotHelperSelectedLocationId(locationId ?? null);
    setSlotHelperSelectedInstructorIds(instructorIds);
    setSlotHelperDurationMinutes(durationMinutes);
    setSlotHelperSelectedDays(days.length > 0 ? days : SLOT_HELPER_DAY_PILLS.map((d) => d.value));
    slotHelperSkipSelectedSlotClearRef.current = responseSelectedKeys.length > 0;
    setSlotHelperSelectedSlotKeys(responseSelectedKeys);
    setSlotHelperApplied(null);
  }, [slotHelperOpen, slotHelperReviewRequestId, slotHelperReviewRequestDetail]);

  const sendSlotHelperReviewEmail = useCallback(async (): Promise<void> => {
    if (!branchId || !scheduleId) return;
    if (slotHelperSelectedInstructorIds.length === 0) return;
    if (slotHelperSelectedSlotKeys.length === 0) return;

    setSlotHelperReviewEmailSending(true);
    setSlotHelperReviewEmailError(null);
    setSlotHelperReviewEmailSuccess(false);

    try {
      const selectedSlots = slotHelperSelectedSlotKeys
        .map((key) => {
          const [date, start_time, end_time] = String(key).split("|");
          return date && start_time && end_time ? { date, start_time, end_time } : null;
        })
        .filter((x): x is { date: string; start_time: string; end_time: string } => !!x);

      const res = await fetch(`/api/scheduling/slot-helper-review/send?branch_id=${encodeURIComponent(branchId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: scheduleId,
          instructor_ids: slotHelperSelectedInstructorIds,
          slots: selectedSlots,
          context: {
            class_id: slotHelperDraftNormalized.classId ?? null,
            location_id: slotHelperDraftNormalized.locationId ?? null,
            duration_minutes: slotHelperDurationMinutes,
            transition_minutes: slotHelperTransitionMinutes,
            turnover_minutes: slotHelperTurnoverMinutes,
            schedule_month: scheduleMonthYear?.month ?? null,
            schedule_year: scheduleMonthYear?.year ?? null,
            availability_time_start: availabilityTimeStart,
            availability_time_end: availabilityTimeEnd,
          },
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const errMsg = (() => {
          if (!json || typeof json !== "object") return "Failed to send email";
          const obj = json as Record<string, unknown>;
          return typeof obj.error === "string" && obj.error.trim() ? obj.error : "Failed to send email";
        })();
        setSlotHelperReviewEmailError(errMsg);
        return;
      }

      setSlotHelperReviewEmailSuccess(true);
      await refreshSlotHelperReviewRequests();
      await refreshSlotHelperActiveHolds();
    } catch (err) {
      setSlotHelperReviewEmailError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSlotHelperReviewEmailSending(false);
    }
  }, [
    availabilityTimeEnd,
    availabilityTimeStart,
    branchId,
    refreshSlotHelperReviewRequests,
    refreshSlotHelperActiveHolds,
    scheduleId,
    scheduleMonthYear?.month,
    scheduleMonthYear?.year,
    slotHelperDraftNormalized.classId,
    slotHelperDraftNormalized.locationId,
    slotHelperDurationMinutes,
    slotHelperSelectedInstructorIds,
    slotHelperSelectedSlotKeys,
    slotHelperTransitionMinutes,
    slotHelperTurnoverMinutes,
  ]);

  const completeSlotHelperReviewRequest = useCallback(async (): Promise<void> => {
    if (!slotHelperReviewRequestId) return;
    setSlotHelperReviewRequestActionLoading(true);
    setSlotHelperReviewRequestActionError(null);
    try {
      const res = await fetch("/api/scheduling/slot-helper-review/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: slotHelperReviewRequestId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json && typeof json === "object" && typeof json.error === "string" ? json.error : "Failed to complete request";
        setSlotHelperReviewRequestActionError(msg);
        return;
      }
      await refreshSlotHelperReviewRequests();
      await refreshSlotHelperReviewRequestDetail(slotHelperReviewRequestId);
      await refreshSlotHelperActiveHolds();
    } catch (err) {
      setSlotHelperReviewRequestActionError(err instanceof Error ? err.message : "Failed to complete request");
    } finally {
      setSlotHelperReviewRequestActionLoading(false);
    }
  }, [
    refreshSlotHelperActiveHolds,
    refreshSlotHelperReviewRequestDetail,
    refreshSlotHelperReviewRequests,
    slotHelperReviewRequestId,
  ]);

  const overrideSlotHelperReviewRequest = useCallback(async (): Promise<void> => {
    if (!slotHelperReviewRequestId) return;
    setSlotHelperReviewRequestActionLoading(true);
    setSlotHelperReviewRequestActionError(null);
    try {
      const res = await fetch("/api/scheduling/slot-helper-review/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: slotHelperReviewRequestId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json && typeof json === "object" && typeof json.error === "string" ? json.error : "Failed to override request";
        setSlotHelperReviewRequestActionError(msg);
        return;
      }
      await refreshSlotHelperReviewRequests();
      await refreshSlotHelperReviewRequestDetail(slotHelperReviewRequestId);
      await refreshSlotHelperActiveHolds();
    } catch (err) {
      setSlotHelperReviewRequestActionError(err instanceof Error ? err.message : "Failed to override request");
    } finally {
      setSlotHelperReviewRequestActionLoading(false);
    }
  }, [
    refreshSlotHelperActiveHolds,
    refreshSlotHelperReviewRequestDetail,
    refreshSlotHelperReviewRequests,
    slotHelperReviewRequestId,
  ]);

  const slotHelperResults = useMemo(() => {
    if (!slotHelperOpen) return [];
    if (!scheduleMonth) return [];
    if (!slotHelperApplied) return []; // wait for initial auto-search
    if (slotHelperRefreshNeeded) return []; // user must click Refresh after changes

    const { classId, locationId, instructorIds, days, durationMinutes, transitionMinutes, turnoverMinutes } = slotHelperApplied;
    if (!classId || !locationId) return [];
    if (instructorIds.length === 0) return [];
    if (days.length === 0) return [];
    if (durationMinutes === null) return [];

    // Ensure the applied duration is allowed for ALL selected instructors at this class+location.
    const durationAllowedForAll = instructorIds.every((instId) =>
      slotHelperMappingRows.some(
        (r) =>
          r.class_id === classId &&
          r.instructor_id === instId &&
          r.location_id === locationId &&
          r.minutes === durationMinutes,
      ),
    );
    if (!durationAllowedForAll) return [];

    const runForDay = (dayFilter: SlotHelperDayFilter) => {
      return buildSlotHelperAvailability({
        scheduleMonth,
        dayStartHHmm: availabilityTimeStart,
        dayEndHHmm: availabilityTimeEnd,
        sessions: engineSessions,
        locationIds: [locationId],
        instructorIds,
        instructorAvailability: availabilityForEngine,
        holidays: slotHelperHolidayClosures,
        durationMinutes,
        transitionMinutes,
        turnoverMinutes,
        dayFilter,
        stepMinutes: 15,
      });
    };

    const raw =
      days.length === SLOT_HELPER_DAY_PILLS.length
        ? runForDay("ALL")
        : days.length === 1
          ? runForDay(days[0] ?? "ALL")
          : (() => {
              const merged = new Map<
                string,
                {
                  date: string;
                  day_of_week: Exclude<SlotHelperDayFilter, "ALL">;
                  slots: Array<{
                    date: string;
                    start_time: string;
                    end_time: string;
                    availableLocationIds: string[];
                    availableInstructorIds: string[];
                  }>;
                }
              >();
              for (const d of days) {
                for (const day of runForDay(d)) {
                  const existing = merged.get(day.date);
                  if (!existing) merged.set(day.date, day);
                  else merged.set(day.date, { ...existing, slots: [...existing.slots, ...day.slots] });
                }
              }
              return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
            })();

    // Require ALL selected instructors (not just "any available").
    return raw
      .map((day) => ({
        ...day,
        slots: day.slots.filter((s) => instructorIds.every((id) => s.availableInstructorIds.includes(id))),
      }))
      .filter((d) => d.slots.length > 0);
  }, [
    slotHelperOpen,
    scheduleMonth,
    availabilityTimeStart,
    availabilityTimeEnd,
    engineSessions,
    availabilityForEngine,
    slotHelperHolidayClosures,
    slotHelperApplied,
    slotHelperRefreshNeeded,
    slotHelperMappingRows,
  ]);

  const slotHelperRequestHoldResults = useMemo(() => {
    if (!slotHelperReviewRequestId || !slotHelperReviewRequestDetail) return [];
    const isExpired = slotHelperReviewRequestDetail.expired;
    if (isExpired) return [];

    const grouped = new Map<
      string,
      {
        date: string;
        day_of_week: Exclude<SlotHelperDayFilter, "ALL">;
        slots: Array<{
          date: string;
          start_time: string;
          end_time: string;
          availableLocationIds: string[];
          availableInstructorIds: string[];
        }>;
      }
    >();

    for (const hold of slotHelperReviewRequestDetail.holds ?? []) {
      if (hold.released_at || hold.consumed_at) continue;
      const date = hold.slot_date;
      const day = dayOfWeekFromIsoDateUtc(date) as Exclude<SlotHelperDayFilter, "ALL"> | null;
      if (!date || !day) continue;
      const start = (hold.start_time || "").slice(0, 5);
      const end = (hold.end_time || "").slice(0, 5);
      if (!start || !end) continue;
      const locationId = hold.location_id ?? slotHelperReviewRequestDetail.request.location_id ?? "";
      const instructorIds = (hold.instructor_ids ?? []).length
        ? hold.instructor_ids ?? []
        : slotHelperReviewRequestDetail.request.instructor_ids ?? [];

      const slot = {
        date,
        start_time: start,
        end_time: end,
        availableLocationIds: locationId ? [locationId] : [],
        availableInstructorIds: instructorIds,
      };

      const existing = grouped.get(date);
      if (!existing) {
        grouped.set(date, { date, day_of_week: day, slots: [slot] });
      } else {
        existing.slots.push(slot);
      }
    }

    return Array.from(grouped.values())
      .map((d) => ({
        ...d,
        slots: d.slots.sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [slotHelperReviewRequestId, slotHelperReviewRequestDetail]);

  const slotHelperUsingRequestHolds = Boolean(slotHelperReviewRequestId && slotHelperReviewRequestDetail);
  const slotHelperDisplayResults = slotHelperUsingRequestHolds ? slotHelperRequestHoldResults : slotHelperResults;
  const slotHelperShowRefreshPrompt = !slotHelperUsingRequestHolds && slotHelperRefreshNeeded;
  const slotHelperShowSelectionPrompt = !slotHelperUsingRequestHolds && !slotHelperSelectionsReady;

  useEffect(() => {
    const wasOpen = slotHelperLocationDropdownOpenRef.current;
    slotHelperLocationDropdownOpenRef.current = slotHelperLocationDropdownOpen;
    if (!wasOpen || slotHelperLocationDropdownOpen) return;
    if (!slotHelperSelectedLocationId) return;
    if (!slotHelperSelectionsReady) return;
    if (!slotHelperRefreshNeeded) return;
    if (slotHelperRefreshing || slotHelperUsingRequestHolds) return;
    void handleSlotHelperRefresh();
  });

  const slotHelperDateOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];
    for (const day of slotHelperDisplayResults) {
      if (!day?.date) continue;
      if (seen.has(day.date)) continue;
      seen.add(day.date);
      options.push({
        value: day.date,
        label: `${day.day_of_week.slice(0, 3)} ${formatIsoDateMMDDYYYY(day.date)}`,
      });
    }
    return options.sort((a, b) => a.value.localeCompare(b.value));
  }, [slotHelperDisplayResults]);

  useEffect(() => {
    if (slotHelperDateOptions.length === 0) return;
    const optionSet = new Set(slotHelperDateOptions.map((o) => o.value));
    setSlotHelperSelectedDates((prev) => {
      if (prev.includes(SLOT_HELPER_ALL_DATES)) {
        return prev.length === 1 && prev[0] === SLOT_HELPER_ALL_DATES ? prev : [SLOT_HELPER_ALL_DATES];
      }
      const seen = new Set<string>();
      const next = prev
        .filter((v) => optionSet.has(v))
        .filter((v) => {
          if (seen.has(v)) return false;
          seen.add(v);
          return true;
        })
        .slice()
        .sort((a, b) => a.localeCompare(b));
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      return next;
    });
  }, [slotHelperDateOptions]);

  const slotHelperDateFilterDisabled =
    slotHelperDateOptions.length === 0 ||
    slotHelperShowRefreshPrompt ||
    slotHelperShowSelectionPrompt ||
    (slotHelperRefreshing && !slotHelperUsingRequestHolds);

  const slotHelperDateOptionsWithAll = useMemo(() => {
    return [{ value: SLOT_HELPER_ALL_DATES, label: "All" }, ...slotHelperDateOptions];
  }, [slotHelperDateOptions]);

  const slotHelperDatePlaceholder = "select time slot date";
  const slotHelperAllDatesSelected = slotHelperSelectedDates.includes(SLOT_HELPER_ALL_DATES);
  const slotHelperSelectedDateSummary = useMemo((): string => {
    if (slotHelperAllDatesSelected) return slotHelperDatePlaceholder;
    if (slotHelperSelectedDates.length === 0) return slotHelperDatePlaceholder;
    if (slotHelperSelectedDates.length === 1) {
      const id = slotHelperSelectedDates[0] ?? "";
      return slotHelperDateOptions.find((o) => o.value === id)?.label ?? id;
    }
    return `${slotHelperSelectedDates.length} dates`;
  }, [slotHelperAllDatesSelected, slotHelperDateOptions, slotHelperDatePlaceholder, slotHelperSelectedDates]);

  const toggleSlotHelperDateFilter = useCallback(
    (value: string): void => {
      if (value === SLOT_HELPER_ALL_DATES) {
        setSlotHelperSelectedDates([SLOT_HELPER_ALL_DATES]);
        return;
      }
      setSlotHelperSelectedDates((prev) => {
        const withoutAll = prev.filter((v) => v !== SLOT_HELPER_ALL_DATES);
        const has = withoutAll.includes(value);
        const next = has ? withoutAll.filter((v) => v !== value) : [...withoutAll, value];
        // keep stable ordering by date asc
        return next.slice().sort((a, b) => a.localeCompare(b));
      });
    },
    [],
  );

  const slotHelperFilteredResults = useMemo(() => {
    // No selection means "no filter" (show all) but keep placeholder text.
    if (slotHelperSelectedDates.length === 0) return slotHelperDisplayResults;
    if (slotHelperSelectedDates.includes(SLOT_HELPER_ALL_DATES)) return slotHelperDisplayResults;
    const selected = new Set(slotHelperSelectedDates);
    return slotHelperDisplayResults.filter((d) => selected.has(d.date));
  }, [slotHelperDisplayResults, slotHelperSelectedDates]);

  useEffect(() => {
    // Ensure we keep collapse state for all known dates, defaulting to collapsed.
    setSlotHelperCollapsedDates((prev) => {
      const next: Record<string, boolean> = {};
      for (const opt of slotHelperDateOptions) {
        next[opt.value] = prev[opt.value] ?? true;
      }
      return next;
    });
  }, [slotHelperDateOptions]);

  const slotHelperAllCollapsed =
    slotHelperDateOptions.length > 0 && slotHelperDateOptions.every((opt) => slotHelperCollapsedDates[opt.value]);
  const slotHelperAllExpanded =
    slotHelperDateOptions.length > 0 && slotHelperDateOptions.every((opt) => !slotHelperCollapsedDates[opt.value]);

  const slotHelperSlotsVirtualizer = useVirtualizer({
    count: slotHelperFilteredResults.length,
    getItemKey: (index) => slotHelperFilteredResults[index]?.date ?? index,
    getScrollElement: () => slotHelperSlotsScrollRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });
  const slotHelperSlotsVirtualizerItems =
    process.env.NODE_ENV === "test"
      ? slotHelperFilteredResults.map((_, index) => ({
          index,
          start: index * 96,
          size: 96,
          key: index,
        }))
      : slotHelperSlotsVirtualizer.getVirtualItems();

  const slotHelperSlotsVirtualizerTotalSize =
    process.env.NODE_ENV === "test"
      ? slotHelperFilteredResults.length * 96
      : slotHelperSlotsVirtualizer.getTotalSize();

  useEffect(() => {
    const wasRefreshing = slotHelperWasRefreshingRef.current;
    slotHelperWasRefreshingRef.current = slotHelperRefreshing;
    if (!wasRefreshing || slotHelperRefreshing) return;
    if (slotHelperRefreshNeeded) return;
    if (slotHelperFilteredResults.length === 0) return;

    const earliest = slotHelperFilteredResults[0]?.date ?? null;
    if (!earliest) return;

    setSlotHelperCollapsedDates((prev) => {
      const next: Record<string, boolean> = {};
      for (const opt of slotHelperDateOptions) {
        next[opt.value] = opt.value !== earliest;
      }
      return next;
    });

    if (slotHelperSlotsScrollRef.current) {
      slotHelperSlotsScrollRef.current.scrollTop = 0;
    }

    if (process.env.NODE_ENV !== "test") {
      requestAnimationFrame(() => {
        slotHelperSlotsVirtualizer.measure();
      });
    }
  }, [
    slotHelperDateOptions,
    slotHelperFilteredResults,
    slotHelperRefreshNeeded,
    slotHelperRefreshing,
    slotHelperSlotsVirtualizer,
  ]);

  useLayoutEffect(() => {
    // Collapse/expand changes row heights; re-measure before paint to avoid a brief "jump" frame.
    if (process.env.NODE_ENV === "test") return;
    if (!slotHelperOpen) return;
    const raf = window.requestAnimationFrame(() => {
      slotHelperSlotsVirtualizer.measure();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    slotHelperOpen,
    slotHelperCollapsedDates,
    slotHelperFilteredResults.length,
    slotHelperSlotsVirtualizer,
  ]);

  useLayoutEffect(() => {
    if (process.env.NODE_ENV === "test") return;
    if (!slotHelperOpen) return;
    if (!slotHelperAutoLocateAcceptedRef.current) return;
    slotHelperAutoLocateAcceptedRef.current = false;
    const expandedDate =
      slotHelperFilteredResults.find((d) => !(slotHelperCollapsedDates[d.date] ?? false))?.date ?? null;
    const expandedEl =
      expandedDate && slotHelperSlotsScrollRef.current
        ? slotHelperSlotsScrollRef.current.querySelector(`[data-day-date="${expandedDate}"]`)
        : null;
    const raf = window.requestAnimationFrame(() => {
      if (expandedEl instanceof HTMLElement) {
        slotHelperSlotsVirtualizer.measureElement(expandedEl);
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    slotHelperOpen,
    slotHelperSelectedSlotKeys.length,
    slotHelperCollapsedDates,
    slotHelperFilteredResults,
    slotHelperSlotsVirtualizer,
  ]);

  const slotHelperSlotMap = useMemo(() => {
    const map = new Map<string, { date: string; start_time: string; end_time: string; availableLocationIds: string[]; availableInstructorIds: string[] }>();
    for (const day of slotHelperDisplayResults) {
      for (const s of day.slots) {
        map.set(`${s.date}|${s.start_time}|${s.end_time}`, s);
      }
    }
    return map;
  }, [slotHelperDisplayResults]);

  const slotHelperSelectedSlot = useMemo(() => {
    if (slotHelperSelectedSlotKeys.length !== 1) return null;
    const key = slotHelperSelectedSlotKeys[0] ?? null;
    if (!key) return null;
    return slotHelperSlotMap.get(key) ?? null;
  }, [slotHelperSelectedSlotKeys, slotHelperSlotMap]);

  const slotHelperSelectedSlotCount = slotHelperSelectedSlotKeys.length;
  const slotHelperSelectedSlotKeySet = useMemo(() => new Set(slotHelperSelectedSlotKeys), [slotHelperSelectedSlotKeys]);
  const slotHelperSelectedSlotRows = useMemo(() => {
    const weekdayOrder = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const rows = slotHelperSelectedSlotKeys
      .map((key) => {
        const slot = slotHelperSlotMap.get(key);
        if (!slot) return null;
        const dayLabel = dayOfWeekFromIsoDateUtc(slot.date)?.slice(0, 3).toUpperCase() ?? "";
        const dateLabel = formatIsoDateMMDDYYYY(slot.date);
        const timeLabel = `${formatTimeAmPm(slot.start_time)}–${formatTimeAmPm(slot.end_time)}`;
        const weekdayIndex = weekdayOrder.includes(dayLabel) ? weekdayOrder.indexOf(dayLabel) : weekdayOrder.length;
        const startMinutes = parseHHmmToMinutes(slot.start_time) ?? 0;
        return {
          key,
          dayLabel,
          dateLabel,
          timeLabel,
          weekdayIndex,
          startMinutes,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    rows.sort((a, b) => {
      if (a.weekdayIndex !== b.weekdayIndex) return a.weekdayIndex - b.weekdayIndex;
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      const dateCompare = a.dateLabel.localeCompare(b.dateLabel);
      if (dateCompare !== 0) return dateCompare;
      return a.timeLabel.localeCompare(b.timeLabel);
    });

    return rows;
  }, [slotHelperSelectedSlotKeys, slotHelperSlotMap]);

  const onSlotHelperSlotGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest("button[data-slot-key]") as HTMLButtonElement | null;
    if (!btn) return;
    if (btn.disabled) return;
    const key = (btn.dataset.slotKey ?? "").trim();
    if (!key) return;

    const isAdding = !slotHelperSelectedSlotKeySet.has(key);
    if (isAdding && slotHelperAutoLocateEnabled && !slotHelperMultiDayOpen) {
      const [date, start_time, end_time] = String(key).split("|");
      const baseDate = String(date ?? "").trim();
      const baseStart = String(start_time ?? "").trim();
      const baseEnd = String(end_time ?? "").trim();
      if (baseDate && baseStart && baseEnd) {
        const selectedDays =
          slotHelperSelectedDays.length > 0
            ? slotHelperSelectedDays
            : (SLOT_HELPER_DAY_PILLS.map((d) => d.value) as SlotHelperDayValue[]);
        const selectedDaySet = new Set(selectedDays);

        const matches: Array<{
          key: string;
          date: string;
          start_time: string;
          end_time: string;
          label: string;
        }> = [];
        for (const day of slotHelperDisplayResults) {
          if (!day?.date) continue;
          if (day.date === baseDate) continue;
          const dow = String(day.day_of_week ?? "").trim().toUpperCase();
          if (dow && !selectedDaySet.has(dow as SlotHelperDayValue)) continue;
          for (const s of day.slots ?? []) {
            if (!s?.start_time || !s?.end_time) continue;
            if (s.start_time !== baseStart || s.end_time !== baseEnd) continue;
            const matchKey = `${day.date}|${s.start_time}|${s.end_time}`;
            if (slotHelperSelectedSlotKeySet.has(matchKey)) continue;
            const dayLabel = String(day.day_of_week ?? dayOfWeekFromIsoDateUtc(day.date) ?? "").slice(0, 3);
            const dateLabel = formatIsoDateMMDDYYYY(day.date);
            const startLabel = formatTimeAmPm(s.start_time);
            const endLabel = formatTimeAmPm(s.end_time);
            const label = `${dayLabel} ${dateLabel} @ ${startLabel}-${endLabel}`;
            matches.push({ key: matchKey, date: day.date, start_time: s.start_time, end_time: s.end_time, label });
          }
        }

        if (matches.length > 0) {
          matches.sort((a, b) => a.date.localeCompare(b.date));
          setSlotHelperMultiDayDays(selectedDays);
          setSlotHelperMultiDayOptions(matches.map((m) => ({ ...m, checked: false })));
          setSlotHelperMultiDayOpen(true);
        }
      }
    }

    setSlotHelperSelectedSlotKeys((prev) => {
      const has = prev.includes(key);
      return has ? prev.filter((x) => x !== key) : [...prev, key];
    });
    setSlotHelperLocationDropdownOpen(false);
    setSlotHelperInstructorDropdownOpen(false);
  }, [
    slotHelperAutoLocateEnabled,
    slotHelperMultiDayOpen,
    slotHelperSelectedDays,
    slotHelperSelectedSlotKeySet,
    slotHelperDisplayResults,
  ]);

  const slotHelperSelectedRangesByDate = useMemo(() => {
    const ranges = new Map<string, Array<{ start: number; end: number }>>();
    for (const key of slotHelperSelectedSlotKeys) {
      const slot = slotHelperSlotMap.get(key);
      if (!slot) continue;
      const startMin = parseHHmmToMinutes(slot.start_time);
      const endMin = parseHHmmToMinutes(slot.end_time);
      if (startMin === null || endMin === null) continue;
      const bufferedStart = Math.max(0, startMin - slotHelperTransitionMinutes);
      const bufferedEnd = Math.min(24 * 60, endMin + slotHelperTurnoverMinutes);
      const list = ranges.get(slot.date) ?? [];
      list.push({ start: bufferedStart, end: bufferedEnd });
      ranges.set(slot.date, list);
    }
    return ranges;
  }, [slotHelperSelectedSlotKeys, slotHelperSlotMap, slotHelperTransitionMinutes, slotHelperTurnoverMinutes]);

  useEffect(() => {
    if (!slotHelperOpen) return;
    const scrollEl = slotHelperSelectionScrollRef.current;
    const target = slotHelperBottomRefreshRef.current;
    if (!scrollEl || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setSlotHelperBottomRefreshVisible(entry.intersectionRatio >= 1);
      },
      { root: scrollEl, threshold: 1 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [slotHelperOpen]);

  useEffect(() => {
    // Never allow a previously selected slot to stay active once results are stale/refreshing.
    if (slotHelperRefreshNeeded || slotHelperRefreshing) {
      setSlotHelperSelectedSlotKeys([]);
    }
  }, [slotHelperRefreshNeeded, slotHelperRefreshing]);

  const localScheduleConflicts = useMemo((): ScheduleConflict[] => {
    return detectScheduleConflicts(engineSessions, conflictEngineConfig);
  }, [engineSessions, conflictEngineConfig]);

  const localConflictsBySessionId = useMemo(() => {
    const byId: Record<string, ScheduleConflict[]> = {};
    for (const c of localScheduleConflicts) {
      byId[c.session_a_id] = byId[c.session_a_id] ? [...byId[c.session_a_id], c] : [c];
      if (c.session_b_id) {
        byId[c.session_b_id] = byId[c.session_b_id] ? [...byId[c.session_b_id], c] : [c];
      }
    }
    return byId;
  }, [localScheduleConflicts]);

  const slotHelperAllDaysSelected = slotHelperSelectedDays.length === SLOT_HELPER_DAY_PILLS.length;

  const slotHelperLabelMaps = useMemo(() => {
    const classLabelById = new Map<string, string>();
    const instructorLabelById = new Map<string, string>();
    const locationLabelById = new Map<string, string>();

    for (const r of slotHelperMappingRows) {
      if (r.class_id && !classLabelById.has(r.class_id)) {
        classLabelById.set(r.class_id, String(r.class_label ?? r.class_name ?? r.class_id).trim() || r.class_id);
      }
      if (r.instructor_id && !instructorLabelById.has(r.instructor_id)) {
        instructorLabelById.set(
          r.instructor_id,
          String(r.instructor_label ?? r.instructor_nickname ?? r.instructor_id).trim() || r.instructor_id,
        );
      }
      if (r.location_id && !locationLabelById.has(r.location_id)) {
        locationLabelById.set(
          r.location_id,
          String(r.location_label ?? r.location_name ?? r.location_id).trim() || r.location_id,
        );
      }
    }

    return { classLabelById, instructorLabelById, locationLabelById };
  }, [slotHelperMappingRows]);

  const slotHelperMappingIndexByClass = useMemo((): Map<string, SlotHelperClassIndex> => {
    const byClass = new Map<string, SlotHelperClassIndex>();

    const ensureClass = (classId: string): SlotHelperClassIndex => {
      const existing = byClass.get(classId);
      if (existing) return existing;
      const created: SlotHelperClassIndex = {
        instructorIds: [],
        locationIds: [],
        minutesAll: new Set<number>(),
        byInstructor: new Map(),
        byLocation: new Map(),
      };
      byClass.set(classId, created);
      return created;
    };

    for (const r of slotHelperMappingRows) {
      const classId = String(r.class_id ?? "").trim();
      const instId = String(r.instructor_id ?? "").trim();
      const locId = String(r.location_id ?? "").trim();
      const minutes = Number(r.minutes);
      if (!classId || !instId || !locId) continue;
      if (!Number.isFinite(minutes) || minutes <= 0) continue;

      const cls = ensureClass(classId);
      cls.minutesAll.add(minutes);

      // byInstructor
      if (!cls.byInstructor.has(instId)) {
        cls.byInstructor.set(instId, { locationIds: new Set<string>(), minutesAll: new Set<number>(), minutesByLocation: new Map() });
      }
      const inst = cls.byInstructor.get(instId)!;
      inst.locationIds.add(locId);
      inst.minutesAll.add(minutes);
      const mByLoc = inst.minutesByLocation.get(locId) ?? new Set<number>();
      mByLoc.add(minutes);
      inst.minutesByLocation.set(locId, mByLoc);

      // byLocation
      if (!cls.byLocation.has(locId)) {
        cls.byLocation.set(locId, { instructorIds: new Set<string>(), minutesAll: new Set<number>(), minutesByInstructor: new Map() });
      }
      const loc = cls.byLocation.get(locId)!;
      loc.instructorIds.add(instId);
      loc.minutesAll.add(minutes);
      const mByInst = loc.minutesByInstructor.get(instId) ?? new Set<number>();
      mByInst.add(minutes);
      loc.minutesByInstructor.set(instId, mByInst);
    }

    // Materialize stable sorted arrays for ids
    for (const cls of byClass.values()) {
      cls.instructorIds = Array.from(cls.byInstructor.keys()).sort();
      cls.locationIds = Array.from(cls.byLocation.keys()).sort();
    }

    return byClass;
  }, [slotHelperMappingRows]);

  const slotHelperClassOptions = useMemo((): SlotHelperOption[] => {
    const byId = new Map<string, string>();
    for (const r of slotHelperMappingRows) {
      if (!r.class_id) continue;
      const cls = classById.get(r.class_id) ?? null;
      const label =
        (cls?.name ?? "").trim() ||
        String(slotHelperLabelMaps.classLabelById.get(r.class_id) ?? "").trim() ||
        r.class_id;
      byId.set(r.class_id, label);
    }
    return Array.from(byId.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [slotHelperMappingRows, classById, slotHelperLabelMaps.classLabelById]);

  const slotHelperInstructorOptions = useMemo((): SlotHelperOption[] => {
    if (!slotHelperSelectedClassId) return [];
    const cls = slotHelperMappingIndexByClass.get(slotHelperSelectedClassId) ?? null;
    if (!cls) return [];
    return cls.instructorIds
      .map((id) => {
        const inst = instructorById.get(id) ?? null;
        const instLabel =
          String(inst?.nickname ?? "").trim() ||
          `${String(inst?.first_name ?? "").trim()} ${String(inst?.last_name ?? "").trim()}`.trim();
        const label = instLabel || String(slotHelperLabelMaps.instructorLabelById.get(id) ?? "").trim() || id;
        return { id, label };
      })
      .filter((opt) => opt.label.trim().toUpperCase() !== "UNASSIGNED")
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [slotHelperSelectedClassId, slotHelperMappingIndexByClass, instructorById, slotHelperLabelMaps.instructorLabelById]);

  const slotHelperSelectedInstructorDisplay = useMemo((): string => {
    const ids = slotHelperSelectedInstructorIds;
    if (ids.length === 0) return "";
    return ids
      .map((id) => slotHelperInstructorOptions.find((x) => x.id === id)?.label ?? id)
      .join(", ");
  }, [slotHelperSelectedInstructorIds, slotHelperInstructorOptions]);

  const slotHelperReviewRequestOptions = useMemo(() => {
    const nowMs = Date.now();
    const formatClassName = (rawName: string): string => {
      const proper = toTitleCaseWithYmcaAndOf(rawName.trim()) ?? rawName.trim();
      if (proper.length <= 20) return proper;
      return `${proper.slice(0, 20).trimEnd()}...`;
    };

    const formatDateTime = (raw: string | null): string => {
      if (!raw) return "";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return "";
      const dateLabel = formatIsoDateMMDDYYYY(d.toISOString().slice(0, 10));
      const timeLabel = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return `${dateLabel} @ ${timeLabel}`;
    };

    const formatInstructorLabel = (id: string): string => {
      const inst = instructorById.get(id) ?? null;
      const nick = String(inst?.nickname ?? "").trim();
      const full = `${String(inst?.first_name ?? "").trim()} ${String(inst?.last_name ?? "").trim()}`.trim();
      return nick || full || id;
    };

    return slotHelperReviewRequests.map((r) => {
      const displayTimestamp = r.sent_at ?? r.created_at;
      const expiresMs = new Date(r.expires_at).getTime();
      const expired = Number.isFinite(expiresMs) ? nowMs > expiresMs : false;
      const statusLine = r.responded_at ? "Responded" : "Sent";
      const statusTimestamp = r.responded_at ?? r.sent_at ?? r.created_at;
      const statusTimestampLabel = formatDateTime(statusTimestamp);

      const className = r.class_id ? classById.get(r.class_id)?.name ?? "" : "";
      const classLabel = className ? formatClassName(className) : "Class";
      const locationName = r.location_id ? locationById.get(r.location_id)?.name ?? "" : "";
      const locationLabel = locationName || "Location";
      const instructors =
        (r.instructor_ids ?? []).length > 0
          ? r.instructor_ids.map(formatInstructorLabel).join(", ")
          : "Instructor(s)";
      const detailLine = `${classLabel} • ${locationLabel} • ${instructors}`;

      const label = expired ? "Expired" : statusLine;
      return {
        value: r.id,
        label,
        detailLine,
        sentAt: displayTimestamp,
        statusTimestampLabel,
        classLabel,
      };
    });
  }, [slotHelperReviewRequests, classById, locationById, instructorById]);

  const slotHelperSelectedRequestSummary = useMemo(() => {
    if (!slotHelperReviewRequestId) return null;
    const selected = slotHelperReviewRequestOptions.find((o) => o.value === slotHelperReviewRequestId) ?? null;
    if (!selected) return null;
    const sentAtRaw = (selected as { sentAt?: string | null }).sentAt ?? null;
    if (!sentAtRaw) return selected;
    const d = new Date(sentAtRaw);
    if (Number.isNaN(d.getTime())) return selected;
    const isoDate = d.toISOString().slice(0, 10);
    const dateLabel = formatIsoDateMMDDYYYY(isoDate);
    const timeLabel = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const classLabel = (selected as { classLabel?: string }).classLabel ?? selected.label;
    return {
      ...selected,
      label: `${dateLabel} @ ${timeLabel} • ${classLabel}.`,
    };
  }, [slotHelperReviewRequestId, slotHelperReviewRequestOptions]);

  const slotHelperAllowedLocationIds = useMemo((): string[] => {
    if (!slotHelperSelectedClassId) return [];

    const cls = slotHelperMappingIndexByClass.get(slotHelperSelectedClassId) ?? null;
    if (!cls) return [];

    // If no instructors selected yet, show ALL locations for the selected class (unique).
    if (slotHelperSelectedInstructorIds.length === 0) {
      return cls.locationIds.slice();
    }

    let intersection: Set<string> | null = null;
    for (const instId of slotHelperSelectedInstructorIds) {
      const inst = cls.byInstructor.get(instId) ?? null;
      const set = inst ? inst.locationIds : new Set<string>();
      if (intersection === null) intersection = new Set(set);
      else {
        const next = new Set<string>();
        for (const x of intersection) {
          if (set.has(x)) next.add(x);
        }
        intersection = next;
      }
    }
    return Array.from(intersection ?? []).sort();
  }, [slotHelperSelectedClassId, slotHelperSelectedInstructorIds, slotHelperMappingIndexByClass]);

  const slotHelperLocationOptions = useMemo((): SlotHelperOption[] => {
    const allowed = new Set(slotHelperAllowedLocationIds);
    return Array.from(allowed)
      .map((id) => {
        const loc = locationById.get(id) ?? null;
        const label =
          (loc ? `${loc.code} - ${loc.name}` : "") ||
          String(slotHelperLabelMaps.locationLabelById.get(id) ?? "").trim() ||
          id;
        return { id, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [slotHelperAllowedLocationIds, locationById, slotHelperLabelMaps.locationLabelById]);

  const slotHelperDurationOptions = useMemo((): number[] => {
    if (!slotHelperSelectedClassId) return [];
    const cls = slotHelperMappingIndexByClass.get(slotHelperSelectedClassId) ?? null;
    if (!cls) return [];

    // If we have both location + instructors, durations must be the INTERSECTION (valid for all selected instructors).
    if (slotHelperSelectedLocationId && slotHelperSelectedInstructorIds.length > 0) {
      let intersection: Set<number> | null = null;
      for (const instId of slotHelperSelectedInstructorIds) {
        const inst = cls.byInstructor.get(instId) ?? null;
        const set = inst?.minutesByLocation.get(slotHelperSelectedLocationId) ?? new Set<number>();
        if (intersection === null) intersection = new Set(set);
        else {
          const next = new Set<number>();
          for (const x of intersection) {
            if (set.has(x)) next.add(x);
          }
          intersection = next;
        }
      }
      return Array.from(intersection ?? []).sort((a, b) => a - b);
    }

    // Otherwise, show UNION (valid durations for selected class, optionally narrowed by selected instructors/location).
    if (slotHelperSelectedLocationId) {
      return Array.from(cls.byLocation.get(slotHelperSelectedLocationId)?.minutesAll ?? []).sort((a, b) => a - b);
    }
    if (slotHelperSelectedInstructorIds.length > 0) {
      const minutes = new Set<number>();
      for (const instId of slotHelperSelectedInstructorIds) {
        for (const m of cls.byInstructor.get(instId)?.minutesAll ?? []) minutes.add(m);
      }
      return Array.from(minutes).sort((a, b) => a - b);
    }
    return Array.from(cls.minutesAll).sort((a, b) => a - b);
  }, [
    slotHelperSelectedClassId,
    slotHelperSelectedInstructorIds,
    slotHelperSelectedLocationId,
    slotHelperMappingIndexByClass,
  ]);

  useEffect(() => {
    // When class changes, reset dependent selections.
    if (slotHelperSkipClassResetRef.current) {
      slotHelperSkipClassResetRef.current = false;
      return;
    }
    setSlotHelperSelectedInstructorIds([]);
    setSlotHelperSelectedLocationId(null);
    setSlotHelperSelectedSlotKeys([]);
    setSlotHelperDurationMinutes(null);
    setSlotHelperClassDropdownOpen(false);
    setSlotHelperLocationDropdownOpen(false);
    setSlotHelperInstructorDropdownOpen(false);
  }, [slotHelperSelectedClassId]);

  useEffect(() => {
    // After selecting a class, auto-select singleton instructor and/or location.
    if (!slotHelperSelectedClassId) return;
    if (slotHelperRefreshing) return;

    if (slotHelperSelectedInstructorIds.length === 0 && slotHelperInstructorOptions.length === 1) {
      const only = slotHelperInstructorOptions[0]?.id ?? null;
      if (only) setSlotHelperSelectedInstructorIds([only]);
    }

    if (!slotHelperSelectedLocationId && slotHelperLocationOptions.length === 1) {
      const only = slotHelperLocationOptions[0]?.id ?? null;
      if (only) setSlotHelperSelectedLocationId(only);
    }
  }, [
    slotHelperSelectedClassId,
    slotHelperInstructorOptions,
    slotHelperLocationOptions,
    slotHelperSelectedInstructorIds,
    slotHelperSelectedLocationId,
    slotHelperRefreshing,
  ]);

  useEffect(() => {
    // If instructors change, ensure selected location remains valid.
    if (!slotHelperSelectedLocationId) return;
    if (slotHelperAllowedLocationIds.includes(slotHelperSelectedLocationId)) return;
    setSlotHelperSelectedLocationId(null);
    setSlotHelperSelectedSlotKeys([]);
  }, [slotHelperAllowedLocationIds, slotHelperSelectedLocationId]);

  useEffect(() => {
    // Any change in selection inputs invalidates the currently selected slot.
    if (slotHelperSkipSelectedSlotClearRef.current) {
      slotHelperSkipSelectedSlotClearRef.current = false;
      return;
    }
    setSlotHelperSelectedSlotKeys([]);
  }, [
    slotHelperSelectedInstructorIds,
    slotHelperDurationMinutes,
    slotHelperSelectedDays,
    slotHelperTransitionMinutes,
    slotHelperTurnoverMinutes,
  ]);

  useEffect(() => {
    // Keep duration within allowed options; if current duration isn't allowed, snap to first allowed.
    if (slotHelperDurationOptions.length === 0) {
      if (slotHelperDurationMinutes !== null) setSlotHelperDurationMinutes(null);
      return;
    }

    if (slotHelperDurationOptions.length === 1) {
      const only = slotHelperDurationOptions[0] ?? null;
      if (only !== null && slotHelperDurationMinutes !== only) setSlotHelperDurationMinutes(only);
      return;
    }

    // Multiple durations => require explicit selection.
    if (slotHelperDurationMinutes === null) return;
    if (!slotHelperDurationOptions.includes(slotHelperDurationMinutes)) {
      setSlotHelperDurationMinutes(null);
    }
  }, [slotHelperDurationOptions, slotHelperDurationMinutes]);

  const localConflictSummary = useMemo(() => {
    const summary = { high: 0, medium: 0, low: 0, total: 0 };
    for (const c of localScheduleConflicts) {
      summary.total++;
      if (c.severity === "HIGH") summary.high++;
      if (c.severity === "MEDIUM") summary.medium++;
      if (c.severity === "LOW") summary.low++;
    }
    return summary;
  }, [localScheduleConflicts]);

  const getSessionSeverity = useCallback(
    (sessionId: string): "HIGH" | "MEDIUM" | "LOW" | null => {
      const list = localConflictsBySessionId[sessionId] ?? [];
      if (list.some((c) => c.severity === "HIGH")) return "HIGH";
      if (list.some((c) => c.severity === "MEDIUM")) return "MEDIUM";
      if (list.some((c) => c.severity === "LOW")) return "LOW";
      return null;
    },
    [localConflictsBySessionId],
  );

  type RiskPillId = "RESET" | "HIGH" | "MED" | "LOW" | "ALL" | "PRINT";
  type RiskFilter = Exclude<RiskPillId, "PRINT">;
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("RESET");
  const [riskPillTooltipOpen, setRiskPillTooltipOpen] = useState<RiskPillId | null>(null);
  const [printConflictsModalOpen, setPrintConflictsModalOpen] = useState(false);
  const [slotHelperTimeHelpOpen, setSlotHelperTimeHelpOpen] = useState<"transition" | "turnover" | null>(null);

  // Counts are per-session (not per-conflict) within the current grid filters/search.
  const riskCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0, any: 0 };
    for (const s of filteredSessions) {
      const sev = getSessionSeverity(s.id);
      if (!sev) continue;
      counts.any += 1;
      if (sev === "HIGH") counts.high += 1;
      if (sev === "MEDIUM") counts.medium += 1;
      if (sev === "LOW") counts.low += 1;
    }
    return counts;
  }, [filteredSessions, getSessionSeverity]);

  const riskFilteredSessions = useMemo(() => {
    if (riskFilter === "RESET") return filteredSessions;
    if (riskFilter === "ALL") return filteredSessions.filter((s) => getSessionSeverity(s.id) !== null);
    if (riskFilter === "HIGH") return filteredSessions.filter((s) => getSessionSeverity(s.id) === "HIGH");
    if (riskFilter === "MED") return filteredSessions.filter((s) => getSessionSeverity(s.id) === "MEDIUM");
    return filteredSessions.filter((s) => getSessionSeverity(s.id) === "LOW");
  }, [filteredSessions, getSessionSeverity, riskFilter]);

  const conflictsForPrintModal = useMemo(() => {
    const idSet = new Set(riskFilteredSessions.map((s) => s.id));
    return localScheduleConflicts.filter((c) => {
      if (idSet.has(c.session_a_id)) return true;
      if (c.session_b_id && idSet.has(c.session_b_id)) return true;
      return false;
    });
  }, [localScheduleConflicts, riskFilteredSessions]);

  const sortedSessions = useMemo(() => {
    const activeSort = sortOrder[0] || null;
    return [...riskFilteredSessions].sort((a, b) => {
      // 1) User-selected single-column sort (if any)
      if (activeSort) {
        if (activeSort.column === "class") {
          const aVal = a.class?.name || "";
          const bVal = b.class?.name || "";
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== 0) return activeSort.direction === "asc" ? cmp : -cmp;
        } else if (activeSort.column === "location") {
          const aVal = formatLocation(a.location);
          const bVal = formatLocation(b.location);
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== 0) return activeSort.direction === "asc" ? cmp : -cmp;
        } else if (activeSort.column === "instructor") {
          const aVal = formatInstructors(a.instructors);
          const bVal = formatInstructors(b.instructors);
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== 0) return activeSort.direction === "asc" ? cmp : -cmp;
        }
      }

      // 2) Default ordering fallback: Day -> Date -> Start Time
      const dayDiff = (DAY_ORDER[a.day_of_week] ?? 99) - (DAY_ORDER[b.day_of_week] ?? 99);
      if (dayDiff !== 0) return dayDiff;
      const dateDiff = a.session_date.localeCompare(b.session_date);
      if (dateDiff !== 0) return dateDiff;
      return a.start_time.localeCompare(b.start_time);
    });
  }, [formatInstructors, formatLocation, riskFilteredSessions, sortOrder]);

  // NOTE: Inline edit candidate conflicts were removed (editing is now modal-based).

  const addCandidateConflicts = useMemo((): ScheduleConflict[] | null => {
    if (!addOpen) return null;
    if (!addForm.session_date || !addForm.start_time || !addForm.end_time || !addForm.class_id || !addForm.location_id) {
      return null;
    }

    const day = dayOfWeekFromIsoDateUtc(addForm.session_date) ?? "";
    const className = classes.find((c) => c.id === addForm.class_id)?.name ?? null;
    const locationCode = locations.find((l) => l.id === addForm.location_id)?.code ?? null;

    const NEW_ID = "__new__";
    const candidate: SessionForConflicts = {
      id: NEW_ID,
      day_of_week: day,
      session_date: addForm.session_date,
      start_time: addForm.start_time,
      end_time: addForm.end_time,
      class_name: className,
      location_code: locationCode,
      location_id: addForm.location_id,
      instructor_ids: addForm.instructor_ids ?? [],
    };

    const baseSessions =
      addForm.hold_id ? engineSessions.filter((s) => s.id !== `hold:${addForm.hold_id}`) : engineSessions;
    const all = detectScheduleConflicts([...baseSessions, candidate], conflictEngineConfig);
    return all.filter((c) => c.session_a_id === NEW_ID || c.session_b_id === NEW_ID);
  }, [
    addOpen,
    addForm.session_date,
    addForm.start_time,
    addForm.end_time,
    addForm.class_id,
    addForm.location_id,
    addForm.instructor_ids,
    addForm.hold_id,
    classes,
    locations,
    engineSessions,
    conflictEngineConfig,
  ]);

  const addBlockingConflicts = useMemo((): ScheduleConflict[] => {
    return (addCandidateConflicts ?? []).filter((c) => c.severity === "HIGH");
  }, [addCandidateConflicts]);

  type AvailabilityStatus = "ANYTIME" | "AVAILABLE" | "OUTSIDE" | "NO_WINDOWS" | "NEEDS_INPUT";

function availabilityStatusLabel(status: AvailabilityStatus): string {
  if (status === "NO_WINDOWS" || status === "OUTSIDE") return "NOT AVAILABLE";
  if (status === "NEEDS_INPUT") return "NEEDS INPUT";
  return status;
}

function shortDowLabel(day: string): string {
  const clean = String(day || "").trim().toUpperCase();
  return clean.length <= 3 ? clean : clean.slice(0, 3);
}
  type AvailabilityVm = {
    instructor_id: string;
    instructor_label: string;
    month: string | null;
    day: string | null;
    status: AvailabilityStatus;
  checkLine: string;
  monthLabel: string | null;
  monthPills: Array<{ day: string; window: string }>;
  };

const AVAIL_DOW_ORDER: Record<string, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

function hm(value: string): string {
  // normalize to HH:mm for display like Maintenance
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return String(value ?? "").slice(0, 5);
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function buildAvailabilityVm(opts: {
  instructorId: string;
  instructorLabel: string;
  month: string | null;
  isoDate: string | null;
  startHHmm: string | null;
  endHHmm: string | null;
  availabilityRows: AvailabilityRule[];
}): AvailabilityVm {
  const { instructorId, instructorLabel, month, isoDate, startHHmm, endHHmm, availabilityRows } = opts;

  const day = isoDate ? dayOfWeekFromIsoDateUtc(isoDate) : null;
  const startMin = startHHmm ? parseHHmmToMinutes(startHHmm) : null;
  const endMin = endHHmm ? parseHHmmToMinutes(endHHmm) : null;

  const rulesForMonth =
    month
      ? availabilityRows.filter((r) => r.instructor_id === instructorId && r.schedule_month === month)
      : [];

  const monthPills = rulesForMonth
    .slice()
    .sort((a, b) => {
      const aDay = AVAIL_DOW_ORDER[String(a.day_of_week).toUpperCase()] ?? 99;
      const bDay = AVAIL_DOW_ORDER[String(b.day_of_week).toUpperCase()] ?? 99;
      if (aDay !== bDay) return aDay - bDay;
      return String(a.available_start).localeCompare(String(b.available_start));
    })
    .map((r) => ({
      day: String(r.day_of_week).toUpperCase(),
      window: `${hm(String(r.available_start).slice(0, 5))}–${hm(String(r.available_end).slice(0, 5))}`,
    }));

  // No rules at all in month => available any time
  if (!month || rulesForMonth.length === 0) {
    const monthLabel = month ? formatMonthShortYear(month) : null;
    return {
      instructor_id: instructorId,
      instructor_label: instructorLabel,
      month,
      day,
      status: "ANYTIME",
      checkLine: month
        ? `No availability rules for ${monthLabel}; available any time.`
        : "Select a date to view availability.",
      monthLabel,
      monthPills: [],
    };
  }

  const monthLabel = formatMonthShortYear(month);

  if (!isoDate || !day) {
    return {
      instructor_id: instructorId,
      instructor_label: instructorLabel,
      month,
      day,
      status: "NEEDS_INPUT",
      checkLine: "Select a date to check availability.",
      monthLabel,
      monthPills,
    };
  }

  if (startMin === null || endMin === null || endMin <= startMin) {
    return {
      instructor_id: instructorId,
      instructor_label: instructorLabel,
      month,
      day,
      status: "NEEDS_INPUT",
      checkLine: "Select a start and end time to check availability.",
      monthLabel,
      monthPills,
    };
  }

  const windowsForDay = rulesForMonth
    .filter((r) => String(r.day_of_week).toUpperCase() === day)
    .map((r) => ({ start: hm(String(r.available_start).slice(0, 5)), end: hm(String(r.available_end).slice(0, 5)) }));

  const dateLabel = formatIsoDateForMessage(isoDate);
  const startLabel = formatTimeAmPm(startHHmm ?? "");
  const endLabel = formatTimeAmPm(endHHmm ?? "");

  if (windowsForDay.length === 0) {
    return {
      instructor_id: instructorId,
      instructor_label: instructorLabel,
      month,
      day,
      status: "NO_WINDOWS",
      checkLine: `No Availability for ${dateLabel} from ${startLabel} to ${endLabel}.`,
      monthLabel,
      monthPills,
    };
  }

  const covered = windowsForDay.some((w) => {
    const wStart = parseHHmmToMinutes(w.start);
    const wEnd = parseHHmmToMinutes(w.end);
    if (wStart === null || wEnd === null) return false;
    return startMin >= wStart && endMin <= wEnd;
  });

  return {
    instructor_id: instructorId,
    instructor_label: instructorLabel,
    month,
    day,
    status: covered ? "AVAILABLE" : "OUTSIDE",
    checkLine: covered
      ? `Available for ${dateLabel} from ${startLabel} to ${endLabel}.`
      : `No Availability for ${dateLabel} from ${startLabel} to ${endLabel}.`,
    monthLabel,
    monthPills,
  };
}

  const addAvailabilityVm = useMemo((): AvailabilityVm[] => {
    if (!addOpen) return [];

    const month = scheduleMonth ?? (addForm.session_date ? addForm.session_date.slice(0, 7) : null);
    const selectedIds = addForm.instructor_ids ?? [];
    return selectedIds.map((instructorId) => {
      const inst = instructors.find((i) => i.id === instructorId) ?? null;
      const label =
        inst?.nickname ||
        `${inst?.first_name ?? ""} ${inst?.last_name ?? ""}`.trim() ||
        instructorId;

      return buildAvailabilityVm({
        instructorId,
        instructorLabel: label,
        month,
        isoDate: addForm.session_date || null,
        startHHmm: addForm.start_time || null,
        endHHmm: addForm.end_time || null,
        availabilityRows: availability,
      });
    });
  }, [
    addOpen,
    addForm.session_date,
    addForm.start_time,
    addForm.end_time,
    addForm.instructor_ids,
    scheduleMonth,
    availability,
    instructors,
  ]);

  const editModalCandidateConflicts = useMemo((): ScheduleConflict[] | null => {
    if (!editModalOpen || !editModalSessionId) return null;
    if (
      !editModalForm.session_date ||
      !editModalForm.start_time ||
      !editModalForm.end_time ||
      !editModalForm.class_id ||
      !editModalForm.location_id
    ) {
      return null;
    }

    const current = sessions.find((s) => s.id === editModalSessionId) ?? null;
    const day = dayOfWeekFromIsoDateUtc(editModalForm.session_date) ?? "";
    const className = classes.find((c) => c.id === editModalForm.class_id)?.name ?? current?.class?.name ?? null;
    const locationCode =
      locations.find((l) => l.id === editModalForm.location_id)?.code ??
      current?.location?.code ??
      null;

    const candidate: SessionForConflicts = {
      id: editModalSessionId,
      day_of_week: day,
      session_date: editModalForm.session_date,
      start_time: editModalForm.start_time,
      end_time: editModalForm.end_time,
      class_name: className,
      location_code: locationCode,
      location_id: editModalForm.location_id,
      instructor_ids: editModalForm.instructor_ids ?? [],
    };

    const replaced = engineSessions.map((s) => (s.id === editModalSessionId ? candidate : s));
    const all = detectScheduleConflicts(replaced, conflictEngineConfig);
    return all.filter((c) => c.session_a_id === editModalSessionId || c.session_b_id === editModalSessionId);
  }, [
    editModalOpen,
    editModalSessionId,
    editModalForm.session_date,
    editModalForm.start_time,
    editModalForm.end_time,
    editModalForm.class_id,
    editModalForm.location_id,
    editModalForm.instructor_ids,
    classes,
    locations,
    engineSessions,
    conflictEngineConfig,
  ]);

  const editModalAvailabilityConflictInstructorId = useMemo((): string | null => {
    if (!editModalOpen || !editModalSessionId) return null;
    const existing = localConflictsBySessionId[editModalSessionId] ?? [];
    const display = editModalCandidateConflicts ?? existing;
    const hit = display.find(
      (c) => c.severity === "HIGH" && c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY",
    );
    const meta = (hit?.meta ?? null) as Record<string, unknown> | null;
    return meta && typeof meta.instructor_id === "string" ? meta.instructor_id : null;
  }, [editModalCandidateConflicts, editModalOpen, editModalSessionId, localConflictsBySessionId]);

  const editModalRelatedAvailabilityHighSessionIds = useMemo((): string[] => {
    const instructorId = editModalAvailabilityConflictInstructorId;
    if (!instructorId) return [];

    const ids: string[] = [];
    for (const s of sessions) {
      const list = localConflictsBySessionId[s.id] ?? [];
      const has = list.some((c) => {
        if (c.severity !== "HIGH") return false;
        if (c.type !== "INSTRUCTOR_OUTSIDE_AVAILABILITY") return false;
        const meta = (c.meta ?? null) as Record<string, unknown> | null;
        const cid = meta && typeof meta.instructor_id === "string" ? meta.instructor_id : null;
        return cid === instructorId;
      });
      if (has) ids.push(s.id);
    }
    return ids;
  }, [editModalAvailabilityConflictInstructorId, localConflictsBySessionId, sessions]);

  const rescheduleAvailabilityVm = useMemo((): AvailabilityVm | null => {
    if (!reschedulePreviewOpen) return null;
    const instructorId = editModalAvailabilityConflictInstructorId;
    if (!instructorId) return null;
    const month = scheduleMonth ?? (editModalForm.session_date ? editModalForm.session_date.slice(0, 7) : null);
    const label = resolveInstructorLabel(instructorId, editModalSessionId) ?? instructorId;
    return buildAvailabilityVm({
      instructorId,
      instructorLabel: label,
      month,
      isoDate: editModalForm.session_date || null,
      startHHmm: editModalForm.start_time || null,
      endHHmm: editModalForm.end_time || null,
      availabilityRows: availability,
    });
  }, [
    availability,
    editModalAvailabilityConflictInstructorId,
    editModalForm.end_time,
    editModalForm.session_date,
    editModalForm.start_time,
    editModalSessionId,
    resolveInstructorLabel,
    reschedulePreviewOpen,
    scheduleMonth,
  ]);

  const rescheduleBodyOverflowPrevRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!reschedulePreviewOpen) {
      if (rescheduleBodyOverflowPrevRef.current !== null) {
        document.body.style.overflow = rescheduleBodyOverflowPrevRef.current;
        rescheduleBodyOverflowPrevRef.current = null;
      }
      return;
    }
    if (rescheduleBodyOverflowPrevRef.current === null) {
      rescheduleBodyOverflowPrevRef.current = document.body.style.overflow || "";
    }
    document.body.style.overflow = "hidden";

    return () => {
      if (rescheduleBodyOverflowPrevRef.current !== null) {
        document.body.style.overflow = rescheduleBodyOverflowPrevRef.current;
        rescheduleBodyOverflowPrevRef.current = null;
      }
    };
  }, [reschedulePreviewOpen]);

  useEffect(() => {
    if (!reschedulePreviewOpen) return;

    setReschedulePreviewError(null);
    setReschedulePreviewResults(null);
    setRescheduleSelectedSessionIds([]);
    setRescheduleEmailModalOpen(false);
    setRescheduleEmailSending(false);
    setRescheduleEmailError(null);
    setRescheduleEmailSuccess(false);
    setRescheduleAdditionalInstructorEmails("");

    if (!scheduleMonth) {
      setReschedulePreviewError("Schedule month is not available.");
      return;
    }

    const instructorId = editModalAvailabilityConflictInstructorId;
    if (!instructorId) {
      setReschedulePreviewError("No instructor availability conflict selected.");
      return;
    }

    if (editModalRelatedAvailabilityHighSessionIds.length === 0) {
      setReschedulePreviewError("No related sessions found.");
      return;
    }

    setReschedulePreviewComputing(true);
    try {
      const results = buildReschedulePreview({
        scheduleMonth,
        targetInstructorId: instructorId,
        relatedSessionIds: editModalRelatedAvailabilityHighSessionIds,
        sessions: engineSessions,
        instructorAvailability: availabilityForEngine,
        stepMinutes: 15,
      });
      setReschedulePreviewResults(results);
      // Requirement: default to unchecked on first load.
      setRescheduleSelectedSessionIds([]);
    } catch (err) {
      console.error("[reschedule-preview] compute failed:", err);
      setReschedulePreviewError("Failed to compute reschedule preview.");
    } finally {
      setReschedulePreviewComputing(false);
    }
  }, [
    availabilityForEngine,
    editModalAvailabilityConflictInstructorId,
    editModalRelatedAvailabilityHighSessionIds,
    engineSessions,
    reschedulePreviewOpen,
    scheduleMonth,
  ]);

  useEffect(() => {
    if (!reschedulePreviewOpen) return;
    if (!branchId || !scheduleId) return;
    if (!rescheduleTargetInstructorId) return;

    void (async () => {
      try {
        await refreshRescheduleStatus();
      } catch {
        // refreshRescheduleStatus already handles errors
      }
    })();
    return;
  }, [branchId, refreshRescheduleStatus, reschedulePreviewOpen, rescheduleTargetInstructorId, scheduleId]);

  const editModalBlockingConflicts = useMemo((): ScheduleConflict[] => {
    return (editModalCandidateConflicts ?? []).filter((c) => c.severity === "HIGH");
  }, [editModalCandidateConflicts]);

  const editAvailabilityVm = useMemo((): AvailabilityVm[] => {
    if (!editModalOpen) return [];

    const month =
      scheduleMonth ?? (editModalForm.session_date ? editModalForm.session_date.slice(0, 7) : null);

    const selectedIds = editModalForm.instructor_ids ?? [];
    return selectedIds.map((instructorId) => {
      const inst = instructors.find((i) => i.id === instructorId) ?? null;
      const label =
        inst?.nickname ||
        `${inst?.first_name ?? ""} ${inst?.last_name ?? ""}`.trim() ||
        instructorId;

      return buildAvailabilityVm({
        instructorId,
        instructorLabel: label,
        month,
        isoDate: editModalForm.session_date || null,
        startHHmm: editModalForm.start_time || null,
        endHHmm: editModalForm.end_time || null,
        availabilityRows: availability,
      });
    });
  }, [
    editModalOpen,
    editModalForm.session_date,
    editModalForm.start_time,
    editModalForm.end_time,
    editModalForm.instructor_ids,
    scheduleMonth,
    availability,
    instructors,
  ]);

  const gridCriteria = useMemo(() => {
    const criteria: string[] = [];

    const hasWeekFilter = !!filterWeekStart;
    const hasDateFilter = !!filterDate;
    const hasDayFilter = !!filterDay;
    const hasSearchFilter = !!searchTerm.trim();
    const hasClassFilter = classFilter.length > 0 && !classFilter.includes("__NONE__");
    const hasLocationFilter = locationFilter.length > 0 && !locationFilter.includes("__NONE__");
    const hasInstructorFilter = instructorFilter.length > 0 && !instructorFilter.includes("__NONE__");
    const activeSort = sortOrder[0] || null;

    const isFiltered =
      hasWeekFilter ||
      hasDateFilter ||
      hasDayFilter ||
      hasSearchFilter ||
      hasClassFilter ||
      hasLocationFilter ||
      hasInstructorFilter;

    criteria.push(isFiltered ? "⚠ PARTIAL SCHEDULE (Filtered)" : "✓ FULL SCHEDULE");
    criteria.push(`Grid: ${sortedSessions.length} of ${sessions.length} sessions`);

    if (branchName) criteria.push(`Branch: ${branchName}`);
    if (scheduleName) criteria.push(`Schedule: ${scheduleName}`);

    if (hasWeekFilter) {
      const satDate = new Date(filterWeekStart + "T00:00:00");
      const friDate = new Date(satDate);
      friDate.setDate(satDate.getDate() + 6);
      const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      criteria.push(`Week: SAT ${formatDate(satDate)} to FRI ${formatDate(friDate)}`);
    }

    if (hasDateFilter) criteria.push(`Date: ${filterDate}`);
    if (hasDayFilter) criteria.push(`Day: ${DAY_ABBREV[filterDay] ?? filterDay}`);

    if (hasSearchFilter) criteria.push(`Search (${filterField}): "${searchTerm}" [${searchMode}]`);

    if (hasClassFilter) criteria.push(`Class Filter: ${classFilter.join(", ")}`);
    if (hasLocationFilter) criteria.push(`Location Filter: ${locationFilter.join(", ")}`);
    if (hasInstructorFilter) criteria.push(`Instructor Filter: ${instructorFilter.join(", ")}`);

    if (activeSort) {
      criteria.push(`Sort: ${activeSort.column} (${activeSort.direction === "asc" ? "ascending" : "descending"})`);
    } else {
      criteria.push("Sort: Default (Day → Date → Start Time)");
    }

    return criteria;
  }, [
    branchName,
    scheduleName,
    sessions.length,
    sortedSessions.length,
    filterWeekStart,
    filterDate,
    filterDay,
    searchTerm,
    filterField,
    searchMode,
    classFilter,
    locationFilter,
    instructorFilter,
    sortOrder,
  ]);

  useEffect(() => {
    onGridChange?.({
      sessions: sortedSessions,
      criteria: gridCriteria,
      filteredCount: sortedSessions.length,
      totalCount: sessions.length,
      conflictSummary: localConflictSummary,
    });
  }, [onGridChange, sortedSessions, gridCriteria, sessions.length, localConflictSummary]);

  const renderConflictBadge = useCallback((sessionId: string, conflicts: ScheduleConflict[] | null) => {
    const list = conflicts ?? [];
    if (list.length === 0) return <span className="inline-flex h-8 w-8" />;

    const sev =
      list.some((c) => c.severity === "HIGH")
        ? "HIGH"
        : list.some((c) => c.severity === "MEDIUM")
          ? "MEDIUM"
          : "LOW";

    const color =
      sev === "HIGH"
        ? "text-red-300"
        : sev === "MEDIUM"
          ? "text-yellow-300"
          : "text-emerald-300";

    const Icon = sev === "HIGH" ? OctagonAlert : sev === "MEDIUM" ? AlertTriangle : CheckCircle2;

    return (
      <Popover open={conflictPopoverId === sessionId} onOpenChange={() => {}}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Conflicts ${sev} (${list.length})`}
            onMouseEnter={() => setConflictPopoverId(sessionId)}
            onMouseLeave={() => setConflictPopoverId(null)}
            onFocus={() => setConflictPopoverId(sessionId)}
            onBlur={() => setConflictPopoverId(null)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 transition hover:bg-black/30 ${color}`}
          >
            <Icon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="pointer-events-none w-80 rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] p-3 text-xs text-foreground shadow-lg backdrop-blur-md"
        >
          <PopoverArrow
            width={12}
            height={8}
            className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
          />
          <div className="space-y-1">
            {list.slice(0, 6).map((c, i) => (
              <div key={`${c.type}-${i}`} className="leading-snug">
                <span
                  className={
                    c.severity === "HIGH"
                      ? "text-red-300"
                      : c.severity === "MEDIUM"
                        ? "text-yellow-300"
                        : "text-emerald-300"
                  }
                >
                  {c.severity}
                </span>{" "}
                {(() => {
                  if (c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY") {
                    return formatInstructorOutsideAvailabilityMessage(c, sessionId);
                  }
                  return c.message;
                })()}
              </div>
            ))}
            {list.length > 6 && <div className="text-muted-foreground">…and more</div>}
          </div>
        </PopoverContent>
      </Popover>
    );
  }, [conflictPopoverId, formatInstructorOutsideAvailabilityMessage]);

  const sessionTableRows = useMemo(() => {
    const rows = sortedSessions.map((session, idx) => (
      <tr
        key={session.id}
        onClick={() => handleEdit(session)}
        className={`cursor-pointer border-b border-white/5 transition hover:bg-white/5 ${idx % 2 === 0 ? "bg-white/[0.02]" : ""}`}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            {renderConflictBadge(session.id, localConflictsBySessionId[session.id] ?? null)}
            <span>{session.day_of_week.slice(0, 3)}</span>
          </div>
        </td>
        <td className="px-3 py-2">{session.session_date}</td>
        <td className="px-3 py-2">{session.start_time.slice(0, 5)}</td>
        <td className="px-3 py-2">{session.end_time.slice(0, 5)}</td>
        <td className="px-3 py-2">{session.class?.name || "-"}</td>
        <td className="px-3 py-2">{formatLocation(session.location)}</td>
        <td className="px-3 py-2 max-w-[200px] truncate">{formatInstructors(session.instructors)}</td>
        <td
          className="px-3 py-2 max-w-[240px] truncate font-mono text-xs text-muted-foreground"
          title={formatInstructorIds(session.instructors)}
        >
          {formatInstructorIds(session.instructors)}
        </td>
        <td className="px-3 py-2 text-center">{session.headcount ?? "-"}</td>
        <td className="px-2 py-2">
          <div className="flex justify-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(session);
              }}
              className="rounded p-1.5 text-blue-400 transition hover:bg-blue-500/20"
              title="Edit session"
              aria-label="Edit session"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(session.id);
              }}
              className="rounded p-1.5 text-red-400 transition hover:bg-red-500/20"
              title="Delete session"
              aria-label="Delete session"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    ));
    return rows;
  }, [
    editModalOpen,
    formatInstructorIds,
    formatInstructors,
    formatLocation,
    handleDelete,
    handleEdit,
    localConflictsBySessionId,
    renderConflictBadge,
    sortedSessions,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading sessions...</span>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">Error: {error}</div>;
  }

  if (!scheduleId) {
    return <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"><p>Please select a schedule (month) to view sessions.</p></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {headerTooltip && headerTooltipRect ? (
        <PortalTooltip text={headerTooltip.text} rect={headerTooltipRect} />
      ) : null}
      <div className="flex flex-col gap-3">
        {/* Row 1: Search + filter controls */}
        <div className="flex flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative z-10 flex items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setSearchMode("narrow"); }}
            placeholder="Search..."
            autoComplete="off"
            className="h-9 w-48 rounded-lg border border-white/10 bg-black/20 pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:border-[var(--brand-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                clearSortAndFilters();
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 rounded p-0.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Field Radio Buttons */}
        <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
          {(["day", "class", "location", "instructor"] as FilterField[]).map((field) => (
            <label key={field} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="filterField"
                value={field}
                checked={filterField === field}
                onChange={() => { setFilterField(field); searchInputRef.current?.focus(); }}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--cta)]"
              />
              <span className="text-sm">{field.toUpperCase()}</span>
            </label>
          ))}
        </div>

        {/* Search Mode Filter Options */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Filter Options:</span>
          {([
            { id: "narrow" as const, label: "Narrow", getDescription: (field: string) => `Exact match: Shows only sessions where ${field} exactly matches your search term.` },
            { id: "find" as const, label: "Find", getDescription: (field: string) => `Contains match: Shows sessions where ${field} contains your search term anywhere in the text.` },
            { id: "smart" as const, label: "Smart", getDescription: (field: string) => `Fuzzy match: Finds ${field} values even with partial or out-of-order characters (e.g., "bpmp" finds "BODYPUMP").` },
          ]).map((option) => (
            <Popover
              key={option.id}
              open={popoverOpen === option.id}
              onOpenChange={() => {}}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchMode(option.id);
                    setPopoverOpen(null);
                    searchInputRef.current?.focus();
                  }}
                  onMouseEnter={() => setPopoverOpen(option.id)}
                  onMouseLeave={() => setPopoverOpen(null)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                    searchMode === option.id
                      ? "bg-[var(--brand)] text-white shadow-sm"
                      : "bg-black/20 text-foreground/70 hover:bg-black/30 hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="center"
                sideOffset={8}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="pointer-events-none w-64 rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                {option.getDescription(filterField.toUpperCase())}
              </PopoverContent>
            </Popover>
          ))}
        </div>
        </div>

        {/* Row 2: Session count + conflicts + actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Session Count */}
          <div className="text-sm text-muted-foreground">
            {sortedSessions.length} of {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </div>

          {/* Conflict risk pills (filters) */}
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground/80">Conflicts:</div>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1 text-xs">
            <Popover open={riskPillTooltipOpen === "HIGH"} onOpenChange={() => {}}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Show only show stopper conflicts"
                  onClick={() => {
                    setRiskFilter("HIGH");
                    setRiskPillTooltipOpen(null);
                  }}
                  onMouseEnter={() => setRiskPillTooltipOpen("HIGH")}
                  onMouseLeave={() => setRiskPillTooltipOpen(null)}
                  onFocus={() => setRiskPillTooltipOpen("HIGH")}
                  onBlur={() => setRiskPillTooltipOpen(null)}
                  className={`btn-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                    riskFilter === "HIGH"
                      ? "border-red-500/40 bg-red-500/15 text-foreground"
                      : "border-white/15 bg-card/40 text-foreground/90 hover:bg-card/60"
                  }`}
                >
                  <OctagonAlert className="h-3.5 w-3.5 text-red-300" />
                  <span>HIGH</span>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
                    {riskCounts.high}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={8}
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                }}
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                show only show stopper conflicts
              </PopoverContent>
            </Popover>

            <Popover open={riskPillTooltipOpen === "MED"} onOpenChange={() => {}}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Show only warning conflicts"
                  onClick={() => {
                    setRiskFilter("MED");
                    setRiskPillTooltipOpen(null);
                  }}
                  onMouseEnter={() => setRiskPillTooltipOpen("MED")}
                  onMouseLeave={() => setRiskPillTooltipOpen(null)}
                  onFocus={() => setRiskPillTooltipOpen("MED")}
                  onBlur={() => setRiskPillTooltipOpen(null)}
                  className={`btn-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                    riskFilter === "MED"
                      ? "border-yellow-500/40 bg-yellow-500/15 text-foreground"
                      : "border-white/15 bg-card/40 text-foreground/90 hover:bg-card/60"
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-300" />
                  <span>MED</span>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
                    {riskCounts.medium}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={8}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                show only warning conflicts
              </PopoverContent>
            </Popover>

            <Popover open={riskPillTooltipOpen === "LOW"} onOpenChange={() => {}}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Show only informational conflicts"
                  onClick={() => {
                    setRiskFilter("LOW");
                    setRiskPillTooltipOpen(null);
                  }}
                  onMouseEnter={() => setRiskPillTooltipOpen("LOW")}
                  onMouseLeave={() => setRiskPillTooltipOpen(null)}
                  onFocus={() => setRiskPillTooltipOpen("LOW")}
                  onBlur={() => setRiskPillTooltipOpen(null)}
                  className={`btn-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                    riskFilter === "LOW"
                      ? "border-emerald-500/40 bg-emerald-500/15 text-foreground"
                      : "border-white/15 bg-card/40 text-foreground/90 hover:bg-card/60"
                  }`}
                >
                  <Info className="h-3.5 w-3.5 text-emerald-300" />
                  <span>LOW</span>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
                    {riskCounts.low}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={8}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                Show only informational conflicts
              </PopoverContent>
            </Popover>

            <div className="mx-1 h-5 w-px bg-white/10" />

            <Popover open={riskPillTooltipOpen === "ALL"} onOpenChange={() => {}}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Show all conflicts"
                  onClick={() => {
                    setRiskFilter("ALL");
                    setRiskPillTooltipOpen(null);
                  }}
                  onMouseEnter={() => setRiskPillTooltipOpen("ALL")}
                  onMouseLeave={() => setRiskPillTooltipOpen(null)}
                  onFocus={() => setRiskPillTooltipOpen("ALL")}
                  onBlur={() => setRiskPillTooltipOpen(null)}
                  className={`btn-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                    riskFilter === "ALL"
                      ? "border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.25)] text-foreground"
                      : "border-white/15 bg-card/40 text-foreground/90 hover:bg-card/60"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5 text-[var(--cta)]" />
                  <span>ALL</span>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
                    {riskCounts.any}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={8}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                show all conflicts
              </PopoverContent>
            </Popover>

            <Popover open={riskPillTooltipOpen === "RESET"} onOpenChange={() => {}}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Show schedule + conflicts"
                  onClick={() => {
                    setRiskFilter("RESET");
                    setRiskPillTooltipOpen(null);
                  }}
                  onMouseEnter={() => setRiskPillTooltipOpen("RESET")}
                  onMouseLeave={() => setRiskPillTooltipOpen(null)}
                  onFocus={() => setRiskPillTooltipOpen("RESET")}
                  onBlur={() => setRiskPillTooltipOpen(null)}
                  className={`btn-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                    riskFilter === "RESET"
                      ? "border-[var(--brand-strong)] bg-[var(--cta)] text-[var(--cta-foreground)]"
                      : "border-white/15 bg-card/40 text-foreground/90 hover:bg-card/60"
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>RESET</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={8}
                className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                show schedule + conflicts
              </PopoverContent>
            </Popover>

            <Popover open={riskPillTooltipOpen === "PRINT"} onOpenChange={() => {}}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Export a conflict checklist"
                  onClick={() => {
                    setPrintConflictsModalOpen(true);
                    setRiskPillTooltipOpen(null);
                  }}
                  onMouseEnter={() => setRiskPillTooltipOpen("PRINT")}
                  onMouseLeave={() => setRiskPillTooltipOpen(null)}
                  onFocus={() => setRiskPillTooltipOpen("PRINT")}
                  onBlur={() => setRiskPillTooltipOpen(null)}
                  className="btn-pill inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-card/40 px-2.5 py-1 font-semibold text-foreground/90 transition hover:bg-card/60"
                >
                  <Printer className="h-3.5 w-3.5 text-[var(--cta)]" />
                  <span>PRINT</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="center"
                sideOffset={8}
                className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                export a conflict checklist
              </PopoverContent>
            </Popover>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddSessionClick}
            disabled={
              !scheduleId ||
              !branchId ||
              slotHelperOpen ||
              addSessionOpening ||
              isAddSessionTransitionPending
            }
            className="btn-pill inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-strong)] bg-[var(--cta)] px-2.5 py-1 text-xs font-semibold text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={addSessionOpening || isAddSessionTransitionPending ? "Add session (loading)" : "Add session"}
          >
            {addSessionOpening || isAddSessionTransitionPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Add Session
              </>
            )}
          </button>

          {saving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Saving...
            </div>
          )}
        </div>
      </div>

      {(saveError || (saveConflicts && saveConflicts.length > 0)) && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-300" />
            <div className="min-w-0">
              {saveError && <div className="font-medium text-red-300">{saveError}</div>}
            </div>
          </div>
        </div>
      )}

      {!slotHelperOpen ? (
      slotHelperClosing ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading sessions...</span>
        </div>
      ) : (
      <>
      <div ref={tableContainerRef} className="max-h-[600px] overflow-auto rounded-xl border border-white/10 bg-black/20">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--brand-strong)]">
            <tr className="border-b border-white/10">
              {/*
                Header label pill styling (per UX spec):
                - Apply ONLY to the main sessions grid header labels.
                - Use theme-first tokens (no hex).
                - Include sort/filter icons inside the pill only when clickable (true here).
              */}
              {(() => null)()}
              <th className="px-3 py-3 text-left font-medium">
                <div className="flex items-center gap-2">
                  {/* Align header text with day values (which render after the conflict badge) */}
                  <span className="inline-flex h-8 w-8" aria-hidden="true" />
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                    Day
                  </div>
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                  Date
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                  Start
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                  End
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                  <span>Class</span>
                  <button
                    type="button"
                    onClick={() => toggleSort("class")}
                    className="group relative rounded p-1 hover:bg-white/10"
                    aria-label="Sort Class"
                    onMouseEnter={(e) => setHeaderTooltip({ text: "Sort Class", el: e.currentTarget })}
                    onMouseLeave={() => setHeaderTooltip(null)}
                    onFocus={(e) => setHeaderTooltip({ text: "Sort Class", el: e.currentTarget })}
                    onBlur={() => setHeaderTooltip(null)}
                  >
                    {getSortDirection("class") === "asc" ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : getSortDirection("class") === "desc" ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4" />
                    )}
                  </button>
                  <Popover open={classFilterOpen} onOpenChange={setClassFilterOpen} modal>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="group relative rounded p-1 hover:bg-white/10"
                        aria-label={isClassFilterActive ? "Filter Class (active)" : "Filter Class"}
                        onMouseEnter={(e) =>
                          setHeaderTooltip({
                            text: isClassFilterActive ? "Filter Class (active)" : "Filter Class",
                            el: e.currentTarget,
                          })
                        }
                        onMouseLeave={() => setHeaderTooltip(null)}
                        onFocus={(e) =>
                          setHeaderTooltip({
                            text: isClassFilterActive ? "Filter Class (active)" : "Filter Class",
                            el: e.currentTarget,
                          })
                        }
                        onBlur={() => setHeaderTooltip(null)}
                      >
                        <Filter className={`h-4 w-4 ${isClassFilterActive ? "text-[var(--cta)]" : ""}`} />
                        {isClassFilterActive ? (
                          <span
                            aria-hidden="true"
                            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--cta)] ring-1 ring-white/20"
                          />
                        ) : null}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      sideOffset={4}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                      className="w-[220px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-2 shadow-xl backdrop-blur-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 pb-2 text-xs text-[var(--brand-ink)]">
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => setAllFilters(uniqueClassValues, setClassFilter)}
                        >
                          Select All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => unselectAllFilters(setClassFilter)}
                        >
                          Unselect All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => clearFilters(setClassFilter)}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto text-sm text-[var(--brand-ink)]">
                        {uniqueClassValues.length === 0 && (
                          <div className="px-2 py-1 text-[var(--brand-ink)]/70">No values</div>
                        )}
                        {uniqueClassValues.map((val) => (
                          <label key={val} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white">
                            <input
                              type="checkbox"
                              checked={classFilter.length === 0 ? true : classFilter.includes(val)}
                              onChange={() => toggleFilterValue(val, classFilter, setClassFilter)}
                              className="h-4 w-4 rounded border-gray-300 bg-green-500 text-green-600 accent-green-500"
                            />
                            <span className="truncate">{val}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                  <span>Location</span>
                  <button
                    type="button"
                    onClick={() => toggleSort("location")}
                    className="group relative rounded p-1 hover:bg-white/10"
                    aria-label="Sort Location"
                    onMouseEnter={(e) => setHeaderTooltip({ text: "Sort Location", el: e.currentTarget })}
                    onMouseLeave={() => setHeaderTooltip(null)}
                    onFocus={(e) => setHeaderTooltip({ text: "Sort Location", el: e.currentTarget })}
                    onBlur={() => setHeaderTooltip(null)}
                  >
                    {getSortDirection("location") === "asc" ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : getSortDirection("location") === "desc" ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4" />
                    )}
                  </button>
                  <Popover open={locationFilterOpen} onOpenChange={setLocationFilterOpen} modal>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="group relative rounded p-1 hover:bg-white/10"
                        aria-label={isLocationFilterActive ? "Filter Location (active)" : "Filter Location"}
                        onMouseEnter={(e) =>
                          setHeaderTooltip({
                            text: isLocationFilterActive ? "Filter Location (active)" : "Filter Location",
                            el: e.currentTarget,
                          })
                        }
                        onMouseLeave={() => setHeaderTooltip(null)}
                        onFocus={(e) =>
                          setHeaderTooltip({
                            text: isLocationFilterActive ? "Filter Location (active)" : "Filter Location",
                            el: e.currentTarget,
                          })
                        }
                        onBlur={() => setHeaderTooltip(null)}
                      >
                        <Filter className={`h-4 w-4 ${isLocationFilterActive ? "text-[var(--cta)]" : ""}`} />
                        {isLocationFilterActive ? (
                          <span
                            aria-hidden="true"
                            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--cta)] ring-1 ring-white/20"
                          />
                        ) : null}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      sideOffset={4}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                      className="w-[240px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-2 shadow-xl backdrop-blur-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 pb-2 text-xs text-[var(--brand-ink)]">
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => setAllFilters(uniqueLocationValues, setLocationFilter)}
                        >
                          Select All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => unselectAllFilters(setLocationFilter)}
                        >
                          Unselect All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => clearFilters(setLocationFilter)}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto text-sm text-[var(--brand-ink)]">
                        {uniqueLocationValues.length === 0 && (
                          <div className="px-2 py-1 text-[var(--brand-ink)]/70">No values</div>
                        )}
                        {uniqueLocationValues.map((val) => (
                          <label key={val} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white">
                            <input
                              type="checkbox"
                              checked={locationFilter.length === 0 ? true : locationFilter.includes(val)}
                              onChange={() => toggleFilterValue(val, locationFilter, setLocationFilter)}
                              className="h-4 w-4 rounded border-gray-300 bg-green-500 text-green-600 accent-green-500"
                            />
                            <span className="truncate">{val}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                  <span>Instructor(s)</span>
                  <button
                    type="button"
                    onClick={() => toggleSort("instructor")}
                    className="group relative rounded p-1 hover:bg-white/10"
                    aria-label="Sort Instructor"
                    onMouseEnter={(e) => setHeaderTooltip({ text: "Sort Instructor", el: e.currentTarget })}
                    onMouseLeave={() => setHeaderTooltip(null)}
                    onFocus={(e) => setHeaderTooltip({ text: "Sort Instructor", el: e.currentTarget })}
                    onBlur={() => setHeaderTooltip(null)}
                  >
                    {getSortDirection("instructor") === "asc" ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : getSortDirection("instructor") === "desc" ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4" />
                    )}
                  </button>
                  <Popover open={instructorFilterOpen} onOpenChange={setInstructorFilterOpen} modal>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="group relative rounded p-1 hover:bg-white/10"
                        aria-label={isInstructorFilterActive ? "Filter Instructor (active)" : "Filter Instructor"}
                        onMouseEnter={(e) =>
                          setHeaderTooltip({
                            text: isInstructorFilterActive ? "Filter Instructor (active)" : "Filter Instructor",
                            el: e.currentTarget,
                          })
                        }
                        onMouseLeave={() => setHeaderTooltip(null)}
                        onFocus={(e) =>
                          setHeaderTooltip({
                            text: isInstructorFilterActive ? "Filter Instructor (active)" : "Filter Instructor",
                            el: e.currentTarget,
                          })
                        }
                        onBlur={() => setHeaderTooltip(null)}
                      >
                        <Filter className={`h-4 w-4 ${isInstructorFilterActive ? "text-[var(--cta)]" : ""}`} />
                        {isInstructorFilterActive ? (
                          <span
                            aria-hidden="true"
                            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--cta)] ring-1 ring-white/20"
                          />
                        ) : null}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      sideOffset={4}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                      className="w-[240px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-2 shadow-xl backdrop-blur-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 pb-2 text-xs text-[var(--brand-ink)]">
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => setAllFilters(uniqueInstructorValues, setInstructorFilter)}
                        >
                          Select All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => unselectAllFilters(setInstructorFilter)}
                        >
                          Unselect All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => clearFilters(setInstructorFilter)}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto text-sm text-[var(--brand-ink)]">
                        {uniqueInstructorValues.length === 0 && (
                          <div className="px-2 py-1 text-[var(--brand-ink)]/70">No values</div>
                        )}
                        {uniqueInstructorValues.map((val) => (
                          <label key={val} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white">
                            <input
                              type="checkbox"
                              checked={instructorFilter.length === 0 ? true : instructorFilter.includes(val)}
                              onChange={() => toggleFilterValue(val, instructorFilter, setInstructorFilter)}
                              className="h-4 w-4 rounded border-gray-300 bg-green-500 text-green-600 accent-green-500"
                            />
                            <span className="truncate">{val}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                  Instructor ID(s)
                </div>
              </th>
              <th className="px-3 py-3 text-center font-medium">
                <div className="flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                    HC
                  </div>
                </div>
              </th>
              <th className="px-3 py-3 text-center font-medium w-20">
                <div className="flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-2.5 py-1 text-sm font-semibold text-foreground">
                    Actions
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessionTableRows}
            {sortedSessions.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  {searchTerm ? "No sessions match your search." : "No sessions found for this schedule."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAY_OPTIONS.map((day) => {
          const count = sessions.filter((s) => s.day_of_week === day).length;
          return (
            <div key={day} className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
              <div className="text-xs text-muted-foreground">{day.slice(0,3)}</div>
              <div className="text-lg font-semibold">{count}</div>
            </div>
          );
        })}
      </div>
      </>
      )
      ) : null}

      {/* MEDIUM Conflicts Confirmation Modal */}
      {mediumConfirm && (
        <ModalPortal>
          <div className="fixed inset-0 z-[110] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (saving) return;
                setMediumConfirm(null);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm medium conflicts"
              className="relative z-10 w-full max-w-xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md"
            >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/15">
                  <AlertTriangle className="h-5 w-5 text-yellow-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Proceed with MEDIUM conflicts?</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">
                    These warnings don’t block automatically, but require acknowledgement to continue.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close confirmation"
                disabled={saving}
                onClick={() => setMediumConfirm(null)}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
              <div className="mb-2 text-sm font-semibold text-[var(--brand-ink)]">MEDIUM conflicts</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--brand-ink)]">
                {mediumConfirm.conflicts.slice(0, 10).map((c, i) => (
                  <li key={`${c.type}-${i}`} className="leading-snug">
                    {c.message}
                  </li>
                ))}
              </ul>
              {mediumConfirm.conflicts.length > 10 && (
                <div className="mt-2 text-xs text-[var(--brand-ink)]/70">…and more</div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setMediumConfirm(null)}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const ctx = mediumConfirm;
                  setMediumConfirm(null);
                  if (ctx.kind === "edit") void handleSaveEdit({ skipMediumConfirm: true });
                  else void handleCreateSession({ skipMediumConfirm: true });
                }}
                className="rounded-xl border border-white/10 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Proceed
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Delete Session Confirmation Modal */}
      {deleteConfirmSessionId && (
        <ModalPortal>
          <div className="fixed inset-0 z-[110] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (saving) return;
                closeDeleteConfirm();
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm delete session"
              className="relative z-10 w-full max-w-xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md"
            >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15">
                  <Trash2 className="h-5 w-5 text-red-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Delete this session?</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">This action cannot be undone.</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close delete confirmation"
                disabled={saving}
                onClick={closeDeleteConfirm}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {deleteConfirmError ? (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {deleteConfirmError}
              </div>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-foreground">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-foreground/80">Schedule</div>
                  <div className="mt-0.5 font-semibold">
                    {scheduleName ? scheduleName : "Schedule"}{" "}
                    {deleteConfirmMonthLabel ? `(${deleteConfirmMonthLabel})` : ""}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-foreground/80">Branch</div>
                  <div className="mt-0.5 font-semibold">{branchName || "-"}</div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-foreground/80">Instructor</div>
                  <div className="mt-0.5 font-semibold">{deleteConfirmInstructorLabel}</div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-foreground/80">Time</div>
                  <div className="mt-0.5 font-semibold">
                    {deleteConfirmSession?.start_time
                      ? formatTimeAmPm(deleteConfirmSession.start_time.slice(0, 5))
                      : "-"}{" "}
                    –{" "}
                    {deleteConfirmSession?.end_time
                      ? formatTimeAmPm(deleteConfirmSession.end_time.slice(0, 5))
                      : "-"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-foreground/80">Class</div>
                  <div className="mt-0.5 font-semibold">{deleteConfirmSession?.class?.name || "-"}</div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-foreground/80">Location</div>
                  <div className="mt-0.5 font-semibold">
                    {deleteConfirmSession?.location
                      ? `${deleteConfirmSession.location.code} - ${deleteConfirmSession.location.name}`
                      : "-"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={closeDeleteConfirm}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                aria-label="Confirm delete"
                disabled={saving}
                onClick={() => void handleConfirmDelete()}
                className="flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Instructor availability is managed in Maintenance → Instructors. */}

      {/* Edit Session Modal */}
      {editModalOpen && editModalSessionId && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (saving) return;
                closeEditModal();
              }}
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Edit session"
              className="relative z-10 w-full max-w-2xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md"
              onPointerDown={(e) => {
                if (!shouldStartModalDrag(e.target)) return;
                editModalDrag.handlePointerDown(e);
              }}
              onPointerMove={editModalDrag.handlePointerMove}
              onPointerUp={editModalDrag.handlePointerUp}
              style={{ transform: `translate(${editModalDrag.offset.x}px, ${editModalDrag.offset.y}px)` }}
            >
            <div className="mb-6 flex items-start justify-between">
              <div
                className="flex cursor-grab select-none items-center gap-3 active:cursor-grabbing"
                aria-label="Drag edit session dialog"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/20">
                  <Edit2 className="h-5 w-5 text-orange-400/90" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Edit Session</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">Update this session</p>
                </div>
              </div>
              <button
                onClick={closeEditModal}
                disabled={saving}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white disabled:opacity-50"
                aria-label="Close edit session"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {saveError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {saveError}
              </div>
            )}

            {saveConflicts && saveConflicts.length > 0 && (
              <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-100">
                <div className="mb-2 font-medium">Blocking conflicts:</div>
                <ul className="list-disc space-y-1 pl-4">
                  {saveConflicts.slice(0, 8).map((c, i) => (
                    <li key={`${c.type}-${i}`}>
                      <span className="font-semibold text-red-200">{c.severity}</span> {c.message}
                    </li>
                  ))}
                </ul>
                {saveConflicts.length > 8 && <div className="mt-1 text-yellow-200/70">…and more</div>}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Date</label>
                <input
                  type="date"
                  value={editModalForm.session_date}
                  onChange={(e) => setEditModalForm((f) => ({ ...f, session_date: e.target.value }))}
                  className="ymca-picker w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                />
                <div className="mt-1 text-xs text-[var(--brand-ink)]/70">
                  Day:{" "}
                  <span className="font-semibold">
                    {editModalForm.session_date ? (dayOfWeekFromIsoDateUtc(editModalForm.session_date) ?? "—") : "—"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Start</label>
                  <input
                    type="time"
                    value={editModalForm.start_time}
                    onChange={(e) => setEditModalForm((f) => ({ ...f, start_time: e.target.value }))}
                    className="ymca-picker w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">End</label>
                  <input
                    type="time"
                    value={editModalForm.end_time}
                    onChange={(e) => setEditModalForm((f) => ({ ...f, end_time: e.target.value }))}
                    className="ymca-picker w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Class</label>
                <Popover open={editModalClassDropdownOpen} onOpenChange={setEditModalClassDropdownOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                      aria-expanded={editModalClassDropdownOpen}
                    >
                      <span className="truncate">
                        {classes.find((c) => c.id === editModalForm.class_id)?.name || "Select class"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-[320px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md">
                    <div ref={scrollToSelected} className="max-h-[300px] overflow-y-auto">
                      {classes.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          data-selected={c.id === editModalForm.class_id}
                          onClick={() => {
                            setEditModalForm((f) => ({ ...f, class_id: c.id }));
                            setEditModalClassDropdownOpen(false);
                          }}
                          className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                            c.id === editModalForm.class_id
                              ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                              : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                      {classes.length === 0 && (
                        <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">No classes</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Location</label>
                <Popover open={editModalLocationDropdownOpen} onOpenChange={setEditModalLocationDropdownOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                      aria-expanded={editModalLocationDropdownOpen}
                    >
                      <span className="truncate">
                        {locations.find((l) => l.id === editModalForm.location_id)
                          ? `${locations.find((l) => l.id === editModalForm.location_id)?.code} - ${locations.find((l) => l.id === editModalForm.location_id)?.name}`
                          : "Select location"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-[340px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md">
                    <div ref={scrollToSelected} className="max-h-[300px] overflow-y-auto">
                      {locations.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          data-selected={l.id === editModalForm.location_id}
                          onClick={() => {
                            setEditModalForm((f) => ({ ...f, location_id: l.id }));
                            setEditModalLocationDropdownOpen(false);
                          }}
                          className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                            l.id === editModalForm.location_id
                              ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                              : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                          }`}
                        >
                          {l.code} - {l.name}
                        </button>
                      ))}
                      {locations.length === 0 && (
                        <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">No locations</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="md:col-span-2">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Instructor(s)</label>
                    <Popover open={editModalInstructorDropdownOpen} onOpenChange={setEditModalInstructorDropdownOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                          aria-expanded={editModalInstructorDropdownOpen}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            {editModalForm.instructor_ids.length > 0
                              ? instructors
                                  .filter((i) => editModalForm.instructor_ids.includes(i.id))
                                  .map((i) => i.nickname || i.first_name)
                                  .join(", ")
                              : "Select instructors (optional)"}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} className="w-[340px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md">
                        <div ref={scrollToSelected} className="max-h-[300px] overflow-y-auto">
                          {instructors.map((inst) => (
                            <button
                              key={inst.id}
                              type="button"
                              data-selected={editModalForm.instructor_ids.includes(inst.id)}
                              onClick={() => toggleEditModalInstructor(inst.id)}
                              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                                editModalForm.instructor_ids.includes(inst.id)
                                  ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                                  : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                              }`}
                            >
                              <div
                                className={`flex h-4 w-4 items-center justify-center rounded border ${
                                  editModalForm.instructor_ids.includes(inst.id)
                                    ? "border-[var(--cta-foreground)] bg-[var(--cta-foreground)]/20"
                                    : "border-white/30"
                                }`}
                              >
                                {editModalForm.instructor_ids.includes(inst.id) && <Check className="h-3 w-3" />}
                              </div>
                              {inst.nickname || `${inst.first_name} ${inst.last_name}`.trim()}
                            </button>
                          ))}
                          {instructors.length === 0 && (
                            <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">No instructors</div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Headcount (HC)</label>
                    <input
                      type="number"
                      min="0"
                      value={editModalForm.headcount ?? ""}
                      onChange={(e) =>
                        setEditModalForm((f) => ({
                          ...f,
                          headcount: e.target.value ? parseInt(e.target.value, 10) : null,
                        }))
                      }
                      placeholder="-"
                      className="w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="h-4 w-4 text-[var(--cta)]" />
                Instructor availability
              </div>

              {availabilityLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading availability…
                </div>
              ) : availabilityError ? (
                <div className="text-xs text-red-200">{availabilityError}</div>
              ) : editModalForm.instructor_ids.length === 0 ? (
                <div className="text-xs text-muted-foreground">Select instructors to see availability.</div>
              ) : (
                <div className="space-y-2">
                  {editAvailabilityVm.map((vm) => {
                    const pill =
                      vm.status === "AVAILABLE"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : vm.status === "ANYTIME"
                          ? "border-white/15 bg-white/10 text-foreground/90"
                          : vm.status === "NEEDS_INPUT"
                            ? "border-white/15 bg-white/5 text-foreground/80"
                            : "border-red-500/40 bg-red-500/15 text-red-200";

                    return (
                      <div
                        key={vm.instructor_id}
                        className="rounded-lg border border-white/10 bg-black/10 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {vm.instructor_label}
                            </div>
                            <div className="mt-0.5 text-xs text-foreground/80">{vm.checkLine}</div>
                          </div>
                          <span
                            className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pill}`}
                          >
                            {availabilityStatusLabel(vm.status)}
                          </span>
                        </div>

                        {vm.monthPills.length > 0 ? (
                          <div className="mt-2">
                            <div className="text-xs font-semibold text-foreground/80">
                              {vm.monthLabel ? `Availability for ${vm.monthLabel}` : "Availability"}
                            </div>
                            <div className="mt-2 flex w-full min-w-0 flex-wrap items-center gap-2">
                              {vm.monthPills.map((p) => (
                                <div
                                  key={`${vm.instructor_id}-${p.day}-${p.window}`}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[11px] font-semibold text-foreground whitespace-nowrap"
                                >
                                  <span className="text-muted-foreground">{shortDowLabel(p.day)}</span>
                                  <span>{p.window}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-xs text-foreground">
              <div className="mb-2 font-medium">Current conflicts (this session):</div>
              {(() => {
                const existing = localConflictsBySessionId[editModalSessionId] ?? [];
                const display = editModalCandidateConflicts ?? existing;

                if (display.length === 0) {
                  return <div className="text-muted-foreground">No conflicts for this session.</div>;
                }
                return (
                  <>
                    <ul className="space-y-1">
                      {display.slice(0, 8).map((c, i) => (
                        <li key={`${c.type}-${i}`}>
                          <div className="flex items-start gap-2">
                            {(() => {
                              const Icon =
                                c.severity === "HIGH" ? OctagonAlert : c.severity === "MEDIUM" ? AlertTriangle : CheckCircle2;
                              const color =
                                c.severity === "HIGH"
                                  ? "text-red-300"
                                  : c.severity === "MEDIUM"
                                    ? "text-yellow-300"
                                    : "text-emerald-300";
                              return <Icon aria-hidden="true" className={`mt-[1px] h-4 w-4 flex-shrink-0 ${color}`} />;
                            })()}
                            <div className="min-w-0 leading-snug">
                              <span
                                className={
                                  c.severity === "HIGH"
                                    ? "text-red-300 font-semibold"
                                    : c.severity === "MEDIUM"
                                      ? "text-yellow-300 font-semibold"
                                      : "text-emerald-300 font-semibold"
                                }
                              >
                                {c.severity}
                              </span>{" "}
                              {c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY"
                                ? formatInstructorOutsideAvailabilityMessage(c, editModalSessionId, {
                                    isoDate: editModalForm.session_date || null,
                                    startHHmm: editModalForm.start_time || null,
                                    endHHmm: editModalForm.end_time || null,
                                  })
                                : c.message}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {display.length > 8 && <div className="mt-1 text-muted-foreground">…and more</div>}
                  </>
                );
              })()}
            </div>

            {editModalBlockingConflicts.length > 0 && (
              <div className="mt-2 text-xs text-red-200">
                Fix <span className="font-semibold">HIGH</span> conflicts before saving.
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  aria-label="Delete session from edit modal"
                  disabled={saving}
                  onClick={() => editModalSessionId && openDeleteConfirm(editModalSessionId)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>

                {editModalAvailabilityConflictInstructorId ? (
                  <button
                    type="button"
                    aria-label={`Reschedule related sessions (${editModalRelatedAvailabilityHighSessionIds.length})`}
                    disabled={
                      saving || !scheduleMonth || editModalRelatedAvailabilityHighSessionIds.length < 2
                    }
                    onClick={() => {
                      // Phase I: opens a preview-only modal (implemented in later step).
                      setRescheduleTargetInstructorId(editModalAvailabilityConflictInstructorId);
                      setReschedulePreviewOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    <CalendarClock className="h-4 w-4 text-[var(--cta)]" />
                    Reschedule{" "}
                    <span className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-xs font-semibold text-foreground/90">
                      {editModalRelatedAvailabilityHighSessionIds.length}
                    </span>
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={saving}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  aria-label="Save session"
                  onClick={() => void handleSaveEdit()}
                  disabled={
                    saving ||
                    !editModalForm.session_date ||
                    !editModalForm.start_time ||
                    !editModalForm.end_time ||
                    !editModalForm.class_id ||
                    !editModalForm.location_id ||
                    editModalBlockingConflicts.length > 0
                  }
                  className="flex items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save Session
                </button>
              </div>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Reschedule Preview Modal (Phase I - preview only) */}
      {reschedulePreviewOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[120] flex items-center justify-center">
            <div
              // Keep Edit Session visually normal behind this preview: we avoid an additional backdrop blur here
              // because stacked backdrop-filters can render inconsistently across browsers.
              className="absolute inset-0 bg-black/60"
              onClick={() => {
                if (reschedulePreviewComputing) return;
                closeReschedulePreview();
              }}
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Reschedule preview"
              className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md max-h-[85vh]"
              onPointerDown={(e) => {
                if (!shouldStartModalDrag(e.target)) return;
                reschedulePreviewDrag.handlePointerDown(e);
              }}
              onPointerMove={reschedulePreviewDrag.handlePointerMove}
              onPointerUp={reschedulePreviewDrag.handlePointerUp}
              style={{
                transform: `translate(${reschedulePreviewDrag.offset.x}px, ${reschedulePreviewDrag.offset.y}px)`,
              }}
            >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex cursor-grab select-none items-center gap-3 active:cursor-grabbing">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/20">
                  <CalendarClock className="h-5 w-5 text-[var(--cta)]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Reschedule Preview</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">
                    {editModalAvailabilityConflictInstructorId
                      ? `Related HIGH availability conflicts: ${editModalRelatedAvailabilityHighSessionIds.length}`
                      : "Preview proposed reschedules"}
                  </p>
                  <div className="mt-1 space-y-0.5 text-xs text-[var(--brand-ink)]/70">
                    <div>
                      <span className="font-semibold">Email:</span>{" "}
                      {rescheduleStatusLoading ? (
                        "Loading…"
                      ) : rescheduleStatus?.email?.sent_at ? (
                        `Sent ${new Date(rescheduleStatus.email.sent_at).toLocaleString()}`
                      ) : (
                        "Not yet sent"
                      )}
                    </div>
                    <div>
                      <span className="font-semibold">Instructor response:</span>{" "}
                      {rescheduleStatus?.request?.responded_at
                        ? `Received ${new Date(rescheduleStatus.request.responded_at).toLocaleString()}`
                        : "Not yet received"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/** Disable reschedule email once instructor has responded (avoid sending new tokens/links after a reply). */}
                {/** Note: response timestamp is returned by /api/scheduling/reschedule-feedback/status */}
                {/** and is displayed in the header just above. */}
                <button
                  type="button"
                  aria-label="Email reschedule preview to instructor"
                  disabled={reschedulePreviewComputing || !!rescheduleStatus?.request?.responded_at}
                  title={
                    rescheduleStatus?.request?.responded_at
                      ? "Instructor has already responded. Email is disabled."
                      : undefined
                  }
                  onClick={() => {
                    setRescheduleEmailModalOpen(true);
                    setRescheduleEmailSuccess(false);
                    setRescheduleEmailError(null);
                    setRescheduleAdditionalInstructorEmails("");
                  }}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mail className="h-4 w-4 text-[var(--cta)]" />
                  Email
                </button>
                <button
                  type="button"
                  aria-label="Close reschedule preview"
                  disabled={reschedulePreviewComputing}
                  onClick={closeReschedulePreview}
                  className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {/* Instructor availability summary (context) */}
              {rescheduleAvailabilityVm ? (
                <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Info className="h-4 w-4 text-[var(--cta)]" />
                    Instructor availability
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {rescheduleAvailabilityVm.instructor_label}
                        </div>
                        <div className="mt-0.5 text-xs text-foreground/80">{rescheduleAvailabilityVm.checkLine}</div>
                      </div>
                      {(() => {
                        const pill =
                          rescheduleAvailabilityVm.status === "AVAILABLE"
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                            : rescheduleAvailabilityVm.status === "ANYTIME"
                              ? "border-white/15 bg-white/10 text-foreground/90"
                              : rescheduleAvailabilityVm.status === "NEEDS_INPUT"
                                ? "border-white/15 bg-white/5 text-foreground/80"
                                : "border-red-500/40 bg-red-500/15 text-red-200";
                        return (
                          <span
                            className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pill}`}
                          >
                            {availabilityStatusLabel(rescheduleAvailabilityVm.status)}
                          </span>
                        );
                      })()}
                    </div>

                    {rescheduleAvailabilityVm.monthPills.length > 0 ? (
                      <div className="mt-2">
                        <div className="text-xs font-semibold text-foreground/80">
                          {rescheduleAvailabilityVm.monthLabel
                            ? `Availability for ${rescheduleAvailabilityVm.monthLabel}`
                            : "Availability"}
                        </div>
                        <div className="mt-2 flex w-full min-w-0 flex-wrap items-center gap-2">
                          {rescheduleAvailabilityVm.monthPills.map((p) => (
                            <div
                              key={`${rescheduleAvailabilityVm.instructor_id}-${p.day}-${p.window}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[11px] font-semibold text-foreground whitespace-nowrap"
                            >
                              <span className="text-muted-foreground">{shortDowLabel(p.day)}</span>
                              <span>{p.window}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {reschedulePreviewComputing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Computing reschedule options…
                </div>
              ) : reschedulePreviewError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {reschedulePreviewError}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {instructorSelectedSessionIds.length > 0 ? (
                        <button
                          type="button"
                          aria-label="Select instructor choices"
                          onClick={applyInstructorSelections}
                          className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-black/30"
                        >
                          Use instructor choices
                          <span className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] font-semibold text-foreground/90">
                            {instructorSelectedSessionIds.length}
                          </span>
                        </button>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Selected: {rescheduleSelectedSessionIds.length}/{rescheduleSelectableSessionIds.length}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="text-xs font-semibold text-foreground/80">Current Schedule</div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-foreground/80">Availability to Reschedule</div>
                      <button
                        type="button"
                        aria-label="Select all reschedulable sessions"
                        onClick={toggleRescheduleSelectAll}
                        className="flex items-center gap-2 text-xs font-semibold text-foreground"
                      >
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            rescheduleSelectAllChecked
                              ? "border-[var(--cta-foreground)] bg-[var(--cta-foreground)]/20"
                              : "border-white/30"
                          }`}
                        >
                          {rescheduleSelectAllChecked ? <Check className="h-3 w-3" /> : null}
                        </div>
                        Select all
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(reschedulePreviewResults ?? []).map((row) => {
                      const s = sessions.find((x) => x.id === row.session_id) ?? null;
                      const currentDate = s?.session_date ? formatIsoDateForMessage(s.session_date) : "-";
                      const currentStart = s?.start_time ? formatTimeAmPm(s.start_time.slice(0, 5)) : "-";
                      const currentEnd = s?.end_time ? formatTimeAmPm(s.end_time.slice(0, 5)) : "-";
                      const currentClass = s?.class?.name || "-";
                      const currentLocation = s?.location ? `${s.location.code} - ${s.location.name}` : "-";

                      const proposal =
                        "reason" in row.proposal
                          ? { kind: "reason" as const, reason: row.proposal.reason }
                          : {
                              kind: "proposed" as const,
                              date: formatIsoDateForMessage(row.proposal.date),
                              start: formatTimeAmPm(row.proposal.start_time),
                              end: formatTimeAmPm(row.proposal.end_time),
                            };

                      const selectable = proposal.kind === "proposed";
                      const checked = rescheduleSelectedSet.has(row.session_id);

                      return (
                        <div
                          key={row.session_id}
                          className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-black/10 p-3 md:grid-cols-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground">{currentDate}</div>
                              </div>
                            </div>
                            <div className="mt-0.5 text-xs text-foreground/80">
                              {currentStart} – {currentEnd}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {currentClass} · {currentLocation}
                            </div>
                          </div>

                          <div className="min-w-0">
                            {proposal.kind === "reason" ? (
                              <div className="text-sm text-muted-foreground">{proposal.reason}</div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-foreground">{proposal.date}</div>
                                    <div className="mt-0.5 text-xs text-foreground/80">
                                      {proposal.start} – {proposal.end}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {currentClass} · {currentLocation}
                                    </div>
                                  </div>

                                  <div className="flex flex-shrink-0 items-center gap-2">
                                    {instructorSelectedSet.has(row.session_id) ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/90 bg-orange-400/20 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                                        <Check className="h-3 w-3" />
                                        Instructor selected
                                      </span>
                                    ) : null}

                                    <button
                                      type="button"
                                      aria-label={`Select session ${row.session_id} for reschedule`}
                                      disabled={!selectable}
                                      onClick={() => toggleRescheduleSelected(row.session_id)}
                                      className="flex items-start justify-center pt-1 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <div
                                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                                          checked
                                            ? "border-[var(--cta-foreground)] bg-[var(--cta-foreground)]/20"
                                            : "border-white/30"
                                        }`}
                                      >
                                        {checked ? <Check className="h-3 w-3" /> : null}
                                      </div>
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {(reschedulePreviewResults ?? []).length === 0 ? (
                      <div className="text-sm text-muted-foreground">No related sessions found.</div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {/* Fixed footer actions (always visible) */}
            <div className="mt-4 flex items-center justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={closeReschedulePreview}
                disabled={reschedulePreviewComputing}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>

          {rescheduleEmailModalOpen && (
            <div className="fixed inset-0 z-[130] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => {
                if (rescheduleEmailSending) return;
                setRescheduleEmailModalOpen(false);
                setRescheduleEmailError(null);
                setRescheduleEmailSuccess(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Email reschedule preview"
              className="relative z-10 w-full max-w-xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md"
              onPointerDown={(e) => {
                if (!shouldStartModalDrag(e.target)) return;
                rescheduleEmailDrag.handlePointerDown(e);
              }}
              onPointerMove={rescheduleEmailDrag.handlePointerMove}
              onPointerUp={rescheduleEmailDrag.handlePointerUp}
              style={{
                transform: `translate(${rescheduleEmailDrag.offset.x}px, ${rescheduleEmailDrag.offset.y}px)`,
              }}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/20">
                    <Mail className="h-5 w-5 text-[var(--cta)]" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-[var(--brand-ink)]">
                      Email Instructor: {rescheduleInstructorLabel}
                    </div>
                    <div className="text-sm text-[var(--brand-ink)]/70">
                      Sends instructor an app link to select which reschedules to accept.
                    </div>
                    <div className="text-sm text-[var(--brand-ink)]/70">
                      {rescheduleExpiresLabel ? `(link expires on ${rescheduleExpiresLabel})` : "(link expires in 48 hours)"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close email modal"
                  disabled={rescheduleEmailSending}
                  onClick={() => {
                    setRescheduleEmailModalOpen(false);
                    setRescheduleEmailError(null);
                    setRescheduleEmailSuccess(false);
                  }}
                  className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-foreground">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground/90">Last sent</div>
                    <div>
                      {rescheduleStatus?.email?.sent_at ? new Date(rescheduleStatus.email.sent_at).toLocaleString() : "Not yet sent"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground/90">To Instructor:</div>
                    <div className="break-all">{rescheduleStatus?.instructor_email ?? "don.race@outlook.com"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground sm:col-span-2">
                    <div className="font-semibold text-foreground/90">Topic</div>
                    <div className="break-words">{rescheduleStatus?.email?.subject ?? "Reschedule Feedback Needed"}</div>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold text-foreground/90">
                  Email to (additional instructor email)
                </label>
                <input
                  value={rescheduleAdditionalInstructorEmails}
                  onChange={(e) => setRescheduleAdditionalInstructorEmails(e.target.value)}
                  placeholder="Enter additional instructor email(s), comma-separated"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-card/70 px-3 py-2 text-sm text-foreground ring-1 ring-white/10 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)]"
                />
                <div className="mt-1 text-xs text-muted-foreground">
                  These are additional instructor email addresses (not an alternate). Separate multiple with commas.
                </div>
              </div>

              {rescheduleEmailError ? (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {rescheduleEmailError}
                </div>
              ) : null}
              {rescheduleEmailSuccess ? (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  Email sent.
                </div>
              ) : null}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={rescheduleEmailSending}
                  onClick={() => {
                    setRescheduleEmailModalOpen(false);
                    setRescheduleEmailError(null);
                    setRescheduleEmailSuccess(false);
                  }}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  aria-label="Send reschedule feedback email"
                  disabled={rescheduleEmailSending || reschedulePreviewComputing}
                  onClick={() => void sendRescheduleFeedbackEmail()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {rescheduleEmailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send Email
                </button>
              </div>
            </div>
            </div>
          )}
        </div>
        </ModalPortal>
      )}

      {/* Add Session Slot Helper */}
      {slotHelperOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeSlotHelper} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Add session helper"
              ref={(node) => {
                if (!node) return;
                setAddSessionOpening((prev) => (prev ? false : prev));
              }}
              className="relative z-10 flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md max-h-[85vh]"
              onPointerDown={(e) => {
                if (!shouldStartModalDrag(e.target)) return;
                slotHelperDrag.handlePointerDown(e);
              }}
              onPointerMove={slotHelperDrag.handlePointerMove}
              onPointerUp={slotHelperDrag.handlePointerUp}
              style={{ transform: `translate(${slotHelperDrag.offset.x}px, ${slotHelperDrag.offset.y}px)` }}
            >
              <div className="mb-4 flex items-start justify-between gap-4 cursor-grab select-none active:cursor-grabbing">
                <div className="min-w-0">
                  <div className="mt-0.5 text-lg font-semibold text-[var(--brand-ink)]">Add Session Helper</div>
                  {slotHelperHierarchyLabel.associationName || slotHelperHierarchyLabel.branchName ? (
                    <div className="mt-0.5 text-sm font-normal text-white/85">
                      {slotHelperHierarchyLabel.associationName ?? ""}
                      {slotHelperHierarchyLabel.associationName && slotHelperHierarchyLabel.branchName ? " -> " : ""}
                      {slotHelperHierarchyLabel.branchName ?? ""}
                    </div>
                  ) : null}
                  <div className="mt-1 text-sm text-white/90">
                    {scheduleMonthLabel ? `Schedule: ${scheduleMonthLabel} • ` : ""}
                    Availability Time Range: {slotHelperAvailabilityRangeLabel}
                  </div>
                  {slotHelperReviewRequestId ? (
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-white/80">
                      <div>
                        <span className="font-semibold text-white">Email:</span>{" "}
                        {slotHelperReviewRequestDetailLoading ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
                          </span>
                        ) : slotHelperReviewRequestDetail?.email?.sent_at ? (
                          `Sent ${new Date(slotHelperReviewRequestDetail.email.sent_at).toLocaleString()}`
                        ) : (
                          "Not yet sent"
                        )}
                      </div>
                      <div>
                        <span className="font-semibold text-white">Instructor response:</span>{" "}
                        {slotHelperReviewRequestDetail?.request?.responded_at
                          ? `Received ${new Date(slotHelperReviewRequestDetail.request.responded_at).toLocaleString()}`
                          : "Not yet received"}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Close add session helper"
                  onClick={closeSlotHelper}
                  className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="w-fit">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-semibold text-foreground/90">Transition (instructor)</label>
                    <Popover open={slotHelperTimeHelpOpen === "transition"} onOpenChange={() => {}}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Transition help"
                          onMouseEnter={() => setSlotHelperTimeHelpOpen("transition")}
                          onMouseLeave={() => setSlotHelperTimeHelpOpen(null)}
                          onFocus={() => setSlotHelperTimeHelpOpen("transition")}
                          onBlur={() => setSlotHelperTimeHelpOpen(null)}
                          className="rounded-md p-1 text-[var(--cta)] hover:bg-black/20"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        sideOffset={8}
                        className="pointer-events-none z-[160] w-[300px] rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                      >
                        <PopoverArrow
                          width={12}
                          height={8}
                          className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                        />
                        Instructor scheduled in different locations - time needed to move to next.
                      </PopoverContent>
                    </Popover>
                  </div>
                  <select
                    value={slotHelperTransitionMinutes}
                    onChange={(e) => setSlotHelperTransitionMinutes(Number(e.target.value))}
                    className="mt-2 ymca-select w-full text-sm font-semibold"
                    disabled={slotHelperRefreshing}
                    aria-label="Select transition"
                  >
                    {[0, 5, 10, 15, 20].map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-fit">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-semibold text-foreground/90">Turnover (location)</label>
                    <Popover open={slotHelperTimeHelpOpen === "turnover"} onOpenChange={() => {}}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Turnover help"
                          onMouseEnter={() => setSlotHelperTimeHelpOpen("turnover")}
                          onMouseLeave={() => setSlotHelperTimeHelpOpen(null)}
                          onFocus={() => setSlotHelperTimeHelpOpen("turnover")}
                          onBlur={() => setSlotHelperTimeHelpOpen(null)}
                          className="rounded-md p-1 text-[var(--cta)] hover:bg-black/20"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        sideOffset={8}
                        className="pointer-events-none z-[160] w-[300px] rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                      >
                        <PopoverArrow
                          width={12}
                          height={8}
                          className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                        />
                        Location scheduled back-to-back for different class types time needed to reset the room.
                      </PopoverContent>
                    </Popover>
                  </div>
                  <select
                    value={slotHelperTurnoverMinutes}
                    onChange={(e) => setSlotHelperTurnoverMinutes(Number(e.target.value))}
                    className="mt-2 ymca-select w-full text-sm font-semibold"
                    disabled={slotHelperRefreshing}
                    aria-label="Select turnover"
                  >
                    {[0, 5, 10, 15, 20].map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex w-fit min-w-[240px] flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-semibold text-foreground/90">Email Requests Sent</label>
                    {slotHelperReviewRequestsLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <PopoverSelect
                      value={slotHelperReviewRequestId}
                      options={slotHelperReviewRequestOptions}
                      onChange={setSlotHelperReviewRequestId}
                      ariaLabel="Select slot helper request"
                      disabled={slotHelperReviewRequestsLoading || slotHelperReviewRequestOptions.length === 0}
                      className="w-full"
                      contentClassName="z-[140] w-[300px]"
                      sideOffset={2}
                      placeholder="Review emails sent..."
                      renderValue={(selected) => {
                        if (!selected || !slotHelperSelectedRequestSummary) {
                          return <span className="truncate font-semibold text-foreground">Review emails sent...</span>;
                        }
                        return (
                          <span className="truncate font-semibold text-foreground">
                            {slotHelperSelectedRequestSummary.label}
                          </span>
                        );
                      }}
                      renderOption={(opt, isSelected) => {
                        const detailLine = (opt as { detailLine?: string }).detailLine ?? "";
                        const statusTimestampLabel = (opt as { statusTimestampLabel?: string }).statusTimestampLabel ?? "";
                        const statusLine = statusTimestampLabel ? `${opt.label} ${statusTimestampLabel}` : opt.label;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div
                              className={`text-sm font-semibold ${
                                isSelected ? "!text-[var(--cta-foreground)]" : "text-foreground"
                              }`}
                            >
                              {statusLine}
                            </div>
                            <div
                              className={`whitespace-normal text-xs font-semibold ${
                                isSelected ? "!text-[var(--cta-foreground)]" : "text-muted-foreground"
                              }`}
                            >
                              {detailLine}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Reset email request selection"
                      disabled={!slotHelperReviewRequestId}
                      onClick={() => {
                        // Reset to initial helper state.
                        setSlotHelperReviewRequestId(null);
                        setSlotHelperReviewRequestDetail(null);
                        setSlotHelperReviewRequestActionError(null);
                        slotHelperLastPrefilledRequestIdRef.current = null;
                        setSlotHelperSelectedSlotKeys([]);
                        setSlotHelperSelectedClassId(null);
                        setSlotHelperSelectedLocationId(null);
                        setSlotHelperSelectedInstructorIds([]);
                        setSlotHelperDurationMinutes(null);
                        setSlotHelperTransitionMinutes(0);
                        setSlotHelperTurnoverMinutes(0);
                        setSlotHelperApplied(null);
                        setSlotHelperRefreshing(false);
                        setSlotHelperClassDropdownOpen(false);
                        setSlotHelperLocationDropdownOpen(false);
                        setSlotHelperInstructorDropdownOpen(false);
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-card/70 p-2 text-[var(--cta)] shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex w-fit flex-col justify-center">
                  <label className="block text-xs font-semibold text-foreground/90">Select Weekday(s)</label>
                  <div className="mt-2 flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1 text-xs">
                    <button
                      type="button"
                      disabled={slotHelperRefreshing}
                      onClick={() =>
                        setSlotHelperSelectedDays((prev) =>
                          prev.length === SLOT_HELPER_DAY_PILLS.length ? [] : SLOT_HELPER_DAY_PILLS.map((x) => x.value),
                        )
                      }
                      aria-pressed={slotHelperAllDaysSelected}
                      className={`btn-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                        slotHelperAllDaysSelected
                          ? "border-white bg-[var(--cta)] text-[var(--cta-foreground)]"
                          : "border-white bg-card/40 text-foreground/90 hover:bg-card/60"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      All
                    </button>

                    {SLOT_HELPER_DAY_PILLS.map((d) => {
                      const selected = slotHelperSelectedDays.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          disabled={slotHelperRefreshing}
                          onClick={() =>
                            setSlotHelperSelectedDays((prev) => {
                              const has = prev.includes(d.value);
                              const next = has ? prev.filter((x) => x !== d.value) : [...prev, d.value];
                              // Keep stable display order: SAT..FRI
                              const order = new Map(SLOT_HELPER_DAY_PILLS.map((x, idx) => [x.value, idx] as const));
                              return next.slice().sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
                            })
                          }
                          aria-pressed={selected}
                          className={`btn-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                            selected
                              ? "border-white bg-[var(--cta)] text-[var(--cta-foreground)]"
                              : "border-white bg-card/40 text-foreground/90 hover:bg-card/60"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {slotHelperMappingError ? (
                <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  Failed to load class/instructor/location mapping: {slotHelperMappingError}
                </div>
              ) : null}

              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row">
                {/* Selection (left) */}
                <div
                  ref={slotHelperSelectionScrollRef}
                  className="report-scroll min-h-0 w-full overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-3 md:w-[360px]"
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                    <span>Selection</span>
                    {!slotHelperBottomRefreshVisible &&
                    slotHelperRefreshNeeded &&
                    !slotHelperRefreshing &&
                    !slotHelperUsingRequestHolds ? (
                      <button
                        type="button"
                        onClick={() => void handleSlotHelperRefresh()}
                        className="rounded-lg border border-[var(--cta)] bg-[var(--cta)] px-2.5 py-1 text-xs font-semibold text-[var(--cta-foreground)] transition hover:brightness-95"
                      >
                        Refresh
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {slotHelperSelectedSlotCount > 0 ? (
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-sm text-foreground">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSlotHelperSelectedSlotsExpanded((prev) => !prev)}
                            className="flex items-center gap-2 text-left text-xs font-semibold text-muted-foreground"
                            aria-expanded={slotHelperSelectedSlotsExpanded}
                          >
                            <span>Selected time slots</span>
                            <ChevronDown
                              className={`h-4 w-4 text-muted-foreground transition ${
                                slotHelperSelectedSlotsExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Selected: {slotHelperSelectedSlotCount > 0 ? slotHelperSelectedSlotCount : "(none)"}
                            </span>
                            <Popover modal open={slotHelperClearSelectedOpen} onOpenChange={setSlotHelperClearSelectedOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  disabled={slotHelperSelectedSlotCount === 0}
                                  className="rounded-lg border border-white/15 bg-card/70 px-2 py-1 text-xs font-semibold text-[var(--cta)] shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Clear
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="end"
                                sideOffset={6}
                                className="z-[150] w-[260px] rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-3 shadow-xl backdrop-blur-md"
                              >
                                <div className="text-sm font-semibold text-foreground">Clear selected time slots?</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  This will release the selected slots back to available.
                                </div>
                                <div className="mt-3 flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setSlotHelperClearSelectedOpen(false)}
                                    className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-black/30"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSlotHelperSelectedSlotKeys([]);
                                      setSlotHelperClearSelectedOpen(false);
                                    }}
                                    className="rounded-lg border border-[var(--cta)] bg-[var(--cta)] px-2.5 py-1.5 text-xs font-semibold text-[var(--cta-foreground)] transition hover:brightness-95"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        {slotHelperSelectedSlotsExpanded ? (
                          <div className="mt-1 space-y-1 font-semibold">
                            {slotHelperSelectedSlotRows.map((row) => (
                              <div key={row.key} className="grid grid-cols-[140px_1fr] gap-2">
                                <span className="truncate">
                                  {row.dayLabel ? `${row.dayLabel} ` : ""}
                                  {row.dateLabel}
                                </span>
                                <span className="truncate">{row.timeLabel}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Select Class → duration → instructors → location, then pick one or more time slots.
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-foreground/90">Class</label>
                      <Popover modal open={slotHelperClassDropdownOpen} onOpenChange={setSlotHelperClassDropdownOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="Select Class"
                            disabled={slotHelperRefreshing || slotHelperMappingLoading || slotHelperClassOptions.length === 0}
                            className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/70 px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-expanded={slotHelperClassDropdownOpen}
                          >
                            <span className="truncate">
                              {slotHelperSelectedClassId
                                ? (slotHelperClassOptions.find((x) => x.id === slotHelperSelectedClassId)?.label ??
                                  slotHelperSelectedClassId)
                                : slotHelperMappingLoading
                                  ? "Loading classes..."
                                  : slotHelperClassOptions.length === 0
                                    ? "No classes available"
                                    : "Select Class..."}
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          sideOffset={4}
                          className="z-[140] w-[320px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
                        >
                          <div ref={scrollToSelected} className="max-h-[280px] overflow-y-auto">
                            {slotHelperMappingLoading ? (
                              <div className="px-3 py-2 text-sm font-semibold text-muted-foreground">
                                Loading classes...
                              </div>
                            ) : slotHelperClassOptions.length === 0 ? (
                              <div className="px-3 py-2 text-sm font-semibold text-muted-foreground">
                                No classes available
                              </div>
                            ) : (
                              slotHelperClassOptions.map((c) => {
                                const selected = c.id === slotHelperSelectedClassId;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    data-selected={selected ? "true" : undefined}
                                    onClick={() => {
                                      setSlotHelperSelectedClassId(c.id);
                                      setSlotHelperClassDropdownOpen(false);
                                    }}
                                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                                      selected
                                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                                        : "text-foreground hover:bg-[var(--brand-strong)]/50"
                                    }`}
                                  >
                                    {c.label}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-foreground/90">Duration</label>
                      {!slotHelperSelectedClassId ? (
                        <button
                          type="button"
                          disabled
                          aria-label="Select duration"
                          className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/70 px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="truncate">Select Class first...</span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ) : slotHelperDurationOptions.length === 0 ? (
                        <button
                          type="button"
                          disabled
                          aria-label="Select duration"
                          className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/70 px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="truncate">No durations available</span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ) : slotHelperDurationOptions.length === 1 ? (
                        <button
                          type="button"
                          disabled
                          aria-label="Select duration"
                          className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/70 px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="truncate">{slotHelperDurationOptions[0]} minutes</span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ) : (
                        <PopoverSelect
                          value={slotHelperDurationMinutes === null ? null : String(slotHelperDurationMinutes)}
                          options={slotHelperDurationOptions.map((m) => ({
                            value: String(m),
                            label: `${m} minutes`,
                          }))}
                          onChange={(nextValue) => {
                            const v = String(nextValue ?? "").trim();
                            setSlotHelperDurationMinutes(v ? Number(v) : null);
                          }}
                          ariaLabel="Select duration"
                          disabled={slotHelperRefreshing}
                          className={
                            slotHelperSelectedClassId && slotHelperDurationMinutes === null
                              ? "mt-2 ymca-select w-full text-sm font-semibold"
                              : "mt-2 w-full"
                          }
                          contentClassName="z-[140] w-[220px]"
                          placeholder="Select a duration..."
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-foreground/90">Instructors</label>
                      <Popover
                        modal
                        open={slotHelperInstructorDropdownOpen}
                        onOpenChange={setSlotHelperInstructorDropdownOpen}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={
                              slotHelperRefreshing ||
                              !slotHelperSelectedClassId ||
                              slotHelperInstructorOptions.length === 0 ||
                              slotHelperInstructorOptions.length === 1
                            }
                          className={
                            slotHelperSelectedClassId && slotHelperSelectedInstructorIds.length === 0
                              ? "mt-2 ymca-select flex w-full items-center justify-between gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                              : "mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/70 px-3 py-2 text-sm shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                          }
                            aria-expanded={slotHelperInstructorDropdownOpen}
                          >
                            <span
                              className={`truncate ${
                                slotHelperSelectedClassId &&
                                slotHelperDurationMinutes !== null &&
                                slotHelperSelectedInstructorIds.length === 0
                                  ? "text-white"
                                  : ""
                              }`}
                            >
                              {slotHelperSelectedInstructorIds.length > 0
                                ? slotHelperSelectedInstructorDisplay
                                : slotHelperSelectedClassId
                                  ? "Select instructor(s)..."
                                  : "Select Class first..."}
                            </span>
                          <ChevronDown
                            className={
                              slotHelperSelectedClassId && slotHelperSelectedInstructorIds.length === 0
                                ? "h-4 w-4 text-[var(--brand-ink)]/70"
                                : "h-4 w-4 text-muted-foreground"
                            }
                          />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          sideOffset={4}
                          className="z-[140] w-[320px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-2 shadow-xl backdrop-blur-md"
                        >
                          <div ref={scrollToSelected} className="max-h-[280px] overflow-y-auto">
                            {slotHelperInstructorOptions.map((inst) => {
                              const checked = slotHelperSelectedInstructorIds.includes(inst.id);
                              return (
                                <button
                                  key={inst.id}
                                  type="button"
                                  data-selected={checked ? "true" : undefined}
                                  onClick={() => {
                                    if (!slotHelperInstructorMultiSelect) {
                                      setSlotHelperSelectedInstructorIds([inst.id]);
                                      setSlotHelperInstructorDropdownOpen(false);
                                      return;
                                    }
                                    setSlotHelperSelectedInstructorIds((prev) => {
                                      const has = prev.includes(inst.id);
                                      return has ? prev.filter((x) => x !== inst.id) : [...prev, inst.id];
                                    });
                                  }}
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                                    checked
                                      ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                                      : "text-foreground hover:bg-[var(--brand-strong)]/50"
                                  }`}
                                >
                                  <span className="truncate">{inst.label}</span>
                                  <span className="flex h-4 w-4 items-center justify-center rounded border border-white/30 bg-black/10">
                                    {checked ? <Check className="h-3 w-3" /> : null}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                              <input
                                type="checkbox"
                                checked={slotHelperInstructorMultiSelect}
                                onChange={(e) => {
                                  const next = e.target.checked;
                                  setSlotHelperInstructorMultiSelect(next);
                                  if (!next && slotHelperSelectedInstructorIds.length > 1) {
                                    setSlotHelperSelectedInstructorIds((prev) => prev.slice(0, 1));
                                  }
                                }}
                                className="h-4 w-4 cursor-pointer accent-[var(--cta)]"
                              />
                              Multiselect
                            </label>
                            <button
                              type="button"
                              disabled={!slotHelperInstructorMultiSelect}
                              onClick={() => setSlotHelperInstructorDropdownOpen(false)}
                              className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Done
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-foreground/90">Location</label>
                      <Popover modal open={slotHelperLocationDropdownOpen} onOpenChange={setSlotHelperLocationDropdownOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={
                              slotHelperRefreshing ||
                              !slotHelperSelectedClassId ||
                              slotHelperLocationOptions.length === 0 ||
                              slotHelperLocationOptions.length === 1
                            }
                            className={
                              slotHelperSelectedClassId && !slotHelperSelectedLocationId
                                ? "mt-2 ymca-select flex w-full items-center justify-between gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                : "mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/70 px-3 py-2 text-sm shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                            }
                            aria-expanded={slotHelperLocationDropdownOpen}
                          >
                            <span
                              className={`truncate ${
                                slotHelperSelectedClassId &&
                                slotHelperSelectedInstructorIds.length > 0 &&
                                !slotHelperSelectedLocationId
                                  ? "text-white"
                                  : ""
                              }`}
                            >
                              {slotHelperSelectedLocationId
                                ? (slotHelperLocationOptions.find((l) => l.id === slotHelperSelectedLocationId)?.label ??
                                  slotHelperSelectedLocationId)
                                : slotHelperSelectedClassId
                                  ? "Select location..."
                                  : "Select Class first..."}
                            </span>
                            <ChevronDown
                              className={
                                slotHelperSelectedClassId && !slotHelperSelectedLocationId
                                  ? "h-4 w-4 text-[var(--brand-ink)]/70"
                                  : "h-4 w-4 text-muted-foreground"
                              }
                            />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          sideOffset={4}
                          className="z-[140] w-[320px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
                        >
                          <div ref={scrollToSelected} className="max-h-[280px] overflow-y-auto">
                            {slotHelperLocationOptions.map((loc) => {
                              const isSelected = loc.id === slotHelperSelectedLocationId;
                              return (
                                <button
                                  key={loc.id}
                                  type="button"
                                  data-selected={isSelected ? "true" : undefined}
                                  onClick={() => {
                                    setSlotHelperSelectedLocationId(loc.id);
                                    setSlotHelperLocationDropdownOpen(false);
                                    setSlotHelperSelectedSlotKeys([]);
                                  }}
                                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                                    isSelected
                                      ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                                      : "text-foreground hover:bg-[var(--brand-strong)]/50"
                                  }`}
                                >
                                  {loc.label}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="pt-3">
                      <button
                        ref={slotHelperBottomRefreshRef}
                        type="button"
                        onClick={() => void handleSlotHelperRefresh()}
                        disabled={!slotHelperRefreshNeeded || slotHelperRefreshing || slotHelperUsingRequestHolds}
                        aria-label="Refresh available time slots"
                        className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50 ${
                          slotHelperRefreshNeeded && !slotHelperRefreshing && !slotHelperUsingRequestHolds
                            ? "border border-[var(--cta)] bg-[var(--cta)] text-[var(--cta-foreground)] hover:brightness-95"
                            : "border border-white/10 bg-black/20 text-foreground hover:bg-black/30"
                        }`}
                      >
                        {slotHelperRefreshing && slotHelperRefreshNeeded ? "Searching..." : "Refresh"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Slots (right) */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                  <div className="border-b border-white/10 bg-black/20 px-4 pb-3 pt-4">
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Available time slots</div>
                        <Popover open={slotHelperRulesTooltipOpen} onOpenChange={() => {}}>
                          <PopoverTrigger asChild>
                            <span
                              onMouseEnter={() => setSlotHelperRulesTooltipOpen(true)}
                              onMouseLeave={() => setSlotHelperRulesTooltipOpen(false)}
                              onFocus={() => setSlotHelperRulesTooltipOpen(true)}
                              onBlur={() => setSlotHelperRulesTooltipOpen(false)}
                              className="inline-flex"
                            >
                              <Popover modal open={slotHelperRulesPopoverOpen} onOpenChange={setSlotHelperRulesPopoverOpen}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="Click for rules determining available time slots"
                                    className="rounded-md p-1 text-[var(--cta)] hover:bg-black/20"
                                    onClick={() => {
                                      setSlotHelperRulesPopoverOpen(true);
                                      setSlotHelperRulesTooltipOpen(false);
                                    }}
                                  >
                                    <Info className="h-4 w-4" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="start"
                                  sideOffset={8}
                                  className="z-[160] w-[360px] rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-4 shadow-xl backdrop-blur-md"
                                >
                                  <div className="text-center text-sm font-semibold text-foreground">
                                    Rules Defining Time Slot Availability
                                  </div>
                                  <div className="mt-3 space-y-3 text-xs text-foreground/90">
                                    <div>
                                      <div className="text-xs font-semibold text-foreground">Availability Rules</div>
                                      <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                                        <li>Within the schedule month and the branch availability time range.</li>
                                        <li>Instructor availability windows must cover the entire slot.</li>
                                        <li>Excluded if the branch is closed for a holiday.</li>
                                        <li>Excluded if it overlaps existing sessions or active slot holds.</li>
                                        <li>Transition and turnover minutes expand busy time around slots.</li>
                                        <li>Time slot that has been reserved for a new class (expires in 48 hours if no instructor confirmation).</li>
                                      </ul>
                                    </div>
                                    <div>
                                      <div className="text-xs font-semibold text-foreground">Conflict Rules</div>
                                      <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                                        <li>No instructor or location double-booking (overlaps are blocked).</li>
                                        <li>Must respect minimum instructor transition time between locations.</li>
                                        <li>Must respect minimum location turnover time between different classes.</li>
                                        <li>Instructor defined daily max hours are enforced.</li>
                                        <li>Invalid times, day mismatches, or outside-month sessions are blocked.</li>
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="mt-4 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setSlotHelperRulesPopoverOpen(false)}
                                      className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-black/30"
                                    >
                                      OK
                                    </button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </span>
                          </PopoverTrigger>
                          <PopoverContent
                            align="center"
                            side="top"
                            sideOffset={6}
                            className="pointer-events-none z-[160] w-auto whitespace-nowrap rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                          >
                            Click for rules determining available time slots
                          </PopoverContent>
                        </Popover>

                        <Popover modal open={slotHelperDateFilterOpen} onOpenChange={setSlotHelperDateFilterOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="Filter available time slots by date"
                              disabled={slotHelperDateFilterDisabled}
                              className="inline-flex w-[191px] max-w-full items-center gap-2 rounded-lg border border-[var(--cta)] bg-[var(--cta)] px-3 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span className="truncate">{slotHelperSelectedDateSummary}</span>
                              <ChevronDown className="h-4 w-4 text-[var(--cta-foreground)]" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            sideOffset={6}
                            className="z-[200] w-[200px] rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-2 shadow-xl backdrop-blur-md"
                          >
                            <div className="max-h-[240px] space-y-1 overflow-y-auto p-1">
                              {slotHelperDateOptionsWithAll.map((opt) => {
                                const isSelected =
                                  opt.value === SLOT_HELPER_ALL_DATES
                                    ? slotHelperAllDatesSelected
                                    : slotHelperSelectedDates.includes(opt.value);
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleSlotHelperDateFilter(opt.value)}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                                      isSelected
                                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                                        : "text-foreground hover:bg-[var(--brand-strong)]/50"
                                    }`}
                                    aria-pressed={isSelected}
                                  >
                                    <span className="truncate">{opt.label}</span>
                                    <span className="flex h-4 w-4 items-center justify-center rounded border border-white/30 bg-black/10">
                                      {isSelected ? <Check className="h-3 w-3" /> : null}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-2 flex items-center justify-end border-t border-white/10 pt-2">
                              <button
                                type="button"
                                onClick={() => setSlotHelperDateFilterOpen(false)}
                                className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-black/30"
                              >
                                Done
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>

                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-card/70 px-2.5 py-2 text-xs font-semibold text-foreground shadow-sm ring-1 ring-white/10">
                          <input
                            type="checkbox"
                            checked={slotHelperAutoLocateEnabled}
                            onChange={(e) => {
                              if (!requireApproved("use Auto Locate")) return;
                              setSlotHelperAutoLocateEnabled(e.target.checked);
                            }}
                            aria-label="Auto Locate"
                            className="h-4 w-4 cursor-pointer accent-[var(--cta)]"
                          />
                          <span>Auto Locate</span>
                        </label>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground/90">
                        <span>
                          Total time checked: <span className="font-mono">{slotHelperTotalCheckedLabel ?? "—"}</span>
                        </span>
                        <Popover open={slotHelperTotalTooltipOpen} onOpenChange={() => {}}>
                          <PopoverTrigger asChild>
                            <span
                              onMouseEnter={() => setSlotHelperTotalTooltipOpen(true)}
                              onMouseLeave={() => setSlotHelperTotalTooltipOpen(false)}
                              onFocus={() => setSlotHelperTotalTooltipOpen(true)}
                              onBlur={() => setSlotHelperTotalTooltipOpen(false)}
                              className="inline-flex"
                            >
                              <button
                                type="button"
                                aria-label="Transition/Turnover help"
                                className="rounded-md p-1 text-[var(--cta)] hover:bg-black/20"
                                onClick={(e) => e.preventDefault()}
                              >
                                <Info className="h-4 w-4" />
                              </button>
                            </span>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            side="top"
                            sideOffset={6}
                            className="pointer-events-none z-[160] w-[360px] rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                          >
                            Transition/Turnover widens busy time for conflict checks; the session end time remains the selected duration.
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          aria-label="Expand all date sections"
                          disabled={slotHelperDateOptions.length === 0 || slotHelperAllExpanded}
                          onClick={() => {
                            setSlotHelperCollapsedDates((prev) => {
                              const next: Record<string, boolean> = {};
                              for (const opt of slotHelperDateOptions) next[opt.value] = false;
                              return next;
                            });
                            if (process.env.NODE_ENV !== "test") {
                              requestAnimationFrame(() => {
                                slotHelperSlotsVirtualizer.measure();
                              });
                            }
                          }}
                          className="rounded-lg border border-white/15 bg-card/70 px-2.5 py-2 text-xs font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Expand all
                        </button>
                        <button
                          type="button"
                          aria-label="Collapse all date sections"
                          disabled={slotHelperDateOptions.length === 0 || slotHelperAllCollapsed}
                          onClick={() => {
                            setSlotHelperCollapsedDates((prev) => {
                              const next: Record<string, boolean> = {};
                              for (const opt of slotHelperDateOptions) next[opt.value] = true;
                              return next;
                            });
                            if (process.env.NODE_ENV !== "test") {
                              requestAnimationFrame(() => {
                                slotHelperSlotsVirtualizer.measure();
                              });
                            }
                          }}
                          className="rounded-lg border border-white/15 bg-card/70 px-2.5 py-2 text-xs font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Collapse all
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    ref={slotHelperSlotsScrollRef}
                    className="report-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4"
                  >
                  {slotHelperRefreshing && !slotHelperUsingRequestHolds ? (
                    <div className="flex min-h-[220px] items-center justify-center text-sm font-semibold text-muted-foreground">
                      Searching...
                    </div>
                  ) : slotHelperShowRefreshPrompt ? (
                    <div className="flex min-h-[220px] items-center justify-center text-sm font-semibold text-muted-foreground">
                      Select Refresh for Available Time Slots
                    </div>
                  ) : slotHelperShowSelectionPrompt ? null : slotHelperDisplayResults.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      {slotHelperUsingRequestHolds
                        ? "No available slots found for this email request."
                        : "No available slots found for these settings. Adjust the selections and try again."}
                    </div>
                  ) : slotHelperFilteredResults.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No available slots for the selected date filter.</div>
                  ) : (
                    <div
                      className="relative"
                      style={{ height: `${slotHelperSlotsVirtualizerTotalSize}px` }}
                    >
                      {slotHelperSlotsVirtualizerItems.map((virtualRow) => {
                        const day = slotHelperFilteredResults[virtualRow.index];
                        if (!day) return null;
                        const daySelectedSlots = day.slots.filter((s) =>
                          slotHelperSelectedSlotKeySet.has(`${s.date}|${s.start_time}|${s.end_time}`),
                        );
                        const selectedCount = daySelectedSlots.length;
                        const collapsed = slotHelperCollapsedDates[day.date] ?? false;
                        return (
                          <div
                            key={day.date}
                            ref={slotHelperSlotsVirtualizer.measureElement}
                            data-index={virtualRow.index}
                            data-day-date={day.date}
                            className="absolute left-0 right-0 pb-[5px]"
                            style={{ transform: `translateY(${virtualRow.start}px)` }}
                          >
                            <div
                              className={`rounded-xl border border-white/10 p-3 ${
                                collapsed ? "h-[80px] bg-black/10" : "bg-black/20"
                              }`}
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex min-w-0 flex-1 items-center gap-3 text-sm font-semibold text-foreground">
                                  <span className="inline-block w-[130px]">
                                    {day.day_of_week.slice(0, 3)} {formatIsoDateMMDDYYYY(day.date)}
                                  </span>
                                  {collapsed && daySelectedSlots.length > 0 ? (
                                    <div className="max-h-[48px] flex-1 overflow-y-auto ymca-scrollbar">
                                      <div className="flex flex-wrap gap-2">
                                        {daySelectedSlots.map((s) => (
                                          <span
                                            key={`${s.date}|${s.start_time}|${s.end_time}`}
                                            className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs font-semibold text-foreground"
                                          >
                                            {formatTimeAmPm(s.start_time)}–{formatTimeAmPm(s.end_time)}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{`Selected: ${selectedCount} of ${day.slots.length}`}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSlotHelperCollapsedDates((prev) => ({
                                        ...prev,
                                        [day.date]: !collapsed,
                                      }))
                                    }
                                    className="rounded-md border border-white/10 bg-black/10 px-2 py-1 text-[10px] font-semibold text-foreground transition hover:bg-black/20"
                                  >
                                    {collapsed ? "Expand" : "Collapse"}
                                  </button>
                                </div>
                              </div>
                              {!collapsed ? (
                                <>
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" onClick={onSlotHelperSlotGridClick}>
                                    {(() => {
                                      const list = day.slots.slice(0, 60);
                                      const nodes = list.map((s) => {
                                        const key = `${s.date}|${s.start_time}|${s.end_time}`;
                                        const checked = slotHelperSelectedSlotKeySet.has(key);
                                        const ranges = slotHelperSelectedRangesByDate.get(s.date) ?? [];
                                        let hasOverlap = false;
                                        if (!checked && ranges.length > 0) {
                                          const slotStart = parseHHmmToMinutes(s.start_time);
                                          const slotEnd = parseHHmmToMinutes(s.end_time);
                                          hasOverlap =
                                            slotStart !== null &&
                                            slotEnd !== null &&
                                            ranges.some((r) => slotStart < r.end && slotEnd > r.start);
                                        }
                                        const respondedSelected =
                                          slotHelperReviewRequestDetail?.request?.response_selected_hold_ids?.length &&
                                          slotHelperSelectedSlotKeys.length > 0 &&
                                          checked;
                                        const checkboxLabel = `${formatTimeAmPm(s.start_time)}–${formatTimeAmPm(s.end_time)}`;
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            data-slot-key={key}
                                            disabled={hasOverlap}
                                            className={`rounded-xl border px-3 py-2 text-left transition ${
                                              hasOverlap
                                                ? "border-white/10 bg-black/10 opacity-60"
                                                : checked
                                                  ? "border-[var(--brand-strong)] bg-[var(--brand-strong)]/20"
                                                  : "border-white/10 bg-black/10 hover:bg-black/20"
                                            } relative pr-9 ${
                                              checked
                                                ? "after:absolute after:right-3 after:top-3 after:flex after:h-4 after:w-4 after:items-center after:justify-center after:rounded after:border after:border-[var(--cta)] after:bg-[var(--cta)] after:text-[var(--cta-foreground)] after:text-[11px] after:font-extrabold after:content-['✓']"
                                                : "after:absolute after:right-3 after:top-3 after:block after:h-4 after:w-4 after:rounded after:border after:border-white/30 after:bg-black/10 after:content-['']"
                                            }`}
                                            aria-pressed={checked}
                                          >
                                            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                                              <span>{checkboxLabel}</span>
                                              {respondedSelected ? (
                                                <span className="rounded-full bg-[var(--cta)] px-2 py-0.5 text-[10px] font-bold text-[var(--cta-foreground)]">
                                                  Responded
                                                </span>
                                              ) : null}
                                            </div>
                                          </button>
                                        );
                                      });
                                      return nodes;
                                    })()}
                                  </div>
                                  {day.slots.length > 60 ? (
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      Showing first 60 slots for this day.
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={closeSlotHelper}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={slotHelperSelectedSlotKeys.length === 0}
                  onClick={() => {
                    if (slotHelperSelectedSlotKeys.length === 0) return;
                    setSlotHelperReviewOpen(true);
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    slotHelperSelectedSlotKeys.length > 0
                      ? "border border-[var(--cta)] bg-[var(--cta)] text-[var(--cta-foreground)] hover:brightness-95"
                      : "border border-white/10 bg-black/20 text-foreground hover:bg-black/30"
                  }`}
                >
                  Review
                </button>
                <button
                  type="button"
                  disabled={
                    slotHelperRefreshing ||
                    slotHelperRefreshNeeded ||
                    !slotHelperSelectedClassId ||
                    !slotHelperSelectedSlot ||
                    !slotHelperSelectedLocationId ||
                    slotHelperSelectedInstructorIds.length === 0 ||
                    slotHelperDurationOptions.length === 0 ||
                    slotHelperSelectedSlotKeys.length !== 1 ||
                    (slotHelperSelectedSlot
                      ? !slotHelperSelectedSlot.availableLocationIds.includes(slotHelperSelectedLocationId) ||
                        slotHelperSelectedInstructorIds.some(
                          (id) => !slotHelperSelectedSlot.availableInstructorIds.includes(id),
                        )
                      : false)
                  }
                  onClick={() => {
                    if (!slotHelperSelectedClassId) return;
                    if (!slotHelperSelectedSlot) return;
                    if (!slotHelperSelectedLocationId) return;
                    if (slotHelperSelectedInstructorIds.length === 0) return;
                    if (slotHelperDurationOptions.length === 0) return;
                    if (slotHelperSelectedSlotKeys.length !== 1) return;

                    const validLocation = slotHelperSelectedSlot.availableLocationIds.includes(slotHelperSelectedLocationId);
                    const validInstructors = slotHelperSelectedInstructorIds.every((id) =>
                      slotHelperSelectedSlot.availableInstructorIds.includes(id),
                    );
                    if (!validLocation || !validInstructors) return;

                    closeSlotHelper();
                    openAddSessionDirect({
                      session_date: slotHelperSelectedSlot.date,
                      start_time: slotHelperSelectedSlot.start_time,
                      end_time: slotHelperSelectedSlot.end_time,
                      location_id: slotHelperSelectedLocationId,
                      instructor_ids: slotHelperSelectedInstructorIds,
                      class_id: slotHelperSelectedClassId,
                    });
                  }}
                  className="rounded-xl border border-white/10 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </div>

            {/* Slot helper multi-day auto locate popup (no underlay) */}
            {slotHelperMultiDayOpen ? (
              <div className="fixed inset-0 z-[120] pointer-events-none">
                <div
                  role="dialog"
                  aria-modal="false"
                  aria-label="Auto locate additional time slots"
                  className="pointer-events-auto relative w-full max-w-xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-5 shadow-2xl backdrop-blur-md"
                  onPointerDown={(e) => {
                    if (!shouldStartModalDrag(e.target)) return;
                    slotHelperMultiDayDrag.handlePointerDown(e);
                  }}
                  onPointerMove={slotHelperMultiDayDrag.handlePointerMove}
                  onPointerUp={slotHelperMultiDayDrag.handlePointerUp}
                  style={{
                    transform: `translate(${slotHelperMultiDayDrag.offset.x}px, ${slotHelperMultiDayDrag.offset.y}px)`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--brand-ink)]">Auto Locate</div>
                    <button
                      type="button"
                      aria-label="Close auto locate popup"
                      onClick={() => {
                        setSlotHelperMultiDayOpen(false);
                        setSlotHelperMultiDayOptions([]);
                        setSlotHelperMultiDayDays([]);
                      }}
                      className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 text-sm text-foreground">
                    These are other available time slots in the days selected in Select Weekdays.
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1 text-xs">
                    {slotHelperMultiDayDays.map((d) => {
                      const label = SLOT_HELPER_DAY_PILLS.find((x) => x.value === d)?.label ?? d.slice(0, 3);
                      return (
                        <span
                          key={d}
                          className="btn-pill inline-flex items-center gap-1.5 rounded-full border border-white bg-[var(--cta)] px-2.5 py-1 font-semibold text-[var(--cta-foreground)]"
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-muted-foreground">
                      Selected: {slotHelperMultiDayCheckedCount}/{slotHelperMultiDayOptions.length}
                    </div>
                    <button
                      type="button"
                      onClick={toggleSlotHelperMultiDaySelectAll}
                      disabled={slotHelperMultiDayOptions.length === 0}
                      aria-label="Toggle all auto locate options"
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          slotHelperMultiDayAllChecked
                            ? "border-[var(--cta)] bg-[var(--cta)] text-[var(--cta-foreground)]"
                            : "border-white/30 bg-black/10"
                        }`}
                        aria-hidden="true"
                      >
                        {slotHelperMultiDayAllChecked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      {slotHelperMultiDayAllChecked ? "Unselect all" : "Select all"}
                    </button>
                  </div>

                  <div className="ymca-scrollbar mt-3 max-h-[320px] overflow-y-auto rounded-xl border border-white/10 bg-black/10 p-2">
                    {slotHelperMultiDayOptions.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          setSlotHelperMultiDayOptions((prev) =>
                            prev.map((p) => (p.key === opt.key ? { ...p, checked: !p.checked } : p)),
                          )
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-foreground transition hover:bg-black/20"
                      >
                        <span className="truncate">{opt.label}</span>
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            opt.checked
                              ? "border-[var(--cta)] bg-[var(--cta)] text-[var(--cta-foreground)]"
                              : "border-white/30 bg-black/10"
                          }`}
                          aria-hidden="true"
                        >
                          {opt.checked ? <Check className="h-3 w-3" /> : null}
                        </span>
                      </button>
                    ))}
                    {slotHelperMultiDayOptions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No additional matching slots found.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSlotHelperMultiDayOpen(false);
                        setSlotHelperMultiDayOptions([]);
                        setSlotHelperMultiDayDays([]);
                      }}
                      className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const keys = slotHelperMultiDayOptions.filter((o) => o.checked).map((o) => o.key);
                        if (keys.length > 0) {
                          setSlotHelperSelectedSlotKeys((prev) => {
                            const next = new Set(prev);
                            for (const k of keys) next.add(k);
                            return Array.from(next);
                          });
                        }
                        slotHelperAutoLocateAcceptedRef.current = true;
                        setSlotHelperMultiDayOpen(false);
                        setSlotHelperMultiDayOptions([]);
                        setSlotHelperMultiDayDays([]);
                      }}
                      className="rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-90"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </ModalPortal>
      )}

      {/* Slot Helper Review Modal (view-only) */}
      {slotHelperReviewOpen && slotHelperOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[120] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSlotHelperReviewOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Review selected time slots"
              className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-[var(--brand-ink)]">Review Selected Time Slots</div>
                  <div className="mt-1 text-sm text-[var(--brand-ink)]/70">
                    View-only list of the currently checked time slots.
                  </div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Email Requests</div>
                        <div className="text-xs text-muted-foreground">
                          Track responses and select a slot to prefill.
                        </div>
                      </div>
                      {slotHelperReviewRequestsLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    </div>

                    {slotHelperReviewRequestsError ? (
                      <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                        {slotHelperReviewRequestsError}
                      </div>
                    ) : null}

                    {slotHelperReviewRequestDetail ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="text-xs font-semibold text-muted-foreground">Email</div>
                          <div className="text-xs font-semibold text-foreground">
                            {slotHelperReviewRequestDetail.email?.sent_at
                              ? `Sent ${new Date(slotHelperReviewRequestDetail.email.sent_at).toLocaleString()}`
                              : "Not yet sent"}
                          </div>
                          <div className="text-xs font-semibold text-muted-foreground">Instructor response</div>
                          <div className="text-xs font-semibold text-foreground">
                            {slotHelperReviewRequestDetail.request.responded_at
                              ? `Received ${new Date(slotHelperReviewRequestDetail.request.responded_at).toLocaleString()}`
                              : "Not yet received"}
                          </div>
                          <div className="text-xs font-semibold text-muted-foreground">Expires</div>
                          <div className="text-xs font-semibold text-foreground">
                            {slotHelperReviewRequestDetail.expired
                              ? "Expired"
                              : new Date(slotHelperReviewRequestDetail.request.expires_at).toLocaleString()}
                          </div>
                          <div className="text-xs font-semibold text-muted-foreground">Status</div>
                          <div className="text-xs font-semibold text-foreground">
                            {slotHelperReviewRequestDetail.request.completed_at
                              ? "Completed"
                              : slotHelperReviewRequestDetail.request.overridden_at
                                ? "Overridden"
                                : slotHelperReviewRequestDetail.request.responded_at
                                  ? "Response received"
                                  : slotHelperReviewRequestDetail.request.sent_at
                                    ? "Sent"
                                    : "Draft"}
                          </div>
                        </div>

                        {slotHelperReviewRequestActionError ? (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {slotHelperReviewRequestActionError}
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          {(slotHelperReviewRequestDetail.holds ?? []).length === 0 ? (
                            <div className="text-xs font-semibold text-muted-foreground">No holds found.</div>
                          ) : (
                            slotHelperReviewRequestDetail.holds.map((hold) => {
                              const selectedIds = new Set(
                                slotHelperReviewRequestDetail.request.response_selected_hold_ids ?? [],
                              );
                              const isSelected = selectedIds.has(hold.id);
                              const isConsumed = !!hold.consumed_at;
                              const isReleased = !!hold.released_at;
                              const isExpired = slotHelperReviewRequestDetail.expired;
                              const isActive = !isConsumed && !isReleased && !isExpired;
                              const hasRequestContext =
                                !!slotHelperReviewRequestDetail.request.class_id &&
                                !!slotHelperReviewRequestDetail.request.location_id &&
                                (slotHelperReviewRequestDetail.request.instructor_ids ?? []).length > 0;

                              return (
                                <div key={hold.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-sm font-semibold text-foreground">
                                      {formatIsoDateMMDDYYYY(hold.slot_date)} • {formatTimeAmPm(hold.start_time)}–
                                      {formatTimeAmPm(hold.end_time)}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                      {isSelected ? (
                                        <span className="rounded-full border border-[var(--cta)]/60 bg-[var(--cta)]/20 px-2 py-0.5 text-[var(--cta-foreground)]">
                                          Selected
                                        </span>
                                      ) : null}
                                      {isConsumed ? (
                                        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-2 py-0.5 text-emerald-100">
                                          Consumed
                                        </span>
                                      ) : isReleased ? (
                                        <span className="rounded-full border border-yellow-400/40 bg-yellow-400/20 px-2 py-0.5 text-yellow-100">
                                          Released
                                        </span>
                                      ) : isExpired ? (
                                        <span className="rounded-full border border-red-400/40 bg-red-400/20 px-2 py-0.5 text-red-100">
                                          Expired
                                        </span>
                                      ) : (
                                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-muted-foreground">
                                          Active
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex items-center justify-end">
                                    <button
                                      type="button"
                                      disabled={
                                        !isActive ||
                                        !hasRequestContext ||
                                        slotHelperReviewRequestActionLoading ||
                                        !!slotHelperReviewRequestDetail.request.completed_at ||
                                        !!slotHelperReviewRequestDetail.request.overridden_at
                                      }
                                      onClick={() => {
                                        if (!isActive) return;
                                        if (!hasRequestContext) return;
                                        closeSlotHelper();
                                        openAddSessionDirect({
                                          session_date: hold.slot_date,
                                          start_time: hold.start_time,
                                          end_time: hold.end_time,
                                          class_id: slotHelperReviewRequestDetail.request.class_id ?? "",
                                          location_id: slotHelperReviewRequestDetail.request.location_id ?? "",
                                          instructor_ids: slotHelperReviewRequestDetail.request.instructor_ids ?? [],
                                          hold_id: hold.id,
                                        });
                                      }}
                                      className="rounded-lg border border-[var(--cta)] bg-[var(--cta)] px-3 py-1.5 text-xs font-semibold text-[var(--cta-foreground)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Prefill Add Session
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {slotHelperReviewRequestDetail.request.response_comment ? (
                          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="text-xs font-semibold text-muted-foreground">Comment</div>
                            <div className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                              {slotHelperReviewRequestDetail.request.response_comment}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-3">
                          <button
                            type="button"
                            onClick={() => void completeSlotHelperReviewRequest()}
                            disabled={
                              slotHelperReviewRequestActionLoading ||
                              slotHelperReviewRequestDetail.expired ||
                              !!slotHelperReviewRequestDetail.request.completed_at ||
                              !!slotHelperReviewRequestDetail.request.overridden_at
                            }
                            className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Mark complete
                          </button>
                          <button
                            type="button"
                            onClick={() => void overrideSlotHelperReviewRequest()}
                            disabled={
                              slotHelperReviewRequestActionLoading ||
                              slotHelperReviewRequestDetail.expired ||
                              !!slotHelperReviewRequestDetail.request.completed_at ||
                              !!slotHelperReviewRequestDetail.request.overridden_at
                            }
                            className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Override
                          </button>
                        </div>
                      </div>
                    ) : slotHelperReviewRequestDetailLoading ? (
                      <div className="mt-3 text-xs text-muted-foreground">Loading request details…</div>
                    ) : (
                      <div className="mt-3 text-xs font-semibold text-muted-foreground">No request selected.</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSlotHelperReviewEmailModalOpen(true)}
                    disabled={slotHelperSelectedSlotKeys.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--cta)] bg-[var(--cta)] px-3 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </button>
                  <button
                    type="button"
                    aria-label="Close review"
                    onClick={() => setSlotHelperReviewOpen(false)}
                    className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-black/10 p-4">
                {slotHelperSelectedSlotKeys.length === 0 ? (
                  <div className="text-sm font-semibold text-muted-foreground">No time slots selected.</div>
                ) : (
                  (() => {
                    const byDate = new Map<string, { start: string; end: string }[]>();
                    for (const key of slotHelperSelectedSlotKeys) {
                      const [date, start, end] = String(key).split("|");
                      if (!date || !start || !end) continue;
                      const list = byDate.get(date) ?? [];
                      list.push({ start, end });
                      byDate.set(date, list);
                    }
                    const dates = Array.from(byDate.keys()).sort();
                    return dates.map((date) => {
                      const rows = (byDate.get(date) ?? []).slice().sort((a, b) => a.start.localeCompare(b.start));
                      return (
                        <div key={date} className="rounded-xl border border-white/10 bg-black/10 p-3">
                          <div className="text-sm font-semibold text-foreground">{formatIsoDateMMDDYYYY(date)}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {rows.map((r, idx) => (
                              <div
                                key={`${date}-${r.start}-${r.end}-${idx}`}
                                className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm font-semibold text-foreground"
                              >
                                {formatTimeAmPm(r.start)}–{formatTimeAmPm(r.end)}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setSlotHelperReviewOpen(false)}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Slot Helper Review Email Modal */}
      {slotHelperReviewEmailModalOpen && slotHelperOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[130] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (slotHelperReviewEmailSending) return;
                setSlotHelperReviewEmailModalOpen(false);
                setSlotHelperReviewEmailError(null);
                setSlotHelperReviewEmailSuccess(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Email slot review"
              className="relative z-10 w-full max-w-xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md"
              onPointerDown={(e) => {
                if (!shouldStartModalDrag(e.target)) return;
                slotHelperReviewEmailDrag.handlePointerDown(e);
              }}
              onPointerMove={slotHelperReviewEmailDrag.handlePointerMove}
              onPointerUp={slotHelperReviewEmailDrag.handlePointerUp}
              style={{
                transform: `translate(${slotHelperReviewEmailDrag.offset.x}px, ${slotHelperReviewEmailDrag.offset.y}px)`,
              }}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/20">
                    <Mail className="h-5 w-5 text-[var(--cta)]" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-[var(--brand-ink)]">Email Instructor(s)</div>
                    <div className="text-sm text-[var(--brand-ink)]/70">
                      Sends selected instructor(s) an app link to review and adjust proposed time slots.
                    </div>
                    <div className="text-sm text-[var(--brand-ink)]/70">(link expires in 48 hours)</div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close email modal"
                  disabled={slotHelperReviewEmailSending}
                  onClick={() => {
                    if (slotHelperReviewEmailSending) return;
                    setSlotHelperReviewEmailModalOpen(false);
                    setSlotHelperReviewEmailError(null);
                    setSlotHelperReviewEmailSuccess(false);
                  }}
                  className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Selected instructors</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {slotHelperSelectedInstructorDisplay || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Selected slots</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {slotHelperSelectedSlotKeys.length}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    If an instructor email can’t be resolved, the system will use <span className="font-mono">don.race@outlook.com</span>.
                  </div>
                </div>

                {slotHelperReviewEmailError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                    {slotHelperReviewEmailError}
                  </div>
                ) : null}

                {slotHelperReviewEmailSuccess ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    Email sent.
                  </div>
                ) : null}

                <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    disabled={slotHelperReviewEmailSending}
                    onClick={() => {
                      if (slotHelperReviewEmailSending) return;
                      setSlotHelperReviewEmailModalOpen(false);
                      setSlotHelperReviewEmailError(null);
                      setSlotHelperReviewEmailSuccess(false);
                    }}
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendSlotHelperReviewEmail()}
                    disabled={
                      slotHelperReviewEmailSending ||
                      slotHelperSelectedSlotKeys.length === 0 ||
                      slotHelperSelectedInstructorIds.length === 0
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {slotHelperReviewEmailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Send email
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Add Session Modal */}
      {addOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={closeAddSession}
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Add session"
              className="relative z-10 w-full max-w-2xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md"
              onPointerDown={(e) => {
                if (!shouldStartModalDrag(e.target)) return;
                addDrag.handlePointerDown(e);
              }}
              onPointerMove={addDrag.handlePointerMove}
              onPointerUp={addDrag.handlePointerUp}
              style={{ transform: `translate(${addDrag.offset.x}px, ${addDrag.offset.y}px)` }}
            >
            <div className="mb-6 flex items-start justify-between">
              <div
                className="flex cursor-grab select-none items-center gap-3 active:cursor-grabbing"
                aria-label="Drag add session dialog"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/20">
                  <Plus className="h-5 w-5 text-[var(--brand-ink)]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Add Session</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">Create a new session for this schedule</p>
                </div>
              </div>
              <button
                onClick={closeAddSession}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
                aria-label="Close add session"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {addError}
              </div>
            )}

            {addConflicts && addConflicts.length > 0 && (
              <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-100">
                <div className="mb-2 font-medium">Blocking conflicts:</div>
                <ul className="list-disc space-y-1 pl-4">
                  {addConflicts.slice(0, 8).map((c, i) => (
                    <li key={`${c.type}-${i}`}>
                      <span className="font-semibold text-red-200">{c.severity}</span> {c.message}
                    </li>
                  ))}
                </ul>
                {addConflicts.length > 8 && <div className="mt-1 text-yellow-200/70">…and more</div>}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Date</label>
                <input
                  type="date"
                  value={addForm.session_date}
                  onChange={(e) => setAddForm((f) => ({ ...f, session_date: e.target.value }))}
                  className="ymca-picker w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                />
                <div className="mt-1 text-xs text-[var(--brand-ink)]/70">
                  Day:{" "}
                  <span className="font-semibold">
                    {addForm.session_date ? (dayOfWeekFromIsoDateUtc(addForm.session_date) ?? "—") : "—"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Start</label>
                  <input
                    type="time"
                    value={addForm.start_time}
                    onChange={(e) => setAddForm((f) => ({ ...f, start_time: e.target.value }))}
                    className="ymca-picker w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">End</label>
                  <input
                    type="time"
                    value={addForm.end_time}
                    onChange={(e) => setAddForm((f) => ({ ...f, end_time: e.target.value }))}
                    className="ymca-picker w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Class</label>
                <Popover open={addClassDropdownOpen} onOpenChange={setAddClassDropdownOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                      aria-expanded={addClassDropdownOpen}
                    >
                      <span className="truncate">
                        {classes.find((c) => c.id === addForm.class_id)?.name || "Select class"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-[320px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md">
                    <div ref={scrollToSelected} className="max-h-[300px] overflow-y-auto">
                      {classes.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          data-selected={c.id === addForm.class_id}
                          onClick={() => {
                            setAddForm((f) => ({ ...f, class_id: c.id }));
                            setAddClassDropdownOpen(false);
                          }}
                          className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                            c.id === addForm.class_id
                              ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                              : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                      {classes.length === 0 && (
                        <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">No classes</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Location</label>
                <Popover open={addLocationDropdownOpen} onOpenChange={setAddLocationDropdownOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                      aria-expanded={addLocationDropdownOpen}
                    >
                      <span className="truncate">
                        {locations.find((l) => l.id === addForm.location_id)
                          ? `${locations.find((l) => l.id === addForm.location_id)?.code} - ${locations.find((l) => l.id === addForm.location_id)?.name}`
                          : "Select location"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-[340px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md">
                    <div ref={scrollToSelected} className="max-h-[300px] overflow-y-auto">
                      {locations.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          data-selected={l.id === addForm.location_id}
                          onClick={() => {
                            setAddForm((f) => ({ ...f, location_id: l.id }));
                            setAddLocationDropdownOpen(false);
                          }}
                          className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                            l.id === addForm.location_id
                              ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                              : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                          }`}
                        >
                          {l.code} - {l.name}
                        </button>
                      ))}
                      {locations.length === 0 && (
                        <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">No locations</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Instructor(s)</label>
                <Popover open={addInstructorDropdownOpen} onOpenChange={setAddInstructorDropdownOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                      aria-expanded={addInstructorDropdownOpen}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {addForm.instructor_ids.length > 0
                          ? instructors
                              .filter((i) => addForm.instructor_ids.includes(i.id))
                              .map((i) => i.nickname || i.first_name)
                              .join(", ")
                          : "Select instructors (optional)"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-[340px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md">
                    <div ref={scrollToSelected} className="max-h-[300px] overflow-y-auto">
                      {instructors.map((inst) => (
                        <button
                          key={inst.id}
                          type="button"
                          data-selected={addForm.instructor_ids.includes(inst.id)}
                          onClick={() => toggleAddInstructor(inst.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                            addForm.instructor_ids.includes(inst.id)
                              ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                              : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                          }`}
                        >
                          <div
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              addForm.instructor_ids.includes(inst.id)
                                ? "border-[var(--cta-foreground)] bg-[var(--cta-foreground)]/20"
                                : "border-white/30"
                            }`}
                          >
                            {addForm.instructor_ids.includes(inst.id) && <Check className="h-3 w-3" />}
                          </div>
                          {inst.nickname || `${inst.first_name} ${inst.last_name}`.trim()}
                        </button>
                      ))}
                      {instructors.length === 0 && (
                        <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">No instructors</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="h-4 w-4 text-[var(--cta)]" />
                Instructor availability
              </div>

              {availabilityLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading availability…
                </div>
              ) : availabilityError ? (
                <div className="text-xs text-red-200">{availabilityError}</div>
              ) : addForm.instructor_ids.length === 0 ? (
                <div className="text-xs text-muted-foreground">Select instructors to see availability.</div>
              ) : (
                <div className="space-y-2">
                  {addAvailabilityVm.map((vm) => {
                    const pill =
                      vm.status === "AVAILABLE"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : vm.status === "ANYTIME"
                          ? "border-white/15 bg-white/10 text-foreground/90"
                          : vm.status === "NEEDS_INPUT"
                            ? "border-white/15 bg-white/5 text-foreground/80"
                            : "border-red-500/40 bg-red-500/15 text-red-200";

                    return (
                      <div
                        key={vm.instructor_id}
                        className="rounded-lg border border-white/10 bg-black/10 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {vm.instructor_label}
                            </div>
                            <div className="mt-0.5 text-xs text-foreground/80">{vm.checkLine}</div>
                          </div>
                          <span
                            className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pill}`}
                          >
                            {availabilityStatusLabel(vm.status)}
                          </span>
                        </div>

                        {vm.monthPills.length > 0 ? (
                          <div className="mt-2">
                            <div className="text-xs font-semibold text-foreground/80">
                              {vm.monthLabel ? `Availability for ${vm.monthLabel}` : "Availability"}
                            </div>
                            <div className="mt-2 flex w-full min-w-0 flex-wrap items-center gap-2">
                              {vm.monthPills.map((p) => (
                                <div
                                  key={`${vm.instructor_id}-${p.day}-${p.window}`}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[11px] font-semibold text-foreground whitespace-nowrap"
                                >
                                  <span className="text-muted-foreground">{shortDowLabel(p.day)}</span>
                                  <span>{p.window}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {addCandidateConflicts && addCandidateConflicts.length > 0 && (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-xs text-foreground">
                <div className="mb-2 font-medium">Detected conflicts (live):</div>
                <ul className="list-disc space-y-1 pl-4">
                  {addCandidateConflicts.slice(0, 8).map((c, i) => (
                    <li key={`${c.type}-${i}`}>
                      <span
                        className={
                          c.severity === "HIGH"
                            ? "text-red-300 font-semibold"
                            : c.severity === "MEDIUM"
                              ? "text-yellow-300 font-semibold"
                              : "text-emerald-300 font-semibold"
                        }
                      >
                        {c.severity}
                      </span>{" "}
                      {c.message}
                    </li>
                  ))}
                </ul>
                {addCandidateConflicts.length > 8 && <div className="mt-1 text-muted-foreground">…and more</div>}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeAddSession}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateSession()}
                disabled={
                  saving ||
                  !addForm.session_date ||
                  !addForm.start_time ||
                  !addForm.end_time ||
                  !addForm.class_id ||
                  !addForm.location_id ||
                  addBlockingConflicts.length > 0
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Session
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <PrintScheduleConflictsReportModal
        isOpen={printConflictsModalOpen}
        onClose={() => setPrintConflictsModalOpen(false)}
        sessionsInScope={riskFilteredSessions}
        conflictsInScope={conflictsForPrintModal}
        contextLabel={riskFilter === "RESET" ? undefined : `Filter: ${riskFilter}`}
        branchName={branchName ?? undefined}
        reportPeriod={scheduleMonthYear ? formatMonthShortYear(`${scheduleMonthYear.year}-${String(scheduleMonthYear.month).padStart(2, "0")}`) : undefined}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit2, Plus, Search, X } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PopoverSelect, type PopoverSelectOption } from "@/components/ui/popover-select";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { InstructorAvailabilityModal } from "@/components/instructor-availability/InstructorAvailabilityModal";
import { useThemeSettings } from "@/components/theme-settings-provider";
import { useBranchAccess } from "@/hooks/useBranchAccess";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

type Instructor = {
  id: string;
  branch_id: string | null;
  raw_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  readable_id: string;
  is_active: boolean;
  created_at: string;
  available_branches?: Array<{ branch_id: string; is_primary?: boolean | null }>;
};

type FormData = {
  first_name: string;
  last_name: string;
  nickname: string;
};

type NicknameValidation = {
  exists: boolean;
  suggestions: string[];
};

type InstructorAvailabilityRow = {
  id: string;
  branch_id: string;
  instructor_id: string;
  schedule_month: string; // "YYYY-MM"
  day_of_week: string; // "MONDAY"..."SUNDAY"
  available_start: string; // "HH:mm"
  available_end: string; // "HH:mm"
};

const DOW_ORDER: Record<string, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

const NICKNAME_MIN_LEN = 2;
const NICKNAME_MAX_LEN = 8;
function sanitizeNicknameInput(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, NICKNAME_MAX_LEN);
}

function getIsoMonthNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function hm(value: string): string {
  return (value || "").slice(0, 5);
}

type OrgBranch = {
  id: string;
  code: string;
  short_code: string | null;
  name: string;
  association_id: string;
};

type OrgAssociation = {
  id: string;
  code: string;
  name: string;
  alliance_id: string | null;
};

export function InstructorsTab() {
  const { branch } = useThemeSettings();
  const { isAdmin } = useBranchAccess();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      if (!isSupabaseConfigured()) return {};
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token ?? null;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      // Best-effort: if auth isn't configured (tests) or session isn't available, omit the header.
      return {};
    }
  }, []);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    first_name: "",
    last_name: "",
    nickname: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Admin-only: instructor sharing (cross-branch availability)
  const [orgBranches, setOrgBranches] = useState<OrgBranch[]>([]);
  const [orgAssociations, setOrgAssociations] = useState<OrgAssociation[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [shareBranchIds, setShareBranchIds] = useState<string[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false);
  const [shareSearch, setShareSearch] = useState("");
  const [shareManageTooltipOpen, setShareManageTooltipOpen] = useState(false);
  const [homeBranchId, setHomeBranchId] = useState<string | null>(null);
  const [branchPillTooltip, setBranchPillTooltip] = useState<{
    instructorId: string;
    branchId: string;
  } | null>(null);

  const [saveResult, setSaveResult] = useState<{
    status: "success" | "error";
    message: string;
    instructor?: Instructor | null;
  } | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Nickname validation
  const [nicknameValidation, setNicknameValidation] = useState<NicknameValidation | null>(null);
  const [validatingNickname, setValidatingNickname] = useState(false);
  const [nicknameSuggestions, setNicknameSuggestions] = useState<string[]>([]);
  const [suggestingNicknames, setSuggestingNicknames] = useState(false);

  // Branch meta for Instructor ID preview
  const [branchShortCode, setBranchShortCode] = useState<string | null>(null);
  const [associationCode, setAssociationCode] = useState<string | null>(null);

  // Instructor availability (month-scoped allow-list)
  const [availabilityMonth, setAvailabilityMonth] = useState<string>(getIsoMonthNow());
  const [availabilityRows, setAvailabilityRows] = useState<InstructorAvailabilityRow[]>([]);
  const [availabilityMonthsWithRules, setAvailabilityMonthsWithRules] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [availabilityEditTooltipOpen, setAvailabilityEditTooltipOpen] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<"narrow" | "find" | "smart">("narrow");
  const [popoverOpen, setPopoverOpen] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isScrollingRef = useRef(false);
  const scrollStopTimerRef = useRef<number | null>(null);

  const loadInstructors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (showInactive) params.set("include_inactive", "true");
      params.set("branch_id", branch.id);
      const res = await fetch(`/api/maintenance/instructors?${params}`, {
        headers: await getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load instructors");
      const data = await res.json();
      setInstructors(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [showInactive, branch.id, getAuthHeaders]);

  useEffect(() => {
    void loadInstructors();
  }, [loadInstructors]);

  const loadInstructorAvailability = useCallback(async () => {
    if (!editingId) return;
    if (!branch?.id) return;
    if (!availabilityMonth) return;

    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      params.set("instructor_id", editingId);
      params.set("month", availabilityMonth);
      const res = await fetch(`/api/scheduling/instructor-availability?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Failed to load instructor availability");
      }
      const json = await res.json();
      const rows = Array.isArray(json?.availability) ? (json.availability as InstructorAvailabilityRow[]) : [];
      setAvailabilityRows(
        rows
          .map((r) => ({
            ...r,
            day_of_week: String(r.day_of_week).toUpperCase(),
            available_start: hm(String(r.available_start)),
            available_end: hm(String(r.available_end)),
          }))
          .filter((r) => r.instructor_id === editingId && r.branch_id === branch.id),
      );
    } catch (e) {
      setAvailabilityError(e instanceof Error ? e.message : "Failed to load instructor availability");
      setAvailabilityRows([]);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [availabilityMonth, branch?.id, editingId]);

  const loadInstructorAvailabilityMonths = useCallback(async () => {
    if (!editingId) return;
    if (!branch?.id) return;

    try {
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      params.set("instructor_id", editingId);
      const res = await fetch(`/api/scheduling/instructor-availability?${params.toString()}`);
      if (!res.ok) {
        setAvailabilityMonthsWithRules([]);
        return;
      }
      const json = await res.json().catch(() => ({}));
      const rows = Array.isArray(json?.availability) ? (json.availability as InstructorAvailabilityRow[]) : [];
      const months = Array.from(
        new Set(
          rows
            .map((r) => String(r.schedule_month ?? "").slice(0, 7))
            .filter((m) => /^\d{4}-\d{2}$/.test(m)),
        ),
      ).sort();
      setAvailabilityMonthsWithRules(months);
    } catch {
      setAvailabilityMonthsWithRules([]);
    }
  }, [branch?.id, editingId]);

  useEffect(() => {
    if (!isFormOpen || !editingId) return;
    void loadInstructorAvailability();
    void loadInstructorAvailabilityMonths();
  }, [isFormOpen, editingId, availabilityMonth, loadInstructorAvailability]);

  const handleAvailabilityUpdated = useCallback(() => {
    void loadInstructorAvailability();
    void loadInstructorAvailabilityMonths();
  }, [loadInstructorAvailability, loadInstructorAvailabilityMonths]);

  const loadOrgBranches = useCallback(async () => {
    if (!isAdmin) return;
    setOrgLoading(true);
    setOrgError(null);
    try {
      const res = await fetch("/api/maintenance/organization");
      const json = (await res.json().catch(() => ({}))) as {
        branches?: OrgBranch[];
        associations?: OrgAssociation[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load organization branches");
      setOrgBranches(Array.isArray(json.branches) ? json.branches : []);
      setOrgAssociations(Array.isArray(json.associations) ? json.associations : []);
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : "Failed to load organization branches");
      setOrgBranches([]);
      setOrgAssociations([]);
    } finally {
      setOrgLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadOrgBranches();
  }, [isAdmin, loadOrgBranches]);

  // Validate nickname with debounce
  useEffect(() => {
    if (!formData.nickname.trim()) {
      setNicknameValidation(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setValidatingNickname(true);
      try {
        const normalizedNickname = sanitizeNicknameInput(formData.nickname);
        if (!normalizedNickname) {
          setNicknameValidation(null);
          return;
        }
        const params = new URLSearchParams({
          check_nickname: normalizedNickname,
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          branch_id: branch.id,
        });
        const res = await fetch(`/api/maintenance/instructors?${params}`, {
          headers: await getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          // Do not show as duplicate if we are editing and it is our own nickname
          if (editingId) {
            const current = instructors.find((i) => i.id === editingId);
            const currentNick = sanitizeNicknameInput(current?.nickname ?? "");
            if (currentNick && currentNick === normalizedNickname) {
              setNicknameValidation({ exists: false, suggestions: [] });
              return;
            }
          }
          setNicknameValidation(data);
        }
      } catch {
        // Ignore validation errors
      } finally {
        setValidatingNickname(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [formData.nickname, formData.first_name, formData.last_name, editingId, instructors]);

  // Fetch nickname suggestions (NEW instructor only) when first+last are present
  useEffect(() => {
    if (!isFormOpen) return;
    if (editingId) return;
    const first = formData.first_name.trim();
    const last = formData.last_name.trim();
    if (!first || !last) {
      setNicknameSuggestions([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSuggestingNicknames(true);
      try {
        const params = new URLSearchParams({
          suggest_nicknames: "true",
          first_name: first,
          last_name: last,
          branch_id: branch.id,
        });
        const res = await fetch(`/api/maintenance/instructors?${params.toString()}`, {
          headers: await getAuthHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const suggestions = Array.isArray(json?.suggestions)
          ? (json.suggestions as unknown[]).filter((v): v is string => typeof v === "string")
          : [];
        setNicknameSuggestions(suggestions.slice(0, 5));
        // Auto-fill the first suggestion only if nickname is empty (do not override manual input).
        setFormData((f) => {
          const current = sanitizeNicknameInput(f.nickname);
          if (current) return f;
          const firstSuggestion = suggestions[0] ? sanitizeNicknameInput(String(suggestions[0])) : "";
          return firstSuggestion ? { ...f, nickname: firstSuggestion } : f;
        });
      } catch {
        // ignore
      } finally {
        setSuggestingNicknames(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [branch.id, editingId, formData.first_name, formData.last_name, isFormOpen]);

  // Fetch association + branch short code for Instructor ID preview
  useEffect(() => {
    if (!branch?.id) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/branches/${encodeURIComponent(branch.id)}`, { signal: controller.signal });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || controller.signal.aborted) return;
        const assoc = typeof json?.association_code === "string" ? json.association_code : null;
        const short = typeof json?.short_code === "string" ? json.short_code : null;
        setAssociationCode(assoc ? assoc.toUpperCase() : null);
        setBranchShortCode(short ? short.toUpperCase() : null);
      } catch {
        // ignore
      }
    })();
    return () => controller.abort();
  }, [branch.id]);

  const openNewForm = () => {
    setFormData({ first_name: "", last_name: "", nickname: "" });
    setEditingId(null);
    setFormError(null);
    setNicknameValidation(null);
    setAvailabilityMonth(getIsoMonthNow());
    setAvailabilityRows([]);
    setAvailabilityError(null);
    setAvailabilityModalOpen(false);
    setHomeBranchId(branch.id);
    setShareError(null);
    setShareSearch("");
    setSharePopoverOpen(false);
    setShareBranchIds(isAdmin ? [branch.id] : []);
    setIsFormOpen(true);
  };

  const openEditForm = (instructor: Instructor) => {
    setFormData({
      first_name: instructor.first_name || "",
      last_name: instructor.last_name || "",
      nickname: instructor.nickname || "",
    });
    setEditingId(instructor.id);
    setFormError(null);
    setNicknameValidation(null);
    setAvailabilityMonth(getIsoMonthNow());
    setAvailabilityRows([]);
    setAvailabilityError(null);
    setAvailabilityModalOpen(false);
    setHomeBranchId(instructor.branch_id ?? null);
    setShareError(null);
    setShareSearch("");
    setSharePopoverOpen(false);
    setIsFormOpen(true);

    if (isAdmin) {
      setShareLoading(true);
      void getAuthHeaders().then((authHeaders) =>
        fetch(`/api/maintenance/instructors/${instructor.id}/branches`, { headers: authHeaders }),
      )
        .then(async (res) => {
          const json = (await res.json().catch(() => [])) as any;
          if (!res.ok) throw new Error(json?.error ?? "Failed to load instructor branches");
          const branchIds = Array.isArray(json)
            ? (json as Array<{ branch_id?: string }>)
                .map((r) => r.branch_id)
                .filter((id): id is string => typeof id === "string" && id.length > 0)
            : [];
          const unique = Array.from(new Set(branchIds));
          const home = instructor.branch_id ?? null;
          const withHome = home && !unique.includes(home) ? [home, ...unique] : unique;
          setShareBranchIds(withHome);
        })
        .catch((e) => {
          setShareError(e instanceof Error ? e.message : "Failed to load instructor branches");
          const home = instructor.branch_id ?? null;
          setShareBranchIds(home ? [home] : []);
        })
        .finally(() => setShareLoading(false));
    }
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
    setNicknameValidation(null);
    setAvailabilityRows([]);
    setAvailabilityError(null);
    setAvailabilityModalOpen(false);
    setHomeBranchId(null);
    setShareBranchIds([]);
    setShareError(null);
    setShareSearch("");
    setSharePopoverOpen(false);
    setSaveResult(null);
    setShowSaveModal(false);
  };

  const handleSave = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setFormError("First name and last name are required");
      return;
    }
    if (!formData.nickname.trim()) {
      setFormError("Nickname is required");
      return;
    }

    if (nicknameValidation?.exists) {
      setFormError("Please choose a unique nickname");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? { id: editingId, ...formData }
        : { ...formData, branch_id: branch.id };

      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/maintenance/instructors", {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      const saved = (await res.json().catch(() => null)) as Instructor | null;
      const savedId = editingId ?? saved?.id ?? null;

      if (isAdmin && savedId) {
        const home = homeBranchId ?? saved?.branch_id ?? null;
        const desired = Array.from(
          new Set([...(home ? [home] : []), ...(shareBranchIds ?? [])])
        );

        // Only attempt sharing updates if we have a home branch.
        if (home) {
          const shareRes = await fetch(`/api/maintenance/instructors/${savedId}/branches`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ branch_ids: desired }),
          });

          if (!shareRes.ok) {
            const shareJson = await shareRes.json().catch(() => ({}));
            throw new Error(shareJson.error || "Failed to update instructor branch sharing");
          }
        }
      }

      setSaveResult({
        status: "success",
        message: "Instructor saved successfully.",
        instructor: saved ?? null,
      });
      setShowSaveModal(true);
      await loadInstructors();
    } catch (e) {
      const friendly =
        e instanceof Error && e.message
          ? e.message
          : "We couldn't save this instructor. Please check the details and try again.";
      setFormError(friendly);
      setSaveResult({
        status: "error",
        message: friendly,
      });
      setShowSaveModal(true);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveModalClose = () => {
    setShowSaveModal(false);
    if (saveResult?.status === "success") {
      closeForm();
    }
  };

  const currentOrgBranch = useMemo(() => {
    return orgBranches.find((b) => b.id === branch.id) ?? null;
  }, [orgBranches, branch.id]);

  const currentAssociation = useMemo(() => {
    if (!currentOrgBranch) return null;
    return orgAssociations.find((a) => a.id === currentOrgBranch.association_id) ?? null;
  }, [orgAssociations, currentOrgBranch]);

  const currentAssociationLabel = useMemo(() => {
    if (!currentAssociation) return null;
    const code = (currentAssociation.code || "").toUpperCase();
    const name = (currentAssociation.name || "").trim();
    if (!code && !name) return null;
    if (!code) return name;
    if (!name) return code;
    return `${code} - ${name}`;
  }, [currentAssociation]);

  const editingInstructor = useMemo(() => {
    if (!editingId) return null;
    return instructors.find((i) => i.id === editingId) ?? null;
  }, [editingId, instructors]);

  const visibleOrgBranches = useMemo(() => {
    const term = shareSearch.trim().toLowerCase();
    const home = homeBranchId;
    const associationId = currentOrgBranch?.association_id ?? null;

    const base = associationId
      ? orgBranches.filter((b) => b.association_id === associationId)
      : orgBranches;

    const filtered = term
      ? base.filter((b) => {
          const label = `${(b.short_code ?? b.code).toUpperCase()} - ${b.name}`.toLowerCase();
          return label.includes(term);
        })
      : base;

    // Bring selected branches to the top
    const selected = new Set(shareBranchIds);
    const sorted = [...filtered].sort((a, b) => {
      const aSelected = selected.has(a.id) ? 1 : 0;
      const bSelected = selected.has(b.id) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      // Keep home branch very top when present
      const aHome = home && a.id === home ? 1 : 0;
      const bHome = home && b.id === home ? 1 : 0;
      if (aHome !== bHome) return bHome - aHome;
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [orgBranches, shareSearch, shareBranchIds, homeBranchId, currentOrgBranch?.association_id]);

  const associationCodeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of orgAssociations) {
      if (a?.id && a.code) m.set(a.id, a.code);
    }
    return m;
  }, [orgAssociations]);

  const orgBranchById = useMemo(() => {
    const m = new Map<string, OrgBranch>();
    for (const b of orgBranches) {
      if (b?.id) m.set(b.id, b);
    }
    return m;
  }, [orgBranches]);

  const getBranchPillLabel = useCallback(
    (branchId: string): string => {
      const b = orgBranchById.get(branchId);
      if (!b) return "—";
      const assocCode = associationCodeById.get(b.association_id)?.toUpperCase() ?? "—";
      const branchCode = (b.short_code ?? b.code).toUpperCase();
      return `${assocCode}-${branchCode}`;
    },
    [associationCodeById, orgBranchById],
  );

  const getBranchName = useCallback(
    (branchId: string): string => {
      const b = orgBranchById.get(branchId);
      return b?.name ?? branchId;
    },
    [orgBranchById],
  );

  const getFallbackBranchPillLabel = useCallback(
    (instructor: Instructor, branchId: string): string => {
      // If org hierarchy metadata hasn't loaded yet, fall back to the instructor's readable_id for the home branch.
      // readable_id is typically: ASSOC-BRANCHSHORT-NICKNAME
      if (branchId === instructor.branch_id) {
        const parts = (instructor.readable_id ?? "").split("-").filter(Boolean);
        if (parts.length >= 2) {
          return `${parts[0]}-${parts[1]}`.toUpperCase();
        }
      }
      return "…";
    },
    [],
  );

  const sharedBranchSummary = useMemo(() => {
    const ids = new Set<string>();
    if (branch.id) ids.add(branch.id); // include current branch context
    for (const id of shareBranchIds) {
      if (id) ids.add(id);
    }
    if (homeBranchId) ids.add(homeBranchId);

    const rows = Array.from(ids).map((id) => {
      const orgLabel = getBranchPillLabel(id);
      const pillLabel =
        orgLabel !== "—"
          ? orgLabel
          : editingInstructor
            ? getFallbackBranchPillLabel(editingInstructor, id)
            : "…";

      return {
        id,
        pillLabel,
        name: getBranchName(id),
        isCurrent: id === branch.id,
        isHome: !!homeBranchId && id === homeBranchId,
      };
    });

    return rows.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      if (a.isHome !== b.isHome) return a.isHome ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [
    branch.id,
    shareBranchIds,
    homeBranchId,
    getBranchPillLabel,
    getBranchName,
    editingInstructor,
    getFallbackBranchPillLabel,
  ]);

  const instructorLabelForAvailability = useMemo(() => {
    const nick = formData.nickname.trim();
    const full = `${formData.first_name} ${formData.last_name}`.trim();
    return nick || full || "Instructor";
  }, [formData.first_name, formData.last_name, formData.nickname]);

  const availabilitySummary = useMemo(() => {
    const rows = availabilityRows
      .filter((r) => r.schedule_month === availabilityMonth)
      .slice()
      .sort((a, b) => {
        const aDay = DOW_ORDER[String(a.day_of_week).toUpperCase()] ?? 99;
        const bDay = DOW_ORDER[String(b.day_of_week).toUpperCase()] ?? 99;
        if (aDay !== bDay) return aDay - bDay;
        return String(a.available_start).localeCompare(String(b.available_start));
      });

    const byDay = new Map<string, string[]>();
    for (const r of rows) {
      const day = String(r.day_of_week).toUpperCase();
      const list = byDay.get(day) ?? [];
      list.push(`${hm(r.available_start)}–${hm(r.available_end)}`);
      byDay.set(day, list);
    }

    const days = Object.keys(DOW_ORDER).sort((a, b) => (DOW_ORDER[a] ?? 99) - (DOW_ORDER[b] ?? 99));
    return days
      .map((d) => ({ day: d, windows: byDay.get(d) ?? [] }))
      .filter((x) => x.windows.length > 0);
  }, [availabilityRows, availabilityMonth]);

  const availabilitySlotCount = useMemo(() => {
    return availabilitySummary.reduce((sum, d) => sum + d.windows.length, 0);
  }, [availabilitySummary]);

  const shareDisabled = !editingId;

  const markScrolling = useCallback(() => {
    // When the user scrolls the table, the mouse pointer stays fixed while rows move under it.
    // That can trigger many mouseenter events for our pill tooltips, causing jank/focus issues.
    // Gate tooltip hover behavior while actively scrolling.
    isScrollingRef.current = true;
    if (scrollStopTimerRef.current) {
      window.clearTimeout(scrollStopTimerRef.current);
    }
    scrollStopTimerRef.current = window.setTimeout(() => {
      isScrollingRef.current = false;
    }, 120);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollStopTimerRef.current) {
        window.clearTimeout(scrollStopTimerRef.current);
        scrollStopTimerRef.current = null;
      }
    };
  }, []);

  // Close branch sharing popover when not in edit mode
  useEffect(() => {
    if (!editingId) {
      setSharePopoverOpen(false);
    }
  }, [editingId]);

  const handleToggleActive = async (instructor: Instructor) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/maintenance/instructors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ id: instructor.id, is_active: !instructor.is_active }),
      });

      if (!res.ok) throw new Error("Failed to update");
      await loadInstructors();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setFormData((f) => ({ ...f, nickname: sanitizeNicknameInput(suggestion) }));
    setNicknameValidation(null);
  };

  const effectiveNicknameSuggestions: string[] = useMemo(() => {
    if (editingId) return [];
    if (nicknameValidation?.exists && nicknameValidation.suggestions.length > 0) {
      return nicknameValidation.suggestions;
    }
    return nicknameSuggestions;
  }, [editingId, nicknameSuggestions, nicknameValidation?.exists, nicknameValidation?.suggestions]);

  const nicknameOptions: PopoverSelectOption[] = useMemo(() => {
    return effectiveNicknameSuggestions.map((s) => ({ value: s, label: s }));
  }, [effectiveNicknameSuggestions]);

  const selectedNicknameOptionValue = useMemo(() => {
    const current = sanitizeNicknameInput(formData.nickname);
    return effectiveNicknameSuggestions.includes(current) ? current : null;
  }, [effectiveNicknameSuggestions, formData.nickname]);

  const instructorIdPreview = useMemo(() => {
    if (editingId) {
      return editingInstructor?.readable_id ?? null;
    }
    const nick = sanitizeNicknameInput(formData.nickname);
    if (!nick) return null;
    if (nicknameValidation?.exists) return null;
    if (!associationCode || !branchShortCode) return null;
    return `${associationCode}-${branchShortCode}-${nick}`;
  }, [associationCode, branchShortCode, editingId, editingInstructor?.readable_id, formData.nickname, nicknameValidation?.exists]);

  const sanitizedNickname = useMemo(() => sanitizeNicknameInput(formData.nickname), [formData.nickname]);
  const nicknameTooShort = sanitizedNickname.length > 0 ? sanitizedNickname.length < NICKNAME_MIN_LEN : true;
  const disableSave =
    saving ||
    validatingNickname ||
    suggestingNicknames ||
    nicknameValidation?.exists ||
    nicknameTooShort;

  // Search/filter logic
  const matchesSearch = useCallback((instructor: Instructor, term: string): boolean => {
    if (!term.trim()) return true;
    const lowerTerm = term.toLowerCase();
    return (
      (instructor.nickname?.toLowerCase().includes(lowerTerm) ?? false) ||
      instructor.readable_id.toLowerCase().includes(lowerTerm) ||
      (instructor.first_name?.toLowerCase().includes(lowerTerm) ?? false) ||
      (instructor.last_name?.toLowerCase().includes(lowerTerm) ?? false)
    );
  }, []);

  const { displayedInstructors, firstMatchId } = useMemo(() => {
    const term = searchTerm.trim();
    
    if (!term) {
      return { displayedInstructors: instructors, firstMatchId: null };
    }

    // Find first match for highlighting
    const firstMatch = instructors.find((i) => matchesSearch(i, term));
    const firstMatchId = firstMatch?.id ?? null;

    // For "find" mode, show all instructors but we'll highlight the match
    if (searchMode === "find") {
      return { displayedInstructors: instructors, firstMatchId };
    }

    // For "narrow" and "smart" modes, filter the list
    const filtered = instructors.filter((i) => matchesSearch(i, term));
    return { displayedInstructors: filtered, firstMatchId };
  }, [instructors, searchTerm, searchMode, matchesSearch]);

  // Scroll to highlighted row when in "find" or "smart" mode
  useEffect(() => {
    if ((searchMode === "find" || searchMode === "smart") && firstMatchId && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [firstMatchId, searchMode]);

  const searchModeOptions = [
    {
      id: "narrow" as const,
      label: "Narrow",
      description: "Narrows the list to show only instructors matching your search. Non-matching instructors are hidden.",
    },
    {
      id: "find" as const,
      label: "Find",
      description: "Finds and scrolls to matching instructors while keeping the full list visible. Matches are highlighted.",
    },
    {
      id: "smart" as const,
      label: "Smart",
      description: "Combines both: narrows the list to matches AND highlights the best match for quick identification.",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-start gap-4 rounded-t-2xl bg-[rgb(16,37,37)] px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Instructors</h2>
          <button
            type="button"
            onClick={openNewForm}
            disabled={isFormOpen}
            className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Instructor
          </button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              disabled={isFormOpen}
              className="h-4 w-4 rounded border-white/20 bg-black/20"
            />
            Show inactive
          </label>
        </div>

        {/* Search and Filter Options */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative z-10 flex items-center">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              suppressHydrationWarning
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isFormOpen}
              placeholder="Search..."
              autoComplete="off"
              className="w-40 rounded-xl border border-white/15 bg-black/20 py-1.5 pl-9 pr-8 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {searchTerm && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearchTerm("");
                  searchInputRef.current?.focus();
                }}
                disabled={isFormOpen}
                className="absolute right-2 rounded p-0.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Options */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Filter Options:</span>
            {searchModeOptions.map((option) => (
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
                      // Keep focus on search input for immediate typing
                      searchInputRef.current?.focus();
                    }}
                    onMouseEnter={() => setPopoverOpen(option.id)}
                    onMouseLeave={() => setPopoverOpen(null)}
                    disabled={isFormOpen}
                    className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                      searchMode === option.id
                        ? "bg-[var(--brand)] text-white shadow-sm"
                        : "bg-black/20 text-foreground/70 hover:bg-black/30 hover:text-foreground"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {option.label}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="center"
                  sideOffset={8}
                  className="pointer-events-none w-56 rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                >
                  <PopoverArrow
                    width={12}
                    height={8}
                    className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                  />
                  {option.description}
                </PopoverContent>
              </Popover>
            ))}
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className="rounded-2xl border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-5 py-4 shadow-sm ring-1 ring-white/5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {editingId ? "Edit Instructor" : "New Instructor"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-foreground">
                  First Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/25 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                  placeholder="John"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  Last Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/25 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                  placeholder="Smith"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  Nickname
                  <span className="text-red-400"> *</span>
                  {validatingNickname && (
                    <span className="ml-2 text-xs text-foreground/50">checking...</span>
                  )}
                </label>
                {!editingId ? (
                  <div className="mt-1 flex items-center gap-2">
                    <PopoverSelect
                      value={selectedNicknameOptionValue}
                      options={nicknameOptions}
                      onChange={(next) => selectSuggestion(next)}
                      ariaLabel="Select a suggested nickname"
                      disabled={suggestingNicknames || nicknameOptions.length === 0}
                      placeholder={suggestingNicknames ? "Loading suggestions..." : "Suggested nicknames"}
                      className="w-[220px]"
                    />
                    <span className="text-xs text-muted-foreground">
                      {nicknameValidation?.exists
                        ? "Nickname taken — pick a suggestion"
                        : nicknameOptions.length
                          ? `${nicknameOptions.length} suggestions`
                          : "Enter first + last name for suggestions"}
                    </span>
                  </div>
                ) : null}
                <div className="relative">
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={(e) =>
                      setFormData((f) => ({
                        ...f,
                        nickname: sanitizeNicknameInput(e.target.value),
                      }))
                    }
                    disabled={!!editingId}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                      nicknameValidation?.exists
                        ? "border-red-400/50 bg-red-950/20 focus:ring-red-400/50"
                        : "border-white/25 bg-black/20 focus:ring-[var(--brand)]/50"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    placeholder="JOHNS"
                  />
                  {formData.nickname && !validatingNickname && nicknameValidation && !nicknameValidation.exists && (
                    <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-400" />
                  )}
                </div>

                {nicknameValidation?.exists ? (
                  <div className="mt-2 text-xs text-red-400">Nickname already in use for this branch.</div>
                ) : null}

                {instructorIdPreview ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Instructor ID: <span className="font-mono font-semibold text-foreground/90">{instructorIdPreview}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {isAdmin && editingId && (
              <div className="rounded-2xl border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-4 py-3 shadow-sm ring-1 ring-white/5">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">
                      Available in branches
                    </div>

                    {/* Tooltip on Manage */}
                    <Popover open={!sharePopoverOpen && shareManageTooltipOpen} onOpenChange={() => {}}>
                      <PopoverAnchor asChild>
                        <div className="inline-flex">
                          <Popover open={sharePopoverOpen} onOpenChange={setSharePopoverOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                disabled={shareDisabled || orgLoading || shareLoading || !orgBranches.length}
                                onMouseEnter={() => setShareManageTooltipOpen(true)}
                                onMouseLeave={() => setShareManageTooltipOpen(false)}
                                onFocus={() => setShareManageTooltipOpen(true)}
                                onBlur={() => setShareManageTooltipOpen(false)}
                                className="btn-pill inline-flex cursor-pointer items-center gap-2 bg-[var(--cta)] px-3 py-1.5 text-xs font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={(e) => {
                                  if (shareDisabled) {
                                    e.preventDefault();
                                    return;
                                  }
                                }}
                              >
                                Manage
                                <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--cta-foreground)]/90 ring-1 ring-black/10">
                                  {shareBranchIds.length}
                                </span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="end"
                              sideOffset={8}
                              className="w-[360px] rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-3 shadow-xl backdrop-blur-md"
                            >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-foreground">
                          {`Select branches${currentAssociationLabel ? ` (${currentAssociationLabel})` : ""}`}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSharePopoverOpen(false)}
                          className="rounded-full p-1 text-foreground/70 hover:bg-white/10 hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-2">
                        <input
                          type="text"
                          value={shareSearch}
                          onChange={(e) => setShareSearch(e.target.value)}
                          placeholder="Search branches..."
                          className="w-full rounded-xl border border-white/25 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                        />
                      </div>

                      {orgError ? (
                        <div className="mt-2 text-xs text-red-400">{orgError}</div>
                      ) : null}
                      {shareError ? (
                        <div className="mt-2 text-xs text-red-400">{shareError}</div>
                      ) : null}
                      {!homeBranchId ? (
                        <div className="mt-2 text-xs text-yellow-300">
                          This instructor has no home branch set; sharing is disabled.
                        </div>
                      ) : null}

                      <div className="mt-3 max-h-[260px] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-black/10">
                        {orgLoading ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            Loading branches…
                          </div>
                        ) : visibleOrgBranches.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No branches found.
                          </div>
                        ) : (
                          <div className="p-1">
                            {visibleOrgBranches.map((b) => {
                              const checked = shareBranchIds.includes(b.id);
                              const isHome = !!homeBranchId && b.id === homeBranchId;
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                          disabled={shareDisabled || !homeBranchId || isHome}
                                  onClick={() => {
                                            if (shareDisabled) return;
                                    setShareBranchIds((prev) => {
                                      const current = Array.isArray(prev) ? prev : [];
                                      const home = homeBranchId;
                                      if (!home) return current;
                                      if (b.id === home) return current;

                                      const next = current.includes(b.id)
                                        ? current.filter((x) => x !== b.id)
                                        : [...current, b.id];

                                      return next.includes(home) ? next : [home, ...next];
                                    });
                                  }}
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                                    isHome
                                      ? "cursor-not-allowed bg-white/5 text-foreground/70"
                                      : shareDisabled || !homeBranchId
                                        ? "cursor-not-allowed text-foreground/50"
                                        : "cursor-pointer text-foreground hover:bg-[var(--brand-strong)]/50"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                                        checked
                                          ? "border-[var(--cta)] bg-[var(--cta)] text-[var(--cta-foreground)]"
                                          : "border-white/25 bg-black/20"
                                      }`}
                                      aria-hidden
                                    >
                                      {checked ? <Check className="h-3 w-3" /> : null}
                                    </span>
                                    <span className="truncate">
                                      {(b.short_code ?? b.code).toUpperCase()} - {b.name}
                                    </span>
                                  </div>
                                  {isHome ? (
                                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                                      Home
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </PopoverAnchor>
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
                        Instructors can be shared across branches.
                      </PopoverContent>
                    </Popover>
                </div>

                {/* Shared branches summary (includes current branch) */}
                <div className="mt-2 rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {sharedBranchSummary.map((r) => (
                      <div
                        key={r.id}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold text-foreground whitespace-nowrap"
                      >
                        <span>{r.name}</span>
                        {r.isCurrent ? (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                            Current
                          </span>
                        ) : null}
                        {r.isHome ? (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                            Home
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            )}

            {editingId && (
            <div className="rounded-2xl border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-4 py-3 shadow-sm ring-1 ring-white/5">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">Instructor availability</div>
                  <Popover
                    open={!!editingId && availabilityEditTooltipOpen}
                    onOpenChange={() => {}}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={!editingId}
                        onClick={() => setAvailabilityModalOpen(true)}
                        onMouseEnter={() => !!editingId && setAvailabilityEditTooltipOpen(true)}
                        onMouseLeave={() => setAvailabilityEditTooltipOpen(false)}
                        onFocus={() => !!editingId && setAvailabilityEditTooltipOpen(true)}
                        onBlur={() => setAvailabilityEditTooltipOpen(false)}
                        className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-3 py-1.5 text-xs font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Edit
                        <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--cta-foreground)]/90 ring-1 ring-black/10">
                          {availabilitySlotCount}
                        </span>
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
                      add an instructors availability for scheduling
                    </PopoverContent>
                  </Popover>
                  <MonthYearPicker
                    value={availabilityMonth}
                    onChange={setAvailabilityMonth}
                    ariaLabel="Availability month"
                    className="min-w-[200px]"
                    highlightedMonths={availabilityMonthsWithRules}
                  />
                </div>

                {availabilityError ? (
                  <div className="text-sm text-red-400">{availabilityError}</div>
                ) : null}

                {!editingId ? (
                  <div className="text-sm text-muted-foreground">
                    Save the instructor first to set month-based availability windows.
                  </div>
                ) : availabilityLoading ? (
                  <div className="text-sm text-muted-foreground">Loading availability…</div>
                ) : availabilitySummary.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No availability windows set for {availabilityMonth}. (No enforcement — assumed available.)
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {availabilitySummary.flatMap((d) =>
                        d.windows.map((w) => (
                          <div
                            key={`${d.day}-${w}`}
                            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold text-foreground whitespace-nowrap"
                          >
                            <span className="text-muted-foreground">{d.day}</span>
                            <span>{w}</span>
                          </div>
                        )),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}

            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}

            <div className="flex justify-start gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="btn-pill border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground hover:bg-black/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={disableSave}
                className="btn-pill bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && saveResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  className={`text-lg font-semibold ${
                    saveResult.status === "success" ? "text-[var(--cta)]" : "text-red-300"
                  }`}
                >
                  {saveResult.status === "success" ? "Saved" : "Unable to save"}
                </h3>
                <p className="mt-1 text-sm text-foreground/80">{saveResult.message}</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={handleSaveModalClose}
                className="rounded-full p-1 text-foreground/70 hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {saveResult.status === "success" && saveResult.instructor ? (
              <div className="mt-4 space-y-1 rounded-xl border border-white/10 bg-black/10 p-3 text-sm text-foreground/90">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-semibold">
                    {saveResult.instructor.first_name} {saveResult.instructor.last_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nickname</span>
                  <span className="font-mono font-semibold">{saveResult.instructor.nickname}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Instructor ID</span>
                  <span className="font-mono font-semibold">{saveResult.instructor.readable_id}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleSaveModalClose}
                className="btn-pill bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {availabilityModalOpen && editingId ? (
        <InstructorAvailabilityModal
          isOpen={availabilityModalOpen}
          onClose={() => setAvailabilityModalOpen(false)}
          branchId={branch.id}
          instructorId={editingId}
          instructorLabel={instructorLabelForAvailability}
          initialMonth={availabilityMonth}
          onUpdated={handleAvailabilityUpdated}
        />
      ) : null}

      {/* Content */}
      <div className="p-5">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading instructors...</div>
        ) : error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : instructors.length === 0 ? (
          <div className="text-sm text-muted-foreground">No instructors found.</div>
        ) : displayedInstructors.length === 0 ? (
          <div className="text-sm text-muted-foreground">No instructors match your search.</div>
        ) : (
          <div className="relative">
            <div
              ref={tableContainerRef}
              onScroll={markScrolling}
              onWheel={markScrolling}
              onTouchMove={markScrolling}
              aria-disabled={isFormOpen}
              data-testid="instructors-table-container"
              className={`report-scroll max-h-96 overflow-auto rounded-lg border border-border transition-opacity ${
                isFormOpen ? "opacity-50" : ""
              }`}
            >
              <table className="min-w-full divide-y divide-border text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Name</th>
                  <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Nickname</th>
                  <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Instructor ID</th>
                  <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Status</th>
                  {isAdmin ? (
                    <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">
                      Scheduling Availability
                    </th>
                  ) : null}
                  <th className="bg-[rgb(16,37,37)] px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedInstructors.map((instructor) => {
                  const isHighlighted = (searchMode === "find" || searchMode === "smart") && 
                    instructor.id === firstMatchId && 
                    searchTerm.trim() !== "";
                  
                  return (
                    <tr
                      key={instructor.id}
                      ref={isHighlighted ? highlightedRowRef : null}
                      onClick={(e) => {
                        if (isFormOpen) return;
                        const target = e.target as HTMLElement | null;
                        // Avoid triggering row-edit when user clicks interactive controls within the row.
                        if (target?.closest("button, a, input, select, textarea, [role='button']")) return;
                        openEditForm(instructor);
                      }}
                      className={`transition-colors ${
                        isHighlighted
                          ? "bg-[var(--brand)]/20 ring-2 ring-[var(--brand)]/50 ring-inset"
                          : "hover:bg-muted/50"
                      } ${!instructor.is_active ? "opacity-50" : ""} cursor-pointer`}
                    >
                      <td className="px-4 py-2 text-foreground">
                        {instructor.first_name} {instructor.last_name}
                      </td>
                      <td className="px-4 py-2 text-foreground">
                        {instructor.nickname || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-foreground/90">
                        {instructor.readable_id}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            instructor.is_active
                              ? "bg-green-500/20 text-green-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {instructor.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {isAdmin ? (
                        <td className="px-4 py-2">
                          {Array.isArray(instructor.available_branches) &&
                          instructor.available_branches.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {instructor.available_branches.map((link) => {
                                const orgLabel = getBranchPillLabel(link.branch_id);
                                const pillLabel =
                                  orgLabel !== "—"
                                    ? orgLabel
                                    : getFallbackBranchPillLabel(instructor, link.branch_id);
                                const branchName = getBranchName(link.branch_id);
                                const tooltipOpen =
                                  branchPillTooltip?.instructorId === instructor.id &&
                                  branchPillTooltip?.branchId === link.branch_id;

                                return (
                                  <Popover key={link.branch_id} open={tooltipOpen} onOpenChange={() => {}}>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        onMouseEnter={() =>
                                          !isScrollingRef.current &&
                                          setBranchPillTooltip({
                                            instructorId: instructor.id,
                                            branchId: link.branch_id,
                                          })
                                        }
                                        onMouseLeave={() => setBranchPillTooltip(null)}
                                        onFocus={() =>
                                          !isScrollingRef.current &&
                                          setBranchPillTooltip({
                                            instructorId: instructor.id,
                                            branchId: link.branch_id,
                                          })
                                        }
                                        onBlur={() => setBranchPillTooltip(null)}
                                        className={`btn-pill inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm ring-1 transition ${
                                          link.is_primary
                                            ? "border-orange-400/70 bg-black/20 text-foreground/80 ring-white/5 hover:bg-black/30 hover:ring-white/10"
                                            : "border-white/40 bg-black/20 text-foreground/80 ring-white/5 hover:bg-black/30 hover:ring-white/10"
                                        }`}
                                      >
                                        {pillLabel}
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
                                      {branchName}
                                    </PopoverContent>
                                  </Popover>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(instructor)}
                            className="rounded-lg p-1.5 hover:bg-white/10"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(instructor)}
                            className={`rounded-lg px-2 py-1 text-xs font-medium ${
                              instructor.is_active
                                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                            }`}
                          >
                            {instructor.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {isFormOpen ? (
              <div
                className="absolute inset-0 cursor-not-allowed"
                data-testid="instructors-table-disabled-overlay"
                aria-hidden="true"
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}


"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Mail, Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, Pencil, PauseCircle, PlayCircle, Shield, User, KeyRound, RefreshCcw } from "lucide-react";
import { useThemeSettings } from "@/components/theme-settings-provider";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Recipient = {
  id: string;
  branch_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  on_hold: boolean;
  recipient_type: "Administrator" | "Branch" | "Member" | "Normal";
  receives_reports?: boolean;
  created_at: string;
  auth_user_id?: string | null;
  is_active?: boolean;
  needs_password_setup?: boolean;
  last_login_at?: string | null;
};

type FormData = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  recipient_type: "Administrator" | "Branch" | "Member";
  receives_reports: boolean;
};

const emptyForm: FormData = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  recipient_type: "Branch",
  receives_reports: false,
};

type Alliance = { id: string; code: string; name: string };
type Association = { id: string; code: string; name: string; alliance_id: string | null };
type OrgBranch = { id: string; code: string; short_code: string | null; name: string; association_id: string };

function formatNameWithYMCA(name: string): string {
  // Preserve stored casing except for YMCA/YMCAs which must be canonical.
  return name.replace(/\bymca(s?)\b/gi, (_, s: string) => (s ? "YMCAs" : "YMCA"));
}

function formatDisplayCode(code: string): string {
  // If codes are stored lowercase (e.g., seeded data), display them uppercase for consistency.
  return code === code.toLowerCase() ? code.toUpperCase() : code;
}

function formatDisplayName(name: string): string {
  // If the stored name is entirely lowercase (common in seeded data), present it in Title Case.
  // Otherwise, preserve stored casing (only canonicalizing YMCA/YMCAs).
  const isAllLower = name === name.toLowerCase();
  if (!isAllLower) return formatNameWithYMCA(name);

  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "ymca") return "YMCA";
      if (lower === "ymcas") return "YMCAs";
      if (/^\([a-z0-9]+\)$/.test(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\(\d{3}\)\s\d{3}-\d{4}(?:\s?ext\s?\d{1,5})?$/;
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

// Phone mask formatting
function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 15); // area3 + first3 + last4 + ext5
  const area = digits.slice(0, 3);
  const first = digits.slice(3, 6);
  const second = digits.slice(6, 10);
  const ext = digits.slice(10);
  let out = "";
  if (area) out += `(${area}`;
  if (area.length === 3) out += `)`;
  if (first) out += ` ${first}`;
  if (second) out += `-${second}`;
  if (ext) out += ` ext ${ext}`;
  return out.trim();
}

// US States for dropdown
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

function formatLastLogin(value: string | null | undefined): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString();
}

function ActionIconButton({
  tooltip,
  ariaLabel,
  onClick,
  disabled,
  allowTooltipWhenDisabled,
  className,
  children,
}: {
  tooltip: string;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  allowTooltipWhenDisabled?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const canShowTooltip = !disabled || allowTooltipWhenDisabled;
  const cursorClass = disabled ? "cursor-not-allowed" : "cursor-pointer";

  return (
    <Popover open={canShowTooltip && tooltipOpen} onOpenChange={() => {}}>
      <PopoverTrigger asChild>
        <span
          className="inline-flex"
          onMouseEnter={() => canShowTooltip && setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
          onFocus={() => canShowTooltip && setTooltipOpen(true)}
          onBlur={() => setTooltipOpen(false)}
        >
          <button
            type="button"
            aria-label={ariaLabel}
            disabled={!!disabled}
            onClick={onClick}
            className={`${className} ${cursorClass}`}
          >
            {children}
          </button>
        </span>
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
        {tooltip}
      </PopoverContent>
    </Popover>
  );
}

function MemberReportPill({ receivesReports }: { receivesReports: boolean }) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const label = receivesReports ? "Yes Report" : "No Report";

  return (
    <Popover open={tooltipOpen} onOpenChange={() => {}}>
      <PopoverTrigger asChild>
        <span
          tabIndex={0}
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
          onFocus={() => setTooltipOpen(true)}
          onBlur={() => setTooltipOpen(false)}
          className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-100"
        >
          {label}
        </span>
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
        To change select edit
      </PopoverContent>
    </Popover>
  );
}

function getStatusBadge(recipient: Recipient): { label: string; className: string } {
  if (recipient.is_active === false) {
    return { label: "Inactive", className: "bg-red-500/20 text-red-300" };
  }
  if (recipient.needs_password_setup) {
    return { label: "Pending Password Change", className: "bg-amber-500/20 text-amber-200" };
  }
  return { label: "Active", className: "bg-green-500/20 text-green-300" };
}

type DropdownOption = { id: string; code: string; name: string };

function Dropdown({
  label,
  valueId,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  valueId: string | null;
  options: DropdownOption[];
  placeholder: string;
  onChange: (nextId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === valueId) ?? null;
  const frameClass = selected
    ? "border-white/25 ring-white/12 hover:ring-white/20"
    : "border-white/12 ring-white/7 hover:ring-white/12";
  const orderedOptions = selected
    ? [selected, ...options.filter((o) => o.id !== selected.id)]
    : options;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-foreground/80">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!!disabled}
            aria-expanded={open}
            className={`btn-pill flex min-w-[260px] items-center justify-between gap-2 border bg-card/60 px-4 py-2 text-sm shadow-sm ring-1 transition hover:bg-card disabled:cursor-not-allowed disabled:opacity-60 ${frameClass}`}
          >
            <span className="truncate">
              {selected ? `${selected.code} - ${selected.name}` : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[340px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
        >
          <div className="max-h-[300px] overflow-y-auto">
            {orderedOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-white/80">No options</div>
            ) : (
              orderedOptions.map((opt) => {
                const isSelected = opt.id === valueId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                      isSelected
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "text-foreground hover:bg-[var(--brand-strong)]/50"
                    }`}
                  >
                    {opt.code} - {opt.name}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function RecipientsTab() {
  const { branch } = useThemeSettings();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Organization hierarchy for cascade selection
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [branches, setBranches] = useState<OrgBranch[]>([]);
  const [selectedAllianceId, setSelectedAllianceId] = useState<string | null>(null);
  const [selectedAssociationId, setSelectedAssociationId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(branch.id || null);
  const [selectionInitialized, setSelectionInitialized] = useState(false);

  // Form state
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [formOnHold, setFormOnHold] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [holdUpdatingId, setHoldUpdatingId] = useState<string | null>(null);

  // Expanded rows for mobile view
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Recipient type dropdown
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  // (no-op) footer text is rendered directly; avoid side-effect logging here.

  // Reset password modal
  const [resettingRecipient, setResettingRecipient] = useState<Recipient | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const loadOrg = useCallback(async () => {
    setOrgLoading(true);
    setOrgError(null);
    try {
      const res = await fetch("/api/maintenance/organization");
      if (!res.ok) throw new Error("Failed to load organization hierarchy");
      const json = await res.json();
      setAlliances(json.alliances ?? []);
      setAssociations(json.associations ?? []);
      setBranches(json.branches ?? []);
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : "Failed to load organization hierarchy");
    } finally {
      setOrgLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  // Default cascade selection ONCE (based on currently selected branch from theme settings)
  useEffect(() => {
    if (orgLoading) return;
    if (selectionInitialized) return;

    const initialBranchId = branch.id || selectedBranchId;
    if (!initialBranchId) {
      setSelectionInitialized(true);
      return;
    }

    const b = branches.find((x) => x.id === initialBranchId);
    if (!b) {
      setSelectionInitialized(true);
      return;
    }

    const assoc = associations.find((a) => a.id === b.association_id) ?? null;
    const allianceId = assoc?.alliance_id ?? null;

    setSelectedBranchId(b.id);
    setSelectedAssociationId(assoc?.id ?? null);
    setSelectedAllianceId(allianceId);
    setSelectionInitialized(true);
  }, [orgLoading, selectionInitialized, branches, associations, branch.id, selectedBranchId]);

  const allianceOptions: DropdownOption[] = alliances.map((a) => ({
    id: a.id,
    code: formatDisplayCode(a.code),
    name: formatDisplayName(a.name),
  }));
  const associationOptions: DropdownOption[] = associations
    .filter((a) => (selectedAllianceId ? a.alliance_id === selectedAllianceId : true))
    .map((a) => ({ id: a.id, code: formatDisplayCode(a.code), name: formatDisplayName(a.name) }));
  const branchOptions: DropdownOption[] = branches
    .filter((b) => (selectedAssociationId ? b.association_id === selectedAssociationId : true))
    .map((b) => ({
      id: b.id,
      code: formatDisplayCode(b.short_code || b.code),
      name: formatDisplayName(b.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const loadRecipients = useCallback(async () => {
    if (!selectedBranchId) {
      setRecipients([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maintenance/recipients?branch_id=${selectedBranchId}`);
      if (!res.ok) throw new Error("Failed to load recipients");
      const data = await res.json();
      setRecipients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {};

    // Email is required
    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!EMAIL_REGEX.test(formData.email.trim())) {
      errors.email = "Invalid email format";
    }

    // Phone validation (optional but must match format if provided)
    if (formData.phone && !PHONE_REGEX.test(formData.phone.trim())) {
      errors.phone = "Use format (123) 456-7890 ext 12345";
    }

    // Zip validation (optional but must match format if provided)
    if (formData.zip_code && !ZIP_REGEX.test(formData.zip_code.trim())) {
      errors.zip_code = "Use format 12345 or 12345-6789";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      setFormError("Please fix the validation errors below");
      return;
    }

    if (!selectedBranchId) {
      setFormError("Please select Alliance, Association, and Branch first");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const method = editingId ? "PUT" : "POST";
      const payload: Record<string, unknown> = {
        branch_id: selectedBranchId,
        email: formData.email.trim(),
        first_name: formData.first_name.trim() || undefined,
        last_name: formData.last_name.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        zip_code: formData.zip_code.trim() || undefined,
        recipient_type: formData.recipient_type,
        receives_reports: formData.recipient_type === "Member" ? formData.receives_reports : false,
      };

      if (editingId) {
        payload.id = editingId;
        payload.on_hold = formOnHold;
      } else {
        // Branch/Admin recipients get a login (OTP onboarding). Members are email-only.
        if (formData.recipient_type !== "Member") {
        payload.create_auth_user = true;
        }
      }

      const res = await fetch("/api/maintenance/recipients", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save recipient");
      }

      setFormData(emptyForm);
      setFormOnHold(false);
      setEditingId(null);
      setValidationErrors({});
      setShowForm(false);
      await loadRecipients();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHold = async (recipient: Recipient) => {
    setHoldUpdatingId(recipient.id);
    try {
      const res = await fetch("/api/maintenance/recipients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recipient.id, on_hold: !recipient.on_hold }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update hold status");
      }

      await loadRecipients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update hold status");
    } finally {
      setHoldUpdatingId(null);
    }
  };

  const startEdit = (recipient: Recipient) => {
    setEditingId(recipient.id);
    setShowForm(true);
    const normalizedType =
      recipient.recipient_type === "Normal" ? "Branch" : recipient.recipient_type;
    setFormData({
      email: recipient.email || "",
      first_name: recipient.first_name || "",
      last_name: recipient.last_name || "",
      phone: recipient.phone || "",
      address: recipient.address || "",
      city: recipient.city || "",
      state: recipient.state || "",
      zip_code: recipient.zip_code || "",
      recipient_type: normalizedType === "Administrator" || normalizedType === "Member" ? normalizedType : "Branch",
      receives_reports: normalizedType === "Member" ? !!recipient.receives_reports : false,
    });
    setFormOnHold(!!recipient.on_hold);
    setFormError(null);
    setValidationErrors({});
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/maintenance/recipients?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");
      
      setDeletingId(null);
      await loadRecipients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleDeactivate = async (recipient: Recipient) => {
    if (!recipient.auth_user_id) return;
    const ok = window.confirm(`Deactivate ${recipient.email}? They will not be able to sign in.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/maintenance/recipients/${recipient.id}/deactivate`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to deactivate");
      }
      await loadRecipients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate");
    }
  };

  const handleActivate = async (recipient: Recipient) => {
    if (!recipient.auth_user_id) return;
    const ok = window.confirm(`Reactivate ${recipient.email}?`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/maintenance/recipients/${recipient.id}/activate`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reactivate");
      }
      await loadRecipients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reactivate");
    }
  };

  const openResetPassword = (recipient: Recipient) => {
    if (!recipient.auth_user_id) return;
    setResettingRecipient(recipient);
    setResetError(null);
  };

  const submitResetPassword = async () => {
    if (!resettingRecipient) return;
    const ok = window.confirm(
      `Send password reset instructions to ${resettingRecipient.email}? They will sign in with a code (OTP) and create a new password.`
    );
    if (!ok) return;

    setResetSaving(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/maintenance/recipients/${resettingRecipient.id}/reset-password`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset password");
      }
      setResettingRecipient(null);
      await loadRecipients();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setResetSaving(false);
    }
  };

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((f) => ({ ...f, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((v) => ({ ...v, [field]: undefined }));
    }
  };

  const getDisplayName = (r: Recipient) => {
    if (r.first_name || r.last_name) {
      return [r.first_name, r.last_name].filter(Boolean).join(" ");
    }
    return null;
  };

  const getDisplayAddress = (r: Recipient) => {
    const parts = [r.address, r.city, r.state, r.zip_code].filter(Boolean);
    if (parts.length === 0) return null;
    if (r.city && r.state) {
      return `${r.address ? r.address + ", " : ""}${r.city}, ${r.state}${r.zip_code ? " " + r.zip_code : ""}`;
    }
    return parts.join(", ");
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl bg-muted px-5 py-3">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-[var(--brand)]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold">Recipients</h2>
              <button
                type="button"
                onClick={() => {
                  if (showForm) {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData(emptyForm);
                    setFormOnHold(false);
                    setValidationErrors({});
                    setFormError(null);
                  } else {
                    setShowForm(true);
                    setEditingId(null);
                  }
                }}
                disabled={!selectedBranchId && !showForm}
                className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {showForm ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Hide Form
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4" />
                    Add Member
                  </>
                )}
              </button>
            </div>
            <p className="mt-[5px] text-xs text-muted-foreground">
              Select a branch (Alliance → Association → Branch) to assign to a new Branch Manager. Members only added for reporting purposes.
            </p>
          </div>
        </div>
      </div>

      {/* Branch selection */}
      <div className="border-b border-border bg-card/50 px-5 py-4">
        {orgLoading ? (
          <div className="text-sm text-muted-foreground">Loading organization hierarchy...</div>
        ) : orgError ? (
          <div className="text-sm text-red-400">{orgError}</div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Dropdown
                label="Alliance"
                valueId={selectedAllianceId}
                options={allianceOptions}
                placeholder="Select Alliance..."
                onChange={(id) => {
                  setSelectedAllianceId(id);
                  setSelectedAssociationId(null);
                  setSelectedBranchId(null);
                }}
              />
              <Dropdown
                label="Association"
                valueId={selectedAssociationId}
                options={associationOptions}
                placeholder="Select Association..."
                disabled={!selectedAllianceId}
                onChange={(id) => {
                  setSelectedAssociationId(id);
                  setSelectedBranchId(null);
                }}
              />
              <Dropdown
                label="Branch"
                valueId={selectedBranchId}
                options={branchOptions}
                placeholder="Select Branch..."
                disabled={!selectedAssociationId}
                onChange={(id) => {
                  setSelectedBranchId(id);
                }}
              />
            </div>
            {selectedBranchId && (
              <p className="text-xs text-muted-foreground">
                Showing recipients for selected branch.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="border-b border-border bg-card/50 px-5 py-4">
          {editingId && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Editing existing recipient ({formData.email || "email"})
            </div>
          )}
          <div className="space-y-4">
            {/* Row 1: Email, Phone, and Recipient Type */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="recipient@example.com"
                  className={`w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                    validationErrors.email
                      ? "border-red-500/50 bg-red-950/20 focus:ring-red-500/50"
                      : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                  }`}
                />
                {validationErrors.email && (
                  <p className="mt-1 text-xs text-red-400">{validationErrors.email}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  Phone <span className="text-foreground/50">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField("phone", formatPhoneInput(e.target.value))}
                  placeholder="(123) 456-7890 ext 12345"
                  className={`w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                    validationErrors.phone
                      ? "border-red-500/50 bg-red-950/20 focus:ring-red-500/50"
                      : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                  }`}
                />
                {validationErrors.phone && (
                  <p className="mt-1 text-xs text-red-400">{validationErrors.phone}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  Recipient Type
                </label>
                <Popover open={typeDropdownOpen} onOpenChange={setTypeDropdownOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground transition hover:bg-black/30"
                    >
                      <span className="flex items-center gap-2">
                        {formData.recipient_type === "Administrator" ? (
                          <Shield className="h-4 w-4 text-purple-400" />
                        ) : formData.recipient_type === "Member" ? (
                          <Mail className="h-4 w-4 text-emerald-300" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                        {formData.recipient_type}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    sideOffset={4}
                    className="w-[200px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        updateField("recipient_type", "Branch");
                        updateField("receives_reports", false);
                        setTypeDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        formData.recipient_type === "Branch"
                          ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                          : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                      }`}
                    >
                      <User className="h-4 w-4" />
                      Branch
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateField("recipient_type", "Member");
                        setTypeDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        formData.recipient_type === "Member"
                          ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                          : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                      }`}
                    >
                      <Mail className="h-4 w-4" />
                      Member
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateField("recipient_type", "Administrator");
                        updateField("receives_reports", false);
                        setTypeDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        formData.recipient_type === "Administrator"
                          ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                          : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                      }`}
                    >
                      <Shield className="h-4 w-4" />
                      Administrator
                    </button>
                  </PopoverContent>
                </Popover>
                <p className="mt-1 text-xs text-foreground/50">
                  {formData.recipient_type === "Administrator"
                    ? "Admins receive system error notifications"
                    : formData.recipient_type === "Member"
                      ? "Members are email-only contacts (no login)"
                      : "Branch users can sign in and manage their branch"}
                </p>
              </div>
            </div>

            {/* Member-only: report opt-in */}
            {formData.recipient_type === "Member" && (
              <label
                htmlFor="receives_reports"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <input
                  id="receives_reports"
                  type="checkbox"
                  checked={!!formData.receives_reports}
                  onChange={(e) => updateField("receives_reports", e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--cta)]"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">Receives reports</div>
                  <div className="text-xs text-foreground/60">
                    If checked, this email will appear in the report Email To/CC/BCC recipient lists.
                  </div>
                </div>
              </label>
            )}

            {/* Row 2: First Name and Last Name */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  First Name <span className="text-foreground/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => updateField("first_name", e.target.value)}
                  placeholder="First name"
                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  Last Name <span className="text-foreground/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => updateField("last_name", e.target.value)}
                  placeholder="Last name"
                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                />
              </div>
            </div>

            {/* Row 3: Address */}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/90">
                Address <span className="text-foreground/50">(optional)</span>
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Street address"
                className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
              />
            </div>

            {/* Row 4: City, State, Zip */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  City <span className="text-foreground/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="City"
                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  State <span className="text-foreground/50">(optional)</span>
                </label>
                <select
                  value={formData.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                >
                  <option value="">Select state</option>
                  {US_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  ZIP Code <span className="text-foreground/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.zip_code}
                  onChange={(e) => updateField("zip_code", e.target.value.replace(/[^\d-]/g, "").slice(0, 10))}
                  placeholder="12345"
                  maxLength={10}
                  className={`w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                    validationErrors.zip_code
                      ? "border-red-500/50 bg-red-950/20 focus:ring-red-500/50"
                      : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                  }`}
                />
                {validationErrors.zip_code && (
                  <p className="mt-1 text-xs text-red-400">{validationErrors.zip_code}</p>
                )}
              </div>
            </div>

            {/* Form Error and Actions */}
            {formError && (
              <p className="flex items-center gap-1 text-sm text-red-400">
                <AlertCircle className="h-4 w-4" />
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData(emptyForm);
                  setFormOnHold(false);
                  setValidationErrors({});
                  setFormError(null);
                }}
                className="btn-pill border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground hover:bg-black/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {saving ? "Saving..." : editingId ? "Save Changes" : "Create & Email Welcome"}
              </button>
            </div>
            {editingId && (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                <input
                  id="on-hold"
                  type="checkbox"
                  checked={formOnHold}
                  onChange={(e) => setFormOnHold(e.target.checked)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                <label htmlFor="on-hold" className="text-foreground/90">
                  Put this recipient on hold (they will not receive schedule emails)
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {/* Reset password modal */}
        {resettingRecipient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">Reset Password</h3>
                  <p className="text-xs text-muted-foreground">
                    This will email a sign-in link (OTP) to {resettingRecipient.email} and require them to create a new password.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !resetSaving && setResettingRecipient(null)}
                  className="btn-pill border border-white/10 bg-black/20 px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-black/30 disabled:opacity-50"
                  disabled={resetSaving}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {resetError && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-300">
                    <AlertCircle className="h-4 w-4" />
                    {resetError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={submitResetPassword}
                  disabled={resetSaving}
                  className="btn-pill inline-flex w-full items-center justify-center gap-2 bg-[var(--cta)] px-3 py-2 text-sm font-semibold text-[var(--cta-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {resetSaving ? "Sending..." : "Email Reset Link"}
                </button>
              </div>
            </div>
          </div>
        )}

        {!selectedBranchId ? (
          <div className="rounded-xl border border-dashed border-white/20 bg-black/10 p-6 text-center">
            <p className="text-sm text-muted-foreground">Select an Alliance, Association, and Branch above to load recipients.</p>
          </div>
        ) : loading ? (
          <div className="text-sm text-muted-foreground">Loading recipients...</div>
        ) : error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : recipients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/20 bg-black/10 p-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No additional recipients added yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Select a branch above, then click &quot;Add Member&quot; to add a Branch Manager or a Member for reporting.
            </p>
          </div>
        ) : (
          <div className="report-scroll max-h-96 overflow-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/60 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Email</th>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Type</th>
                  <th className="hidden px-4 py-2 text-left font-semibold md:table-cell">Last Login</th>
                  <th className="hidden px-4 py-2 text-left font-semibold md:table-cell">Phone</th>
                  <th className="hidden px-4 py-2 text-left font-semibold lg:table-cell">Location</th>
                  <th className="px-4 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recipients.map((recipient) => {
                  const displayName = getDisplayName(recipient);
                  const displayAddress = getDisplayAddress(recipient);
                  const isExpanded = expandedId === recipient.id;
                  const status = getStatusBadge(recipient);
                  const hasLogin = !!recipient.auth_user_id;

                  return (
                    <Fragment key={recipient.id}>
                      <tr
                        className="hover:bg-muted/50 transition-colors cursor-pointer md:cursor-default"
                        onClick={() => setExpandedId(isExpanded ? null : recipient.id)}
                      >
                        <td className="px-4 py-2 text-foreground">
                          <div className="flex items-center gap-2">
                            <span className="md:hidden">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={recipient.on_hold ? "text-muted-foreground line-through" : ""}>
                                {recipient.email}
                              </span>
                              {recipient.on_hold && (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                                  On hold
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-foreground">
                          {displayName || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {(() => {
                            const type =
                              recipient.recipient_type === "Normal" ? "Branch" : recipient.recipient_type;
                            if (type === "Administrator") {
                              return (
                            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                              Admin
                            </span>
                              );
                            }
                            if (type === "Member") {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                                  Member
                                  <MemberReportPill receivesReports={!!recipient.receives_reports} />
                                </span>
                              );
                            }
                            return (
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/80">
                                Branch
                              </span>
                            );
                          })()}
                        </td>
                        <td className="hidden px-4 py-2 text-foreground md:table-cell">
                          <span className="text-xs text-foreground/90">{formatLastLogin(recipient.last_login_at)}</span>
                        </td>
                        <td className="hidden px-4 py-2 text-foreground md:table-cell">
                          {recipient.phone || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="hidden px-4 py-2 text-foreground lg:table-cell">
                          {displayAddress || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <ActionIconButton
                              tooltip="Edit member"
                              ariaLabel="Edit member"
                              onClick={() => startEdit(recipient)}
                              className="rounded-lg p-1.5 text-[var(--brand)] hover:bg-[var(--brand-soft)]/30"
                            >
                              <Pencil className="h-4 w-4" />
                            </ActionIconButton>

                            <ActionIconButton
                              tooltip={hasLogin ? "Reset member password" : "No login account linked"}
                              ariaLabel="Reset member password"
                              onClick={() => openResetPassword(recipient)}
                              disabled={!hasLogin}
                              allowTooltipWhenDisabled={!hasLogin}
                              className="rounded-lg p-1.5 text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
                            >
                              <KeyRound className="h-4 w-4" />
                            </ActionIconButton>
                            {hasLogin ? (
                              recipient.is_active === false ? (
                                <ActionIconButton
                                  tooltip="Reactivate member account"
                                  ariaLabel="Reactivate member account"
                                  onClick={() => handleActivate(recipient)}
                                  className="rounded-lg p-1.5 text-green-300 hover:bg-green-500/20"
                                >
                                  <PlayCircle className="h-4 w-4" />
                                </ActionIconButton>
                              ) : (
                                <ActionIconButton
                                  tooltip="Deactivate member account"
                                  ariaLabel="Deactivate member account"
                                  onClick={() => handleDeactivate(recipient)}
                                  className="rounded-lg p-1.5 text-red-300 hover:bg-red-500/20"
                                >
                                  <PauseCircle className="h-4 w-4" />
                                </ActionIconButton>
                              )
                            ) : null}
                            <ActionIconButton
                              tooltip={recipient.on_hold ? "Resume member" : "Put member on hold"}
                              ariaLabel={recipient.on_hold ? "Resume member" : "Put member on hold"}
                              onClick={() => handleToggleHold(recipient)}
                              disabled={holdUpdatingId === recipient.id}
                              className="rounded-lg p-1.5 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                            >
                              {recipient.on_hold ? (
                                <PlayCircle className="h-4 w-4" />
                              ) : (
                                <PauseCircle className="h-4 w-4" />
                              )}
                            </ActionIconButton>
                            {deletingId === recipient.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-foreground/70">Delete?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(recipient.id)}
                                  className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30"
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(null)}
                                  className="rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-foreground hover:bg-white/20"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <ActionIconButton
                                tooltip="Remove member"
                                ariaLabel="Remove member"
                                onClick={() => setDeletingId(recipient.id)}
                                className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/20"
                              >
                                <Trash2 className="h-4 w-4" />
                              </ActionIconButton>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Mobile expanded details */}
                      {isExpanded && (
                        <tr key={`${recipient.id}-details`} className="md:hidden bg-muted/30">
                          <td colSpan={8} className="px-4 py-2">
                            <div className="space-y-1 text-sm">
                              <div>
                                <span className="text-muted-foreground">Status:</span>{" "}
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>
                                  {status.label}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Last login:</span>{" "}
                                {formatLastLogin(recipient.last_login_at)}
                              </div>
                              {recipient.phone && (
                                <div>
                                  <span className="text-muted-foreground">Phone:</span>{" "}
                                  {recipient.phone}
                                </div>
                              )}
                              {displayAddress && (
                                <div>
                                  <span className="text-muted-foreground">Location:</span>{" "}
                                  {displayAddress}
                                </div>
                              )}
                              {!recipient.phone && !displayAddress && (
                                <div className="text-muted-foreground">No additional details</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {recipients.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {recipients.length} member{recipients.length !== 1 ? "s" : ""} loaded for the selected branch.
          </p>
        )}
      </div>
    </div>
  );
}

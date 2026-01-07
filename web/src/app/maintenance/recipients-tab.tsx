"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Mail, Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, Pencil, PauseCircle, PlayCircle } from "lucide-react";
import { useThemeSettings } from "@/components/theme-settings-provider";

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
  recipient_type: "Administrator" | "Normal";
  created_at: string;
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
  recipient_type: "Administrator" | "Normal";
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
  recipient_type: "Normal",
};

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\(\d{4}\)\s\d{3}-\d{4}(?:\s?ext\s?\d{1,5})?$/;
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

// Phone mask formatting
function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16); // area4 + first3 + last4 + ext5
  const area = digits.slice(0, 4);
  const first = digits.slice(4, 7);
  const second = digits.slice(7, 11);
  const ext = digits.slice(11);
  let out = "";
  if (area) out += `(${area}`;
  if (area.length === 4) out += `)`;
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

export function RecipientsTab() {
  const { branch } = useThemeSettings();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const loadRecipients = useCallback(async () => {
    if (!branch.id) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maintenance/recipients?branch_id=${branch.id}`);
      if (!res.ok) throw new Error("Failed to load recipients");
      const data = await res.json();
      setRecipients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

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
      errors.phone = "Use format (1234) 567-8901 ext 12345";
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

    setSaving(true);
    setFormError(null);

    try {
      const method = editingId ? "PUT" : "POST";
      const payload: Record<string, unknown> = {
        branch_id: branch.id,
        email: formData.email.trim(),
        first_name: formData.first_name.trim() || undefined,
        last_name: formData.last_name.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        zip_code: formData.zip_code.trim() || undefined,
        recipient_type: formData.recipient_type,
      };

      if (editingId) {
        payload.id = editingId;
        payload.on_hold = formOnHold;
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
    setFormData({
      email: recipient.email || "",
      first_name: recipient.first_name || "",
      last_name: recipient.last_name || "",
      phone: recipient.phone || "",
      address: recipient.address || "",
      city: recipient.city || "",
      state: recipient.state || "",
      zip_code: recipient.zip_code || "",
      recipient_type: recipient.recipient_type || "Normal",
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

  const updateField = <K extends keyof FormData>(field: K, value: string) => {
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
          <div>
            <h2 className="text-base font-semibold">Schedule Email Recipients</h2>
            <p className="text-xs text-muted-foreground">
              Additional CC recipients when emailing schedules for {branch.name}
            </p>
          </div>
        </div>
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
            }
          }}
          className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90"
        >
          {showForm ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide Form
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add Recipient
            </>
          )}
        </button>
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
                  placeholder="(1234) 567-8901 ext 12345"
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
                <select
                  value={formData.recipient_type}
                  onChange={(e) => updateField("recipient_type", e.target.value as "Administrator" | "Normal")}
                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                >
                  <option value="Normal">Normal</option>
                  <option value="Administrator">Administrator</option>
                </select>
                <p className="mt-1 text-xs text-foreground/50">
                  Admins receive system error notifications
                </p>
              </div>
            </div>

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
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Recipient"}
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
        {loading ? (
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
              Click &quot;Add Recipient&quot; above to CC them on schedule distributions.
            </p>
          </div>
        ) : (
          <div className="report-scroll max-h-96 overflow-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/60 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Email</th>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Type</th>
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
                          {recipient.recipient_type === "Administrator" ? (
                            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                              Admin
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Normal</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-2 text-foreground md:table-cell">
                          {recipient.phone || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="hidden px-4 py-2 text-foreground lg:table-cell">
                          {displayAddress || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(recipient)}
                              className="rounded-lg p-1.5 text-[var(--brand)] hover:bg-[var(--brand-soft)]/30"
                              title="Edit recipient"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleHold(recipient)}
                              disabled={holdUpdatingId === recipient.id}
                              className="rounded-lg p-1.5 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                              title={recipient.on_hold ? "Resume recipient" : "Put on hold"}
                            >
                              {recipient.on_hold ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                            </button>
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
                              <button
                                type="button"
                                onClick={() => setDeletingId(recipient.id)}
                                className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/20"
                                title="Remove recipient"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Mobile expanded details */}
                      {isExpanded && (
                        <tr key={`${recipient.id}-details`} className="md:hidden bg-muted/30">
                          <td colSpan={6} className="px-4 py-2">
                            <div className="space-y-1 text-sm">
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
            {recipients.length} recipient{recipients.length !== 1 ? "s" : ""} will be CC&apos;d on schedule emails for {branch.name}.
          </p>
        )}
      </div>
    </div>
  );
}

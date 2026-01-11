"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Mail, Send, Loader2, Paperclip, AlertCircle, CheckCircle } from "lucide-react";
import { RecipientPicker, type Recipient } from "./RecipientPicker";

interface EmailPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBlob: Blob | null;
  defaultSubject: string;
  defaultMessage: string;
  defaultFileName: string;
  branchId: string;
}

export function EmailPdfModal({
  isOpen,
  onClose,
  pdfBlob,
  defaultSubject,
  defaultMessage,
  defaultFileName,
  branchId,
}: EmailPdfModalProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [bccEmails, setBccEmails] = useState<string[]>([]);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  type RecipientApiRow = Recipient & {
    on_hold?: boolean;
    recipient_type?: "Administrator" | "Branch" | "Member" | "Normal" | string;
    receives_reports?: boolean;
  };

  // Load recipients when modal opens
  const loadRecipients = useCallback(async () => {
    if (!branchId) return;
    
    setLoadingRecipients(true);
    try {
      const res = await fetch(`/api/maintenance/recipients?branch_id=${branchId}`);
      if (res.ok) {
        const data = await res.json();
        const rows = (data ?? []) as RecipientApiRow[];
        const selectable = rows
          .filter((r) => !r.on_hold)
          .filter((r) => {
            const type =
              r.recipient_type === "Normal" ? "Branch" : r.recipient_type;
            if (type === "Branch") return true;
            if (type === "Member") return r.receives_reports === true;
            return false;
          })
          .map((r) => ({
            id: r.id,
            email: r.email,
            first_name: r.first_name,
            last_name: r.last_name,
          }));

        setRecipients(selectable);
      }
    } catch (err) {
      console.error("Failed to load recipients:", err);
    } finally {
      setLoadingRecipients(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (isOpen) {
      loadRecipients();
      // Reset form when opening
      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setToEmails([]);
      setCcEmails([]);
      setBccEmails([]);
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, loadRecipients, defaultSubject, defaultMessage]);

  const handleSend = async () => {
    if (!pdfBlob) {
      setError("PDF not generated. Please try again.");
      return;
    }

    if (toEmails.length === 0) {
      setError("Please add at least one recipient in the To field.");
      return;
    }

    if (!subject.trim()) {
      setError("Please enter a subject.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Convert blob to base64
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      const res = await fetch("/api/email/send-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmails,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          bcc: bccEmails.length > 0 ? bccEmails : undefined,
          subject: subject.trim(),
          message: message.trim(),
          pdfBase64: base64,
          fileName: defaultFileName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send email");
      }

      setSuccess(true);
      // Auto-close after success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const pdfSizeKB = pdfBlob ? Math.round(pdfBlob.size / 1024) : 0;
  const totalRecipients = toEmails.length + ccEmails.length + bccEmails.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-xl backdrop-blur-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/30">
              <Mail className="h-5 w-5 text-[var(--brand-ink)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
                Email PDF Report
              </h2>
              <p className="text-sm text-[var(--brand-ink)]/70">
                Send report to recipients
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white transition disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success state */}
        {success && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="font-medium text-emerald-200">Email sent successfully!</p>
              <p className="text-sm text-emerald-200/70">
                Sent to {totalRecipients} recipient{totalRecipients !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {!success && (
          <>
            {/* PDF Attachment Info */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--brand-strong)]/50 bg-[var(--brand-strong)]/20 px-4 py-3">
              <Paperclip className="h-5 w-5 text-[var(--brand-ink)]/70" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--brand-ink)]">
                  {defaultFileName}
                </p>
                <p className="text-xs text-[var(--brand-ink)]/60">
                  {pdfSizeKB} KB • PDF attachment
                </p>
              </div>
            </div>

            {/* Recipient Fields */}
            <div className="space-y-4">
              {loadingRecipients ? (
                <div className="flex items-center gap-2 text-sm text-foreground/70">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading recipients...
                </div>
              ) : (
                <>
                  <RecipientPicker
                    label="To *"
                    recipients={recipients}
                    selectedEmails={toEmails}
                    onChange={setToEmails}
                    placeholder="Add recipients..."
                  />

                  <RecipientPicker
                    label="CC"
                    recipients={recipients}
                    selectedEmails={ccEmails}
                    onChange={setCcEmails}
                    placeholder="Add CC recipients..."
                  />

                  <RecipientPicker
                    label="BCC"
                    recipients={recipients}
                    selectedEmails={bccEmails}
                    onChange={setBccEmails}
                    placeholder="Add BCC recipients..."
                  />
                </>
              )}

              {/* Subject */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  Subject *
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                />
              </div>

              {/* Message */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground/90">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="flex-1 rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-black/30 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || toEmails.length === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-2.5 text-sm font-medium text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Email
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


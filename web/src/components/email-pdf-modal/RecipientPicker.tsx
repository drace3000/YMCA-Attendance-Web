"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Search, User } from "lucide-react";

export type Recipient = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

interface RecipientPickerProps {
  label: string;
  recipients: Recipient[];
  selectedEmails: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  allowManualEntry?: boolean;
}

export function RecipientPicker({
  label,
  recipients,
  selectedEmails,
  onChange,
  placeholder = "Select recipients...",
  allowManualEntry = true,
}: RecipientPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDisplayName = (r: Recipient) => {
    if (r.first_name || r.last_name) {
      return [r.first_name, r.last_name].filter(Boolean).join(" ");
    }
    return r.email;
  };

  const filteredRecipients = recipients.filter((r) => {
    const searchLower = search.toLowerCase();
    const name = getDisplayName(r).toLowerCase();
    const email = r.email.toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower);
  });

  const toggleRecipient = (email: string) => {
    if (selectedEmails.includes(email)) {
      onChange(selectedEmails.filter((e) => e !== email));
    } else {
      onChange([...selectedEmails, email]);
    }
  };

  const removeEmail = (email: string) => {
    onChange(selectedEmails.filter((e) => e !== email));
  };

  const handleAddManualEmail = () => {
    const email = manualEmail.trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (!selectedEmails.includes(email)) {
        onChange([...selectedEmails, email]);
      }
      setManualEmail("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddManualEmail();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-foreground/90">
        {label}
      </label>

      {/* Selected tags */}
      <div
        className="min-h-[42px] cursor-text rounded-xl border border-white/15 bg-black/20 px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-[var(--brand)]/50"
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        <div className="flex flex-wrap gap-1">
          {selectedEmails.map((email) => {
            const recipient = recipients.find((r) => r.email === email);
            const display = recipient ? getDisplayName(recipient) : email;
            return (
              <span
                key={email}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand-strong)]/40 px-2 py-0.5 text-xs text-foreground"
              >
                {display}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeEmail(email);
                  }}
                  className="rounded-full p-0.5 hover:bg-white/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          {allowManualEntry && (
            <input
              ref={inputRef}
              type="email"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsOpen(true)}
              placeholder={selectedEmails.length === 0 ? placeholder : "Add email..."}
              className="min-w-[120px] flex-1 bg-transparent text-foreground placeholder:text-foreground/50 focus:outline-none"
            />
          )}
          {!allowManualEntry && selectedEmails.length === 0 && (
            <span className="py-0.5 text-foreground/50">{placeholder}</span>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-hidden rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] shadow-xl backdrop-blur-md">
          {/* Search */}
          <div className="border-b border-[var(--brand-strong)]/50 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipients..."
                className="w-full rounded-lg border border-white/15 bg-black/20 py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/50"
              />
            </div>
          </div>

          {/* Recipients list */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filteredRecipients.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-foreground/60">
                {search ? "No matching recipients" : "No recipients available"}
              </div>
            ) : (
              filteredRecipients.map((recipient) => {
                const isSelected = selectedEmails.includes(recipient.email);
                return (
                  <button
                    key={recipient.id}
                    type="button"
                    onClick={() => toggleRecipient(recipient.email)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                      isSelected
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "text-foreground hover:bg-[var(--brand-strong)]/50"
                    }`}
                  >
                    <User className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {getDisplayName(recipient)}
                      </div>
                      {(recipient.first_name || recipient.last_name) && (
                        <div className="truncate text-xs opacity-70">
                          {recipient.email}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <span className="shrink-0 text-xs">✓</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, KeyRound, UserPlus, Loader2, CheckCircle, AlertCircle, Eye, EyeOff, X, Building2, ChevronDown, User, Phone } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { signInWithPassword, signUpWithPassword, signInWithOtp, updateUserPassword, verifyOtp } from "@/lib/supabaseClient";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useThemeSettings } from "@/components/theme-settings-provider";
import { sendPasswordResetCode, verifyPasswordResetCode } from "@/lib/password-reset-otp";

type Tab = "signin" | "register";
type SignInMode = "password" | "otp";

type Branch = {
  id: string;
  name: string;
  branch_manager_email: string | null;
};

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\(\d{3}\)\s\d{3}-\d{4}$/;

// Format phone as (123) 456-7890
function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const area = digits.slice(0, 3);
  const first = digits.slice(3, 6);
  const second = digits.slice(6, 10);

  let out = "";
  if (area) out += `(${area}`;
  if (area.length === 3) out += `)`;
  if (first) out += ` ${first}`;
  if (second) out += `-${second}`;
  return out.trim();
}

export default function Home() {
  const { user, loading: authLoading, devSignIn, isDevMode, setRecipientContext, signOut } = useAuth();
  const { setBranch } = useThemeSettings();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("signin");
  const [signInMode, setSignInMode] = useState<SignInMode>("password");
  
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [showCreatePasswordModal, setShowCreatePasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [createPasswordError, setCreatePasswordError] = useState<string | null>(null);
  const [createPasswordLoading, setCreatePasswordLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingBranchId, setPendingBranchId] = useState<string | null>(null);
  const [pendingHierarchy, setPendingHierarchy] = useState<{
    allianceName: string;
    associationName: string;
    branchName: string;
  } | null>(null);
  const [showWelcomeAfterPasswordSetup, setShowWelcomeAfterPasswordSetup] = useState(false);
  const [showFirstTimeWelcomeModal, setShowFirstTimeWelcomeModal] = useState(false);
  
  // Dev mode login success modal
  const [showDevLoginSuccess, setShowDevLoginSuccess] = useState(false);
  
  // Registration flow state - prevents premature login UI
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Inline validation errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Phase 5: Forgot password link (Phase 6 implements modal)
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotEmailError, setForgotEmailError] = useState<string | null>(null);
  const [forgotStep, setForgotStep] = useState<"email" | "otp" | "success">("email");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotInfo, setForgotInfo] = useState<string | null>(null);
  const [forgotOtpDigits, setForgotOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const forgotOtpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotShowNewPassword, setForgotShowNewPassword] = useState(false);
  const [forgotShowConfirmPassword, setForgotShowConfirmPassword] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  // Sign-in with code (OTP) state
  const [signInOtpSent, setSignInOtpSent] = useState(false);
  const [signInOtpDigits, setSignInOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const signInOtpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [signInOtpLoading, setSignInOtpLoading] = useState(false);
  const [signInOtpError, setSignInOtpError] = useState<string | null>(null);
  const [signInOtpInfo, setSignInOtpInfo] = useState<string | null>(null);

  // Refs for OTP inputs
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // Resend countdown for forgot password
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = window.setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendSeconds]);

  // Load branches when register tab is active
  useEffect(() => {
    if (activeTab === "register") {
      loadBranches();
    }
  }, [activeTab]);

  // Deep link support: /?email=<email>&mode=otp
  const appliedDeepLinkRef = useRef(false);
  useEffect(() => {
    if (appliedDeepLinkRef.current) return;
    // Some unit tests mock `useSearchParams()` as null; guard to avoid crashing.
    if (!searchParams || typeof (searchParams as any).get !== "function") return;
    const mode = (searchParams as any).get("mode");
    if (mode !== "otp") return;

    appliedDeepLinkRef.current = true;
    const qpEmail = (searchParams as any).get("email");
    setActiveTab("signin");
    setSignInMode("otp");
    if (qpEmail) setEmail(qpEmail);
  }, [searchParams]);

  // Best-effort prefetch of hierarchy names for the first-time welcome popup
  useEffect(() => {
    if (!showCreatePasswordModal) return;
    if (!pendingBranchId) return;
    if (pendingHierarchy) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/branches/${pendingBranchId}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || controller.signal.aborted) return;

        const allianceName =
          typeof data?.alliance_name === "string" && data.alliance_name.trim() ? data.alliance_name : "—";
        const associationName =
          typeof data?.association_name === "string" && data.association_name.trim() ? data.association_name : "—";
        const branchName = typeof data?.name === "string" && data.name.trim() ? data.name : "—";
        setPendingHierarchy({ allianceName, associationName, branchName });
      } catch {
        // ignore
      }
    })();

    return () => controller.abort();
  }, [showCreatePasswordModal, pendingBranchId, pendingHierarchy]);

  const loadBranches = async () => {
    try {
      const res = await fetch("/api/branches");
      if (res.ok) {
        const data = await res.json();
        const available = data.filter((b: Branch) => !b.branch_manager_email);
        setBranches(available);
      }
    } catch {
      // Ignore
    }
  };

  // Validation helpers
  const isValidEmail = (value: string) => EMAIL_REGEX.test(value);
  const isValidPhone = (value: string) => PHONE_REGEX.test(value);

  // Form is valid when all required fields are filled and valid
  const isRegisterFormValid = 
    email.trim() && 
    isValidEmail(email.trim()) &&
    password.length >= 6 && 
    selectedBranch &&
    firstName.trim() &&
    lastName.trim() &&
    phone.trim() &&
    isValidPhone(phone.trim());

  const loadRecipientContextAfterAuth = async (normalizedEmail: string): Promise<void> => {
    setPendingEmail(normalizedEmail);

    const ctxRes = await fetch("/api/auth/login-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    if (!ctxRes.ok) {
      const data = await ctxRes.json().catch(() => ({}));
      const msg = data?.error || "Failed to load account context";
      if (ctxRes.status === 403 && String(msg).toLowerCase().includes("deactivated")) {
        setError("Account deactivated");
      } else {
        setError(msg);
      }
      // Ensure a user who is not present in recipients is not left signed-in.
      await signOut();
      return;
    }

    const ctx = (await ctxRes.json()) as {
      recipient: {
        email: string;
        recipient_type: "Administrator" | "Normal";
        branch_id: string;
        association_id?: string | null;
        alliance_id?: string | null;
        needs_password_setup: boolean;
      };
      branch: { id: string; name: string } | null;
    };

    setRecipientContext({
      recipient_type: ctx.recipient.recipient_type,
      branch_id: ctx.recipient.branch_id,
      association_id: ctx.recipient.association_id ?? null,
      alliance_id: ctx.recipient.alliance_id ?? null,
    });

    if (ctx.recipient.recipient_type === "Normal" && ctx.branch) {
      setBranch({ id: ctx.branch.id, name: ctx.branch.name });
    }

    if (ctx.recipient.needs_password_setup) {
      setPendingBranchId(ctx.recipient.branch_id);
      setPendingHierarchy(null);
      setShowWelcomeAfterPasswordSetup(ctx.recipient.recipient_type === "Normal");
      setShowCreatePasswordModal(true);
      setCreatePasswordError(null);
      setNewPassword("");
      setConfirmNewPassword("");
      return;
    }

    setSuccess("Signed in successfully!");
    setEmail("");
    setPassword("");
  };

  const handleSignIn = async () => {
    // Dev mode: bypass authentication and show success modal
    if (isDevMode) {
      setLoading(true);
      setError(null);
      // Simulate a brief loading state
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      setShowDevLoginSuccess(true);
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await signInWithPassword(email.trim(), password);
      if (error) {
        setError(error.message);
      } else {
        // After auth, load recipient context and enforce first-time password change if needed.
        const normalizedEmail = email.trim().toLowerCase();
        await loadRecipientContextAfterAuth(normalizedEmail);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleSendSignInOtp = async (): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Please enter your email address");
      return;
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setSignInOtpLoading(true);
    setSignInOtpError(null);
    setSignInOtpInfo(null);
    setError(null);

    try {
      const { error } = await signInWithOtp(normalizedEmail);
      if (error) {
        setSignInOtpError(error.message);
        return;
      }
      setSignInOtpSent(true);
      setSignInOtpDigits(["", "", "", "", "", ""]);
      setSignInOtpInfo(`Code sent to ${normalizedEmail}`);
      setTimeout(() => signInOtpRefs.current[0]?.focus(), 50);
    } catch (e) {
      setSignInOtpError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setSignInOtpLoading(false);
    }
  };

  const handleVerifySignInOtp = async (): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setSignInOtpError("Valid email is required");
      return;
    }
    const token = signInOtpDigits.join("");
    if (token.length !== 6) {
      setSignInOtpError("Enter the 6-digit code");
      return;
    }

    setSignInOtpLoading(true);
    setSignInOtpError(null);
    setError(null);

    try {
      const { error } = await verifyOtp(normalizedEmail, token);
      if (error) {
        setSignInOtpError(error.message);
        return;
      }

      await loadRecipientContextAfterAuth(normalizedEmail);
    } catch (e) {
      setSignInOtpError(e instanceof Error ? e.message : "Failed to verify code");
    } finally {
      setSignInOtpLoading(false);
    }
  };

  const handleSignInOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...signInOtpDigits];
    next[index] = digit;
    setSignInOtpDigits(next);
    setSignInOtpError(null);
    if (digit && index < 5) {
      signInOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleSignInOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !signInOtpDigits[index] && index > 0) {
      signInOtpRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && signInOtpDigits.every((d) => d)) {
      void handleVerifySignInOtp();
    }
  };

  const handleSignInOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]!;
    setSignInOtpDigits(next);
    const nextEmpty = next.findIndex((d) => !d);
    signInOtpRefs.current[nextEmpty >= 0 ? nextEmpty : 5]?.focus();
  };

  // Handle dev login success confirmation
  const handleDevLoginConfirm = () => {
    setShowDevLoginSuccess(false);
    const normalizedEmail = email.trim().toLowerCase();
    devSignIn(normalizedEmail || undefined); // Pass entered email to mock user

    // In dev-bypass mode, still populate recipient context + branch
    // so branch-level isolation behavior can be exercised.
    void (async () => {
      if (!normalizedEmail) return;
      try {
        const ctxRes = await fetch("/api/auth/login-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail }),
        });
        if (!ctxRes.ok) return;
        const ctx = (await ctxRes.json()) as {
          recipient: {
            recipient_type: "Administrator" | "Normal";
            branch_id: string;
            association_id?: string | null;
            alliance_id?: string | null;
          };
          branch: { id: string; name: string } | null;
        };
        setRecipientContext({
          recipient_type: ctx.recipient.recipient_type,
          branch_id: ctx.recipient.branch_id,
          association_id: ctx.recipient.association_id ?? null,
          alliance_id: ctx.recipient.alliance_id ?? null,
        });
        if (ctx.recipient.recipient_type === "Normal" && ctx.branch) {
          setBranch({ id: ctx.branch.id, name: ctx.branch.name });
        }
      } catch {
        // ignore
      }
    })();

    setEmail("");
    setPassword("");
  };

  const handleSendAuthCode = async () => {
    // Clear previous errors
    setError(null);
    setEmailError(null);
    setPhoneError(null);

    // Validate all required fields
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!isValidEmail(email.trim())) {
      setEmailError("Please enter a valid email address");
      setError("Please fix the highlighted errors");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name");
      return;
    }
    if (!phone.trim()) {
      setError("Please enter your phone number");
      return;
    }
    if (!isValidPhone(phone.trim())) {
      setPhoneError("Use format (123) 456-7890");
      setError("Please fix the highlighted errors");
      return;
    }
    if (!selectedBranch) {
      setError("Please select a branch");
      return;
    }

    setLoading(true);

    try {
      // Check if email is already a branch manager
      const checkRes = await fetch(`/api/auth/verify-manager?email=${encodeURIComponent(email.trim())}`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.isManager) {
          setEmailError("This email is already registered as a branch manager");
          setError(`This email is already managing ${checkData.branch?.name || "a branch"}. Please use Sign In instead.`);
          setLoading(false);
          return;
        }
      }

      // Mark as registering to prevent premature login UI
      setIsRegistering(true);

      const { data, error: signUpError } = await signUpWithPassword(email.trim(), password);
      
      if (signUpError) {
        setIsRegistering(false);
        if (signUpError.message.includes("already registered")) {
          setEmailError("This email is already registered");
          setError("This email is already registered. Please use Sign In instead.");
          return;
        }
        setError(signUpError.message);
        return;
      }

      if (data?.user && !data?.session) {
        const { error: otpError } = await signInWithOtp(email.trim());
        if (otpError) {
          setIsRegistering(false);
          setError(otpError.message);
          return;
        }
        setOtpDigits(["", "", "", "", "", ""]);
        setOtpError(null);
        setShowOtpModal(true);
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
      } else if (data?.session) {
        // Session created immediately, proceed to register manager
        await completeManagerRegistration();
      }
    } catch (e) {
      setIsRegistering(false);
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    setOtpError(null);
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && otpDigits.every(d => d)) {
      handleVerifyOtp();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData) {
      const newDigits = [...otpDigits];
      for (let i = 0; i < pastedData.length; i++) {
        newDigits[i] = pastedData[i];
      }
      setOtpDigits(newDigits);
      const nextEmpty = newDigits.findIndex(d => !d);
      otpInputRefs.current[nextEmpty >= 0 ? nextEmpty : 5]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length !== 6) {
      setOtpError("Please enter all 6 digits");
      return;
    }

    setLoading(true);
    setOtpError(null);

    try {
      const { error } = await verifyOtp(email.trim(), code);
      if (error) {
        setOtpError(error.message);
      } else {
        setShowOtpModal(false);
        setSuccess("Email verified! Completing registration...");
        // Complete the manager registration
        await completeManagerRegistration();
      }
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : "Failed to verify code");
    } finally {
      setLoading(false);
    }
  };

  const completeManagerRegistration = async () => {
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          branch_id: selectedBranch,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to register as branch manager");
        setIsRegistering(false);
      } else {
        setSuccess(`Welcome! You are now the manager of ${data.branch.name}.`);
        // Clear registration state - user is now fully logged in
        setIsRegistering(false);
        // Clear form fields
        setEmail("");
        setPassword("");
        setShowPassword(false);
        setOtpDigits(["", "", "", "", "", ""]);
        setFirstName("");
        setLastName("");
        setPhone("");
        setSelectedBranch("");
        setShowOtpModal(false);
        setOtpError(null);
        setEmailError(null);
        setPhoneError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register");
      setIsRegistering(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setOtpDigits(["", "", "", "", "", ""]);
    setFirstName("");
    setLastName("");
    setPhone("");
    setSelectedBranch("");
    setError(null);
    setSuccess(null);
    setShowOtpModal(false);
    setOtpError(null);
    setIsRegistering(false);
    setEmailError(null);
    setPhoneError(null);
    setShowForgotPasswordModal(false);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  // Always show the splash image - auth forms only when not logged in
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Splash Image - Always Visible */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <Image
          src="/assets/images/ymca-attendance-splash-image.png"
          alt="YMCA Attendance & Scheduling"
          width={800}
          height={600}
          className="w-full h-auto"
          priority
        />
      </div>

      {/* Auth Card - Shown when NOT logged in OR during registration flow */}
      {(!user || isRegistering) && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {/* Tab Headers */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => { setActiveTab("signin"); resetForm(); }}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition ${
                activeTab === "signin"
                  ? "bg-[var(--brand-gradient-strong)] text-white"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <KeyRound className="h-4 w-4" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("register"); resetForm(); }}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition ${
                activeTab === "register"
                  ? "bg-[var(--brand-gradient-strong)] text-white"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              New Branch Manager
            </button>
          </div>

          {/* Form Content */}
          <div className="p-6">
            {success && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-500/20 px-4 py-3 text-sm text-green-300">
                <CheckCircle className="h-5 w-5 flex-shrink-0" />
                {success}
              </div>
            )}

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-300">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* SIGN IN TAB */}
            {activeTab === "signin" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@ymca.org"
                      className="w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 pr-4 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Sign-in mode selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSignInMode("password");
                      setSignInOtpError(null);
                      setSignInOtpInfo(null);
                      setSignInOtpSent(false);
                      setSignInOtpDigits(["", "", "", "", "", ""]);
                    }}
                    className={`btn-pill flex items-center justify-center gap-2 border px-3 py-2 text-sm font-semibold transition ${
                      signInMode === "password"
                        ? "border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.35)] text-foreground"
                        : "border-white/10 bg-black/20 text-muted-foreground hover:bg-black/30"
                    }`}
                  >
                    <Lock className="h-4 w-4" />
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignInMode("otp");
                      setShowPassword(false);
                      setPassword("");
                      setSignInOtpError(null);
                      setSignInOtpInfo(null);
                      setSignInOtpSent(false);
                      setSignInOtpDigits(["", "", "", "", "", ""]);
                    }}
                    className={`btn-pill flex items-center justify-center gap-2 border px-3 py-2 text-sm font-semibold transition ${
                      signInMode === "otp"
                        ? "border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.35)] text-foreground"
                        : "border-white/10 bg-black/20 text-muted-foreground hover:bg-black/30"
                    }`}
                  >
                    <KeyRound className="h-4 w-4" />
                    Sign in with code
                  </button>
                </div>

                {signInMode === "password" ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground/90">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                          placeholder="Enter your password"
                          className="w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 pr-11 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPasswordModal(true);
                          setForgotEmail(email.trim());
                          setForgotEmailError(null);
                          setForgotError(null);
                          setForgotInfo(null);
                          setForgotStep("email");
                          setForgotOtpDigits(["", "", "", "", "", ""]);
                          setForgotNewPassword("");
                          setForgotConfirmPassword("");
                          setResendSeconds(0);
                        }}
                        className="mt-2 text-xs font-semibold text-[var(--cta)] hover:opacity-90"
                      >
                        Forgot Password?
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={loading}
                      aria-label="Submit Sign In"
                      className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <KeyRound className="h-5 w-5" />
                          Sign In
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-foreground/90">
                      We’ll email you a 6-digit sign-in code. You’ll click “Send code” first.
                    </div>

                    {signInOtpInfo && (
                      <div className="flex items-center gap-2 rounded-xl bg-[var(--brand)]/20 px-4 py-2 text-sm text-foreground">
                        <CheckCircle className="h-4 w-4 text-[var(--cta)]" />
                        {signInOtpInfo}
                      </div>
                    )}

                    {signInOtpError && (
                      <div className="flex items-center gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-300">
                        <AlertCircle className="h-4 w-4" />
                        {signInOtpError}
                      </div>
                    )}

                    {!signInOtpSent ? (
                      <button
                        type="button"
                        onClick={handleSendSignInOtp}
                        disabled={signInOtpLoading}
                        className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
                      >
                        {signInOtpLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
                        Send code
                      </button>
                    ) : (
                      <>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-foreground/90">6-digit code</label>
                          <div className="flex justify-center gap-2" aria-label="Sign in code inputs">
                            {signInOtpDigits.map((digit, index) => (
                              <input
                                key={index}
                                ref={(el) => {
                                  signInOtpRefs.current[index] = el;
                                }}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onPaste={index === 0 ? handleSignInOtpPaste : undefined}
                                onChange={(e) => handleSignInOtpChange(index, e.target.value)}
                                onKeyDown={(e) => handleSignInOtpKeyDown(index, e)}
                                className="h-14 w-12 rounded-xl border-2 border-white/20 bg-black/30 text-center text-2xl font-bold text-foreground focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
                              />
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleVerifySignInOtp}
                          disabled={signInOtpLoading || signInOtpDigits.some((d) => !d)}
                          className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
                        >
                          {signInOtpLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="h-5 w-5" />
                              Verify & Sign In
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSignInOtpSent(false);
                            setSignInOtpDigits(["", "", "", "", "", ""]);
                            setSignInOtpError(null);
                            setSignInOtpInfo(null);
                          }}
                          disabled={signInOtpLoading}
                          className="btn-pill flex w-full items-center justify-center gap-2 border border-white/10 bg-black/20 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-black/30 disabled:opacity-50"
                        >
                          Send a new code
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* NEW BRANCH MANAGER TAB */}
            {activeTab === "register" && (
              <div className="space-y-4">
                {/* Email Address */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                      placeholder="your.email@ymca.org"
                      className={`w-full rounded-xl border py-3 pl-11 pr-4 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                        emailError
                          ? "border-red-500/50 bg-red-950/20 focus:ring-red-500/50"
                          : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                      }`}
                      autoFocus
                    />
                  </div>
                  {emailError && (
                    <p className="mt-1 text-xs text-red-400">{emailError}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">
                    Create Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 pr-11 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* Name Fields */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">
                    Your Name <span className="text-red-400">*</span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        className="w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 pr-4 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                      />
                    </div>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">
                    Phone Number <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        const formatted = formatPhoneInput(e.target.value);
                        setPhone(formatted);
                        if (phoneError) setPhoneError(null);
                      }}
                      placeholder="(123) 456-7890"
                      className={`w-full rounded-xl border py-3 pl-11 pr-4 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                        phoneError
                          ? "border-red-500/50 bg-red-950/20 focus:ring-red-500/50"
                          : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                      }`}
                    />
                  </div>
                  {phoneError && (
                    <p className="mt-1 text-xs text-red-400">{phoneError}</p>
                  )}
                </div>

                {/* Branch Selection */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">
                    Select Your Branch <span className="text-red-400">*</span>
                  </label>
                  {branches.length === 0 ? (
                    <p className="rounded-xl bg-yellow-500/20 px-4 py-3 text-sm text-yellow-300">
                      Loading branches or all branches have managers assigned.
                    </p>
                  ) : (
                    <Popover open={branchDropdownOpen} onOpenChange={setBranchDropdownOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="btn-pill flex w-full items-center justify-between gap-2 border border-white/10 bg-card/60 px-4 py-3 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                        >
                          <span className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {branches.find(b => b.id === selectedBranch)?.name || "-- Select a branch --"}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        sideOffset={4}
                        className="w-[280px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
                      >
                        <div className="max-h-[300px] overflow-y-auto">
                          {branches.map((branch) => (
                            <button
                              key={branch.id}
                              type="button"
                              onClick={() => {
                                setSelectedBranch(branch.id);
                                setBranchDropdownOpen(false);
                              }}
                              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                                branch.id === selectedBranch
                                  ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                                  : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                              }`}
                            >
                              <Building2 className="h-4 w-4" />
                              <span>{branch.name}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={handleSendAuthCode}
                  disabled={loading || !isRegisterFormValid}
                  className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Mail className="h-5 w-5" />
                      Email Authorization Code
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-muted-foreground">
                  We&apos;ll send a 6-digit verification code to your email
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OTP Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowOtpModal(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)]/20">
                <Mail className="h-7 w-7 text-[var(--brand)]" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-foreground">
                Enter Authorization Code
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">
                We sent a 6-digit code to<br />
                <span className="font-medium text-foreground">{email}</span>
              </p>

              {otpError && (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  {otpError}
                </div>
              )}

              <div className="mb-6 flex justify-center gap-2">
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { otpInputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onPaste={index === 0 ? handleOtpPaste : undefined}
                    className="h-14 w-12 rounded-xl border-2 border-white/20 bg-black/30 text-center text-2xl font-bold text-foreground focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={loading || otpDigits.some(d => !d)}
                className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Verify Code
                  </>
                )}
              </button>

              <p className="mt-4 text-xs text-muted-foreground">
                Didn&apos;t receive the code? Check your spam folder.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Create New Password Modal (forced for first-time login) */}
      {showCreatePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)]/20">
                <KeyRound className="h-7 w-7 text-[var(--brand)]" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-foreground">
                Welcome! Please create your password
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">
                You must set a new password before continuing.
              </p>

              {createPasswordError && (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  {createPasswordError}
                </div>
              )}

              <div className="space-y-3 text-left">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 chars, letters + numbers"
                      className="w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 pr-11 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showConfirmNewPassword ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 pr-11 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const pw = newPassword.trim();
                  const confirm = confirmNewPassword.trim();
                  if (pw.length < 8) {
                    setCreatePasswordError("Password must be at least 8 characters");
                    return;
                  }
                  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) {
                    setCreatePasswordError("Password must include at least one letter and one number");
                    return;
                  }
                  if (pw !== confirm) {
                    setCreatePasswordError("Passwords do not match");
                    return;
                  }
                  if (!pendingEmail) {
                    setCreatePasswordError("Missing account email. Please sign in again.");
                    return;
                  }

                  setCreatePasswordLoading(true);
                  setCreatePasswordError(null);
                  try {
                    const { error: updateError } = await updateUserPassword(pw);
                    if (updateError) {
                      setCreatePasswordError(updateError.message);
                      return;
                    }

                    const res = await fetch("/api/auth/complete-password-setup", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: pendingEmail }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      setCreatePasswordError(data?.error || "Failed to update account status");
                      return;
                    }

                    setShowCreatePasswordModal(false);
                    setEmail("");
                    setPassword("");
                    if (showWelcomeAfterPasswordSetup) {
                      setShowFirstTimeWelcomeModal(true);
                    } else {
                      setSuccess("Password updated successfully!");
                    }
                  } catch (e) {
                    setCreatePasswordError(e instanceof Error ? e.message : "Failed to set password");
                  } finally {
                    setCreatePasswordLoading(false);
                  }
                }}
                disabled={createPasswordLoading}
                className="mt-6 btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {createPasswordLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Set Password & Continue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* First-time Branch Manager Welcome Modal (after password setup) */}
      {showFirstTimeWelcomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <CheckCircle className="h-10 w-10 text-green-400" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-foreground">
                Welcome to the YMCA EZAttendance
              </h2>
              <p className="text-sm text-muted-foreground">
                Your new password was accepted successfully.
              </p>

              <div className="mx-auto mt-4 w-fit text-left text-sm text-foreground">
                <div>
                  <span className="font-semibold">Alliance:</span>{" "}
                  {pendingHierarchy?.allianceName ?? "—"}
                </div>
                <div>
                  <span className="font-semibold">Association:</span>{" "}
                  {pendingHierarchy?.associationName ?? "—"}
                </div>
                <div>
                  <span className="font-semibold">Branch:</span>{" "}
                  {pendingHierarchy?.branchName ?? "—"}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowFirstTimeWelcomeModal(false);
                  setShowWelcomeAfterPasswordSetup(false);
                }}
                className="mt-6 btn-pill mx-auto flex w-40 items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dev Login Success Modal */}
      {showDevLoginSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <CheckCircle className="h-10 w-10 text-green-400" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-foreground">
                Login Successful
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Welcome! You have been successfully logged in.
              </p>

              <button
                type="button"
                onClick={handleDevLoginConfirm}
                className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90"
              >
                <CheckCircle className="h-5 w-5" />
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forgot Password Modal (Phase 6) */}
      {showForgotPasswordModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowForgotPasswordModal(false);
          }}
        >
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowForgotPasswordModal(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              aria-label="Close forgot password"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)]/20">
                <Mail className="h-7 w-7 text-[var(--brand)]" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-foreground">Reset Password</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                {forgotStep === "email"
                  ? "Enter your email to receive a 6-digit reset code."
                  : forgotStep === "otp"
                    ? "Enter the 6-digit code and create a new password."
                    : "Your password has been reset. You can sign in now."}
              </p>

              {forgotInfo && (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)]/20 px-4 py-2 text-sm text-foreground">
                  <CheckCircle className="h-4 w-4 text-[var(--cta)]" />
                  {forgotInfo}
                </div>
              )}

              {forgotError && (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  {forgotError}
                </div>
              )}

              {forgotStep === "email" && (
                <div className="space-y-3 text-left">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground/90">
                      Email Address
                    </label>
                    <input
                      type="email"
                      aria-label="Forgot password email"
                      value={forgotEmail}
                      onChange={(e) => {
                        setForgotEmail(e.target.value);
                        setForgotEmailError(null);
                        setForgotError(null);
                      }}
                      placeholder="your.email@ymca.org"
                      className={`w-full rounded-xl border px-4 py-3 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                        forgotEmailError
                          ? "border-red-500/50 bg-red-950/20 focus:ring-red-500/50"
                          : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                      }`}
                      autoFocus
                    />
                    {forgotEmailError && (
                      <p className="mt-1 text-xs text-red-400">{forgotEmailError}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={forgotLoading || !EMAIL_REGEX.test(forgotEmail.trim())}
                    onClick={async () => {
                      const v = forgotEmail.trim();
                      if (!EMAIL_REGEX.test(v)) {
                        setForgotEmailError("Please enter a valid email address");
                        return;
                      }
                      setForgotLoading(true);
                      setForgotError(null);
                      setForgotInfo(null);
                      try {
                        const { error } = await sendPasswordResetCode(v);
                        if (error) {
                          setForgotError(error.message);
                          return;
                        }
                        setForgotStep("otp");
                        setForgotInfo(`Reset code sent to ${v}`);
                        setResendSeconds(60);
                        setTimeout(() => forgotOtpRefs.current[0]?.focus(), 50);
                      } catch (e) {
                        setForgotError(e instanceof Error ? e.message : "Failed to send reset code");
                      } finally {
                        setForgotLoading(false);
                      }
                    }}
                    className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
                    Send Reset Code
                  </button>
                </div>
              )}

              {forgotStep === "otp" && (
                <div className="space-y-4 text-left">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground/90">Email</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/10 px-4 py-3 text-foreground/90 focus:outline-none"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground/90">Reset Code</label>
                    <div className="flex justify-center gap-2" aria-label="Reset code inputs">
                      {forgotOtpDigits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => { forgotOtpRefs.current[index] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onPaste={(e) => {
                            if (index !== 0) return;
                            e.preventDefault();
                            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                            if (!pasted) return;
                            const next = ["", "", "", "", "", ""];
                            for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]!;
                            setForgotOtpDigits(next);
                            const nextEmpty = next.findIndex((d) => !d);
                            forgotOtpRefs.current[nextEmpty >= 0 ? nextEmpty : 5]?.focus();
                          }}
                          onChange={(e) => {
                            const d = e.target.value.replace(/\D/g, "").slice(-1);
                            const next = [...forgotOtpDigits];
                            next[index] = d;
                            setForgotOtpDigits(next);
                            setForgotError(null);
                            if (d && index < 5) forgotOtpRefs.current[index + 1]?.focus();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && !forgotOtpDigits[index] && index > 0) {
                              forgotOtpRefs.current[index - 1]?.focus();
                            }
                          }}
                          className="h-14 w-12 rounded-xl border-2 border-white/20 bg-black/30 text-center text-2xl font-bold text-foreground focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
                        />
                      ))}
                    </div>
                    <div className="mt-2 text-center text-xs text-muted-foreground">
                      {resendSeconds > 0 ? (
                        <span>Resend available in {resendSeconds}s</span>
                      ) : (
                        <button
                          type="button"
                          className="font-semibold text-[var(--cta)] hover:opacity-90"
                          onClick={async () => {
                            const v = forgotEmail.trim();
                            setForgotLoading(true);
                            setForgotError(null);
                            setForgotInfo(null);
                            try {
                              const { error } = await sendPasswordResetCode(v);
                              if (error) {
                                setForgotError(error.message);
                                return;
                              }
                              setForgotInfo(`Reset code resent to ${v}`);
                              setResendSeconds(60);
                            } catch (e) {
                              setForgotError(e instanceof Error ? e.message : "Failed to resend code");
                            } finally {
                              setForgotLoading(false);
                            }
                          }}
                        >
                          Resend Code
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground/90">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={forgotShowNewPassword ? "text" : "password"}
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder="Minimum 8 chars, letters + numbers"
                        className="w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 pr-11 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                      />
                      <button
                        type="button"
                        onClick={() => setForgotShowNewPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Toggle new password visibility"
                      >
                        {forgotShowNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground/90">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={forgotShowConfirmPassword ? "text" : "password"}
                        value={forgotConfirmPassword}
                        onChange={(e) => setForgotConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 pr-11 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                      />
                      <button
                        type="button"
                        onClick={() => setForgotShowConfirmPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Toggle confirm password visibility"
                      >
                        {forgotShowConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={forgotLoading}
                    onClick={async () => {
                      const code = forgotOtpDigits.join("");
                      const pw = forgotNewPassword.trim();
                      const confirm = forgotConfirmPassword.trim();

                      if (code.length !== 6) {
                        setForgotError("Please enter all 6 digits");
                        return;
                      }
                      if (pw.length < 8) {
                        setForgotError("Password must be at least 8 characters");
                        return;
                      }
                      if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) {
                        setForgotError("Password must include at least one letter and one number");
                        return;
                      }
                      if (pw !== confirm) {
                        setForgotError("Passwords do not match");
                        return;
                      }

                      setForgotLoading(true);
                      setForgotError(null);
                      setForgotInfo(null);
                      try {
                        const { error: verifyErr } = await verifyPasswordResetCode(forgotEmail.trim(), code);
                        if (verifyErr) {
                          const msg = verifyErr.message;
                          if (msg.toLowerCase().includes("expired")) {
                            setForgotError("Code expired, request new code");
                          } else {
                            setForgotError(msg);
                          }
                          return;
                        }

                        const { error: pwErr } = await updateUserPassword(pw);
                        if (pwErr) {
                          setForgotError(pwErr.message);
                          return;
                        }

                        // Clear needs_password_setup if this user is flagged (safe no-op for others)
                        await fetch("/api/auth/complete-password-setup", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
                        });

                        setForgotStep("success");
                        setForgotInfo("Password reset successfully!");
                      } catch (e) {
                        setForgotError(e instanceof Error ? e.message : "Failed to reset password");
                      } finally {
                        setForgotLoading(false);
                      }
                    }}
                    className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                    Reset Password
                  </button>
                </div>
              )}

              {forgotStep === "success" && (
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(false)}
                  className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] py-3 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90"
                >
                  <CheckCircle className="h-5 w-5" />
                  Back to Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

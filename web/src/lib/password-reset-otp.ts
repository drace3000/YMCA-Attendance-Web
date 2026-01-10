import { signInWithOtp, verifyOtp } from "@/lib/supabaseClient";

export async function sendPasswordResetCode(email: string): Promise<{ error: { message: string } | null }> {
  const { error } = await signInWithOtp(email);
  return { error: error ? { message: error.message } : null };
}

export async function verifyPasswordResetCode(email: string, token: string): Promise<{ error: { message: string } | null }> {
  const { error } = await verifyOtp(email, token);
  return { error: error ? { message: error.message } : null };
}


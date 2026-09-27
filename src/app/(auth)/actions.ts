"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { ROLE_HOME, isRole, safeNext } from "@/lib/auth/roles";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import {
  fieldErrorsOf,
  formToObject,
  publicValues,
  type FormState,
} from "@/lib/validation/form-state";

// -----------------------------------------------------------------------------
// Sign up (email + password, no email verification for now)
// -----------------------------------------------------------------------------
export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formToObject(formData);
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values: publicValues(raw) };
  }
  const { email, password, fullName, role } = parsed.data;

  // Create an already-confirmed user so no verification email is needed.
  // `role` is read by the DB trigger, which only accepts patient/doctor.
  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (createError) {
    const taken = createError.code === "email_exists" || createError.status === 422;
    return {
      error: taken
        ? "An account with this email already exists. Log in instead."
        : "Could not create your account. Please try again.",
      values: publicValues(raw),
    };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    redirect("/login");
  }

  // New patients start the optional profile setup (requirements flow 5.1).
  redirect(role === "patient" ? "/patient/profile?welcome=1" : ROLE_HOME[role]);
}

// -----------------------------------------------------------------------------
// Log in
// -----------------------------------------------------------------------------
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formToObject(formData);
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values: publicValues(raw) };
  }
  const { email, password, next } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      error:
        error.code === "invalid_credentials"
          ? "Incorrect email or password."
          : error.code === "user_banned"
            ? "Your account has been suspended. Please contact support."
            : "Could not log you in. Please try again.",
      values: publicValues(raw),
    };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, status")
    .eq("id", data.user.id)
    .single();

  if (!profile || !isRole(profile.role)) {
    await supabase.auth.signOut();
    return { error: "Your account profile is missing. Please contact support." };
  }

  if (profile.status === "suspended") {
    await supabase.auth.signOut();
    return { error: "Your account has been suspended. Please contact support." };
  }

  redirect(safeNext(next, ROLE_HOME[profile.role]));
}

// -----------------------------------------------------------------------------
// Password reset (email link -> /auth/confirm -> /reset-password)
// -----------------------------------------------------------------------------
export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = formToObject(formData);
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values: publicValues(raw) };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/auth/confirm?next=/reset-password`,
  });

  // Same answer whether or not the account exists (no user enumeration).
  return {
    message: "If an account exists for that email, we've sent a link to reset your password.",
  };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your reset link has expired. Request a new one from Forgot password." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Choose a password different from your current one."
          : "Could not update your password. Please try again.",
    };
  }

  redirect("/dashboard");
}

// -----------------------------------------------------------------------------
// Log out
// -----------------------------------------------------------------------------
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

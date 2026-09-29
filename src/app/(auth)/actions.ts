"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit/log";
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
  const { email, phone, password, fullName, role } = parsed.data;
  const admin = createAdminClient();

  // One account per mobile number (users.phone is unique).
  const { data: phoneOwner } = await admin.from("users").select("id").eq("phone", phone).maybeSingle();
  if (phoneOwner) {
    return {
      fieldErrors: { phone: ["This mobile number is already registered. Log in instead, or use another number."] },
      values: publicValues(raw),
    };
  }

  // Create an already-confirmed user so no verification email is needed.
  // `role` is read by the DB trigger, which only accepts patient/doctor.
  // The mobile number goes on the auth account (synced to public.users.phone);
  // it isn't verified here — SMS alerts still ask for a code (M11).
  const attrs = { email, password, email_confirm: true, user_metadata: { full_name: fullName, role } };
  let { data: created, error: createError } = await admin.auth.admin.createUser({ ...attrs, phone: `+${phone}` });

  // Some projects refuse phone numbers on auth accounts (phone sign-in off):
  // create the account without it and store the number on the profile row.
  let storePhoneOnProfile = false;
  if (createError && createError.code !== "email_exists" && createError.code !== "phone_exists" && /phone/i.test(createError.message)) {
    ({ data: created, error: createError } = await admin.auth.admin.createUser(attrs));
    storePhoneOnProfile = !createError;
  }

  if (createError || !created.user) {
    const code = createError?.code;
    if (code === "phone_exists") {
      return { fieldErrors: { phone: ["This mobile number is already registered."] }, values: publicValues(raw) };
    }
    const taken = code === "email_exists" || (createError?.status === 422 && !/phone/i.test(createError.message));
    if (!taken) console.error("[signUp]", createError);
    return {
      error: taken
        ? "An account with this email already exists. Log in instead."
        : "Could not create your account. Please try again.",
      values: publicValues(raw),
    };
  }
  if (storePhoneOnProfile) {
    const { error } = await admin.from("users").update({ phone }).eq("id", created.user.id);
    if (error) console.error("[signUp] phone", error.message);
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
    await audit({
      category: "security",
      action: error.code === "user_banned" ? "login.blocked" : "login.failed",
      targetType: "email",
      targetId: email.toLowerCase(),
      metadata: { reason: error.code ?? "error" },
      success: false,
      actor: null,
    });
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
    await audit({
      category: "security",
      action: "login.blocked",
      targetType: "user",
      targetId: data.user.id,
      metadata: { reason: "suspended" },
      success: false,
      actor: { id: data.user.id, role: profile.role, label: email },
    });
    await supabase.auth.signOut();
    return { error: "Your account has been suspended. Please contact support." };
  }

  await audit({
    category: "security",
    action: "login.success",
    targetType: "user",
    targetId: data.user.id,
    actor: { id: data.user.id, role: profile.role, label: email },
  });
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
  await audit({
    category: "security",
    action: "password.reset_request",
    targetType: "email",
    targetId: parsed.data.email.toLowerCase(),
    actor: null,
  });
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

  await audit({
    category: "security",
    action: "password.change",
    targetType: "user",
    targetId: user.id,
    actor: { id: user.id, role: null, label: user.email ?? null },
  });
  redirect("/dashboard");
}

// -----------------------------------------------------------------------------
// Log out
// -----------------------------------------------------------------------------
export async function signOut() {
  await audit({ category: "security", action: "logout", targetType: "user" });
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

import { z } from "zod";
import { normalizeBdPhone } from "@/lib/sms/phone";

const email = z.string().trim().toLowerCase().email("Enter a valid email address");

/** Bangladeshi mobile number -> 8801XXXXXXXXX. */
const mobile = z
  .string()
  .trim()
  .min(1, "Enter your mobile number")
  .transform((v, ctx) => {
    const phone = normalizeBdPhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Bangladeshi mobile number, e.g. 01712-345678" });
      return z.NEVER;
    }
    return phone;
  });

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    email,
    phone: mobile,
    role: z.enum(["patient", "doctor"], { error: "Choose an account type" }),
    password,
    confirmPassword: z.string(),
    acceptTerms: z.literal("on", { error: "You must accept the terms" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

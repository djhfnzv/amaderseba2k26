import { z } from "zod";
import {
  MAX_CONSULTATION_MINUTES,
  MIN_CONSULTATION_MINUTES,
  toMinutes,
} from "@/lib/schedule/constants";

const time = (label: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `Enter a valid ${label}`);

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const availabilitySchema = z
  .object({
    weekdays: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, "Choose at least one day")
      .max(7),
    startTime: time("start time"),
    endTime: time("end time"),
    consultationType: z.enum(["online", "in_person"], { error: "Choose a consultation type" }),
    // Not sent at all for online blocks (the chamber picker is hidden).
    chamberId: z.preprocess((v) => blankToNull(v) ?? null, z.string().max(64).nullable()),
    consultationMinutes: z.coerce
      .number({ error: "Enter the consultation length" })
      .int()
      .min(MIN_CONSULTATION_MINUTES, `At least ${MIN_CONSULTATION_MINUTES} minutes`)
      .max(MAX_CONSULTATION_MINUTES, `At most ${MAX_CONSULTATION_MINUTES} minutes`),
  })
  .superRefine((v, ctx) => {
    if (toMinutes(v.endTime) <= toMinutes(v.startTime)) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after the start time" });
    } else if (toMinutes(v.endTime) - toMinutes(v.startTime) < v.consultationMinutes) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "The block is too short for one consultation" });
    }
    // The chamber only matters for in-person blocks.
    if (v.consultationType === "in_person" && !z.uuid().safeParse(v.chamberId).success) {
      ctx.addIssue({ code: "custom", path: ["chamberId"], message: "Choose the chamber for in-person visits" });
    }
  })
  .transform((v) => ({ ...v, chamberId: v.consultationType === "online" ? null : v.chamberId }));

const date = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter a valid ${label}`);

export const leaveSchema = z
  .object({
    startDate: date("start date"),
    endDate: z.preprocess(blankToNull, date("end date").nullable()),
    partDay: z.boolean(),
    startTime: z.preprocess(blankToNull, time("start time").nullable()),
    endTime: z.preprocess(blankToNull, time("end time").nullable()),
    reason: z.preprocess(blankToNull, z.string().trim().max(200, "Keep it under 200 characters").nullable()),
  })
  .transform((v) => ({ ...v, endDate: v.endDate ?? v.startDate }))
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
    }
    if (v.partDay) {
      if (v.endDate !== v.startDate) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "Part-day leave must be a single day" });
      }
      if (!v.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Enter a start time" });
      if (!v.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Enter an end time" });
      if (v.startTime && v.endTime && toMinutes(v.endTime) <= toMinutes(v.startTime)) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after the start time" });
      }
    }
  });

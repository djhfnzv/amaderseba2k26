import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditCategory, Json } from "@/types/database";
import { clientInfo } from "./client-info";

export type AuditActor = { id: string | null; role: string | null; label: string | null };

export type AuditEntry = {
  category: AuditCategory;
  action: string;
  targetType?: string;
  targetId?: string | null;
  /** Whose medical data this is (drives the patient's "Access history"). */
  patientId?: string | null;
  metadata?: Record<string, Json | undefined>;
  success?: boolean;
  /** Don't log patients opening their own data. */
  skipSelf?: boolean;
  /** Defaults to the signed-in user; pass null for anonymous (e.g. failed login). */
  actor?: AuditActor | null;
};

/**
 * Records a view/download/security event (M14). Writes happen after the
 * response is sent, never throw, and never block the page.
 * Creates/updates/deletes are logged by database triggers instead.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const { ip, userAgent } = clientInfo(await headers());
    let actor: AuditActor | null;
    if (entry.actor !== undefined) {
      actor = entry.actor;
    } else {
      const user = await getCurrentUser();
      actor = user ? { id: user.id, role: user.role, label: user.full_name || user.email } : null;
    }
    if (entry.skipSelf && actor?.id && entry.patientId && actor.id === entry.patientId) return;

    const row = {
      actor_id: actor?.id ?? null,
      actor_role: actor?.role ?? (actor ? null : "anonymous"),
      actor_label: actor?.label?.slice(0, 200) ?? null,
      category: entry.category,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId?.slice(0, 80) ?? null,
      patient_id: entry.patientId ?? null,
      success: entry.success ?? true,
      ip,
      user_agent: userAgent,
      metadata: JSON.parse(JSON.stringify(entry.metadata ?? {})) as Json,
    };

    after(async () => {
      const { error } = await createAdminClient().from("audit_logs").insert(row);
      if (error) console.error("[audit]", entry.action, error.message);
    });
  } catch (e) {
    console.error("[audit]", entry.action, (e as Error).message);
  }
}

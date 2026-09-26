import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { ROLE_HOME } from "@/lib/auth/roles";

/** Generic post-login landing: forwards to the role's own dashboard. */
export default async function DashboardRedirect() {
  const user = await requireUser("/dashboard");
  redirect(ROLE_HOME[user.role]);
}

import { redirect } from "next/navigation";
import { requireOwnerAdmin, isSuperAdmin } from "@/lib/auth/guards";
import { getStaff } from "@/features/admin/actions/staff";
import { StaffManager } from "@/features/admin/components/staff-manager";

export const dynamic = "force-dynamic";

export default async function WorkspaceStaffPage() {
  const user = await requireOwnerAdmin(); // full tenant admin only (staff bounced)
  if (isSuperAdmin(user)) redirect("/admin/staff"); // super admins manage staff in the console
  const data = await getStaff();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Add staff for your workspace and set what they can do. View = read-only; Edit = can change
          content and settings in this workspace. Staff can never manage staff or change you.
        </p>
      </div>
      <StaffManager data={data} />
    </div>
  );
}

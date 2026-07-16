import { redirect } from "next/navigation";
import { requireOwnerAdmin, isSuperAdmin } from "@/lib/auth/guards";
import { getStaff } from "@/features/admin/actions/staff";
import { StaffManager } from "@/features/admin/components/staff-manager";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const user = await requireOwnerAdmin(); // full owner/admin only (staff bounced)
  if (!isSuperAdmin(user)) redirect("/w/staff");
  const data = await getStaff();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Add staff and set what they can do. Platform staff see all tenants; assign to a tenant to
          scope them. View = read-only everywhere; Edit = can change content and settings. Staff can
          never manage staff or change you.
        </p>
      </div>
      <StaffManager data={data} />
    </div>
  );
}

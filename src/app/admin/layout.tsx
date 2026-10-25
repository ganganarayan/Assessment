import { OwnerShell } from "@/features/admin/components/owner-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return <OwnerShell>{children}</OwnerShell>;
}

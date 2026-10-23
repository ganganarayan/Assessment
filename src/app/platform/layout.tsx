import { OwnerShell } from "@/features/admin/components/owner-shell";

/**
 * The platform screens get the same rail as the admin ones.
 *
 * Uncontained because each page here already declares its own <main> and its own
 * width - Accounts is a 6xl table and would be crushed by the admin column.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <OwnerShell contained={false}>{children}</OwnerShell>;
}

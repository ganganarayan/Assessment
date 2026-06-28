import { requireSuperAdmin } from "@/lib/auth/guards";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { BuilderTabProvider } from "@/features/admin/components/builder-tab-context";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperAdmin();

  return (
    <BuilderTabProvider>
      <div className="md:flex md:min-h-screen">
        <AdminSidebar user={{ name: user.name, email: user.email }} />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
        </main>
      </div>
    </BuilderTabProvider>
  );
}

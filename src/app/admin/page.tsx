import Link from "next/link";
import { getDashboardCounts } from "@/features/assessment/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const counts = await getDashboardCounts(await actingTenantId());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Link href="/admin/assessments/new" className={buttonVariants()}>
          New assessment
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Assessments" value={counts.assessments} />
        <Stat label="Published" value={counts.published} />
        <Stat label="Completed submissions" value={counts.submissions} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/assessments" className={buttonVariants({ variant: "outline" })}>
          Manage assessments
        </Link>
        <Link href="/admin/submissions" className={buttonVariants({ variant: "outline" })}>
          View submissions
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

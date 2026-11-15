import { requireSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { collectPublicUrls, isProductionRuntime } from "@/lib/indexnow/submit";
import { isAccepted } from "@/lib/indexnow/plan";
import { SubmitNowButton } from "@/features/indexnow/components/submit-now-button";

export const dynamic = "force-dynamic";

/**
 * Super admin, IndexNow: what is sent to Bing, Yandex, Seznam, Naver and Yep. Every deploy
 * sends new and changed pages by itself; the button resends everything.
 */
export default async function IndexNowPage() {
  await requireSuperAdmin();
  const [hosts, runs, sentCount] = await Promise.all([
    collectPublicUrls(),
    prisma.indexNowRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.indexNowUrl.count(),
  ]);
  const live = isProductionRuntime();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">IndexNow</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          New and changed public pages go to Bing, Yandex, Seznam, Naver and Yep after every deploy. Google is not part of
          IndexNow; it reads the sitemap through Search Console.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-4">
        <p className="text-sm">
          {live ? "🟢 Production: sending is on." : "🟡 Not production: nothing is sent from here."} {sentCount} pages sent so far.
        </p>
        <ul className="text-sm">
          {hosts.map((h) => (
            <li key={h.host}>
              <strong>{h.host}</strong>: {h.urls.length} public pages
            </li>
          ))}
        </ul>
        <SubmitNowButton enabled={live} />
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">When</th>
              <th className="p-2">Site</th>
              <th className="p-2">Pages</th>
              <th className="p-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td className="p-2" colSpan={4}>
                  Nothing sent yet.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="p-2 whitespace-nowrap">{formatIST(r.createdAt)}</td>
                  <td className="p-2">{r.host}</td>
                  <td className="p-2">{r.count}</td>
                  <td className="p-2">
                    {isAccepted(r.status) ? `🟢 Accepted (${r.status})` : `🟡 Failed (${r.status || "no reply"})`}
                    {r.note ? ` ${r.note}` : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

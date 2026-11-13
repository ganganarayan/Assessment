import type { PaidLog } from "@/features/billing/data/paid-log";

/**
 * The paid log: date (IST), type, account, Razorpay payment id, amount, currency, and a
 * total per currency. Server-rendered, no interactivity.
 */
export function PaidLogTable({ log, title = "Paid log" }: { log: PaidLog; title?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {log.rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No payments yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">Date (IST)</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Razorpay payment id</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Currency</th>
                <th className="px-3 py-2 font-medium">Webhook</th>
              </tr>
            </thead>
            <tbody>
              {log.rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="whitespace-nowrap px-3 py-2">{r.when}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.type}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.account}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.paymentId}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{r.amount}</td>
                  <td className="px-3 py-2">{r.currency}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {r.webhook === null ? "-" : r.webhook ? "🟢 Received" : "🟡 Not received"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {log.totals.map((t) => (
                <tr key={t.currency} className="border-t border-[var(--border)] font-semibold">
                  <td className="px-3 py-2" colSpan={4}>
                    Total {t.currency} ({t.count} payment{t.count === 1 ? "" : "s"})
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{t.total}</td>
                  <td className="px-3 py-2">{t.currency}</td>
                  <td />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

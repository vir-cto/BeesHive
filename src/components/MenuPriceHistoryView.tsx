import { useRestaurant } from '../context/RestaurantContext'

/**
 * Phase 11/32 — pricing audit: who changed what, Supervisor vs Admin, with old → new.
 * Shared by the Admin (highest pricing authority) and Supervisor (price operator)
 * menu tabs per the role matrix. Read-only — no role can edit history here.
 */
export default function MenuPriceHistoryView() {
  const { activityLog, menu } = useRestaurant()

  const priceChanges = activityLog
    .filter((log) => (log.action ?? '').startsWith('price changed'))
    .slice(0, 50)

  return (
    <div className="rounded-[20px] border border-orange-100 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">Price History</h2>
      <p className="mt-1 text-sm text-slate-500">
        Every price change is audited with who made it. Admin holds the highest pricing authority and can override Supervisor
        prices — historical orders always keep their original price snapshot.
      </p>
      {priceChanges.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No price changes recorded yet. Changes made by Supervisor or Admin will appear here.
        </p>
      ) : (
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {priceChanges.map((log) => {
            const match = (log.action ?? '').match(/₹\s*([\d.]+)\s*→\s*₹\s*([\d.]+)/)
            const dish = menu.find((item) => item.id === log.entityId)
            const dishName = dish?.name ?? (log.action ?? '').match(/"([^"]+)"/)?.[1] ?? 'Unknown dish'
            return (
              <div key={log.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{dishName}</p>
                  <p className="text-[11px] text-slate-500">
                    {log.userName} • {new Date(log.timestamp ?? log.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {match ? (
                    <span className="text-sm font-bold text-slate-700">
                      ₹{match[1]} → ₹{match[2]}
                    </span>
                  ) : (
                    <span className="max-w-40 truncate text-sm text-slate-600">{log.action ?? log.subtitle}</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      log.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {log.role}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

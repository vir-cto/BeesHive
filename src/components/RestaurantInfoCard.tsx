import { useRestaurant } from '../context/RestaurantContext'
import { Store } from 'lucide-react'

/**
 * Read-only "Restaurant Information" card shown in the Waiter & Supervisor
 * account profile tabs. It reflects whatever the Admin configured in Settings
 * (name, address, GSTIN, phone, email, GST %, service charge) because all roles
 * share the same settings from RestaurantContext.
 */
export default function RestaurantInfoCard() {
  const { settings } = useRestaurant()

  const taxTotal = Math.max(0, Number(settings.taxRate) || 0)
  const serviceCharge = Math.max(0, Number(settings.serviceCharge) || 0)
  const rows: [string, string][] = [
    ['Name', settings.restaurantName],
    ['Address', settings.address],
    ['GSTIN', settings.gstin],
    ['Phone', settings.phone],
    ['Email', settings.email],
  ].filter(([, v]) => String(v || '').trim() !== '') as [string, string][]

  return (
    <div className="rounded-[20px] border border-orange-100 bg-white p-5">
      <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
        <Store size={16} className="text-orange-500" />
        Restaurant Information
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Restaurant details are configured by the admin in Settings. They will appear here
          once set.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-1.5 last:border-0">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
              <span className="text-right font-medium text-slate-800">{value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">GST (CGST+SGST)</span>
          <span className="text-right font-medium text-slate-800">{taxTotal}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">Service charge</span>
          <span className="text-right font-medium text-slate-800">
            {settings.serviceChargeMode === 'rupees' ? `₹${serviceCharge.toFixed(2)}` : `${serviceCharge}%`}
          </span>
        </div>
      </div>
    </div>
  )
}
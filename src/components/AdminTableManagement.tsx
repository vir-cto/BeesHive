import { useMemo, useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { Table, TableStatus } from '../context/RestaurantContext'
import { Plus, Edit2, Trash2, X, MapPin, CheckCircle2 } from 'lucide-react'
import { TABLE_AREAS, tableArea, groupTablesByArea } from '../lib/tableAreas'
import { applyTableFilters, useTableFilter } from '../lib/tableFilters'
import TableFilterBar from './TableFilterBar'

const FEATURES = ['AC', 'Non-AC', 'Window', 'Corner', 'Family', 'VIP']

export default function AdminTableManagement() {
  const { tables, addTable, updateTable, deactivateTable, activateTable, deleteTable } = useRestaurant()
  const [showForm, setShowForm] = useState(false)
  const [editingTable, setEditingTable] = useState<Table | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<Table | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAction, setSavedAction] = useState<'added' | 'updated' | null>(null)

 const handleAction = (action: () => void, message: string) => {
  try {
    action()
    setFeedback(message)
    setActionError(null)

    window.setTimeout(() => {
      setFeedback(null)
    }, 2500)
  } catch (err) {
    setActionError(
      err instanceof Error ? err.message : 'Action failed'
    )
  }
}

  const [formData, setFormData] = useState({
    name: '',
    capacity: 4,
    area: 'Indoor',
    features: [] as string[],
    status: 'available' as TableStatus,
  })

  // Shared table filter (area / status / seats / VIP / sort) + free-text search.
  const { filter, updateFilter, resetFilter, search: tableSearch, setSearch: setTableSearch } = useTableFilter()

  // Distinct areas present in the current tables (for the chip row), ordered like TABLE_AREAS.
  const areaOptions: string[] = useMemo(() => {
    const seen = new Set<string>()
    const ordered = TABLE_AREAS.filter((a) => {
      if (tables.some((t) => tableArea(t) === a)) {
        seen.add(a)
        return true
      }
      return false
    })
    const custom = Array.from(new Set(tables.map((t) => tableArea(t))))
      .filter((a) => !TABLE_AREAS.includes(a) && !seen.has(a))
      .sort((a, b) => a.localeCompare(b))
    return [...ordered, ...custom]
  }, [tables])

  // Table count per area, shown next to each area chip in the filter bar.
  const areaCounts: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {}
    tables.forEach((t) => {
      const area = tableArea(t)
      counts[area] = (counts[area] ?? 0) + 1
    })
    return counts
  }, [tables])

  const resetForm = () => {
    setFormData({ name: '', capacity: 4, area: 'Indoor', features: [], status: 'available' })
    setEditingTable(null)
    setShowForm(false)
  }

  // Tables after applying the shared filter (area / status / seats / VIP) + search.
  const filteredTables: Table[] = useMemo(
    () => applyTableFilters(tables, filter, tableSearch),
    [tables, filter, tableSearch],
  )

  const handleEdit = (table: Table) => {
    setEditingTable(table)
    setFormData({
      name: table.name,
      capacity: table.capacity,
      area: table.area ?? 'Indoor',
      features: table.features ?? [],
      status: table.status,
    })
    setShowForm(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()

  if (saving) return

  setActionError(null)
  setSavedAction(null)
  setSaving(true)

  try {
    if (editingTable) {
      updateTable(editingTable.id, formData)
      setSavedAction('updated')
    } else {
      addTable({
        ...formData,
        status: 'available',
        active: true,
      })
      setSavedAction('added')
    }

    setSaving(false)

    window.setTimeout(() => {
      resetForm()
      setSavedAction(null)
    }, 1000)
  } catch (err) {
    setSaving(false)
    setActionError(
      err instanceof Error ? err.message : 'Could not save table'
    )
  }
}

  const toggleFeature = (feature: string) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }))
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{feedback}</div>
      )}
      {(actionError || (deleteError && !deleteCandidate)) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{actionError ?? deleteError}</div>
      )}

      {/* Header Container - Responsive Flex Column to Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Table Management</h2>
          <p className="text-sm text-slate-500">Tables are grouped area-wise — Indoor, Garden, Terrace and so on.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600"
        >
          <Plus size={16} />
          <span>Add Table</span>
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">
              {editingTable ? 'Edit Table' : 'Add New Table'}
            </h3>
            <button onClick={resetForm} className="text-slate-500 hover:text-slate-700">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Table Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., T-01"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Capacity</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                  min="1"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Area</label>
                <select
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                >
                  {TABLE_AREAS.map((area) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>
              {editingTable && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as TableStatus })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                  >
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Features</label>
              <div className="flex flex-wrap gap-2">
                {FEATURES.map((feature) => (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggleFeature(feature)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      formData.features.includes(feature)
                        ? 'bg-orange-500 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-300'
                    }`}
                  >
                    {feature}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
  type="submit"
  disabled={saving || savedAction !== null}
  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition ${
    savedAction
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  } disabled:cursor-not-allowed`}
>
  {saving ? (
    'Saving…'
  ) : savedAction ? (
    <>
      <CheckCircle2 size={16} />
      {savedAction === 'added' ? 'Added' : 'Updated'}
    </>
  ) : (
    <>
      {editingTable ? <Edit2 size={16} /> : <Plus size={16} />}
      {editingTable ? 'Update Table' : 'Add Table'}
    </>
  )}
</button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Shared filter + sort control */}
      <TableFilterBar
        filter={filter}
        updateFilter={updateFilter}
        resetFilter={resetFilter}
        search={tableSearch}
        setSearch={setTableSearch}
        areaOptions={areaOptions}
        areaCounts={areaCounts}
        matched={filteredTables.length}
        total={tables.length}
      />

      {filteredTables.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          {tables.length === 0 ? (
            <>
              <p className="text-slate-500">No tables configured yet.</p>
              <p className="mt-1 text-sm text-slate-400">Click "Add Table" to get started.</p>
            </>
          ) : (
            <>
              <p className="text-slate-500">No tables match your filter.</p>
              <button
                onClick={resetFilter}
                className="mt-2 rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-200"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupTablesByArea(filteredTables).map(({ area, tables: areaTables }) => (
            <section key={area} className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="shrink-0 text-orange-500" />
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{area}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  {areaTables.length} table{areaTables.length === 1 ? '' : 's'}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {areaTables.filter((t) => t.active !== false && t.status === 'available').length} available
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {areaTables.map((table) => (
                  <div key={table.id} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{table.name}</h3>
                        <p className="text-sm text-slate-500">{table.area || 'No area assigned'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                            table.active === false
                              ? 'bg-slate-200 text-slate-700'
                              : table.status === 'available'
                                ? 'bg-emerald-100 text-emerald-700'
                                : table.status === 'occupied'
                                  ? 'bg-orange-100 text-orange-700'
                                  : table.status === 'reserved'
                                    ? 'bg-blue-100 text-blue-700'
                                    : table.status === 'cleaning'
                                      ? 'bg-violet-100 text-violet-700'
                                      : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {table.active === false ? 'Deactivated' : table.status}
                        </span>
                      </div>
                    </div>
                    <p className="mb-2 text-sm text-slate-600">Capacity: {table.capacity} guests</p>
                    {(table.features ?? []).length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1">
                        {(table.features ?? []).map((feature) => (
                          <span key={feature} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {feature}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleEdit(table)}
                        className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                      >
                        <Edit2 size={12} />
                        Edit
                      </button>
                      {table.active === false ? (
                        <button
                          onClick={() => handleAction(() => activateTable(table.id), `Table ${table.name} activated.`)}
                          className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(() => deactivateTable(table.id), `Table ${table.name} deactivated.`)}
                          className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-600 transition hover:bg-amber-100"
                        >
                          Deactivate
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteCandidate(table)}
                        className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/40 p-4 py-6 sm:items-center bh-modal-overlay">
          <div className="w-full max-w-sm rounded-[20px] bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Delete Table {deleteCandidate.name}?</h3>
            <p className="mt-2 text-sm text-slate-600">
              If this table has no historical records it will be permanently deleted.
              If it has past sessions, orders, or bills it must be deactivated instead — historical data is never destroyed.
            </p>
            {deleteError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleAction(() => { deleteTable(deleteCandidate.id); setDeleteCandidate(null) }, `Table ${deleteCandidate.name} deleted.`)}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600"
              >
                Delete
              </button>
              <button
                onClick={() => { setDeleteCandidate(null); setDeleteError(null) }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
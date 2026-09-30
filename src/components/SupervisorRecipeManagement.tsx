/**
 * Bee's Hive — Supervisor Recipe Management
 * Configure Dish → ingredient → quantity → unit. Saved recipes drive
 * real ingredient consumption when orders enter preparation.
 */
import { useMemo, useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { RecipeIngredient } from '../context/RestaurantContext'
import { Plus, Trash2, Save } from 'lucide-react'

export default function SupervisorRecipeManagement() {
  const { menu, inventory, recipes, saveRecipe } = useRestaurant()
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [draft, setDraft] = useState<RecipeIngredient[]>([])
  const [draftFor, setDraftFor] = useState<string>('')

  const activeMenu = useMemo(() => menu.filter((m) => m.active), [menu])
  const selectedItem = activeMenu.find((m) => m.id === selectedItemId)
  const existingRecipe = useMemo(
    () => recipes.find((r) => r.menuItemId === selectedItemId),
    [recipes, selectedItemId],
  )

  // Load the current recipe into the editor whenever a different dish is selected.
  if (selectedItemId && draftFor !== selectedItemId) {
    setDraftFor(selectedItemId)
    setDraft(
      existingRecipe
        ? existingRecipe.ingredients.map((ing) => ({ ...ing }))
        : [{ inventoryItemId: inventory[0]?.id ?? '', name: inventory[0]?.name ?? '', quantity: 0, unit: inventory[0]?.unit ?? '' }],
    )
  }

  const updateRow = (index: number, patch: Partial<RecipeIngredient>) => {
    setDraft((prev) => prev.map((row, i) => {
      if (i !== index) return row
      if (patch.inventoryItemId) {
        const inv = inventory.find((item) => item.id === patch.inventoryItemId)
        return { ...row, ...patch, name: inv?.name ?? row.name, unit: inv?.unit ?? row.unit }
      }
      return { ...row, ...patch }
    }))
  }

  const handleSave = () => {
    if (!selectedItemId) return
    try {
      saveRecipe(selectedItemId, draft)
      setStatus({ kind: 'ok', text: `Recipe saved for ${selectedItem?.name}. Ingredient consumption is now live.` })
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to save recipe' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Recipe Configuration</h2>
        <p className="text-sm text-slate-500">
          Map each dish to its ingredients. When an order starts preparation, exactly these quantities
          (× order quantity) are deducted from inventory. Dishes without a recipe show
          &ldquo;No recipe configured&rdquo; and do not deduct ingredients.
        </p>
      </div>

      <div className="rounded-[20px] border border-orange-100 bg-white p-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Dish</label>
        <select
          value={selectedItemId}
          onChange={(e) => { setSelectedItemId(e.target.value); setStatus(null) }}
          className="w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Select a dish…</option>
          {activeMenu.map((m) => (
            <option key={m.id} value={m.id}>{m.name} · ₹{m.price}</option>
          ))}
        </select>

        {selectedItemId && (
          <div className="mt-4 space-y-3">
            {existingRecipe ? (
              <p className="text-xs font-semibold text-emerald-700">
                Recipe configured · {existingRecipe.ingredients.length} ingredient(s) · updated {new Date(existingRecipe.updatedAt).toLocaleString()}
              </p>
            ) : (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">No recipe configured</p>
            )}

            {draft.map((row, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <select
                  value={row.inventoryItemId}
                  onChange={(e) => updateRow(index, { inventoryItemId: e.target.value })}
                  className="min-w-50 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select ingredient…</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.quantity || ''}
                  placeholder="Qty per serving"
                  onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
                  className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <span className="w-12 text-sm text-slate-500">{row.unit || '—'}</span>
                <button
                  type="button"
                  onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove ingredient"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDraft((prev) => [...prev, { inventoryItemId: '', name: '', quantity: 0, unit: '' }])}
                className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Plus size={14} /> Add ingredient
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-700"
              >
                <Save size={14} /> Save recipe
              </button>
            </div>

            {status && (
              <p className={`text-sm font-semibold ${status.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{status.text}</p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-[20px] border border-orange-100 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-900">Configured recipes ({recipes.length})</h3>
        {recipes.length === 0 ? (
          <p className="text-sm text-slate-500">No recipes configured yet.</p>
        ) : (
          <div className="space-y-2">
            {recipes.map((recipe) => {
              const dish = menu.find((m) => m.id === recipe.menuItemId)
              return (
                <div key={recipe.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <p className="font-semibold text-slate-900">{dish?.name ?? recipe.menuItemId}</p>
                  <p className="text-slate-600">
                    {recipe.ingredients.map((ing) => `${ing.name} ${ing.quantity}${ing.unit}`).join(' · ')}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Firestore sync engine (offline-first).
 *
 * Responsibilities:
 *   • hydrate every business collection from Firestore once, then keep it live
 *     with `onSnapshot` (a token confirmed on a waiter's phone appears on the
 *     admin dashboard within a second — on ANY device);
 *   • treat the server snapshot as the source of truth for deletes, while never
 *     losing records created on this device while offline;
 *   • push only the entities that actually changed, debounced, in chunked
 *     batches — so a busy service never fires hundreds of Firestore writes and
 *     the UI never blocks;
 *   • respect the per-role write matrix (identical to firestore.rules) so a
 *     waiter never attempts a write the rules would reject.
 *
 * The engine is framework-free; the React context owns state and simply tells
 * it "something changed" via `schedule()`.
 */
import { dataMode, isFirebaseConfigured } from './config'
import { loadCollection, saveEntities, watchCollection } from './dataService'
import type { DirectoryRole } from './userService'

export interface SyncEntity {
  id: string
  createdAt?: number
  updatedAt?: number
  timestamp?: number
  startTime?: number
  generatedAt?: number
  recordedAt?: number
}

export interface SyncBinding {
  /** Firestore collection name (see FIRESTORE_COLLECTIONS). */
  name: string
  /** Current local items (reads live state through a ref). */
  read: () => unknown[]
  /** Apply an authoritative remote snapshot to React state. */
  write: (items: unknown[]) => void
}

export interface SyncEngine {
  /** Queue a debounced push after local state changed. */
  schedule: () => void
  /** Stop listeners + timers (provider unmount). */
  stop: () => void
}

/** Which roles may write each collection — mirrors firestore.rules exactly. */
const WRITE_MATRIX: Record<string, DirectoryRole[]> = {
  orders: ['admin', 'waiter', 'supervisor'],
  diningSessions: ['admin', 'waiter', 'supervisor'],
  tables: ['admin', 'waiter', 'supervisor'],
  menu: ['admin', 'supervisor'],
  menuCategories: ['admin', 'supervisor'],
  // Billing & payments are admin-only (see firestore.rules). Waiters read their
  // session bill/payment status but cannot write or alter them.
  bills: ['admin'],
  paymentRecords: ['admin'],
  notifications: ['admin', 'waiter', 'supervisor'],
  inventory: ['admin', 'supervisor'],
  stockHistory: ['admin', 'supervisor'],
  inventoryUsage: ['admin', 'supervisor'],
  purchaseRequests: ['admin', 'supervisor'],
  recipes: ['admin', 'supervisor'],
  activityLog: ['admin', 'waiter', 'supervisor'],
}

export const canWriteCollection = (name: string, role?: DirectoryRole): boolean =>
  role != null && (WRITE_MATRIX[name]?.includes(role) ?? false)

/** Only admins may delete (Firestore rules enforce the same). */
export const canDeleteCollection = (name: string, role?: DirectoryRole): boolean =>
  role === 'admin' && canWriteCollection(name, role)

/** Best-effort timestamp of an entity, used for newest-first ordering + freshness. */
export const stampOf = (entity: SyncEntity): number =>
  entity.createdAt ??
  entity.timestamp ??
  entity.generatedAt ??
  entity.recordedAt ??
  entity.updatedAt ??
  entity.startTime ??
  0

interface CollectionState {
  ref: unknown
  pushed: Map<string, string>
  dirty: boolean
  pending: { ids: Set<string>; at: number } | null
  /** Hydration finished (or failed) — only then may local state be pushed. */
  ready: boolean
}

export interface SyncEngineOptions {
  /** Current signed-in role (read through a getter so it stays fresh). */
  role: () => DirectoryRole | undefined
  bindings: SyncBinding[]
}

const PUSH_DEBOUNCE_MS = 350
const SHIELD_MS = 20_000
/** Automatic retry delay while a collection still has unpushed changes. */
const PUSH_RETRY_MS = 5_000

/**
 * Page-load timestamp. `offlineNew` protection used to be scoped to a single
 * engine instance, but the engine restarts whenever the auth identity object
 * changes (ID-token refresh / directory sync). Records created earlier in the
 * SAME page session but not yet durable on the server were then dropped by the
 * re-hydration and could never be pushed — they "disappeared" on the next
 * reload. Anchoring the window to the page load keeps them until they land,
 * while state from a PREVIOUS page load is never kept (firebase mode boots
 * empty by design).
 */
const APP_SESSION_START = Date.now()

export const startFirebaseSync = (options: SyncEngineOptions): SyncEngine => {
  if (dataMode !== 'firebase' || !isFirebaseConfigured()) {
    return { schedule: () => {}, stop: () => {} }
  }

  const states = new Map<string, CollectionState>()
  const stateFor = (name: string): CollectionState => {
    let state = states.get(name)
    if (!state) {
      state = { ref: null, pushed: new Map(), dirty: false, pending: null, ready: false }
      states.set(name, state)
    }
    return state
  }

  let stopped = false
  const unsubscribers: (() => void)[] = []

  /** Adopt a server snapshot: authoritative for deletes, tolerant for offline-new items. */
  const applyRemote = (binding: SyncBinding, remote: SyncEntity[]): void => {
    const state = stateFor(binding.name)
    if (state.pending) {
      const landed = [...state.pending.ids].every((id) => remote.some((r) => r.id === id))
      const expired = Date.now() - state.pending.at > SHIELD_MS
      // Our own write has not reached the server yet — the snapshot is stale and
      // applying it would visibly revert the operator's action.
      if (!landed && !expired) return
      state.pending = null
    }
    const remoteIds = new Set(remote.map((r) => r.id))
    const offlineNew = (binding.read() as SyncEntity[]).filter(
      (item) => !remoteIds.has(item.id) && stampOf(item) >= APP_SESSION_START,
    )
    const merged = [...remote, ...offlineNew].sort((a, b) => stampOf(b) - stampOf(a))
    state.pushed = new Map(remote.map((r) => [r.id, JSON.stringify(r)]))
    state.ref = merged
    state.dirty = offlineNew.length > 0
    state.ready = true
    binding.write(merged)
  }

  // ── 1. One-time hydration so nothing flashes empty on load ────────────────
  // Firestore is ALWAYS authoritative: an empty collection means "empty", it
  // does NOT mean "seed the database with whatever this browser happens to
  // hold". `applyRemote` still keeps entities that were genuinely created
  // during THIS session (see `offlineNew`), so a record the operator created
  // while offline is never lost — while stale in-memory/default state can
  // never be pushed as production data.
  options.bindings.forEach((binding) => {
    void loadCollection<SyncEntity>(binding.name)
      .then((remote) => {
        if (stopped) return
        applyRemote(binding, remote)
      })
      .catch((err) => {
        // Hydration failed (offline / rules). Mark the collection ready so the
        // operator's own local edits can still be retried later instead of
        // being blocked forever; the live listener below recovers as soon as
        // Firestore answers again. The failure itself is logged truthfully —
        // a silent drop here is how records vanish between days.
        stateFor(binding.name).ready = true
        console.error(
          `Firestore hydration failed for "${binding.name}":`,
          err instanceof Error ? err.message : err,
        )
      })
  })

  // ── 2. Live listeners: any device's change lands here in real time ────────
  options.bindings.forEach((binding) => {
    unsubscribers.push(
      watchCollection<SyncEntity>(binding.name, (remote) => {
        if (!stopped) applyRemote(binding, remote)
      }),
    )
  })

  // ── 3. Settings document (settings/restaurant) ───────────────────────────
  //
  // NOTHING here. Settings are deliberately NOT part of the background push:
  // the local settings object always contains application defaults, so pushing
  // it (even with `merge: true`) overwrites real Firestore values. A stale,
  // un-hydrated or long-running admin session therefore used to reset the
  // restaurant settings overnight. Settings are now written ONLY by an explicit
  // admin save, field-by-field (see services/firebase/settingsService.ts), and
  // are hydrated + watched separately in RestaurantContext.

  // ── 4. Debounced diff push ────────────────────────────────────────────────
  let timer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let queued = false

  const pushAll = async (): Promise<void> => {
    const role = options.role()
    for (const binding of options.bindings) {
      if (stopped) return
      const state = stateFor(binding.name)
      const items = binding.read() as SyncEntity[]
      // Wait for hydration so a stale local cache can never overwrite Firestore.
      if (!state.ready) continue
      // Fast path: state untouched since the last successful push.
      if (state.ref === items && !state.dirty) continue
      if (!canWriteCollection(binding.name, role)) {
        state.ref = items
        continue
      }
      const next = new Map<string, string>()
      const upserts: SyncEntity[] = []
      for (const item of items) {
        const json = JSON.stringify(item)
        next.set(item.id, json)
        if (state.pushed.get(item.id) !== json) upserts.push(item)
      }
      const deletes: string[] = []
      if (canDeleteCollection(binding.name, role)) {
        for (const id of state.pushed.keys()) if (!next.has(id)) deletes.push(id)
      }
      if (upserts.length === 0 && deletes.length === 0) {
        state.ref = items
        continue
      }
      state.pending = { ids: new Set([...upserts.map((u) => u.id), ...deletes]), at: Date.now() }
      try {
        await saveEntities(binding.name, upserts, deletes)
        state.pushed = next
        state.ref = items
        state.dirty = false
      } catch (err) {
        // Surface the failure truthfully and keep the collection dirty so the
        // automatic retry below replays the SAME diff. Swallowing this error
        // silently was how a record could appear on screen yet never reach
        // Firestore — and be gone after the next reload.
        console.error(
          `Firestore push failed for "${binding.name}":`,
          err instanceof Error ? err.message : err,
        )
        state.dirty = true
        state.pending = null
      }
    }

  }

  /**
   * While any collection still has unpushed changes, retry automatically.
   * Previously a failed push waited indefinitely for some unrelated state
   * change (or a tab visibility event) before it was ever attempted again.
   */
  const scheduleRetryIfNeeded = (): void => {
    if (stopped || retryTimer || timer) return
    const anyDirty = options.bindings.some((binding) => stateFor(binding.name).dirty)
    if (!anyDirty) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      void run()
    }, PUSH_RETRY_MS)
  }

  const run = async (): Promise<void> => {
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      await pushAll()
    } catch (err) {
        if (import.meta.env.DEV) console.error('Firestore sync push failed:', err instanceof Error ? err.message : err)
    } finally {
      running = false
      if (queued) {
        queued = false
        await run()
      } else {
        scheduleRetryIfNeeded()
      }
    }
  }

  const schedule = (): void => {
    if (stopped || timer) return
    timer = setTimeout(() => {
      timer = null
      void run()
    }, PUSH_DEBOUNCE_MS)
  }

  // Anything still unpushed when the tab is closed or hidden is flushed now.
  const flushNow = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    void run()
  }
  document.addEventListener('visibilitychange', flushNow)
  window.addEventListener('beforeunload', flushNow)

  const stop = () => {
    stopped = true
    if (timer) clearTimeout(timer)
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    document.removeEventListener('visibilitychange', flushNow)
    window.removeEventListener('beforeunload', flushNow)
    unsubscribers.forEach((unsub) => unsub())
  }

  return { schedule, stop }
}

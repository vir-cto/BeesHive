/**
 * Bee's Hive — Restaurant Context
 * Single source of truth for all restaurant state.
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { dataMode, isFirebaseConfigured } from '../services/firebase/config'
import { FIRESTORE_COLLECTIONS, loadDoc, saveDoc } from '../services/firebase/dataService'
import {
  RESTAURANT_SETTINGS_DOC_ID,
  buildSettingsPatch,
  createRestaurantSettingsIfMissing,
  logSettings,
  logSettingsError,
  normalizeSettingsNumbers,
  readRestaurantSettings,
  watchRestaurantSettings,
  withSettingsDefaults,
  writeRestaurantSettingsPatch,
} from '../services/firebase/settingsService'
import { startFirebaseSync, type SyncBinding, type SyncEngine } from '../services/firebase/syncEngine'
import {
  SessionCapacityExceededError,
  refreshTableCapacityLedger,
  reserveSession,
} from '../services/firebase/sessionCapacityService'
import { usePrintQueue, enqueueTokenPrint, enqueueBillPrint, createPrintPreviewJob, setPrintServerUrls, printQueue } from '../services/print/printService'
import type { SessionReceiptPayload } from '../services/print/printFormatters'
// import { formatTokenNumber, formatParcelTokenNumber, formatOrderToken } from '../lib/tokenSequence'
import { nextTokenNumber } from '../lib/tokenSequence'
import { servingSuffix } from '../lib/servingType'
import {
  toBusinessDayStr as businessDayStr,
  isSameBusinessDay as businessDayIsSame,
} from '../lib/businessDay'
import { useAuth } from './AuthContext'

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
const round2 = (n: number) => Math.round(n * 100) / 100

const HISTORY_LIMITS = {
  notifications: 300,
  activityLog: 1500,
  stockHistory: 3000,
  inventoryUsage: 3000,
} as const

// ─── Types ───────────────────────────────────────────────────────────────────
export type OrderStatus = 'placed' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled'
export type SessionStatus = 'active' | 'payment_pending' | 'closed'
export type TableStatus = 'available' | 'occupied' | 'cleaning' | 'reserved'
export type StockStatus = 'GOOD' | 'LOW' | 'CRITICAL' | 'OUT_OF_STOCK'
export type PurchaseRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PURCHASED' | 'RECEIVED'
export type OrderPriority = 'normal' | 'fast' | 'vip'
export type PaymentMode = 'CASH' | 'UPI' | 'PHONE_UPI' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'QR_CODE' | 'WALLET'
export const PAYMENT_MODES: PaymentMode[] = ['CASH', 'UPI', 'PHONE_UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'QR_CODE', 'WALLET']

export interface Category { id: string; name: string; active: boolean }

export interface MenuItem {
  id: string; name: string; price: number; description: string; preparationTime: number
  category: string; categoryId: string; available: boolean; active: boolean
  imageUrl?: string; imagePath?: string; imageAlt?: string; minimumOrderQty?: number
  cookingMethod?: string
  createdAt: number; updatedAt: number; priceHistory?: { price: number; changedAt: number; changedBy?: string }[]
  specialDate?: string
  foodType?: 'veg' | 'non_veg'
  isVeg?: boolean
  halfPlatePrice?: number | null
}

export interface Table { id: string; name: string; capacity: number; status: TableStatus; active: boolean; isVip: boolean; currentSessions: number; area?: string; features?: string[]; createdAt?: number; updatedAt?: number }
export interface Session { id: string; tableId: string; guestCount: number; status: SessionStatus; waiterId: string; startTime: number; endTime?: number; createdAt: number; customerName?: string; customerContact?: string; serviceRequested?: boolean; expiresAt?: number; extendedCount?: number; cancelledReason?: string }
export interface OrderItem { id: string; menuItemId: string; name: string; price: number; priceSnapshot: number; nameSnapshot: string; quantity: number; specialRequests?: string; servingType?: 'full' | 'half' }

export interface Order {
  id: string; tableId: string; sessionId: string; waiterId: string; items: OrderItem[]
  status: OrderStatus; tokenNumber?: number; createdAt: number
  orderType?: 'dine_in' | 'parcel'
  confirmedAt?: number; preparingAt?: number; readyAt?: number; servedAt?: number
  totalAmount: number; isVip: boolean; priority: OrderPriority; estimatedReadyAt?: number; preparationStartedAt?: number; estimatedPreparationMinutes?: number
}

export interface BillLine { nameSnapshot: string; priceSnapshot: number; quantity: number; taxAmount: number; servingType?: 'full' | 'half' }
export interface Bill {
  id: string; sessionId: string; tableId: string; billNumber: string
  subtotal: number; cgst: number; sgst: number; serviceCharge: number; parcelCharge?: number; discount: number; grandTotal: number
  status: 'GENERATED' | 'PAID' | 'VOID'; generatedAt: number; lines: BillLine[]
}

export interface PaymentRecord {
  id: string; billId: string; sessionId: string; tableId: string; amount: number
  paymentMode: PaymentMode; recordedBy: string; recordedByName?: string; recordedAt: number; status: 'PENDING' | 'COMPLETED'
  billNumber?: string; waiterId: string
  kind?: 'sale' | 'purchase'
  purchaseRequestId?: string; itemName?: string; quantity?: number; unit?: string; unitCost?: number
  vendor?: string; notes?: string
}

export interface InventoryItem {
  id: string; name: string; quantity: number; unit: string; minimumThreshold: number
  category: string; status: StockStatus; lastUpdated: number; updatedBy?: string; updatedByName?: string; createdAt: number
  active?: boolean; notes?: string
}

export type StockUpdateType = 'DAILY_STOCK_COUNT' | 'STOCK_ADDED' | 'STOCK_ADJUSTMENT' | 'ORDER_CONSUMPTION' | 'OUT_OF_STOCK' | 'RESTOCK' | 'REQUEST_CREATED'

export interface StockUpdate {
  id: string; itemId: string; itemName: string; previousQty: number; newQty: number; difference: number
  unit: string; type: StockUpdateType; reason?: string; updatedBy: string; updatedByName: string; timestamp: number
}

export interface PurchaseRequest {
  id: string; itemId?: string; itemName: string; currentQuantity: number; requestedQuantity: number
  unit: string; priority: 'URGENT' | 'MEDIUM' | 'LOW'; reason?: string; status: PurchaseRequestStatus
  createdAt: number; requestedBy: string; requestedByName: string
  processedBy?: string; processedByName?: string; processedAt?: number
  purchasedQuantity?: number; purchaseUnitCost?: number; purchaseTotalCost?: number
  purchaseVendor?: string; purchaseNote?: string; purchaseMode?: PaymentMode
}

export interface Notification { id: string; title: string; message: string; role: 'admin' | 'supervisor' | 'waiter'; read: boolean; createdAt: number; sessionId?: string; tableId?: string; tableName?: string }
// PrintJob type is imported from ../services/print/printService (single source
// of truth — the local duplicate below was removed; it conflicted with the
// import and lacked the 'session_receipt' kind).

export interface RestaurantSettings {
  restaurantName: string; address: string; phone: string; email: string; gstin: string
  fssaiLicenseNumber: string
  taxRate: number; serviceCharge: number; serviceChargeMode: 'percent' | 'rupees'; parcelCharge: number; currency: string; locale: string
  dateFormat: string; timeFormat: string; invoiceFooter: string; receiptFooter: string; tokenFooter: string; paper58mm: boolean
  prepWarningMinutes: number; businessHoursStart: string; businessHoursEnd: string
  tokenPrinterName: string; billPrinterName: string; kitchenPrintServerUrl: string; adminPrintServerUrl: string; printRetryCount: number
  inventoryViewMode?: 'large' | 'medium' | 'small' | 'smaller' | 'list'
}

export interface InventoryUsage {
  id: string; orderId: string; menuItemName: string; itemName: string
  quantity: number; unit: string; timestamp: number; recordedBy?: string
}

export interface RecipeIngredient { inventoryItemId: string; name: string; quantity: number; unit: string }
export interface Recipe { id: string; menuItemId: string; ingredients: RecipeIngredient[]; updatedAt: number }

export interface ActivityItem {
  id: string; type: string; title: string; subtitle: string
  metadata?: Record<string, unknown>; createdAt: number; userId: string; userName: string
  action?: string; entity?: string; entityId?: string; timestamp?: number; role?: string
}

export type NotificationItem = Notification

export interface DailySummary {
  date: string
  orders: number
  servedOrders: number
  cancelledOrders: number
  sessions: number
  guests: number
  bills: number
  billedRevenue: number
  collectedRevenue: number
  tokens: number
  dineInTokens: number
  parcelTokens: number
  byMode: Partial<Record<PaymentMode, number>>
}

// ─── Context Interface ────────────────────────────────────────────────────────

interface RestaurantContextValue {
  tables: Table[]; sessions: Session[]; orders: Order[]; menu: MenuItem[]; categories: Category[]
  inventory: InventoryItem[]; purchaseRequests: PurchaseRequest[]; bills: Bill[]; paymentRecords: PaymentRecord[]
  notifications: Notification[]; settings: RestaurantSettings; users: { id: string; name: string }[]; stockHistory: StockUpdate[]; activityLog: ActivityItem[]; inventoryUsage: InventoryUsage[]; recipes: Recipe[]

  saveRecipe: (menuItemId: string, ingredients: RecipeIngredient[]) => Recipe
  getRecipeForMenuItem: (menuItemId: string) => Recipe | undefined

  createOrder: (tableId: string, waiterId: string, sessionId: string, items: { menuItemId: string; name: string; price: number; quantity: number; specialRequests?: string; servingType?: 'full' | 'half' }[], priority: OrderPriority, orderType?: 'dine_in' | 'parcel') => Promise<Order>
  confirmOrder: (orderId: string) => Order
  updateOrderStatus: (orderId: string, status: OrderStatus) => void
  setOrderReady: (orderId: string) => void
  serveOrder: (orderId: string) => void
  addCategory: (name: string) => Category
  addMenuItem: (data: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>) => MenuItem
  updateMenuItemDetails: (id: string, data: Partial<MenuItem>) => void
  updateMenuItemPrice: (id: string, price: number) => void
  toggleMenuItemAvailability: (id: string, available: boolean) => void
  setMenuItemActive: (id: string, active: boolean) => void
  renameCategory: (id: string, name: string) => void
  deactivateCategory: (id: string) => void
  deleteCategory: (id: string) => void
  deleteMenuItem: (id: string) => void
  setSpecialDate: (itemId: string, date?: string, mealType?: string) => void
  getTodaySpecials: () => MenuItem[]
  calculateMenuPriceHistory: (itemId: string) => NonNullable<MenuItem['priceHistory']>
  /**
   * Start a dining session for a table. Rejects (without writing anything) when
   * the table does not have enough remaining capacity for `guestCount` guests.
   */
  createSession: (tableId: string, guestCount: number, waiterId: string, customerName?: string, customerContact?: string, durationMinutes?: number) => Promise<Session>
  getActiveSessionsForTable: (tableId: string) => Session[]
  getTableOccupancy: (tableId: string) => { capacity: number; occupied: number; available: number }
  requestService: (sessionId: string, tableId: string, waiterId: string) => void
  cancelSession: (sessionId: string, reason?: string) => void
  extendSession: (sessionId: string, minutes: number) => void
  closeSession: (sessionId: string) => void
  completeCleaning: (tableId: string, assumeClosedSessionId?: string) => void
  generateBill: (sessionId: string) => Bill
  generateParcelBill: (orderId: string) => Bill
  recordPayment: (data: { billId: string; sessionId: string; tableId: string; amount: number; paymentMode: PaymentMode; recordedBy: string }) => PaymentRecord
  reprintBill: (billId: string) => void
  addInventoryItem: (data: Omit<InventoryItem, 'id' | 'createdAt' | 'status' | 'lastUpdated'>) => InventoryItem
  updateInventoryQuantity: (id: string, quantity: number) => void
  addStock: (id: string, quantity: number, reason: string) => StockUpdate
  adjustStock: (id: string, quantity: number, reason: string) => StockUpdate
  markOutOfStock: (id: string) => void
  dailyStockUpdate: (id: string, newQuantity: number, updatedBy: string, updatedByName: string) => StockUpdate
  requestStock: (itemId: string, itemName: string, currentQuantity: number, requestedQuantity: number, unit: string, reason: string, priority: 'URGENT' | 'MEDIUM' | 'LOW') => PurchaseRequest
  createPurchaseRequest: (data: Omit<PurchaseRequest, 'id' | 'status' | 'createdAt' | 'requestedBy' | 'requestedByName'>) => PurchaseRequest
  updatePurchaseRequestStatus: (requestId: string, status: PurchaseRequestStatus) => void
  markPurchaseRequestPurchased: (requestId: string, details: { quantity: number; unitCost: number; totalCost: number; vendor?: string; note?: string; paymentMode: PaymentMode; newItem?: { name: string; unit: string; minimumThreshold: number; category?: string }; targetItemId?: string }) => void
  recordInventoryPurchase: (details: { itemId: string; quantity: number; unitCost: number; totalCost: number; vendor?: string; note?: string; paymentMode: PaymentMode; newItem?: { name: string; unit: string; minimumThreshold: number; category?: string } }) => void
  addNotification: (title: string, message: string, role: string, refs?: { sessionId?: string; tableId?: string; tableName?: string }) => Notification
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (role?: string) => void
  getRecentActivity: (limit?: number, date?: string) => ActivityItem[]
  addActivity: (item: Omit<ActivityItem, 'id' | 'createdAt'>) => ActivityItem
  getStockHistory: (itemId: string) => StockUpdate[]
  getStockUsage: (itemId: string) => StockUpdate[]
  getDailySummary: (date: string) => DailySummary
  getDailyHistory: (limit?: number) => DailySummary[]
  updateSettings: (data: Partial<RestaurantSettings>) => Promise<void>
  /** Settings hydration state: 'pending' until Firestore answered, 'error' when it could not be read. */
  settingsHydration: 'pending' | 'ready' | 'error'
  addTable: (data: { name: string; capacity: number; isVip?: boolean; status?: TableStatus; active?: boolean; area?: string; features?: string[] }) => Table
  updateTable: (id: string, data: Partial<Table>) => void
  deactivateTable: (id: string) => void
  activateTable: (id: string) => void
  deleteTable: (id: string) => void
  updateInventoryItem: (id: string, data: Partial<Pick<InventoryItem, 'name' | 'category' | 'unit' | 'minimumThreshold' | 'quantity' | 'notes' | 'active'>>) => void
  deleteInventoryItem: (id: string) => void
  resetRestaurantData: () => void
  printJobs: ReturnType<typeof usePrintQueue>
  printOrderToken: (orderId: string) => ReturnType<typeof usePrintQueue>[number] | null
  previewOrderToken: (orderId: string) => ReturnType<typeof usePrintQueue>[number] | null
  printSessionReceipt: (sessionId: string) => ReturnType<typeof usePrintQueue>[number] | null
  setStockRemaining: (id: string, quantity: number) => void
  persistToLocalStorage: () => void
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null)

export function useRestaurant() {
  const context = useContext(RestaurantContext)
  if (!context) throw new Error('useRestaurant must be used within a RestaurantProvider')
  return context
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Business-day filtering is FIXED to IST (the restaurant's calendar). The
// previous local-time implementation made "Today" depend on whatever timezone
// the device happened to run in; the shared module keeps every device,
// refresh and analytics view on the exact same day boundary.
export const isSameBusinessDay = (timestamp: number, dateStr: string) =>
  businessDayIsSame(timestamp, dateStr)
const toDateStr = (d: Date) => businessDayStr(d.getTime())
const getBusinessDay = (timestamp: number) => businessDayStr(timestamp)

const computeStockStatus = (quantity: number, minimumThreshold: number): StockStatus => {
  if (quantity <= 0) return 'OUT_OF_STOCK'
  if (quantity <= minimumThreshold) return 'LOW'
  return 'GOOD'
}

// ─── Default Data ─────────────────────────────────────────────────────────────

const defaultSettings: RestaurantSettings = {
  restaurantName: "Bee's Hive", address: '', phone: '', email: '', gstin: '', fssaiLicenseNumber: '',
  taxRate: 5, serviceCharge: 5, serviceChargeMode: 'percent', parcelCharge: 0, currency: 'INR', locale: 'en-IN',
  dateFormat: 'DD/MM/YYYY', timeFormat: '12', invoiceFooter: 'Thank you for visiting!', receiptFooter: 'Thank you for visiting!', tokenFooter: 'Enjoy your meal!',
  paper58mm: false, prepWarningMinutes: 15, businessHoursStart: '10:00', businessHoursEnd: '23:00',
  tokenPrinterName: 'Kitchen Token Printer', billPrinterName: 'Admin Bill Printer',
  kitchenPrintServerUrl: '', adminPrintServerUrl: '', printRetryCount: 3
}

const OLD_DEFAULT_TAX_RATE = 9
const OLD_DEFAULT_SETTINGS: RestaurantSettings = { ...defaultSettings, taxRate: OLD_DEFAULT_TAX_RATE }

const migrateSettings = (stored: RestaurantSettings): RestaurantSettings => {
  const merged = { ...defaultSettings, ...stored }
  if (JSON.stringify(merged) === JSON.stringify(OLD_DEFAULT_SETTINGS)) {
    return { ...merged, taxRate: defaultSettings.taxRate }
  }
  return merged
}

const defaultTables: Table[] = []
const defaultCategories: Category[] = []
const defaultMenu: MenuItem[] = []
const defaultInventory: InventoryItem[] = []

const STORAGE_KEYS = {
  tables: 'beeshive_tables', sessions: 'beeshive_sessions', orders: 'beeshive_orders',
  menu: 'beeshive_menu', categories: 'beeshive_categories', inventory: 'beeshive_inventory',
  purchaseRequests: 'beeshive_purchaseRequests', bills: 'beeshive_bills',
  paymentRecords: 'beeshive_paymentRecords', notifications: 'beeshive_notifications',
  stockHistory: 'beeshive_stockHistory', inventoryUsage: 'beeshive_inventoryUsage',
  activityLog: 'beeshive_activityLog', recipes: 'beeshive_recipes', settings: 'beeshive_settings'
}

const readStored = <T,>(key: string, fallback: T): T => {
  if (dataMode !== 'mock') return fallback
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

export const inferFoodType = (name: string): 'veg' | 'non_veg' => {
  const n = (name || '').toLowerCase()
  if (/(chicken|mutton|fish|egg|prawn|meat|keema|non[- ]?veg)/.test(n)) return 'non_veg'
  return 'veg'
}

const normalizeMenuItems = (items: MenuItem[]): MenuItem[] =>
  (items || []).map((m: MenuItem) =>
    m.foodType === 'veg' || m.foodType === 'non_veg'
      ? m
      : typeof m.isVeg === 'boolean'
        ? { ...m, foodType: m.isVeg ? 'veg' : 'non_veg' }
        : { ...m, foodType: inferFoodType(m.name) }
  )

/**
 * The stock status is DERIVED from the authoritative quantity + minimum stock
 * (see `computeStockStatus`) — it is never a stored priority and never a
 * per-day value. Inventory documents written by an older build, or before a
 * threshold was edited, can therefore carry a stale `status`; that made a real
 * item (e.g. Semiy(a), 0 kg) fail to appear in the OUT OF STOCK list/filter and
 * in the dashboard counts even though the record itself was present.
 * Recomputing on hydration keeps every screen and every counter on the SAME
 * rule while leaving the master inventory list itself untouched (items are
 * permanent stock records — they are never filtered by date).
 */
const normalizeInventoryItems = (items: InventoryItem[]): InventoryItem[] =>
  (items || []).map((item: InventoryItem) => {
    const status = computeStockStatus(
      Number(item.quantity) || 0,
      Number(item.minimumThreshold) || 0,
    )
    return item.status === status ? item : { ...item, status }
  })

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (dataMode !== 'firebase') return
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key))
    Object.keys(localStorage)
      .filter((key) => key.startsWith('beeshive_token_counter_'))
      .forEach((key) => localStorage.removeItem(key))
  }, [])

  const [tables, setTables] = useState<Table[]>(() => readStored(STORAGE_KEYS.tables, defaultTables))
  const [sessions, setSessions] = useState<Session[]>(() => readStored(STORAGE_KEYS.sessions, []))
  const [orders, setOrders] = useState<Order[]>(() => readStored(STORAGE_KEYS.orders, []))
  const ordersRef = useRef(orders)
  ordersRef.current = orders
  const tablesRef = useRef(tables)
  tablesRef.current = tables

  const [menu, setMenu] = useState<MenuItem[]>(() => normalizeMenuItems(readStored(STORAGE_KEYS.menu, defaultMenu)))
  const [categories, setCategories] = useState<Category[]>(() => readStored(STORAGE_KEYS.categories, defaultCategories))
  const [inventory, setInventory] = useState<InventoryItem[]>(() => readStored(STORAGE_KEYS.inventory, defaultInventory))
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>(() => readStored(STORAGE_KEYS.purchaseRequests, []))
  const [bills, setBills] = useState<Bill[]>(() => readStored(STORAGE_KEYS.bills, []))
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>(() => readStored(STORAGE_KEYS.paymentRecords, []))
  const [notifications, setNotifications] = useState<Notification[]>(() => readStored(STORAGE_KEYS.notifications, []))
  const [stockHistory, setStockHistory] = useState<StockUpdate[]>(() => readStored(STORAGE_KEYS.stockHistory, []))
  const [activityLog, setActivityLog] = useState<ActivityItem[]>(() => readStored(STORAGE_KEYS.activityLog, []))
  const [inventoryUsage, setInventoryUsage] = useState<InventoryUsage[]>(() => readStored(STORAGE_KEYS.inventoryUsage, []))
  const [settings, setSettings] = useState<RestaurantSettings>(() => migrateSettings(readStored(STORAGE_KEYS.settings, defaultSettings)))
  const [recipes, setRecipes] = useState<Recipe[]>(() => readStored(STORAGE_KEYS.recipes, []))
  const [users] = useState<{ id: string; name: string }[]>([])
  const printJobs = usePrintQueue()

  useEffect(() => {
    setPrintServerUrls(settings.kitchenPrintServerUrl, settings.adminPrintServerUrl, settings.printRetryCount)
  }, [settings.kitchenPrintServerUrl, settings.adminPrintServerUrl, settings.printRetryCount])

  const { user: authUser } = useAuth()
  const actorRef = useRef({ id: 'system', name: 'System' })
  actorRef.current = { id: authUser?.id ?? 'system', name: authUser?.name ?? 'System' }

  const persistToLocalStorage = useCallback(() => {
    if (dataMode !== 'mock') return
    try {
      localStorage.setItem(STORAGE_KEYS.tables, JSON.stringify(tables))
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions))
      localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders))
      localStorage.setItem(STORAGE_KEYS.menu, JSON.stringify(menu))
      localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories))
      localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(inventory))
      localStorage.setItem(STORAGE_KEYS.purchaseRequests, JSON.stringify(purchaseRequests))
      localStorage.setItem(STORAGE_KEYS.bills, JSON.stringify(bills))
      localStorage.setItem(STORAGE_KEYS.paymentRecords, JSON.stringify(paymentRecords))
      localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(notifications))
      localStorage.setItem(STORAGE_KEYS.stockHistory, JSON.stringify(stockHistory))
      localStorage.setItem(STORAGE_KEYS.inventoryUsage, JSON.stringify(inventoryUsage))
      localStorage.setItem(STORAGE_KEYS.activityLog, JSON.stringify(activityLog))
      localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(recipes))
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
    } catch (e) {
            if (import.meta.env.DEV) console.error('Failed to persist:', e)
    }
  }, [tables, sessions, orders, menu, categories, inventory, purchaseRequests, bills, paymentRecords, notifications, stockHistory, inventoryUsage, activityLog, settings, recipes])

  useEffect(() => {
    // Realtime remote updates are handled by the Firebase sync engine
    // (startFirebaseSync below): it hydrates every collection, keeps live
    // onSnapshot listeners and merges offline-created records safely.
    // A raw `onSnapshot` here would bypass that merge logic and clobber local
    // state mid-service, so it was removed.
    if (dataMode !== 'firebase') return
  }, [])

  useEffect(() => {
    const id = setTimeout(persistToLocalStorage, 250)
    return () => clearTimeout(id)
  }, [tables, sessions, orders, menu, categories, inventory, purchaseRequests, bills, paymentRecords, notifications, stockHistory, inventoryUsage, activityLog, settings, recipes, persistToLocalStorage])

  const persistRef = useRef(persistToLocalStorage)
  persistRef.current = persistToLocalStorage
  useEffect(() => {
    const flush = () => persistRef.current()
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

  useEffect(() => {
    if (dataMode !== 'mock') return
    const applyIfChanged = (key: string, prev: unknown): unknown => {
      const raw = localStorage.getItem(key)
      if (!raw) return prev
      try {
        const next = JSON.parse(raw)
        return raw === JSON.stringify(prev) ? prev : next
      } catch {
        return prev
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (e.key === STORAGE_KEYS.notifications) {
        setNotifications((prev) => applyIfChanged(STORAGE_KEYS.notifications, prev) as Notification[])
      } else if (e.key === STORAGE_KEYS.orders) {
        setOrders((prev) => {
          const n = applyIfChanged(STORAGE_KEYS.orders, prev) as Order[]
          if (n !== prev) ordersRef.current = n
          return n
        })
      } else if (e.key === STORAGE_KEYS.sessions) {
        setSessions((prev) => applyIfChanged(STORAGE_KEYS.sessions, prev) as Session[])
      } else if (e.key === STORAGE_KEYS.menu) {
        setMenu((prev) => normalizeMenuItems(applyIfChanged(STORAGE_KEYS.menu, prev) as MenuItem[]))
      } else if (e.key === STORAGE_KEYS.categories) {
        setCategories((prev) => applyIfChanged(STORAGE_KEYS.categories, prev) as Category[])
      } else if (e.key === STORAGE_KEYS.tables) {
        setTables((prev) => applyIfChanged(STORAGE_KEYS.tables, prev) as Table[])
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const stateRef = useRef({
    tables, sessions, orders, menu, categories, inventory, purchaseRequests,
    bills, paymentRecords, notifications, stockHistory, inventoryUsage,
    activityLog, recipes, settings,
  })
  stateRef.current = {
    tables, sessions, orders, menu, categories, inventory, purchaseRequests,
    bills, paymentRecords, notifications, stockHistory, inventoryUsage,
    activityLog, recipes, settings,
  }

  const engineRef = useRef<SyncEngine | null>(null)

  useEffect(() => {
    if (!authUser) return
    const bindings: SyncBinding[] = [
      { name: FIRESTORE_COLLECTIONS.orders, read: () => stateRef.current.orders, write: (items) => setOrders(items as Order[]) },
      { name: FIRESTORE_COLLECTIONS.sessions, read: () => stateRef.current.sessions, write: (items) => setSessions(items as Session[]) },
      { name: FIRESTORE_COLLECTIONS.tables, read: () => stateRef.current.tables, write: (items) => setTables(items as Table[]) },
      { name: FIRESTORE_COLLECTIONS.menu, read: () => stateRef.current.menu, write: (items) => setMenu(normalizeMenuItems(items as MenuItem[])) },
      { name: FIRESTORE_COLLECTIONS.categories, read: () => stateRef.current.categories, write: (items) => setCategories(items as Category[]) },
      { name: FIRESTORE_COLLECTIONS.bills, read: () => stateRef.current.bills, write: (items) => setBills(items as Bill[]) },
      { name: FIRESTORE_COLLECTIONS.paymentRecords, read: () => stateRef.current.paymentRecords, write: (items) => setPaymentRecords(items as PaymentRecord[]) },
      { name: FIRESTORE_COLLECTIONS.notifications, read: () => stateRef.current.notifications, write: (items) => setNotifications(items as Notification[]) },
      { name: FIRESTORE_COLLECTIONS.inventory, read: () => stateRef.current.inventory, write: (items) => setInventory(normalizeInventoryItems(items as InventoryItem[])) },
      { name: FIRESTORE_COLLECTIONS.stockHistory, read: () => stateRef.current.stockHistory, write: (items) => setStockHistory(items as StockUpdate[]) },
      { name: FIRESTORE_COLLECTIONS.inventoryUsage, read: () => stateRef.current.inventoryUsage, write: (items) => setInventoryUsage(items as InventoryUsage[]) },
      { name: FIRESTORE_COLLECTIONS.purchaseRequests, read: () => stateRef.current.purchaseRequests, write: (items) => setPurchaseRequests(items as PurchaseRequest[]) },
      { name: FIRESTORE_COLLECTIONS.recipes, read: () => stateRef.current.recipes, write: (items) => setRecipes(items as Recipe[]) },
      { name: FIRESTORE_COLLECTIONS.activityLog, read: () => stateRef.current.activityLog, write: (items) => setActivityLog(items as ActivityItem[]) },
    ]
    const engine = startFirebaseSync({
      role: () => authUser.role,
      bindings,
    })
    engineRef.current = engine
    return () => {
      engineRef.current = null
      engine.stop()
    }
  }, [authUser])

  useEffect(() => {
    engineRef.current?.schedule()
  }, [tables, sessions, orders, menu, categories, inventory, purchaseRequests, bills, paymentRecords, notifications, stockHistory, inventoryUsage, activityLog, recipes])

  // ─── Restaurant settings persistence (settings/restaurant) ────────────────
  //
  // Deliberately separate from the collection sync engine:
  //   • startup hydrates FROM Firestore (defaults only fill fields that do not
  //     exist in the document — an existing document is never written back);
  //   • the document is created once, and only when it truly does not exist;
  //   • a live read-only listener keeps every session on the stored values;
  //   • only an explicit admin save writes, and it writes just the edited
  //     fields with merge:true (see updateSettings below).
  const [settingsHydration, setSettingsHydration] = useState<'pending' | 'ready' | 'error'>(
    dataMode === 'firebase' ? 'pending' : 'ready',
  )
  const settingsHydratedRef = useRef(dataMode !== 'firebase')
  // A just-saved patch is shielded for a few seconds so a snapshot that was
  // already in flight cannot visually revert the operator's save.
  const settingsWriteShieldRef = useRef<{ patch: Record<string, unknown>; at: number } | null>(null)

  useEffect(() => {
    if (dataMode !== 'firebase' || !isFirebaseConfigured() || !authUser) return
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    const applyRemote = (remote: Record<string, unknown>, source: 'init' | 'create' | 'live') => {
      if (cancelled) return
      const shield = settingsWriteShieldRef.current
      const shielded =
        source === 'live' && shield && Date.now() - shield.at < 15_000
          ? shield.patch
          : null
      setSettings((prev) => {
        // Firestore is authoritative; `prev` (defaults + this session's edits)
        // only fills fields the document genuinely does not have.
        const merged = withSettingsDefaults(prev, remote)
        const next = normalizeSettingsNumbers(
          shielded ? ({ ...merged, ...shielded } as RestaurantSettings) : merged,
        )
        if (shielded && Object.entries(shielded).every(([key, value]) => remote[key] === value)) {
          settingsWriteShieldRef.current = null
        }
        return next
      })
      const tag = source === 'live' ? 'REMOTE' : 'HYDRATED'
      logSettings(tag, `source=${source}\nuid=${authUser.id}\nkeys=${Object.keys(remote).length}\ndata=${JSON.stringify(remote)}`)
    }

    void (async () => {
      try {
        const snapshot = await readRestaurantSettings(RESTAURANT_SETTINGS_DOC_ID)
        if (cancelled) return
        if (snapshot.exists && snapshot.data) {
          logSettings('INIT', `firestoreDocumentExists=true\naction=hydrate\nuid=${authUser.id}`)
          applyRemote(snapshot.data, 'init')
        } else if (authUser.role !== 'admin') {
          // Readers cannot create the document (Firestore rules); keep defaults
          // in memory and never attempt a write.
          logSettings('INIT', `firestoreDocumentExists=false\naction=skip\nreason=non-admin\nuid=${authUser.id}`)
        } else {
          const created = await createRestaurantSettingsIfMissing(
            buildSettingsPatch(stateRef.current.settings) as Partial<RestaurantSettings>,
            RESTAURANT_SETTINGS_DOC_ID,
          )
          if (cancelled) return
          logSettings(
            'INIT',
            `firestoreDocumentExists=false\naction=${created.created ? 'create' : 'skip'}\nuid=${authUser.id}`,
          )
          if (created.data) applyRemote(created.data, 'create')
        }
        settingsHydratedRef.current = true
        setSettingsHydration('ready')
        if (!cancelled) {
          unsubscribe = watchRestaurantSettings((snap) => {
            if (snap.exists && snap.data) applyRemote(snap.data, 'live')
          }, RESTAURANT_SETTINGS_DOC_ID)
        }
      } catch (err) {
        if (cancelled) return
        // Hydration failed (offline / rules / transient). Keep whatever the app
        // already has on screen, but mark it as unverified: updateSettings will
        // re-read Firestore before it is allowed to write anything.
        settingsHydratedRef.current = false
        setSettingsHydration('error')
        logSettingsError('settingsHydration', err)
      }
    })()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [authUser])


  // ─── Core Actions ─────────────────────────────────────────────────────────

  const addActivity = useCallback((item: Omit<ActivityItem, 'id' | 'createdAt'>): ActivityItem => {
    const newAct: ActivityItem = {
      id: createId('act'),
      createdAt: Date.now(),
      ...item,
    }
    setActivityLog((prev) => [newAct, ...prev].slice(0, HISTORY_LIMITS.activityLog))
    return newAct
  }, [])

  const createOrder = useCallback(async (
    tableId: string,
    waiterId: string,
    sessionId: string,
    items: { menuItemId: string; name: string; price: number; quantity: number; specialRequests?: string; servingType?: 'full' | 'half' }[],
    priority: OrderPriority,
    orderType: 'dine_in' | 'parcel' = 'dine_in'
  ): Promise<Order> => {
    const totalAmount = items.reduce((acc, i) => acc + i.price * i.quantity, 0)
    const tokenNumber = await nextTokenNumber(orderType)
    
    const formattedItems: OrderItem[] = items.map((i) => ({
      id: createId('item'),
      menuItemId: i.menuItemId,
      name: i.name,
      price: i.price,
      priceSnapshot: i.price,
      nameSnapshot: i.name,
      quantity: i.quantity,
      specialRequests: i.specialRequests,
      servingType: i.servingType,
    }))

    const newOrder: Order = {
      id: createId('ord'),
      tableId,
      sessionId,
      waiterId,
      items: formattedItems,
      status: 'placed',
      tokenNumber,
      createdAt: Date.now(),
      orderType,
      totalAmount,
      isVip: priority === 'vip',
      priority,
    }

    // Mirror the brand-new order into the ref immediately. React state updates
    // are batched/async, but the click handler that created the order calls
    // confirmOrder(created.id) in the same tick — a stale ref made that lookup
    // fail and crashed the cart modal with "reading 'id' of undefined".
    ordersRef.current = [newOrder, ...ordersRef.current]
    setOrders((prev) => [newOrder, ...prev])
    addActivity({
      type: 'order_created',
      title: `Order Created (${orderType.toUpperCase()})`,
      subtitle: `Token #${tokenNumber} · ₹${totalAmount}`,
      userId: actorRef.current.id,
      userName: actorRef.current.name,
      entity: 'order',
      entityId: newOrder.id,
    })

    return newOrder
  }, [addActivity])

  const confirmOrder = useCallback((orderId: string): Order => {
    // Resolve the order from the ref (kept in sync with state + same-tick
    // writes) instead of relying on a variable assigned inside the setOrders
    // updater. React runs updaters later, so the old code always saw
    // `updated === null` and returned `undefined` through the non-null
    // assertion on the stale ref -> "Cannot read properties of undefined
    // (reading 'id')" in the waiter cart / parcel modals.
    const existing = orderId ? ordersRef.current.find((o) => o.id === orderId) : undefined
    if (!existing) throw new Error('Order not found')
    // Idempotent: if already confirmed, return the existing confirmed order.
    if (existing.status === 'confirmed') return existing
    const updated: Order = { ...existing, status: 'confirmed', confirmedAt: Date.now() }
    ordersRef.current = ordersRef.current.map((o) => (o.id === orderId ? updated : o))
    setOrders((prev) => prev.map((ord) => (ord.id === orderId ? updated : ord)))

    addActivity({
      type: 'order_confirmed',
      title: 'Order Confirmed',
      subtitle: `Order ${updated.id}`,
      userId: actorRef.current.id,
      userName: actorRef.current.name,
      entity: 'order',
      entityId: updated.id,
    })

    return updated
  }, [addActivity])

  const updateOrderStatus = useCallback((orderId: string, status: OrderStatus) => {
    setOrders((prev) =>
      prev.map((ord) => (ord.id === orderId ? { ...ord, status } : ord))
    )
  }, [])

  const setOrderReady = useCallback((orderId: string) => {
    updateOrderStatus(orderId, 'ready')
  }, [updateOrderStatus])

  const serveOrder = useCallback((orderId: string) => {
    updateOrderStatus(orderId, 'served')
  }, [updateOrderStatus])

  const saveRecipe = useCallback((menuItemId: string, ingredients: RecipeIngredient[]): Recipe => {
    const existing = recipes.find((r) => r.menuItemId === menuItemId)
    const updated: Recipe = {
      id: existing?.id || createId('recipe'),
      menuItemId,
      ingredients,
      updatedAt: Date.now(),
    }
    setRecipes((prev) => [...prev.filter((r) => r.menuItemId !== menuItemId), updated])
    return updated
  }, [recipes])

  const getRecipeForMenuItem = useCallback((menuItemId: string) => {
    return recipes.find((r) => r.menuItemId === menuItemId)
  }, [recipes])

  const addCategory = useCallback((name: string): Category => {
    const cat: Category = { id: createId('cat'), name, active: true }
    setCategories((prev) => [...prev, cat])
    return cat
  }, [])

  const addMenuItem = useCallback((data: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>): MenuItem => {
    const item: MenuItem = {
      ...data,
      id: createId('menu'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      foodType: data.foodType || inferFoodType(data.name),
    }
    setMenu((prev) => [...prev, item])
    return item
  }, [])

  const updateMenuItemDetails = useCallback((id: string, data: Partial<MenuItem>) => {
    setMenu((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...data, updatedAt: Date.now() } : item
      )
    )
  }, [])

  const updateMenuItemPrice = useCallback((id: string, price: number) => {
    setMenu((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const history = item.priceHistory || []
          return {
            ...item,
            price,
            updatedAt: Date.now(),
            priceHistory: [...history, { price: item.price, changedAt: Date.now(), changedBy: actorRef.current.name }],
          }
        }
        return item
      })
    )
  }, [])

  const toggleMenuItemAvailability = useCallback((id: string, available: boolean) => {
    setMenu((prev) => prev.map((m) => (m.id === id ? { ...m, available } : m)))
  }, [])

  const setMenuItemActive = useCallback((id: string, active: boolean) => {
    setMenu((prev) => prev.map((m) => (m.id === id ? { ...m, active } : m)))
  }, [])

  const renameCategory = useCallback((id: string, name: string) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))
  }, [])

  const deactivateCategory = useCallback((id: string) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, active: false } : c)))
  }, [])

  const deleteCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const deleteMenuItem = useCallback((id: string) => {
    setMenu((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const setSpecialDate = useCallback((itemId: string, date?: string) => {
    setMenu((prev) => prev.map((m) => (m.id === itemId ? { ...m, specialDate: date } : m)))
  }, [])

  const getTodaySpecials = useCallback(() => {
    const today = toDateStr(new Date())
    return menu.filter((m) => m.specialDate === today)
  }, [menu])

  const calculateMenuPriceHistory = useCallback((itemId: string) => {
    return menu.find((m) => m.id === itemId)?.priceHistory || []
  }, [menu])

  /**
   * Start a dining session on a physical table.
   *
   * A table's capacity is the maximum TOTAL number of guests seated across ALL
   * of its active sessions, so one table may host several independent sessions
   * (T-01, capacity 4 → 2 guests + 2 guests). Every session owns its own id,
   * guests, orders, bill and lifecycle — sessions are never merged.
   *
   * Capacity is checked twice on purpose:
   *   • here, against the newest local state — instant feedback for the operator;
   *   • in `reserveSession()`, inside a Firestore transaction — the authoritative
   *     check that also protects the data when two waiters act simultaneously.
   * Neither check ever replaces `getActiveSessionsForTable()`; both use the same
   * `status !== 'closed'` lifecycle so completed sessions free their seats.
   */
  const createSession = useCallback(async (tableId: string, guestCount: number, waiterId: string, customerName?: string, customerContact?: string, durationMinutes?: number): Promise<Session> => {
    const guests = Math.floor(Number(guestCount))
    if (!Number.isFinite(guests) || guests < 1) {
      throw new Error('At least 1 guest is required to start a session.')
    }
    const table = tablesRef.current.find((t) => t.id === tableId)
    if (!table) {
      throw new Error('This table is no longer available — refresh the table list and try again.')
    }
    const capacity = Math.max(0, Math.floor(Number(table.capacity) || 0))
    const activeSessions = stateRef.current.sessions.filter((s) => s.tableId === tableId && s.status !== 'closed')
    const occupied = activeSessions.reduce((sum, s) => sum + Math.max(0, Math.floor(Number(s.guestCount) || 0)), 0)
    if (capacity > 0 && occupied + guests > capacity) {
      throw new SessionCapacityExceededError(capacity, occupied, guests)
    }

    const now = Date.now()
    const session: Session = {
      id: createId('sess'),
      tableId,
      guestCount: guests,
      status: 'active',
      waiterId,
      startTime: now,
      createdAt: now,
      customerName,
      customerContact,
      // Stay duration chosen in the waiter's "Start Dining Session" dialog —
      // without it `expiresAt` stayed undefined and the countdown UI (and the
      // auto "stay time over" prompt) could never work.
      ...(durationMinutes && durationMinutes > 0 ? { expiresAt: now + durationMinutes * 60000 } : {}),
    }

    // Authoritative, atomic reservation. A rejected reservation writes NOTHING,
    // so an over-capacity session can never reach the database. When the device
    // is offline the transaction cannot run and the app keeps its existing
    // offline-first behaviour (the sync engine pushes the session on reconnect).
    const reserved = await reserveSession(session)

    // Only add the session to local state when the reservation was actually
    // persisted (or when Firebase is not configured and we are in mock mode).
    // A `authoritative: false` return means the transaction did not run — do NOT
    // present a session that does not exist in Firestore.
    if (reserved.authoritative) {
      setSessions((prev) => [session, ...prev])
      setTables((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, status: 'occupied', currentSessions: (t.currentSessions || 0) + 1 } : t))
      )
    }
    return session
  }, [])

  const getActiveSessionsForTable = useCallback((tableId: string) => {
    return sessions.filter((s) => s.tableId === tableId && s.status !== 'closed')
  }, [sessions])

  const getTableOccupancy = useCallback((tableId: string) => {
    const table = tables.find((t) => t.id === tableId)
    const active = getActiveSessionsForTable(tableId)
    const occupied = active.reduce((acc, s) => acc + s.guestCount, 0)
    const capacity = table?.capacity || 0
    return { capacity, occupied, available: Math.max(0, capacity - occupied) }
  }, [tables, getActiveSessionsForTable])

  const requestService = useCallback((sessionId: string, tableId: string, _waiterId: string) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, serviceRequested: true } : s)))
    // The receiving waiter must see WHICH table called: resolve the real table
    // name from the live tables state (never hardcode, never infer from the
    // waiter's name, never show only the opaque session id). The table/session
    // references are persisted on the notification document itself.
    const tableName = tablesRef.current.find((t) => t.id === tableId)?.name
    addNotification(
      'Call Service',
      tableName ? `Table ${tableName} requested service.` : `Table request for session ${sessionId}`,
      'waiter',
      { sessionId, tableId, tableName },
    )
    // addNotification is declared later in this provider and is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * A session that stops occupying a table immediately frees its seats again:
   * the derived capacity ledger of that table is refreshed from the
   * authoritative session documents. Best effort by design — the ledger is a
   * summary, and `reserveSession()` always recomputes from the real sessions.
   */
  const releaseTableCapacity = useCallback((session: Session | undefined) => {
    if (!session) return
    void refreshTableCapacityLedger(session.tableId, session.id).catch(() => {})
  }, [])

  const cancelSession = useCallback((sessionId: string, reason?: string) => {
    const target = stateRef.current.sessions.find((s) => s.id === sessionId)
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: 'closed', cancelledReason: reason, endTime: Date.now() } : s)))
    releaseTableCapacity(target)
  }, [releaseTableCapacity])

    const extendSession = useCallback(async (sessionId: string, minutes: number) => {
    // Extend must work even when the original session time has already expired.
    // For an expired session, the new time starts from NOW.
    // For an active session, the new time starts from the existing expiry.
    if (isFirebaseConfigured()) {
      const stored = await loadDoc<Record<string, unknown>>(
        FIRESTORE_COLLECTIONS.sessions,
        sessionId,
      )

      if (!stored) return

      const currentExpiry =
        typeof stored.expiresAt === 'number'
          ? stored.expiresAt
          : Date.now()

      const extensionBase = Math.max(currentExpiry, Date.now())
      const newExpiry = extensionBase + minutes * 60000

      // Update local state immediately.
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                expiresAt: newExpiry,
                extendedCount: (s.extendedCount || 0) + 1,
              }
            : s,
        ),
      )

      // Persist the new expiry to Firestore.
      await saveDoc(
        FIRESTORE_COLLECTIONS.sessions,
        sessionId,
        { expiresAt: newExpiry },
        { merge: true },
      ).catch(() => {})
    } else {
      // Mock / offline mode.
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s

          const currentExpiry =
            typeof s.expiresAt === 'number'
              ? s.expiresAt
              : Date.now()

          const extensionBase = Math.max(currentExpiry, Date.now())
          const newExpiry = extensionBase + minutes * 60000

          return {
            ...s,
            expiresAt: newExpiry,
            extendedCount: (s.extendedCount || 0) + 1,
          }
        }),
      )
    }
  }, [])

  const closeSession = useCallback((sessionId: string) => {
    // Resolve the table BEFORE the state update — assigning it inside the
    // setSessions updater ran too late (React batches updaters), so the table
    // was never moved to 'cleaning' when its last session closed.
    const target = sessions.find((s) => s.id === sessionId)
    const targetTableId = target?.tableId ?? null
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'closed', endTime: Date.now() } : s))
    )
    // The seats of this session no longer count toward the table's occupancy,
    // whatever the other sessions on the same table are doing.
    releaseTableCapacity(target)
    if (targetTableId) {
      const activeRemains = sessions.some((s) => s.tableId === targetTableId && s.id !== sessionId && s.status !== 'closed')
      if (!activeRemains) {
        setTables((prev) => prev.map((t) => (t.id === targetTableId ? { ...t, status: 'cleaning' } : t)))
      }
    }
  }, [sessions, releaseTableCapacity])

  const completeCleaning = useCallback((tableId: string) => {
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status: 'available' } : t)))
  }, [])

  const generateBill = useCallback((sessionId: string): Bill => {
    if (authUser?.role !== 'admin') throw new Error('Only administrators can generate bills')
    // Idempotent: if a bill already exists for this session, return it.
    const existingBill = bills.find(b => b.sessionId === sessionId && b.status !== 'PAID')
    if (existingBill) return existingBill

    const sessOrders = orders.filter((o) => o.sessionId === sessionId && o.status !== 'cancelled')
    const lines: BillLine[] = []
    let subtotal = 0

    sessOrders.forEach((o) => {
      o.items.forEach((item) => {
        const itemTotal = item.priceSnapshot * item.quantity
        subtotal += itemTotal
        lines.push({
          nameSnapshot: item.nameSnapshot,
          priceSnapshot: item.priceSnapshot,
          quantity: item.quantity,
          taxAmount: round2(itemTotal * (settings.taxRate / 100)),
          servingType: item.servingType,
        })
      })
    })

    const cgst = round2(subtotal * (settings.taxRate / 200))
    const sgst = round2(subtotal * (settings.taxRate / 200))
    const serviceCharge = round2(settings.serviceChargeMode === 'percent' ? subtotal * (settings.serviceCharge / 100) : settings.serviceCharge)
    const grandTotal = round2(subtotal + cgst + sgst + serviceCharge)

    const bill: Bill = {
      id: createId('bill'),
      sessionId,
      tableId: sessOrders[0]?.tableId || '',
      billNumber: `BH-${Date.now().toString().slice(-6)}`,
      subtotal,
      cgst,
      sgst,
      serviceCharge,
      discount: 0,
      grandTotal,
      status: 'GENERATED',
      generatedAt: Date.now(),
      lines,
    }

    setBills((prev) => [bill, ...prev])
    return bill
  }, [authUser?.role, orders, bills, settings])

  const generateParcelBill = useCallback((orderId: string): Bill => {
    if (authUser?.role !== 'admin') throw new Error('Only administrators can generate bills')
    const ord = orders.find((o) => o.id === orderId)
    if (!ord) throw new Error('Order not found')

    // Idempotent: if a bill already exists for this order, return it.
    const existingBill = bills.find(b => b.tableId === ord.tableId && b.sessionId === ord.sessionId && b.status !== 'PAID')
    if (existingBill) return existingBill

    const lines: BillLine[] = ord.items.map((item) => {
      const itemTotal = item.priceSnapshot * item.quantity
      return {
        nameSnapshot: item.nameSnapshot,
        priceSnapshot: item.priceSnapshot,
        quantity: item.quantity,
        taxAmount: round2(itemTotal * (settings.taxRate / 100)),
        servingType: item.servingType,
      }
    })

    const subtotal = ord.totalAmount
    const cgst = round2(subtotal * (settings.taxRate / 200))
    const sgst = round2(subtotal * (settings.taxRate / 200))
    const parcelCharge = round2(Math.max(0, settings.parcelCharge ?? 0))
    const grandTotal = round2(subtotal + cgst + sgst + parcelCharge)

    const bill: Bill = {
      id: createId('bill'),
      sessionId: ord.sessionId,
      tableId: ord.tableId,
      billNumber: `PCL-${Date.now().toString().slice(-6)}`,
      subtotal,
      cgst,
      sgst,
      serviceCharge: 0,
      parcelCharge,
      discount: 0,
      grandTotal,
      status: 'GENERATED',
      generatedAt: Date.now(),
      lines,
    }

    setBills((prev) => [bill, ...prev])
    return bill
  }, [authUser?.role, orders, bills, settings])

  const recordPayment = useCallback((data: { billId: string; sessionId: string; tableId: string; amount: number; paymentMode: PaymentMode; recordedBy: string }): PaymentRecord => {
    if (authUser?.role !== 'admin') throw new Error('Only administrators can record payments')
    // Idempotent: if payment already exists for this bill, return the existing one.
    const existingPayment = paymentRecords.find(p => p.billId === data.billId && p.status === 'COMPLETED')
    if (existingPayment) {
      // Update the bill status to PAID if not already
      setBills((prev) => prev.map((b) => (b.id === data.billId ? { ...b, status: 'PAID' } : b)))
      return existingPayment
    }
    const rec: PaymentRecord = {
      id: createId('pay'),
      ...data,
      recordedAt: Date.now(),
      status: 'COMPLETED',
      waiterId: data.recordedBy,
      kind: 'sale',
    }
    setPaymentRecords((prev) => [rec, ...prev])
    setBills((prev) => prev.map((b) => (b.id === data.billId ? { ...b, status: 'PAID' } : b)))
    closeSession(data.sessionId)
    return rec
  }, [authUser?.role, closeSession, paymentRecords])

  const reprintBill = useCallback((billId: string) => {
  if (authUser?.role !== 'admin') throw new Error('Only administrators can reprint bills')
  const bill = bills.find((b) => b.id === billId)
  if (!bill) return null
  
  return enqueueBillPrint({
    billNumber: bill.billNumber,
    date: new Date(bill.generatedAt).toLocaleDateString(),
    time: new Date(bill.generatedAt).toLocaleTimeString(),
    table: bill.tableId,
    waiter: '',
    lines: bill.lines.map((line) => ({ name: line.nameSnapshot + servingSuffix(line.servingType), quantity: line.quantity, amount: line.priceSnapshot })),
    subtotal: bill.subtotal,
    cgstRate: 0,
    cgst: bill.cgst,
    sgstRate: 0,
    sgst: bill.sgst,
    discount: bill.discount,
    serviceCharge: bill.serviceCharge,
    parcelCharge: bill.parcelCharge,
    grandTotal: bill.grandTotal,
    paymentStatus: bill.status,
    restaurantName: settings.restaurantName,
    address: settings.address,
    gstin: settings.gstin,
    fssaiLicenseNumber: settings.fssaiLicenseNumber,
  }, billId)
}, [authUser?.role, bills, settings.address, settings.fssaiLicenseNumber, settings.gstin, settings.restaurantName])

  const addInventoryItem = useCallback((data: Omit<InventoryItem, 'id' | 'createdAt' | 'status' | 'lastUpdated'>): InventoryItem => {
    const item: InventoryItem = {
      ...data,
      id: createId('inv'),
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      status: computeStockStatus(data.quantity, data.minimumThreshold),
    }
    setInventory((prev) => [...prev, item])
    return item
  }, [])

  const updateInventoryQuantity = useCallback((id: string, quantity: number) => {
    setInventory((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity,
              lastUpdated: Date.now(),
              status: computeStockStatus(quantity, item.minimumThreshold),
            }
          : item
      )
    )
  }, [])

  const addStock = useCallback((id: string, quantity: number, reason: string): StockUpdate => {
    let update!: StockUpdate
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = item.quantity + quantity
          update = {
            id: createId('stk'),
            itemId: id,
            itemName: item.name,
            previousQty: item.quantity,
            newQty,
            difference: quantity,
            unit: item.unit,
            type: 'STOCK_ADDED',
            reason,
            updatedBy: actorRef.current.id,
            updatedByName: actorRef.current.name,
            timestamp: Date.now(),
          }
          return {
            ...item,
            quantity: newQty,
            lastUpdated: Date.now(),
            status: computeStockStatus(newQty, item.minimumThreshold),
          }
        }
        return item
      })
    )
    if (update) setStockHistory((prev) => [update, ...prev].slice(0, HISTORY_LIMITS.stockHistory))
    return update
  }, [])

  const adjustStock = useCallback((id: string, quantity: number, reason: string): StockUpdate => {
    let update!: StockUpdate
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const diff = quantity - item.quantity
          update = {
            id: createId('stk'),
            itemId: id,
            itemName: item.name,
            previousQty: item.quantity,
            newQty: quantity,
            difference: diff,
            unit: item.unit,
            type: diff < 0 ? 'ORDER_CONSUMPTION' : 'STOCK_ADDED',
            reason,
            updatedBy: actorRef.current.id,
            updatedByName: actorRef.current.name,
            timestamp: Date.now(),
          }
          return {
            ...item,
            quantity,
            lastUpdated: Date.now(),
            status: computeStockStatus(quantity, item.minimumThreshold),
          }
        }
        return item
      })
    )
    if (update) setStockHistory((prev) => [update, ...prev].slice(0, HISTORY_LIMITS.stockHistory))
    return update
  }, [])

  const markOutOfStock = useCallback((id: string) => {
    updateInventoryQuantity(id, 0)
  }, [updateInventoryQuantity])

  const dailyStockUpdate = useCallback((id: string, newQuantity: number, updatedBy: string, updatedByName: string): StockUpdate => {
    let update!: StockUpdate
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          update = {
            id: createId('stk'),
            itemId: id,
            itemName: item.name,
            previousQty: item.quantity,
            newQty: newQuantity,
            difference: newQuantity - item.quantity,
            unit: item.unit,
            type: newQuantity - item.quantity < 0 ? 'ORDER_CONSUMPTION' : 'STOCK_ADDED',
            updatedBy,
            updatedByName,
            timestamp: Date.now(),
          }
          return {
            ...item,
            quantity: newQuantity,
            lastUpdated: Date.now(),
            status: computeStockStatus(newQuantity, item.minimumThreshold),
          }
        }
        return item
      })
    )
    if (update) setStockHistory((prev) => [update, ...prev].slice(0, HISTORY_LIMITS.stockHistory))
    return update
  }, [])

  const requestStock = useCallback((itemId: string, itemName: string, currentQuantity: number, requestedQuantity: number, unit: string, reason: string, priority: 'URGENT' | 'MEDIUM' | 'LOW'): PurchaseRequest => {
    const req: PurchaseRequest = {
      id: createId('req'),
      itemId,
      itemName,
      currentQuantity,
      requestedQuantity,
      unit,
      priority,
      reason,
      status: 'PENDING',
      createdAt: Date.now(),
      requestedBy: actorRef.current.id,
      requestedByName: actorRef.current.name,
    }
    setPurchaseRequests((prev) => [req, ...prev])
    return req
  }, [])

  const createPurchaseRequest = useCallback((data: Omit<PurchaseRequest, 'id' | 'status' | 'createdAt' | 'requestedBy' | 'requestedByName'>): PurchaseRequest => {
    const req: PurchaseRequest = {
      ...data,
      id: createId('req'),
      status: 'PENDING',
      createdAt: Date.now(),
      requestedBy: actorRef.current.id,
      requestedByName: actorRef.current.name,
    }
    setPurchaseRequests((prev) => [req, ...prev])
    return req
  }, [])

  const updatePurchaseRequestStatus = useCallback((requestId: string, status: PurchaseRequestStatus) => {
    setPurchaseRequests((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          return {
            ...req,
            status,
            processedBy: actorRef.current.id,
            processedByName: actorRef.current.name,
            processedAt: Date.now(),
          }
        }
        return req
      })
    )
  }, [])

  const markPurchaseRequestPurchased = useCallback((requestId: string, details: { quantity: number; unitCost: number; totalCost: number; vendor?: string; note?: string; paymentMode: PaymentMode; newItem?: { name: string; unit: string; minimumThreshold: number; category?: string }; targetItemId?: string }) => {
    const request = purchaseRequests.find((entry) => entry.id === requestId)
    if (!request) throw new Error('Purchase request not found')
    let itemId = request.itemId || details.targetItemId
    if (!itemId && details.newItem) {
      itemId = addInventoryItem({
        name: details.newItem.name,
        quantity: details.quantity,
        unit: details.newItem.unit,
        minimumThreshold: details.newItem.minimumThreshold,
        category: details.newItem.category || 'General',
      }).id
    } else if (itemId) {
      addStock(itemId, details.quantity, `Purchase fulfillment #${requestId}`)
    }
    setPurchaseRequests((prev) =>
      prev.map((req) => {
        if (req.id === requestId) {
          return {
            ...req,
            status: 'PURCHASED',
            purchasedQuantity: details.quantity,
            purchaseUnitCost: details.unitCost,
            purchaseTotalCost: details.totalCost,
            purchaseVendor: details.vendor,
            purchaseNote: details.note,
            purchaseMode: details.paymentMode,
            itemId,
          }
        }
        return req
      })
    )
    const now = Date.now()
    setPaymentRecords((prev) => [{
      id: createId('purchase'),
      billId: `purchase_${requestId}`,
      sessionId: `purchase_${requestId}`,
      tableId: 'inventory',
      amount: details.totalCost,
      paymentMode: details.paymentMode,
      recordedBy: actorRef.current.id,
      recordedByName: actorRef.current.name,
      waiterId: actorRef.current.id,
      recordedAt: now,
      status: 'COMPLETED',
      kind: 'purchase',
      purchaseRequestId: requestId,
      itemName: request.itemName,
      quantity: details.quantity,
      unit: request.unit,
      unitCost: details.unitCost,
      vendor: details.vendor,
      notes: details.note,
    }, ...prev])
  }, [purchaseRequests, addInventoryItem, addStock])

  const recordInventoryPurchase = useCallback((details: { itemId: string; quantity: number; unitCost: number; totalCost: number; vendor?: string; note?: string; paymentMode: PaymentMode; newItem?: { name: string; unit: string; minimumThreshold: number; category?: string } }) => {
    let itemId = details.itemId
    let itemName = details.newItem?.name ?? ''
    let unit = details.newItem?.unit ?? ''
    if (!itemId && details.newItem) {
      const added = addInventoryItem({
        name: details.newItem.name,
        quantity: details.quantity,
        unit: details.newItem.unit,
        minimumThreshold: details.newItem.minimumThreshold,
        category: details.newItem.category || 'General',
      })
      itemId = added.id
    } else if (itemId) {
      addStock(itemId, details.quantity, 'Direct Inventory Purchase')
      const existing = inventory.find((item) => item.id === itemId)
      itemName = existing?.name ?? itemName
      unit = existing?.unit ?? unit
    }
    if (!itemId) throw new Error('Select an inventory item or provide a new item')
    setPaymentRecords((prev) => [{
      id: createId('purchase'),
      billId: `purchase_direct_${itemId}_${Date.now()}`,
      sessionId: `purchase_direct_${itemId}`,
      tableId: 'inventory',
      amount: details.totalCost,
      paymentMode: details.paymentMode,
      recordedBy: actorRef.current.id,
      recordedByName: actorRef.current.name,
      waiterId: actorRef.current.id,
      recordedAt: Date.now(),
      status: 'COMPLETED',
      kind: 'purchase',
      itemName,
      quantity: details.quantity,
      unit,
      unitCost: details.unitCost,
      vendor: details.vendor,
      notes: details.note,
    }, ...prev])
  }, [inventory, addInventoryItem, addStock])

  const addNotification = useCallback((title: string, message: string, role: string, refs?: { sessionId?: string; tableId?: string; tableName?: string }): Notification => {
    const notif: Notification = {
      id: createId('notif'),
      title,
      message,
      role: role as 'admin' | 'supervisor' | 'waiter',
      read: false,
      createdAt: Date.now(),
      ...refs,
    }
    setNotifications((prev) => [notif, ...prev].slice(0, HISTORY_LIMITS.notifications))
    return notif
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllNotificationsRead = useCallback((role?: string) => {
    setNotifications((prev) =>
      prev.map((n) => (!role || n.role === role ? { ...n, read: true } : n))
    )
  }, [])

  const getRecentActivity = useCallback((limit = 20, date?: string) => {
    if (date) {
      return activityLog.filter((a) => isSameBusinessDay(a.createdAt, date)).slice(0, limit)
    }
    return activityLog.slice(0, limit)
  }, [activityLog])

  const getStockHistory = useCallback((itemId: string) => {
    return stockHistory.filter((s) => s.itemId === itemId)
  }, [stockHistory])

  const getStockUsage = useCallback((itemId: string) => {
    return stockHistory.filter((s) => s.itemId === itemId && s.type === 'ORDER_CONSUMPTION')
  }, [stockHistory])

  const getDailySummary = useCallback((date: string): DailySummary => {
    const dayOrders = orders.filter((o) => isSameBusinessDay(o.createdAt, date))
    const daySessions = sessions.filter((s) => isSameBusinessDay(s.createdAt, date))
    const dayBills = bills.filter((b) => isSameBusinessDay(b.generatedAt, date))
    const dayPayments = paymentRecords.filter((p) => isSameBusinessDay(p.recordedAt, date) && p.kind !== 'purchase')

    const servedOrders = dayOrders.filter((o) => o.status === 'served').length
    const cancelledOrders = dayOrders.filter((o) => o.status === 'cancelled').length
    const guests = daySessions.reduce((acc, s) => acc + s.guestCount, 0)
    const billedRevenue = dayBills.filter((b) => b.status !== 'VOID').reduce((acc, b) => acc + b.grandTotal, 0)
    const collectedRevenue = dayPayments.reduce((acc, p) => acc + p.amount, 0)

    const byMode: Partial<Record<PaymentMode, number>> = {}
    dayPayments.forEach((p) => {
      byMode[p.paymentMode] = (byMode[p.paymentMode] || 0) + p.amount
    })

    const dineInTokens = dayOrders.filter((o) => (o.orderType ?? 'dine_in') === 'dine_in' && o.tokenNumber != null).length
    const parcelTokens = dayOrders.filter((o) => o.orderType === 'parcel' && o.tokenNumber != null).length

    return {
      date,
      orders: dayOrders.length,
      servedOrders,
      cancelledOrders,
      sessions: daySessions.length,
      guests,
      bills: dayBills.length,
      billedRevenue,
      collectedRevenue,
      tokens: dineInTokens + parcelTokens,
      dineInTokens,
      parcelTokens,
      byMode,
    }
  }, [orders, sessions, bills, paymentRecords])

  const getDailyHistory = useCallback((limit = 30): DailySummary[] => {
    const dates = new Set<string>()
    orders.forEach((o) => dates.add(getBusinessDay(o.createdAt)))
    sessions.forEach((s) => dates.add(getBusinessDay(s.createdAt)))
    bills.forEach((b) => dates.add(getBusinessDay(b.generatedAt)))

    const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a)).slice(0, limit)
    return sortedDates.map((d) => getDailySummary(d))
  }, [orders, sessions, bills, getDailySummary])

  /**
   * Persist an admin's settings edit.
   *
   * Writes ONLY the edited fields (`{ merge: true }`) so an existing
   * `settings/restaurant` document can never be overwritten by the rest of the
   * local state (which always contains application defaults). React state is
   * updated only after Firestore confirms the write, and the promise rejects on
   * failure so the Settings page never reports a save that did not happen.
   */
  const updateSettings = useCallback(async (data: Partial<RestaurantSettings>) => {
    const patch = buildSettingsPatch(data)
    if (Object.keys(patch).length === 0) return
    const before = stateRef.current.settings

    if (dataMode === 'firebase') {
      if (!isFirebaseConfigured()) throw new Error('Firebase Firestore is unavailable.')
      if (authUser?.role !== 'admin') throw new Error('Only an admin can change restaurant settings.')
      if (!settingsHydratedRef.current) {
        // Never trust (nor write) values that were not verified against
        // Firestore in this session — re-read once, then give up loudly.
        const verified = await readRestaurantSettings(RESTAURANT_SETTINGS_DOC_ID).catch((err) => {
          logSettingsError('updateSettings:verify', err)
          return null
        })
        if (!verified) {
          throw new Error('Could not verify the saved settings with Firestore. Nothing was saved — please retry.')
        }
        settingsHydratedRef.current = true
        setSettingsHydration('ready')
        if (verified.exists && verified.data) {
          const remote = verified.data
          setSettings((prev) => normalizeSettingsNumbers(withSettingsDefaults(prev, remote)))
          logSettings('HYDRATED', `source=pre-save-verify\nuid=${authUser.id}\ndata=${JSON.stringify(remote)}`)
        }
      }
      logSettings(
        'WRITE',
        `source=updateSettings\nuid=${authUser.id}\nmode=firebase\nbefore=${JSON.stringify(before)}\nafter=${JSON.stringify(patch)}`,
      )
      try {
        await writeRestaurantSettingsPatch(patch, RESTAURANT_SETTINGS_DOC_ID)
      } catch (err) {
        logSettingsError('updateSettings', err)
        throw new Error(
          `Settings could not be saved to Firestore: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      settingsWriteShieldRef.current = { patch, at: Date.now() }
    } else {
      logSettings(
        'WRITE',
        `source=updateSettings\nuid=${authUser?.id ?? 'none'}\nmode=mock\nbefore=${JSON.stringify(before)}\nafter=${JSON.stringify(patch)}`,
      )
    }

    // Only now is the local state allowed to change.
    setSettings((prev) => normalizeSettingsNumbers({ ...prev, ...patch } as RestaurantSettings))
  }, [authUser])

  const addTable = useCallback((data: { name: string; capacity: number; isVip?: boolean; status?: TableStatus; active?: boolean; area?: string; features?: string[] }): Table => {
    const table: Table = {
      id: createId('tbl'),
      name: data.name,
      capacity: data.capacity,
      status: data.status || 'available',
      active: data.active ?? true,
      isVip: !!data.isVip,
      currentSessions: 0,
      area: data.area,
      features: data.features,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setTables((prev) => [...prev, table])
    addActivity({
      type: 'table_created',
      title: `Table ${table.name} added`,
      subtitle: `Capacity ${table.capacity}${table.area ? ` · ${table.area}` : ''}`,
      userId: actorRef.current.id,
      userName: actorRef.current.name,
      entity: 'table',
      entityId: table.id,
    })
    return table
  }, [addActivity])

  const updateTable = useCallback((id: string, data: Partial<Table>) => {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...data, updatedAt: Date.now() } : t))
    )
    const current = tablesRef.current.find((t) => t.id === id)
    if (current) {
      const changed = Object.keys(data).filter((k) => k !== 'updatedAt')
      addActivity({
        type: 'table_updated',
        title: `Table ${data.name ?? current.name} updated`,
        subtitle: changed.length > 0 ? `Changed: ${changed.join(', ')}` : 'Details updated',
        userId: actorRef.current.id,
        userName: actorRef.current.name,
        entity: 'table',
        entityId: id,
      })
    }
  }, [addActivity])

  const deactivateTable = useCallback((id: string) => {
    updateTable(id, { active: false })
  }, [updateTable])

  const activateTable = useCallback((id: string) => {
    updateTable(id, { active: true })
  }, [updateTable])

  const deleteTable = useCallback((id: string) => {
    const removed = tablesRef.current.find((t) => t.id === id)
    setTables((prev) => prev.filter((t) => t.id !== id))
    if (removed) {
      addActivity({
        type: 'table_deleted',
        title: `Table ${removed.name} deleted`,
        subtitle: `Capacity ${removed.capacity}${removed.area ? ` · ${removed.area}` : ''}`,
        userId: actorRef.current.id,
        userName: actorRef.current.name,
        entity: 'table',
        entityId: id,
      })
    }
  }, [addActivity])

  const updateInventoryItem = useCallback((id: string, data: Partial<Pick<InventoryItem, 'name' | 'category' | 'unit' | 'minimumThreshold' | 'quantity' | 'notes' | 'active'>>) => {
    let update: StockUpdate | null = null
    setInventory((prev) => prev.map((item) => {
      if (item.id !== id) return item
      if (data.quantity !== undefined && data.quantity !== item.quantity) {
        update = {
          id: createId('stk'),
          itemId: item.id,
          itemName: item.name,
          previousQty: item.quantity,
          newQty: data.quantity,
          difference: data.quantity - item.quantity,
          unit: data.unit ?? item.unit,
          type: 'STOCK_ADJUSTMENT',
          reason: 'Inventory item edited',
          updatedBy: actorRef.current.id,
          updatedByName: actorRef.current.name,
          timestamp: Date.now(),
        }
      }
      return {
        ...item,
        ...data,
        lastUpdated: Date.now(),
        status: computeStockStatus(
          data.quantity !== undefined ? data.quantity : item.quantity,
          data.minimumThreshold !== undefined ? data.minimumThreshold : item.minimumThreshold,
        ),
      }
    }))
    if (update) setStockHistory((prev) => [update as StockUpdate, ...prev].slice(0, HISTORY_LIMITS.stockHistory))
  }, [])

  /**
   * Permanent removal of a master inventory record.
   *
   * Inventory items are permanent stock records, so this is the ONE destructive
   * inventory action in the app. It is admin-only (the Supervisor screen no
   * longer renders it and Firestore rules reject a supervisor delete) and it
   * writes an activity entry, so an item that disappears can always be explained
   * in Admin → Recent Activity instead of vanishing silently.
   */
  const deleteInventoryItem = useCallback((id: string) => {
    const removed = stateRef.current.inventory.find((item) => item.id === id)
    setInventory((prev) => prev.filter((item) => item.id !== id))
    if (removed) {
      addActivity({
        type: 'inventory_deleted',
        title: `Inventory item ${removed.name} deleted`,
        subtitle: `Stock was ${removed.quantity} ${removed.unit} · minimum ${removed.minimumThreshold} ${removed.unit}`,
        userId: actorRef.current.id,
        userName: actorRef.current.name,
        entity: 'inventory',
        entityId: id,
      })
    }
  }, [addActivity])

  const resetRestaurantData = useCallback(() => {
    setTables([])
    setSessions([])
    setOrders([])
    setMenu([])
    setCategories([])
    setInventory([])
    setPurchaseRequests([])
    setBills([])
    setPaymentRecords([])
    setNotifications([])
    setStockHistory([])
    setActivityLog([])
    setInventoryUsage([])
    setRecipes([])
    if (dataMode === 'mock') localStorage.clear()
  }, [])

  const buildTokenPrintPayload = useCallback((orderId: string) => {
    const order = ordersRef.current.find((o) => o.id === orderId)
    if (!order) return null
    const tableName = tables.find((t) => t.id === order.tableId)?.name || 'N/A'
    return {
      tokenNumber: order.tokenNumber ?? 0,
      date: businessDayStr(order.createdAt),
      time: new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      table: tableName,
      guests: 0,
      waiter: order.waiterId,
      items: order.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity, servingType: i.servingType })),
      specialRequests: order.items.filter((i) => i.specialRequests).map((i) => i.specialRequests!),
      prepTimeMinutes: order.estimatedPreparationMinutes ?? 0,
      priority: order.priority,
      isVip: order.isVip,
      orderId: order.id,
      kind: order.orderType,
      restaurantName: settings.restaurantName,
      address: settings.address,
      gstin: settings.gstin,
      fssaiLicenseNumber: settings.fssaiLicenseNumber,
    }
  }, [settings, tables])

  /** Automatic kitchen print for the confirmed order — exactly one physical job. */
  const printOrderToken = useCallback((orderId: string) => {
    const order = ordersRef.current.find((o) => o.id === orderId)
    if (!order) return null

    const existingJob = printJobs.find((j) =>
      j.kind === 'token' &&
      j.printer === 'supervisor_token' &&
      j.referenceId === orderId,
    )
    if (existingJob) return existingJob

    const payload = buildTokenPrintPayload(orderId)
    if (!payload) return null
    return enqueueTokenPrint(payload, orderId)
  }, [buildTokenPrintPayload, printJobs])

  /** Display-only token preview. It never sends anything to a printer. */
  const previewOrderToken = useCallback((orderId: string) => {
    const payload = buildTokenPrintPayload(orderId)
    if (!payload) return null
    return createPrintPreviewJob('token', 'supervisor_token', payload, orderId)
  }, [buildTokenPrintPayload])

  /**
   * Print a session receipt (waiter session summary - NOT a paid bill).
   *
   * This is a SESSION SUMMARY for the waiter/customer to see what has been
   * ordered so far and the current total. It does NOT record a payment, mark
   * anything as PAID, or create a Bill document. The waiter must NOT be able
   * to collect payment or close the bill via this function.
   *
   * The receipt is derived from:
   *   - session (table, guests, waiter, time)
   *   - session's orders (items, prices)
   *   - settings (taxRate, restaurant info)
   *
   * Tax calculation uses the SAME logic as generateBill:
   *   cgst = round2(subtotal * taxRate / 200)
   *   sgst = round2(subtotal * taxRate / 200)
   *   total = round2(subtotal + cgst + sgst)
   */
  const printSessionReceipt = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return null

    // Get all non-cancelled orders for this session
    const sessionOrders = orders.filter((o) =>
      o.sessionId === sessionId && o.status !== 'cancelled'
    )
    if (sessionOrders.length === 0) return null

    // Collect all order items with their serving type
    const allItems: { name: string; servingType?: 'full' | 'half'; quantity: number; price: number }[] = []
    let subtotal = 0
    for (const order of sessionOrders) {
      for (const item of order.items) {
        const itemTotal = item.priceSnapshot * item.quantity
        subtotal += itemTotal
        allItems.push({
          name: item.nameSnapshot,
          servingType: item.servingType,
          quantity: item.quantity,
          price: item.priceSnapshot,
        })
      }
    }

    // Use the SAME tax calculation as generateBill
    const taxRate = Math.max(0, Number(settings.taxRate) || 0)
    const cgst = round2(subtotal * (taxRate / 200))
    const sgst = round2(subtotal * (taxRate / 200))
    const total = round2(subtotal + cgst + sgst)

    const tableName = tables.find((t) => t.id === session.tableId)?.name || 'N/A'

    // Create the session receipt payload
    const payload: SessionReceiptPayload = {
      sessionId,
      date: businessDayStr(session.startTime),
      time: new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      table: tableName,
      guests: session.guestCount,
      waiter: session.waiterId,
      items: allItems,
      subtotal,
      cgst,
      sgst,
      // Same GST model as generateBill: taxRate is the combined rate, split
      // evenly into CGST/SGST halves.
      cgstRate: round2(taxRate / 2),
      total,
      restaurantName: settings.restaurantName,
      address: settings.address,
      gstin: settings.gstin,
      fssaiLicenseNumber: settings.fssaiLicenseNumber,
    }

    // Enqueue a session_receipt print job using the kitchen printer
    const jobId = 'session_receipt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
    const job = printQueue.enqueue({
      id: jobId,
      kind: 'session_receipt',
      printer: 'supervisor_token',
      payload,
      referenceId: sessionId,
      intent: 'manual',
    })

    return job
  }, [orders, sessions, settings, tables])

  const setStockRemaining = useCallback((id: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error('Stock quantity must be a non-negative number')
    }
    dailyStockUpdate(id, quantity, actorRef.current.id, actorRef.current.name)
  }, [dailyStockUpdate])

  return (
    <RestaurantContext.Provider
      value={{
        tables, sessions, orders, menu, categories, inventory, purchaseRequests, bills, paymentRecords,
        notifications, settings, users, stockHistory, activityLog, inventoryUsage, recipes,
        saveRecipe, getRecipeForMenuItem, createOrder, confirmOrder, updateOrderStatus, setOrderReady,
        serveOrder, addCategory, addMenuItem, updateMenuItemDetails, updateMenuItemPrice,
        toggleMenuItemAvailability, setMenuItemActive, renameCategory, deactivateCategory, deleteCategory,
        deleteMenuItem, setSpecialDate, getTodaySpecials, calculateMenuPriceHistory, createSession,
        getActiveSessionsForTable, getTableOccupancy, requestService, cancelSession, extendSession,
        closeSession, completeCleaning, generateBill, generateParcelBill, recordPayment,
        reprintBill, addInventoryItem, updateInventoryQuantity, addStock, adjustStock, markOutOfStock,
        dailyStockUpdate, requestStock, createPurchaseRequest, updatePurchaseRequestStatus,
        markPurchaseRequestPurchased, recordInventoryPurchase, addNotification, markNotificationRead,
        markAllNotificationsRead, getRecentActivity, addActivity, getStockHistory, getStockUsage,
        getDailySummary, getDailyHistory, updateSettings, addTable, updateTable, deactivateTable,
        activateTable, deleteTable, updateInventoryItem, deleteInventoryItem, resetRestaurantData,
        printJobs, printOrderToken, previewOrderToken, printSessionReceipt, setStockRemaining, persistToLocalStorage, settingsHydration,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  )
}
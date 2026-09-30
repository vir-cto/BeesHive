/**
 * Bee's Hive — central physical-print service.
 *
 * Automatic printing (waiter order/token) and manual printing (preview -> PRINT)
 * are deliberately separate operations.
 *
 * IMPORTANT:
 * - No browser print dialog is used for physical PT-210 printing.
 * - `enqueueTokenPrint()` is for the one automatic kitchen-token event.
 * - `createPrintPreviewJob()` creates display-only data; it NEVER prints.
 * - `printPreviewJob()` prints only after the operator presses PRINT.
 * - A physical job is attempted once. A deliberate retry/reprint creates a new
 *   explicit job, so an ambiguous transport failure can never silently print
 *   the same receipt a second time.
 */
import { useEffect, useState } from 'react'
import type { BillPrintPayload, TokenPrintPayload, SessionReceiptPayload } from './printFormatters'
import { formatBill58mm, formatToken58mm, formatSessionReceipt58mm } from './printFormatters'
import { persistPrintJob, printJobMetadata } from '../firebase/printJobStore'

export type PrintJobKind = 'token' | 'bill' | 'session_receipt'
export type PrintPrinter = 'supervisor_token' | 'counter_bill'
export type PrintStatus = 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED'
export type PrintIntent = 'automatic' | 'manual'

export type PrintPayload = TokenPrintPayload | BillPrintPayload | SessionReceiptPayload

export interface PrintJob {
  id: string
  kind: PrintJobKind
  printer: PrintPrinter
  status: PrintStatus
  payload: PrintPayload
  createdAt: number
  printedAt?: number
  attempts: number
  error?: string
  referenceId: string
  /** Automatic jobs are one-shot; manual jobs exist only after PRINT is clicked. */
  intent: PrintIntent
}

export interface PrinterStatus {
  connected: boolean
  name: string
  error?: string
}

export interface PrinterBridge {
  readonly printer: PrintPrinter
  connect: () => Promise<void>
  print: (job: PrintJob) => Promise<void>
  status: () => PrinterStatus
}

/**
 * This bridge intentionally does NOT call window.print().
 * If no relay/native bridge is configured, the queue fails explicitly instead
 * of opening a browser print dialog or pretending that a physical print worked.
 */
export class WebPrinterBridge implements PrinterBridge {
  readonly printer: PrintPrinter
  constructor(printer: PrintPrinter) {
    this.printer = printer
  }
  async connect(): Promise<void> {
    return
  }
  async print(_job: PrintJob): Promise<void> {
    throw new Error('Physical printer relay is not configured')
  }
  status(): PrinterStatus {
    return { connected: false, name: 'No physical printer relay configured', error: 'relay not configured' }
  }
}

const relayApiKey = (): string =>
  String(import.meta.env.VITE_PRINT_RELAY_API_KEY ?? '').trim()

export class PrintServerBridge implements PrinterBridge {
  readonly printer: PrintPrinter
  private baseUrl: string

  constructor(printer: PrintPrinter, baseUrl: string) {
    this.printer = printer
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private get label(): string {
    return this.printer === 'supervisor_token' ? 'Kitchen' : 'Admin'
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const key = relayApiKey()
    if (key) headers['X-Api-Key'] = key
    return headers
  }

  async connect(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
        headers: relayApiKey() ? { 'X-Api-Key': relayApiKey() } : undefined,
      })
      if (!res.ok) throw new Error(`Print server responded ${res.status}`)
      const data = (await res.json()) as {
        ok?: boolean
        kitchenPrinter?: { configured?: boolean }
        billPrinter?: { configured?: boolean }
      }
      if (!data.ok) throw new Error('Print server health check failed')
      const target = this.printer === 'supervisor_token' ? data.kitchenPrinter : data.billPrinter
      if (target && target.configured === false) throw new Error(`${this.label} printer is not configured on the relay`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('not configured')) throw error
      throw new Error(`${this.label} printer relay is unavailable (${this.baseUrl})`)
    }
  }

  async print(job: PrintJob): Promise<void> {
    const lines = previewLinesForJob(job)
    let res: Response

    try {
      res = await fetch(`${this.baseUrl}/print`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          id: job.id,
          kind: job.kind,
          printer: job.printer,
          referenceId: job.referenceId,
          intent: job.intent,
          // Physical attempts are intentionally one-shot. A manual reprint is
          // a new job and therefore safe to trigger explicitly.
          attempts: 1,
          lines,
        }),
      })
    } catch {
      throw new Error(`${this.label} printer relay is unavailable (${this.baseUrl})`)
    }

    if (!res.ok) throw new Error(`Print server rejected job (${res.status})`)

    const data = (await res.json()) as {
      ok?: boolean
      error?: string
      duplicate?: boolean
      job?: { id?: string; status?: string; error?: string }
    }
    if (!data.ok) throw new Error(data.error || 'Print server failed to queue the job')

    // A duplicate automatic submission is already represented by the relay's
    // existing job. Follow that canonical job instead of polling our rejected
    // random id.
    const canonicalJobId = data.job?.id || job.id

    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 400))
      const statusResponse = await fetch(
        `${this.baseUrl}/jobs/${encodeURIComponent(canonicalJobId)}`,
        { headers: relayApiKey() ? { 'X-Api-Key': relayApiKey() } : undefined },
      )
      if (!statusResponse.ok) throw new Error(`Print server status failed (${statusResponse.status})`)
      const status = (await statusResponse.json()) as {
        ok?: boolean
        job?: { status?: string; error?: string }
      }
      if (!status.ok || !status.job) throw new Error('Print server lost the print job')
      if (status.job.status === 'PRINTED') return
      if (status.job.status === 'FAILED') throw new Error(status.job.error || 'Physical printer failed')
    }

    throw new Error('Timed out waiting for the physical printer acknowledgement')
  }

  status(): PrinterStatus {
    return { connected: true, name: `Print Server (${this.baseUrl})` }
  }
}

let kitchenPrintServerUrl = ''
let adminPrintServerUrl = ''

export const setPrintServerUrl = (url: string): void => {
  setPrintServerUrls(url, url)
}

export const getPrintServerUrl = (): string => kitchenPrintServerUrl

export const setPrintServerUrls = (
  kitchenUrl: string,
  adminUrl: string,
  _retryCount?: number,
): void => {
  kitchenPrintServerUrl = kitchenUrl.trim().replace(/\/$/, '')
  adminPrintServerUrl = adminUrl.trim().replace(/\/$/, '')
}

/** Kept for settings compatibility; physical jobs are deliberately one-shot. */
export const setPrintRetryAttempts = (_retryCount: number): void => {}
export const getPrintRetryAttempts = (): number => 1

export const getPrintServerUrls = (): { kitchen: string; admin: string } => ({
  kitchen: kitchenPrintServerUrl,
  admin: adminPrintServerUrl,
})

export class MockPrinterBridge implements PrinterBridge {
  readonly printer: PrintPrinter
  fail = false
  delayMs = 500

  constructor(printer: PrintPrinter) {
    this.printer = printer
  }

  async connect(): Promise<void> {
    return
  }

  async print(_job: PrintJob): Promise<void> {
    if (this.fail) throw new Error('Printer offline: ' + this.printer)
    await new Promise((resolve) => window.setTimeout(resolve, this.delayMs))
  }

  status(): PrinterStatus {
    return {
      connected: !this.fail,
      name: this.printer,
      error: this.fail ? 'offline' : undefined,
    }
  }
}

const activeBridges: Partial<Record<PrintPrinter, PrinterBridge>> = {}

export const setNativePrinterBridge = (bridge: PrinterBridge): void => {
  activeBridges[bridge.printer] = bridge
}

export const hasNativePrinterBridge = (printer: PrintPrinter): boolean =>
  Boolean(activeBridges[printer])

const createId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 9)}`

const defaultBridge = (printer: PrintPrinter): PrinterBridge => {
  const serverUrl = printer === 'supervisor_token' ? kitchenPrintServerUrl : adminPrintServerUrl
  if (serverUrl) return new PrintServerBridge(printer, serverUrl)
  return activeBridges[printer] ?? new WebPrinterBridge(printer)
}

const recordJob = (job: PrintJob): void => {
  persistPrintJob({
    jobId: job.id,
    kind: job.kind,
    printer: job.printer,
    referenceId: job.referenceId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: Date.now(),
    printedAt: job.printedAt,
    attempts: job.attempts,
    error: job.error,
    ...printJobMetadata(job.payload),
  })
}

class PrintQueue {
  private jobs: PrintJob[] = []
  private listeners = new Set<() => void>()
  private processing = false

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }

  snapshot(): PrintJob[] {
    return [...this.jobs]
  }

  enqueue(
    job: Omit<PrintJob, 'status' | 'createdAt' | 'attempts'>,
    options: { dedupe?: boolean } = {},
  ): PrintJob {
    const now = Date.now()
    const dedupe = options.dedupe !== false

    if (dedupe) {
      const fingerprint = JSON.stringify({
        kind: job.kind,
        printer: job.printer,
        referenceId: job.referenceId,
        payload: job.payload,
      })

      const duplicate = this.jobs.find((existing) => {
        if (existing.status === 'FAILED') return false
        if (now - existing.createdAt > 1500) return false
        return JSON.stringify({
          kind: existing.kind,
          printer: existing.printer,
          referenceId: existing.referenceId,
          payload: existing.payload,
        }) === fingerprint
      })

      if (duplicate) return duplicate
    }

    const full: PrintJob = {
      ...job,
      status: 'QUEUED',
      createdAt: now,
      attempts: 0,
    }

    this.jobs.push(full)
    this.emit()
    recordJob(full)
    void this.pump()
    return full
  }

  retry(jobId: string): void {
    const job = this.jobs.find((candidate) => candidate.id === jobId)
    if (!job || job.status === 'PRINTING') return
    job.status = 'QUEUED'
    job.error = undefined
    this.emit()
    recordJob(job)
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      for (;;) {
        const next = this.jobs.find((job) => job.status === 'QUEUED')
        if (!next) break

        next.status = 'PRINTING'
        next.attempts += 1
        this.emit()
        recordJob(next)

        try {
          const bridge = defaultBridge(next.printer)
          await bridge.connect()
          await bridge.print(next)
          next.status = 'PRINTED'
          next.printedAt = Date.now()
          next.error = undefined
        } catch (error) {
          // IMPORTANT: no automatic second physical attempt. If the transport
          // result is ambiguous, retrying can physically duplicate the receipt.
          next.status = 'FAILED'
          next.error = error instanceof Error ? error.message : 'Print failed'
        }

        this.emit()
        recordJob(next)
      }
    } finally {
      this.processing = false
    }
  }
}

export const printQueue = new PrintQueue()

/** Automatic kitchen print: one job for one confirmed order. */
export const enqueueTokenPrint = (
  payload: TokenPrintPayload,
  referenceId: string,
): PrintJob =>
  printQueue.enqueue({
    id: createId('token'),
    kind: 'token',
    printer: 'supervisor_token',
    payload,
    referenceId,
    intent: 'automatic',
  })

/**
 * Physical bill/session print entry point. Call this only when the business
 * event itself is supposed to print immediately.
 */
export const enqueueBillPrint = (
  payload: BillPrintPayload,
  referenceId: string,
  intent: PrintIntent = 'manual',
): PrintJob =>
  printQueue.enqueue({
    id: createId('bill'),
    kind: 'bill',
    printer: 'counter_bill',
    payload,
    referenceId,
    intent,
  })

export const enqueueSessionReceiptPrint = (
  payload: SessionReceiptPayload,
  referenceId: string,
): PrintJob =>
  printQueue.enqueue({
    id: createId('session_receipt'),
    kind: 'session_receipt',
    printer: 'counter_bill',
    payload,
    referenceId,
    intent: 'manual',
  })

/**
 * Create a preview-only job. This function has ZERO physical-print side effects.
 */
export const createPrintPreviewJob = (
  kind: PrintJobKind,
  printer: PrintPrinter,
  payload: PrintPayload,
  referenceId: string,
): PrintJob => ({
  id: createId(`preview_${kind}`),
  kind,
  printer,
  payload,
  referenceId,
  status: 'QUEUED',
  createdAt: Date.now(),
  attempts: 0,
  intent: 'manual',
})

/** Print a preview only after the operator explicitly presses PRINT. */
export const printPreviewJob = (preview: PrintJob): PrintJob =>
  printQueue.enqueue(
    {
      id: createId(`${preview.kind}_manual`),
      kind: preview.kind,
      printer: preview.printer,
      payload: preview.payload,
      referenceId: preview.referenceId,
      intent: 'manual',
    },
    { dedupe: false },
  )

export const retryPrint = (jobId: string): void => {
  const job = printQueue.snapshot().find((candidate) => candidate.id === jobId)
  if (!job) return
  reprintJob(job)
}

export const reprintJob = (job: PrintJob): PrintJob =>
  printQueue.enqueue(
    {
      id: createId(`${job.kind}_reprint`),
      kind: job.kind,
      printer: job.printer,
      payload: job.payload,
      referenceId: job.referenceId,
      intent: 'manual',
    },
    { dedupe: false },
  )

export const getPrintJobs = (): PrintJob[] => printQueue.snapshot()

export const usePrintQueue = (): PrintJob[] => {
  const [jobs, setJobs] = useState<PrintJob[]>(printQueue.snapshot())
  useEffect(() => printQueue.subscribe(() => setJobs(printQueue.snapshot())), [])
  return jobs
}

export const previewLinesForJob = (job: PrintJob): string[] => {
  if (job.kind === 'token') return formatToken58mm(job.payload as TokenPrintPayload)
  if (job.kind === 'bill') return formatBill58mm(job.payload as BillPrintPayload)
  if (job.kind === 'session_receipt') return formatSessionReceipt58mm(job.payload as SessionReceiptPayload)
  return []
}

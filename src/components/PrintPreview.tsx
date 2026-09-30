/**
 * Bee's Hive — physical receipt preview.
 *
 * Opening this modal NEVER prints.
 * The physical PT-210 is triggered only by the PRINT button, which sends the
 * receipt through printService -> Windows relay -> the configured COM port.
 * `window.print()` is deliberately not used here.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  printPreviewJob,
  reprintJob,
  usePrintQueue,
  type PrintJob,
} from '../services/print/printService'
import type { BillPrintPayload, TokenPrintPayload, SessionReceiptPayload } from '../services/print/printFormatters'
import {
  formatBill58mm as formatBill,
  formatSessionReceipt58mm as formatSession,
  formatToken58mm as formatToken,
} from '../services/print/printFormatters'
import { receiptTokenLabel } from '../lib/tokenLabel'
import { Printer, X, AlertTriangle, CheckCircle, RotateCcw } from 'lucide-react'

export interface PrintPreviewProps {
  /** Existing queued/printed job, used for an intentional reprint. */
  jobId?: string
  /** Display-only job. It is not sent to the printer until PRINT is clicked. */
  previewJob?: PrintJob
  onCancel?: () => void
}

export default function PrintPreview({ jobId, previewJob, onCancel }: PrintPreviewProps) {
  const jobs = usePrintQueue()
  const queuedJob = jobId ? jobs.find((job) => job.id === jobId) : undefined
  const baseJob = previewJob ?? queuedJob
  const [printedJobId, setPrintedJobId] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [localError, setLocalError] = useState('')
  const printTriggeredRef = useRef(false)

  const activePrintedJob = printedJobId
    ? jobs.find((job) => job.id === printedJobId)
    : undefined

  const job = activePrintedJob ?? baseJob

  useEffect(() => {
    if (!printedJobId) return
    const current = jobs.find((candidate) => candidate.id === printedJobId)
    if (!current) return
    if (current.status === 'PRINTED' || current.status === 'FAILED') {
      setPrinting(false)
      printTriggeredRef.current = false
    }
  }, [jobs, printedJobId])

  const lines = useMemo(() => {
    if (!job) return []
    return getPreviewLines(job)
  }, [job])

  if (!job) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 bh-modal-overlay">
        <div className="rounded-2xl bg-white p-6 shadow-2xl">
          <p className="text-slate-500">Receipt preview is no longer available.</p>
          {onCancel && (
            <button onClick={onCancel} className="mt-3 rounded-xl bg-slate-100 px-4 py-2 text-sm">Close</button>
          )}
        </div>
      </div>
    )
  }

  const isToken = job.kind === 'token'
  const isParcel = isToken && (job.payload as TokenPrintPayload).kind === 'parcel'
  const tokenPayload = isToken ? (job.payload as TokenPrintPayload) : undefined
  const tokenNo = tokenPayload ? receiptTokenLabel(tokenPayload.tokenNumber, tokenPayload.kind) : ''
  const isDisplayOnly = Boolean(previewJob) && !printedJobId
  const terminalStatus = activePrintedJob?.status ?? (isDisplayOnly ? 'READY' : job.status)

  const handlePrint = () => {
    if (printing || printTriggeredRef.current) return
    printTriggeredRef.current = true
    setLocalError('')
    setPrinting(true)
    try {
      const physicalJob = isDisplayOnly ? printPreviewJob(job) : reprintJob(job)
      setPrintedJobId(physicalJob.id)
    } catch (error) {
      setPrinting(false)
      printTriggeredRef.current = false
      setLocalError(error instanceof Error ? error.message : 'Could not send receipt to printer')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 py-6 sm:items-center bh-modal-overlay">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Printer size={18} className="text-orange-500" />
            {job.kind === 'token' ? 'Token Preview' : job.kind === 'session_receipt' ? 'Session Receipt Preview' : 'Bill Preview'}
          </h2>
          {onCancel && (
            <button onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
              <X size={16} />
            </button>
          )}
        </div>

        {terminalStatus === 'FAILED' && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>Print failed — {activePrintedJob?.error ?? job.error ?? 'printer unavailable'}</span>
          </div>
        )}

        {terminalStatus === 'PRINTED' && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle size={16} /> Printed through the configured PT-210.
          </div>
        )}

        {terminalStatus === 'READY' && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
            <Printer size={16} /> Preview only — nothing has been printed.
          </div>
        )}

        {isToken && (
          <div className="mb-3 rounded-xl border-2 border-orange-200 bg-linear-to-br from-orange-50 to-amber-50 py-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-orange-500">{isParcel ? 'Parcel' : 'Token'}</p>
            <p className="mt-0.5 text-4xl font-black tracking-wider text-slate-900">
              {isParcel ? `PARCEL ${tokenNo}` : `TOKEN ${tokenNo}`}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-[#fffdf9] p-3">
          <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-tight text-slate-800">
            {lines.join('\n')}
          </pre>
        </div>

        {localError && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{localError}</div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
          >
            {printing ? <RotateCcw size={14} className="animate-spin" /> : <Printer size={14} />}
            {printing ? 'Printing…' : terminalStatus === 'PRINTED' ? 'Print Again' : 'PRINT'}
          </button>

          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Keep formatter output identical to the physical PT-210 payload. */
function getPreviewLines(job: PrintJob): string[] {
  if (job.kind === 'token') return formatToken(job.payload as TokenPrintPayload)
  if (job.kind === 'bill') return formatBill(job.payload as BillPrintPayload)
  return formatSession(job.payload as SessionReceiptPayload)
}

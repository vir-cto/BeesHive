/**
 * Durable print-job records (Firestore `printJobs` collection).
 *
 * The in-browser PrintQueue is operational state only; every status transition
 * is mirrored here so the authoritative print history survives a browser
 * refresh, a crashed tab or a different device. This record NEVER causes a
 * physical print — the relay's idempotency ledger remains the sole duplicate
 * protection, and reprints still go through the user-initiated new-job path.
 */
import { dataMode, isFirebaseConfigured } from './config'
import { FIRESTORE_COLLECTIONS, saveDoc } from './dataService'

export interface DurablePrintJob {
  jobId: string
  kind: string
  printer: string
  referenceId: string
  status: 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED'
  createdAt: number
  updatedAt: number
  printedAt?: number
  attempts: number
  error?: string
  /** Light metadata only — never receipt contents or customer PII beyond refs. */
  tokenNumber?: number
  billNumber?: string
}

/** Fire-and-forget mirror of a print-job status transition into Firestore. */
export const persistPrintJob = (job: DurablePrintJob): void => {
  if (dataMode !== 'firebase' || !isFirebaseConfigured()) return
  // Firestore `printJobs` is the durable print history (never localStorage /
  // in-memory only). Failures are non-fatal: the physical print has already
  // been handed to the relay, and the job is retried on the next transition.
  saveDoc(FIRESTORE_COLLECTIONS.printJobs, job.jobId, job, { merge: true }).catch(() => {})
}

/** Extract the light metadata fields from a typed print payload. */
export const printJobMetadata = (payload: unknown): { tokenNumber?: number; billNumber?: string } => {
  if (payload && typeof payload === 'object') {
    const p = payload as { tokenNumber?: unknown; billNumber?: unknown }
    return {
      tokenNumber: typeof p.tokenNumber === 'number' ? p.tokenNumber : undefined,
      billNumber: typeof p.billNumber === 'string' ? p.billNumber : undefined,
    }
  }
  return {}
}

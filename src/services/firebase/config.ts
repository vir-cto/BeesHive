// Firebase configuration — THE single authoritative configuration for Bee's Hive.
//
// Rules for this module:
//   • Every value comes from `.env` (`VITE_FIREBASE_*`). No project id, API key,
//     bucket or app id is ever hard-coded in TypeScript.
//   • This is the ONLY module that calls `initializeApp`, and it initializes all
//     four Firebase products from that one app:
//         Firebase App → Firebase Authentication → Cloud Firestore → Cloud Storage
//     A second app on the same config would silently split the Auth session (the
//     user appears signed out in one module and signed in in another) and can
//     point different features at different projects.
//   • The configuration is validated as ONE coherent project: the sender id
//     encoded in the app id (`1:<senderId>:web:<hash>`) must match
//     VITE_FIREBASE_MESSAGING_SENDER_ID, and the auth domain / storage bucket
//     must belong to VITE_FIREBASE_PROJECT_ID. A half-updated `.env` (only the
//     API key swapped) is therefore reported as misconfigured instead of
//     silently signing users into a different project.
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getAuth, type Auth } from 'firebase/auth'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const env = (name: string): string => (import.meta.env[name] ?? '').toString().trim()

export const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY'),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: env('VITE_FIREBASE_APP_ID'),
  ...(env('VITE_FIREBASE_MEASUREMENT_ID')
    ? { measurementId: env('VITE_FIREBASE_MEASUREMENT_ID') }
    : {}),
}

/** The project the running build is bound to. Not a secret — safe to display. */
export const firebaseProjectId = firebaseConfig.projectId

/** Sender id encoded inside the app id (`1:<senderId>:web:<hash>`). */
const senderIdFromAppId = firebaseConfig.appId.split(':')[1] ?? ''

/**
 * True only when a COMPLETE, self-consistent Web app config is present. When the
 * app id does not belong to the configured project the config counts as broken,
 * so a partially updated `.env` can never mix two projects.
 */
export const isFirebaseConfigured = (): boolean => {
  const complete = Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
  )
  if (!complete) return false
  // Standard Firebase host/bucket names for the configured project. Both legacy
  // (`.appspot.com`) and current (`.firebasestorage.app`) bucket suffixes are
  // accepted so an existing project keeps working after a bucket migration.
  const sameProjectHost =
    firebaseConfig.authDomain === `${firebaseConfig.projectId}.firebaseapp.com` ||
    firebaseConfig.authDomain === `${firebaseConfig.projectId}.web.app`
  const sameProjectBucket =
    firebaseConfig.storageBucket === `${firebaseConfig.projectId}.firebasestorage.app` ||
    firebaseConfig.storageBucket === `${firebaseConfig.projectId}.appspot.com`
  return sameProjectHost && sameProjectBucket && senderIdFromAppId === firebaseConfig.messagingSenderId
}

interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
}

/** Memoized services for the single Firebase app of this page load. */
let services: FirebaseServices | null = null

const build = (): FirebaseServices | null => {
  if (!isFirebaseConfigured()) return null
  try {
    // getApps()/getApp() guard: a hot reload or a second import must reuse the
    // already-initialized app instead of creating a duplicate "[DEFAULT]" app.
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    return {
      app,
      auth: getAuth(app),
      db: getFirestore(app),
      storage: getStorage(app),
    }
  } catch {
    // A malformed configuration must not crash the bundle: the app then runs
    // with Firebase unavailable and reports it through the normal error paths.
    return null
  }
}

export const getFirebaseServices = (): FirebaseServices | null => {
  if (!services) services = build()
  return services
}

export const getAppNow = (): FirebaseApp | null => getFirebaseServices()?.app ?? null
export const getAuthNow = (): Auth | null => getFirebaseServices()?.auth ?? null
export const getFirestoreNow = (): Firestore | null => getFirebaseServices()?.db ?? null
export const getStorageNow = (): FirebaseStorage | null => getFirebaseServices()?.storage ?? null

// Compatibility handles (null when Firebase is not configured). Kept so legacy
// imports keep working without creating a second initialization path.
export const app = getFirebaseServices()?.app ?? null
export const auth = getFirebaseServices()?.auth ?? null
export const db = getFirebaseServices()?.db ?? null
export const storage = getFirebaseServices()?.storage ?? null

/**
 * Data mode. PRODUCTION IS ALWAYS `firebase`.
 *
 * `mock` exists only for local development / automated UI work without a
 * Firebase project: it keeps business records in the browser, which is exactly
 * what production must never do. It is therefore hard-gated behind the Vite DEV
 * flag, so a built bundle (`npm run build` → `vite preview` / any deployment)
 * runs in Firebase mode even if `VITE_DATA_MODE=mock` is left in the
 * environment by mistake. No business data can end up in localStorage in a
 * deployed build.
 */
const requestedDataMode = import.meta.env.VITE_DATA_MODE || 'firebase'

export const dataMode: 'firebase' | 'mock' =
  import.meta.env.DEV && requestedDataMode === 'mock' ? 'mock' : 'firebase'
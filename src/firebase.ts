// Firebase SDK handles (backwards-compatible re-exports).
//
// The single authoritative configuration — and the ONLY `initializeApp` call
// site — lives in services/firebase/config.ts, which initializes the Firebase
// App plus Authentication, Cloud Firestore and Cloud Storage from it. This
// module merely re-exports those handles, so every historical import path
// ('../firebase') keeps working without creating a second Firebase app or
// pointing any feature at a different project.
export {
  getAppNow,
  getAuthNow,
  getFirestoreNow,
  getStorageNow,
  getFirebaseServices,
  firebaseProjectId,
} from './services/firebase/config'

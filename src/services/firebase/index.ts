// Firebase Service Layer
// Central export for all Firebase services.
// In mock mode (VITE_DATA_MODE=mock) every read/write is a safe no-op / returned
// as empty, so the app never touches the Firebase SDK unless it is configured.

export { firebaseConfig, isFirebaseConfigured, dataMode, firebaseProjectId } from './config'
export {
  signInWithEmail,
  signInWithUsername,
  signInWithIdentifier,
  signOut,
  getCurrentUser,
  onAuthStateChange,
  listFirebaseUsers,
  sendPasswordReset,
  mapAuthError,
} from './authService'
export type { AuthUser } from './authService'
export {
  uploadMenuImage,
  uploadMemberImage,
  deleteMenuImage,
  deleteMemberImage,
  getImageUrl,
  getMenuImagePath,
  getMemberImagePath,
} from './storageService'
export type { UploadResult } from './storageService'
export {
  saveCollection,
  saveEntities,
  loadCollection,
  watchCollection,
  deleteEntity,
  loadDoc,
  saveDoc,
  FIRESTORE_COLLECTIONS,
} from './dataService'
export type { StoredEntity, SaveOptions, FirestoreCollectionName } from './dataService'
export { nextToken, currentToken, tokenCounterId } from './tokenService'
export type { TokenSeries } from './tokenService'
export {
  loadUsersDirectory,
  watchUsersDirectory,
  saveUsersDirectory,
  deleteUserDirectoryEntry,
  toDirectoryEntry,
  createDirectoryAccount,
  provisionAuthAccount,
  markBootstrapClaimed,
  reserveUsername,
  releaseUsername,
  reservePhone,
  releasePhone,
  reserveEmail,
  releaseEmail,
  isValidPhone,
  normalizePhone,
  isValidContactEmailFormat,
} from './userService'
export type { DirectoryUser, DirectoryRole } from './userService'
// Firebase Storage service for dish / profile images.
// Stores the file in Firebase Storage and returns { imageUrl, imagePath }.
// Only the URL/path is persisted to Firestore — never base64.
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { getStorageNow } from '../../firebase'
import { isFirebaseConfigured } from './config'

/** Storage path: restaurants/{restaurantId}/menu/{menuItemId}/original */
export const getMenuImagePath = (restaurantId: string, menuItemId: string): string =>
  `restaurants/${restaurantId}/menu/${menuItemId}/original`

export const getMemberImagePath = (userId: string): string => `members/${userId}/avatar`

export interface UploadResult {
  imageUrl: string
  imagePath: string
}

/**
 * A URL that survives a reload and is visible on every device.
 *
 * `data:` URLs (base64 previews) and `blob:` object URLs exist only inside the
 * browser tab that created them: they must NEVER be written to Firestore (a
 * base64 payload has no business in a document, and both break on the next
 * reload / on another device). Image forms use this to decide whether a value
 * can be persisted as-is.
 */
export const isDurableImageUrl = (url?: string): boolean =>
  !!url && !url.startsWith('data:') && !url.startsWith('blob:')

const fileToBytes = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer())

export const uploadMenuImage = async (file: File, restaurantId: string, menuItemId: string): Promise<UploadResult> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured. Set VITE_DATA_MODE=mock or provide Firebase credentials.')
  const storage = getStorageNow()
  if (!storage) throw new Error('Firebase Storage is unavailable. Check the Firebase configuration.')
  const path = getMenuImagePath(restaurantId, menuItemId)
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, await fileToBytes(file), { contentType: file.type })
  const imageUrl = await getDownloadURL(storageRef)
  return { imageUrl, imagePath: path }
}

export const uploadMemberImage = async (file: File, userId: string): Promise<UploadResult> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured.')
  const storage = getStorageNow()
  if (!storage) throw new Error('Firebase Storage is unavailable. Check the Firebase configuration.')
  const path = getMemberImagePath(userId)
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, await fileToBytes(file), { contentType: file.type })
  const imageUrl = await getDownloadURL(storageRef)
  return { imageUrl, imagePath: path }
}

export const deleteMenuImage = async (imagePath: string): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const storage = getStorageNow()
  if (!storage) throw new Error('Firebase Storage is unavailable. Check the Firebase configuration.')
  await deleteObject(ref(storage, imagePath))
}

/** Delete a member's profile photo (best-effort; missing objects are ignored). */
export const deleteMemberImage = async (imagePath: string): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const storage = getStorageNow()
  if (!storage) throw new Error('Firebase Storage is unavailable. Check the Firebase configuration.')
  try {
    await deleteObject(ref(storage, imagePath))
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'storage/object-not-found') return
    throw err
  }
}

export const getImageUrl = async (imagePath: string): Promise<string> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured.')
  const storage = getStorageNow()
  if (!storage) throw new Error('Firebase Storage is unavailable. Check the Firebase configuration.')
  return getDownloadURL(ref(storage, imagePath))
}

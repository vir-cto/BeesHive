import { useRef, useState, useCallback, useEffect } from 'react'
import { Camera, X } from 'lucide-react'
import { dataMode } from '../services/firebase/config'
import { uploadMemberImage } from '../services/firebase/storageService'

interface AvatarUploadProps {
  currentImageUrl?: string
  onImageSelected: (file: File, previewUrl: string) => void
  onImageRemoved?: () => void
  label?: string
  userId?: string
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/** Circular profile-photo picker. Produces a data-URL preview (stored with the account). */
export default function AvatarUpload({
  currentImageUrl,
  onImageSelected,
  onImageRemoved,
  label = 'Profile Photo',
  userId,
}: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPreview(currentImageUrl || null)
  }, [currentImageUrl])

  const processFile = useCallback(
    (file: File) => {
      setError(null)
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Only JPEG, PNG, and WEBP images are allowed.')
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        setError('Image must be smaller than 5MB.')
        return
      }
      const reader = new FileReader()
      reader.onload = async (event) => {
        const result = event.target?.result as string
        setPreview(result)
        if (dataMode === 'firebase') {
          if (!userId) {
            onImageSelected(file, result)
            return
          }
          try {
            const uploaded = await uploadMemberImage(file, userId)
            setPreview(uploaded.imageUrl)
            onImageSelected(file, uploaded.imageUrl)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload profile photo to Firebase Storage.')
          }
          return
        }
        onImageSelected(file, result)
      }
      reader.onerror = () => setError('Failed to read the image file.')
      reader.readAsDataURL(file)
    },
    [onImageSelected, userId]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemove = () => {
    setPreview(null)
    setError(null)
    onImageRemoved?.()
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload photo"
          className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-orange-400 hover:bg-orange-50"
        >
          {preview ? (
            <>
              <img src={preview} alt="Avatar preview" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                <Camera size={18} className="text-white" />
              </span>
            </>
          ) : (
            <Camera size={20} className="text-slate-400 transition group-hover:text-orange-500" />
          )}
        </button>

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-orange-100 hover:text-orange-700"
          >
            {preview ? 'Replace Photo' : 'Upload Photo'}
          </button>
          {preview && onImageRemoved && (
            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-50"
            >
              <X size={12} /> Remove
            </button>
          )}
          <p className="text-[10px] text-slate-400">JPEG, PNG, WEBP • Max 5MB</p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && <div className="mt-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
    </div>
  )
}
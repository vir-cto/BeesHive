import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { dataMode } from '../services/firebase/config'
import { uploadMenuImage, uploadMemberImage, type UploadResult } from '../services/firebase/storageService'

interface ImageUploadProps {
  currentImageUrl?: string
  currentImageAlt?: string
  onImageSelected: (file: File, previewUrl: string, uploadResult?: UploadResult) => void
  onImageRemoved: () => void
  disabled?: boolean
  /** Context for Firebase Storage upload path */
  uploadContext?: {
    type: 'menu' | 'member'
    restaurantId?: string
    menuItemId?: string
    userId?: string
  }
}

// Accept any common image format — validation is by extension OR MIME type,
// so files whose MIME type the browser doesn't recognise are still accepted.
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic', 'heif', 'tif', 'tiff', 'ico', 'jfif', 'pjpeg', 'pjp']
const hasImageExtension = (name: string): boolean => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.includes(ext)
}
const ACCEPT_ATTR = ['image/*', ...IMAGE_EXTENSIONS.map((e) => `.${e}`)].join(',')
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export default function ImageUpload({
  currentImageUrl,
  currentImageAlt,
  onImageSelected,
  onImageRemoved,
  disabled = false,
  uploadContext,
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null)
  const [altText, setAltText] = useState(currentImageAlt || '')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    (file: File) => {
      setError(null)
      setUploading(true)

      if ((file.type && !file.type.startsWith('image/')) || (!file.type && !hasImageExtension(file.name))) {
        setError('Please choose an image file (JPG, PNG, WEBP, GIF, BMP, SVG, AVIF, HEIC, TIFF, etc.).')
        setUploading(false)
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        setError('Image must be smaller than 5MB.')
        setUploading(false)
        return
      }

      const reader = new FileReader()
      reader.onload = async (event) => {
        const result = event.target?.result as string
        setPreview(result)

        // In Firebase mode the photo belongs in Firebase Storage: the component
        // uploads it and hands the parent the durable download URL. The value
        // passed upward is never a `data:`/`blob:` browser-local preview when an
        // upload target is known.
        if (dataMode === 'firebase' && uploadContext && import.meta.env.VITE_FIREBASE_PROJECT_ID) {
          try {
            let uploadResult: UploadResult | undefined
            if (uploadContext.type === 'menu' && uploadContext.restaurantId && uploadContext.menuItemId) {
              uploadResult = await uploadMenuImage(file, uploadContext.restaurantId, uploadContext.menuItemId)
            } else if (uploadContext.type === 'member' && uploadContext.userId) {
              uploadResult = await uploadMemberImage(file, uploadContext.userId)
            }

            if (!uploadResult) {
              // No usable upload target (a missing item/user id). Report it —
              // never silently fall back to a preview that cannot be saved.
              setPreview(currentImageUrl || null)
              setError('The photo was not uploaded. Save the item first, then add the photo.')
              return
            }

            setPreview(uploadResult.imageUrl)
            onImageSelected(file, uploadResult.imageUrl, uploadResult)
          } catch (err) {
            // The upload genuinely failed: show the reason and keep the image
            // that IS stored, so the operator never believes a photo was saved.
            setPreview(currentImageUrl || null)
            setError(
              err instanceof Error && err.message
                ? `Photo upload to Firebase Storage failed: ${err.message}`
                : 'Photo upload to Firebase Storage failed. Please try again.',
            )
          } finally {
            setUploading(false)
          }
          return
        }

        // No upload target configured (local/mock development): hand the caller
        // the local preview so the form can show the chosen file.
        onImageSelected(file, result)
        setUploading(false)
      }
      reader.onerror = () => {
        setError('Failed to read the image file.')
        setUploading(false)
      }
      reader.readAsDataURL(file)
    },
    [currentImageUrl, onImageSelected, uploadContext]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleRemove = () => {
    setPreview(null)
    setAltText('')
    setError(null)
    onImageRemoved()
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-700">Dish Image</label>

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt={altText || 'Dish preview'}
            className="h-48 w-full rounded-xl border border-slate-200 object-cover"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
              <Loader2 size={32} className="animate-spin text-white" />
            </div>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600"
              title="Remove image"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed transition ${
            dragOver
              ? 'border-orange-400 bg-orange-50'
              : 'border-slate-300 bg-slate-50 hover:border-orange-300 hover:bg-orange-50/50'
          } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <ImageIcon size={40} className="mb-2 text-slate-400" />
          <p className="text-sm font-medium text-slate-600">
            Drag & drop or click to upload
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Any image format — JPG, PNG, WEBP, GIF, BMP, SVG, AVIF, HEIC, TIFF… • Max 5MB
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      {preview && !disabled && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            <Camera size={14} />
            Replace Image
          </button>
        </div>
      )}

      {preview && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Alt Text</label>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Describe the image"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
            disabled={disabled}
          />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <p className="text-xs text-slate-400">
        <Upload size={10} className="mr-1 inline" />
        Images are stored in cloud storage. Only the URL is saved to the menu item.
      </p>
    </div>
  )
}
import { useCallback, useEffect, useState } from 'react'
import { useAuth, MAX_ADMINS } from '../context/AuthContext'
import Avatar from './Avatar'
import AvatarUpload from './AvatarUpload'
import { uploadMemberImage, deleteMemberImage, getMemberImagePath } from '../services/firebase/storageService'
import { isValidContactEmailFormat, isValidPhone } from '../services/firebase/userService'
import { validateUsername } from '../lib/username'
import { validatePassword } from '../lib/password'
import { Plus, Trash2, Crown, UserCog, X, Shield, CheckCircle, Mail, Phone, Calendar, BadgeCheck, CheckCircle2, Circle, AlertCircle } from 'lucide-react'

type Admin = ReturnType<typeof useAuth>['listAdmins'] extends () => (infer T)[] ? T : never

/**
 * The password policy is defined ONCE in `lib/password.ts`; the checklist below
 * is rendered from the same rule list that is enforced before a save, so the
 * guidance and the enforcement can never drift apart.
 */
const PASSWORD_RULES: string[] = validatePassword('').errors

const PasswordChecklist = ({ password, confirm }: { password: string; confirm: string }) => {
  if (password.length === 0 && confirm.length === 0) return null
  const failures = validatePassword(password).errors
  const mismatch = confirm.length > 0 && confirm !== password
  return (
    <div className="mt-2">
      <ul className="space-y-1">
        {PASSWORD_RULES.map((label) => {
          const ok = !failures.includes(label)
          return (
            <li
              key={label}
              className={`flex items-center gap-1.5 text-xs font-medium ${ok ? 'text-emerald-600' : 'text-red-500'}`}
            >
              {ok ? <CheckCircle2 size={12} /> : <Circle size={12} />}
              {label}
            </li>
          )
        })}
      </ul>
      {mismatch && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <AlertCircle size={12} /> Passwords do not match
        </p>
      )}
    </div>
  )
}

export default function AdminAdminManagement() {
  const { user, isMainAdmin, listAdmins, createAdmin, deleteAdmin, transferMainAdmin, updateMyCredentials } = useAuth()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showTransfer, setShowTransfer] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '', password: '', confirmPassword: '', avatarUrl: '' })
  const [formAvatarFile, setFormAvatarFile] = useState<File | null>(null)
  const [myForm, setMyForm] = useState({ name: '', username: '', email: '', phone: '', password: '', confirmPassword: '', currentPassword: '', avatarUrl: '' })
  const [myAvatarFile, setMyAvatarFile] = useState<File | null>(null)
  const [myAvatarChanged, setMyAvatarChanged] = useState(false)
  const [detailsAdmin, setDetailsAdmin] = useState<Admin | null>(null)

const [creating, setCreating] = useState(false)
const [created, setCreated] = useState(false)

const [savingCredentials, setSavingCredentials] = useState(false)
const [credentialsSaved, setCredentialsSaved] = useState(false)

const [deleteCandidate, setDeleteCandidate] = useState<Admin | null>(null)
const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(() => setAdmins(listAdmins()), [listAdmins])
  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (user && !myAvatarChanged) {
      setMyForm({ name: user.name, username: user.username, email: user.email, phone: user.phone, password: '', confirmPassword: '', currentPassword: '', avatarUrl: user.avatarUrl ?? '' })
    }
  }, [user, myAvatarChanged])

  const adminsFull = admins.length >= MAX_ADMINS

  const handleCreate = async () => {
    setError(''); setSuccess(''); setCreated(false)
    if (!form.name || !form.username || !form.email || !form.phone || !form.password) {
      setError('Name, username, email, phone number and password are all required'); return
    }
    const usernameError = validateUsername(form.username)
    if (usernameError) { setError(usernameError); return }
    if (!isValidContactEmailFormat(form.email)) { setError('Enter a valid email address.'); return }
    if (!isValidPhone(form.phone)) { setError('Phone number must be exactly 10 digits (digits only — no +91, no spaces).'); return }
    const passwordCheck = validatePassword(form.password)
    if (!passwordCheck.isValid) {
      setError(`Password is not strong enough: ${passwordCheck.errors.join('; ')}.`)
      return
    }
    if (form.confirmPassword !== form.password) {
      setError('Password and Confirm Password do not match.')
      return
    }
    setCreating(true)
    setSuccess('Admin account created.')
refresh()

window.setTimeout(() => {
  setCreated(false)
  setShowCreate(false)
}, 1000)
    try {
      const adminData = {
        name: form.name.trim(), username: form.username.trim(), email: form.email.trim(), phone: form.phone.trim(),
        password: form.password, avatarUrl: formAvatarFile ? undefined : form.avatarUrl,
      }
      await createAdmin({ ...adminData, avatarFile: formAvatarFile ?? undefined, isMainAdmin: false, active: true })
      setForm({ name: '', username: '', email: '', phone: '', password: '', confirmPassword: '', avatarUrl: '' })
      setFormAvatarFile(null)
      // The form closes ONLY after the Auth account, Storage image and
      // Firestore profile have all persisted successfully.
      setShowCreate(false)
      setSuccess('Admin account created.')
      refresh()
    } catch (err) {
      // Failure: the form stays open with the real error so it can be corrected.
      setError(err instanceof Error ? err.message : 'Failed to create admin')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (adminId: string) => {
  const admin = admins.find((entry) => entry.id === adminId)

  if (!admin) return

  setDeleteCandidate(admin)
  setError('')
  setSuccess('')
}

const confirmDelete = async () => {
  if (!deleteCandidate || deleting) return

  setDeleting(true)
  setError('')
  setSuccess('')

  try {
    const name = deleteCandidate.name

    await deleteAdmin(deleteCandidate.id)

    setDeleteCandidate(null)
    setSuccess(`Admin "${name}" deleted.`)
    refresh()
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Failed to delete admin'
    )
  } finally {
    setDeleting(false)
  }
}

  const handleTransfer = async (targetId: string, targetName: string) => {
    if (!window.confirm(`Transfer "Main Admin" title to "${targetName}"? You will become a regular Admin.`)) return
    setError(''); setSuccess('')
    try {
      await transferMainAdmin(targetId)
      setShowTransfer(null)
      setSuccess(`Main Admin title transferred to ${targetName}.`)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer title')
    }
  }

  const handleUpdateMe = async () => {
  if (savingCredentials) return

  setError('')
  setSuccess('')
  setCredentialsSaved(false)

  if (!user) return

  const updates: {
    name?: string
    username?: string
    email?: string
    phone?: string
    password?: string
    currentPassword?: string
    avatarUrl?: string
  } = {}

  if (myForm.name.trim() !== user.name) {
    updates.name = myForm.name
  }

  if (
    myForm.username.trim().toLowerCase() !==
    (user.username ?? '')
  ) {
    updates.username = myForm.username
  }

  if (
    myForm.email.trim().toLowerCase() !==
    (user.email ?? '').toLowerCase()
  ) {
    updates.email = myForm.email
  }

  if (myForm.phone.trim() !== (user.phone ?? '')) {
    updates.phone = myForm.phone
  }

  // Username validation
  if (updates.username !== undefined) {
    const usernameError = validateUsername(updates.username)

    if (usernameError) {
      setError(usernameError)
      return
    }

    const normalized = updates.username.trim().toLowerCase()

    if (
      admins.some(
        (entry) =>
          entry.id !== user.id &&
          (entry.username ?? '').toLowerCase() === normalized
      )
    ) {
      setError('That username is already taken.')
      return
    }
  }

  // Email validation
  if (
    updates.email !== undefined &&
    !isValidContactEmailFormat(updates.email)
  ) {
    setError('Enter a valid email address.')
    return
  }

  if (
    updates.email !== undefined &&
    admins.some(
      (entry) =>
        entry.id !== user.id &&
        (entry.email ?? '').toLowerCase() ===
          updates.email!.trim().toLowerCase()
    )
  ) {
    setError('That email address is already in use.')
    return
  }

  // Phone validation
  if (updates.phone !== undefined) {
    if (!isValidPhone(updates.phone)) {
      setError(
        'Phone number must be exactly 10 digits (digits only — no +91, no spaces).'
      )
      return
    }

    if (
      admins.some(
        (entry) =>
          entry.id !== user.id &&
          entry.phone === updates.phone
      )
    ) {
      setError('That phone number is already in use.')
      return
    }
  }

  // Password validation
  if (myForm.password) {
    const passwordCheck = validatePassword(myForm.password)

    if (!passwordCheck.isValid) {
      setError(
        `New password is not strong enough: ${passwordCheck.errors.join('; ')}.`
      )
      return
    }

    if (myForm.confirmPassword !== myForm.password) {
      setError('Password and Confirm Password do not match.')
      return
    }

    if (!myForm.currentPassword) {
      setError('Enter your current password to change it.')
      return
    }

    updates.password = myForm.password
    updates.currentPassword = myForm.currentPassword
  }

  setSavingCredentials(true)

  try {
    let photoRemovedFromStorage = false

    // Profile photo
    if (
      myAvatarChanged ||
      myForm.avatarUrl !== (user.avatarUrl ?? '')
    ) {
      if (myAvatarFile && user.id) {
        const uploaded = await uploadMemberImage(
          myAvatarFile,
          user.id
        )

        updates.avatarUrl = uploaded.imageUrl
      } else if (myForm.avatarUrl === '') {
        updates.avatarUrl = ''
        photoRemovedFromStorage = Boolean(user.avatarUrl)
      } else if (!myForm.avatarUrl.startsWith('data:')) {
        updates.avatarUrl = myForm.avatarUrl
      } else {
        setError(
          'The profile photo has not finished uploading. Please select it again.'
        )
        return
      }
    }

    if (Object.keys(updates).length === 0) {
      setError('No changes to save.')
      return
    }

    // Save credentials
    await updateMyCredentials(updates)

    // Remove old profile image if necessary
    if (photoRemovedFromStorage) {
      await deleteMemberImage(
        getMemberImagePath(user.id)
      ).catch(() => {})
    }

    // Clear password fields
    setMyForm((prev) => ({
      ...prev,
      password: '',
      confirmPassword: '',
      currentPassword: '',
    }))

    setMyAvatarFile(null)
    setMyAvatarChanged(false)

    // IMPORTANT: successful save state
    setSavingCredentials(false)
    setCredentialsSaved(true)
    setSuccess('Your credentials updated successfully.')

    refresh()

    // Return to normal button after 2 seconds
    window.setTimeout(() => {
      setCredentialsSaved(false)
    }, 2000)

  } catch (err) {
    setSavingCredentials(false)

    setError(
      err instanceof Error
        ? err.message
        : 'Failed to update credentials'
    )
  }
}

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Admin Management</h2>
        <p className="mt-1 text-sm text-slate-500">Manage admin accounts and credentials. Only one Main Admin exists at a time.</p>
      </div>

      {(error || success) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || success}
        </div>
      )}

      <div className="rounded-[20px] border border-orange-100 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserCog size={18} className="text-orange-600" />
          <h3 className="text-lg font-bold text-slate-900">My Credentials</h3>
          {user?.isMainAdmin && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
              <Crown size={12} /> Main Admin
            </span>
          )}
        </div>
        <div className="space-y-3">
          <AvatarUpload
            key={myForm.avatarUrl || 'empty-avatar'}
            currentImageUrl={myForm.avatarUrl}
            onImageSelected={(file, previewUrl) => {
              setMyForm((prev) => ({ ...prev, avatarUrl: previewUrl }))
              setMyAvatarFile(file)
              setMyAvatarChanged(true)
            }}
            onImageRemoved={() => {
              setMyForm((prev) => ({ ...prev, avatarUrl: '' }))
              setMyAvatarFile(null)
              setMyAvatarChanged(true)
            }}
            label="My Profile Photo"
            userId={user?.id}
          />
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Name</label>
            <input value={myForm.name} onChange={(e) => setMyForm({ ...myForm, name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Username (login identifier — must be unique)</label>
            <input
              value={myForm.username}
              onChange={(e) => setMyForm({ ...myForm, username: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
            {myForm.username && validateUsername(myForm.username) && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} /> {validateUsername(myForm.username)}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
            <input type="email" value={myForm.email} onChange={(e) => setMyForm({ ...myForm, email: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Phone Number (exactly 10 digits — login identifier)</label>
            <input
              value={myForm.phone}
              onChange={(e) => setMyForm({ ...myForm, phone: e.target.value })}
              placeholder="9876543210"
              inputMode="numeric"
              maxLength={10}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-400 ${myForm.phone && !isValidPhone(myForm.phone) ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
            />
            {myForm.phone && !isValidPhone(myForm.phone) && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} /> Phone number must be exactly 10 digits (digits only — no +91, no spaces).</p>
            )}
          </div>
          {myForm.password.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Current Password (required to change password)</label>
              <input
                type="password"
                value={myForm.currentPassword}
                onChange={(e) => setMyForm({ ...myForm, currentPassword: e.target.value })}
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">New Password (leave blank to keep current)</label>
            <input type="password" value={myForm.password} onChange={(e) => setMyForm({ ...myForm, password: e.target.value })} placeholder="Strong password" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
            <PasswordChecklist password={myForm.password} confirm={myForm.confirmPassword} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Confirm New Password</label>
            <input
              type="password"
              value={myForm.confirmPassword}
              onChange={(e) => setMyForm({ ...myForm, confirmPassword: e.target.value })}
              placeholder="Re-enter password"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-400 ${myForm.confirmPassword && myForm.confirmPassword !== myForm.password ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
            />
          </div>
          <button
  onClick={handleUpdateMe}
  disabled={
    savingCredentials ||
    credentialsSaved ||
    (myForm.password.length > 0 &&
      (!validatePassword(myForm.password).isValid ||
        myForm.confirmPassword !== myForm.password))
  }
  title={
    myForm.password.length > 0 &&
    myForm.confirmPassword !== myForm.password
      ? 'Passwords do not match'
      : undefined
  }
  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition ${
    credentialsSaved
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  } disabled:cursor-not-allowed disabled:opacity-60`}
>
  {savingCredentials ? (
    'Saving…'
  ) : credentialsSaved ? (
    <>
      <CheckCircle2 size={16} />
      Saved
    </>
  ) : (
    <>
      <CheckCircle size={16} />
      Save Changes
    </>
  )}
</button>
        </div>
      </div>

      <div className="rounded-[20px] border border-orange-100 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-orange-600" />
            <h3 className="text-lg font-bold text-slate-900">All Admins ({admins.length}/{MAX_ADMINS})</h3>
          </div>
          {isMainAdmin && !adminsFull && (
            <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 rounded-xl bg-orange-100 px-3 py-2 text-sm font-bold text-orange-700 transition hover:bg-orange-200">
              {showCreate ? <X size={16} /> : <Plus size={16} />}
              {showCreate ? 'Cancel' : 'Add Admin'}
            </button>
          )}
        </div>

        {isMainAdmin && adminsFull && (
          <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            <AlertCircle size={14} /> Admin limit reached ({admins.length}/{MAX_ADMINS}). Delete or demote an admin before creating a new one.
          </p>
        )}

        {showCreate && (
          <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <h4 className="mb-3 text-sm font-bold text-slate-800">Create New Admin</h4>
            <p className="mb-3 text-xs text-slate-500">Maximum {MAX_ADMINS} admins allowed. Currently {admins.length}/{MAX_ADMINS}.</p>
            <div className="mb-3">
              <AvatarUpload
                currentImageUrl={form.avatarUrl}
                onImageSelected={(file, previewUrl) => { setForm({ ...form, avatarUrl: previewUrl }); setFormAvatarFile(file) }}
                onImageRemoved={() => { setForm({ ...form, avatarUrl: '' }); setFormAvatarFile(null) }}
                label="Admin Profile Photo"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username (unique login identifier)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" type="email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Phone number (10 digits)"
                inputMode="numeric"
                maxLength={10}
                className={`rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-400 ${form.phone && !isValidPhone(form.phone) ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
              />
              <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Strong password" type="password" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
            </div>
            <div className="mt-3">
              <PasswordChecklist password={form.password} confirm={form.confirmPassword} />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Confirm Password</label>
              <input
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="Re-enter password"
                type="password"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-400 ${form.confirmPassword && form.confirmPassword !== form.password ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
              />
            </div>
            <button
  onClick={handleCreate}
  disabled={
    creating ||
    created ||
    !form.name ||
    !form.username ||
    !form.email ||
    !isValidPhone(form.phone) ||
    !validatePassword(form.password).isValid ||
    form.confirmPassword !== form.password
  }
  title={
    form.confirmPassword !== form.password
      ? 'Passwords do not match'
      : undefined
  }
  className={`mt-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition ${
    created
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  } disabled:cursor-not-allowed disabled:opacity-60`}
>
  {creating ? (
    'Creating…'
  ) : created ? (
    <>
      <CheckCircle2 size={16} />
      Created
    </>
  ) : (
    <>
      <Plus size={16} />
      Create Admin
    </>
  )}
</button>
          </div>
        )}

        {admins.length === 0 ? (
          <p className="text-sm text-slate-500">No admins yet.</p>
        ) : (
          <div className="space-y-2">
            {admins.map((admin) => (
              <div key={admin.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <button
                  onClick={() => setDetailsAdmin(admin)}
                  className="flex min-w-0 items-center gap-3 text-left"
                  title="View details"
                >
                  <Avatar name={admin.name} src={admin.avatarUrl} role="admin" className="h-9 w-9 text-sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{admin.name}</p>
                    <p className="max-w-full truncate text-xs text-slate-500">{admin.email} {admin.phone ? `• ${admin.phone}` : ''}</p>
                  </div>
                </button>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  {admin.isMainAdmin ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                      <Crown size={12} /> Main Admin
                    </span>
                  ) : (
                    <>
                      {isMainAdmin && (
                        <button onClick={() => setShowTransfer(showTransfer === admin.id ? null : admin.id)} className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-200 sm:flex-none">
                          <Crown size={12} /> <span className="truncate">Transfer Title</span>
                        </button>
                      )}
                      {user?.id !== admin.id && (
                        <button
  onClick={() => handleDelete(admin.id)}
  className="rounded-lg bg-red-50 p-2 text-red-500 transition hover:bg-red-100"
  title="Delete admin"
  aria-label={`Delete ${admin.name}`}
>
  <Trash2 size={14} />
</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showTransfer && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-semibold text-amber-800">Transfer Main Admin title?</p>
            <p className="mb-3 text-xs text-amber-700">You will become a regular Admin. This action cannot be undone unless the new Main Admin transfers it back.</p>
            <div className="flex gap-2">
              <button onClick={() => { const a = admins.find((x) => x.id === showTransfer); if (a) handleTransfer(a.id, a.name) }} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600">
                Confirm Transfer
              </button>
              <button onClick={() => setShowTransfer(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin Details Modal — opened by clicking the avatar / row */}
      {detailsAdmin && (
        <div
          className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay"
          onClick={() => setDetailsAdmin(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-xl font-bold text-slate-900">Admin Details</h3>
              <button
                onClick={() => setDetailsAdmin(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col items-center text-center">
              <Avatar
                name={detailsAdmin.name}
                src={detailsAdmin.avatarUrl}
                role="admin"
                className="h-24 w-24 text-3xl"
              />
              <p className="mt-3 text-lg font-bold text-slate-900">{detailsAdmin.name}</p>
              <span className="mt-1 flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-bold text-orange-700 capitalize">
                {detailsAdmin.isMainAdmin ? 'Main Admin' : 'Admin'}
              </span>
            </div>

            <div className="mt-5 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail size={15} className="shrink-0 text-slate-400" />
                {detailsAdmin.email}
              </div>
              {detailsAdmin.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone size={15} className="shrink-0 text-slate-400" />
                  {detailsAdmin.phone}
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-600">
                <BadgeCheck size={15} className="shrink-0 text-slate-400" />
                <span className="capitalize">{detailsAdmin.id}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar size={15} className="shrink-0 text-slate-400" />
                {new Date(detailsAdmin.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
            </div>

            {detailsAdmin.isMainAdmin && (
              <div className="mt-3 flex items-center justify-center">
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                  <Crown size={12} /> Main Admin
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteCandidate && (
  <div
    className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 p-4"
    onClick={() => !deleting && setDeleteCandidate(null)}
  >
    <div
      className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Delete Admin?
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Are you sure you want to delete this admin account?
          </p>
        </div>

        <button
          onClick={() => !deleting && setDeleteCandidate(null)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          disabled={deleting}
        >
          <X size={18} />
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3">
        <p className="text-sm font-bold text-red-700">
          {deleteCandidate.name}
        </p>
        <p className="mt-1 text-xs text-red-600">
          {deleteCandidate.email}
        </p>
        <p className="mt-2 text-xs font-semibold text-red-600">
          This action cannot be undone.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setDeleteCandidate(null)}
          disabled={deleting}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={confirmDelete}
          disabled={deleting}
          className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deleting ? (
            'Deleting…'
          ) : (
            <>
              <Trash2 size={15} />
              Delete Admin
            </>
          )}
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  )
}

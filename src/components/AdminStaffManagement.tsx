// import { useState } from 'react';
// import { useAuth, MAX_SUPERVISORS, type UserAccount } from '../context/AuthContext';
// import Avatar from './Avatar';
// import AvatarUpload from './AvatarUpload';
// import { isValidContactEmailFormat, isValidPhone } from '../services/firebase/userService';
// import { validateUsername } from '../lib/username';
// import {
//   UserPlus,
//   Edit2,
//   Trash2,
//   Mail,
//   Phone,
//   Lock,
//   User,
//   X,
//   Calendar,
//   BadgeCheck,
//   CheckCircle2,
//   Circle,
//   AlertCircle,
//   AlertTriangle,
// } from 'lucide-react';

// type StaffFormData = {
//   name: string;
//   username: string;
//   email: string;
//   phone: string;
//   password: string;
//   confirmPassword: string;
//   role: 'waiter' | 'supervisor';
//   active: boolean;
//   avatarUrl?: string;
// };

// const emptyForm: StaffFormData = {
//   name: '',
//   username: '',
//   email: '',
//   phone: '',
//   password: '',
//   confirmPassword: '',
//   role: 'waiter',
//   active: true,
//   avatarUrl: '',
// };

// const PASSWORD_RULES: { label: string; test: (pwd: string) => boolean }[] = [
//   { label: 'At least 8 characters', test: (p) => p.length >= 8 },
//   { label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
//   { label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
//   { label: 'One number (0-9)', test: (p) => /[0-9]/.test(p) },
//   { label: 'One special character (!@#$…)', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
// ];

// export default function AdminStaffManagement() {
//   const { createStaff, updateStaff, deleteStaff, listStaff, users } = useAuth();
//   const [showForm, setShowForm] = useState(false);
//   const [editingId, setEditingId] = useState<string | null>(null);
//   const [form, setForm] = useState<StaffFormData>(emptyForm);
//   const [formAvatarFile, setFormAvatarFile] = useState<File | null>(null);
//   const [error, setError] = useState('');
//   const [saving, setSaving] = useState(false);
//   const [detailsMember, setDetailsMember] = useState<UserAccount | null>(null);

//   const staff = listStaff();
//   const supervisorCount = users.filter((u) => u.role === 'supervisor').length;
//   const supervisorsFull = supervisorCount >= MAX_SUPERVISORS;

//   const passwordChecks = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) }));
//   const passwordValid = form.password.length > 0 && passwordChecks.every((r) => r.ok);
//   const passwordsMismatch =
//     form.confirmPassword.length > 0 && form.confirmPassword !== form.password;
//   const passwordRequired = !editingId || form.password.length > 0;
//   const passwordOk = !passwordRequired || passwordValid;
//   const confirmOk = !passwordRequired || (!passwordsMismatch && form.confirmPassword.length > 0);
//   const canSubmit = passwordOk && confirmOk;

//   const openCreate = () => {
//     setEditingId(null);
//     setForm(emptyForm);
//     setFormAvatarFile(null);
//     setShowForm(true);
//     setError('');
//   };

//   const openEdit = (member: UserAccount) => {
//     setEditingId(member.id);
//     setForm({
//       name: member.name,
//       username: member.username,
//       email: member.email,
//       phone: member.phone,
//       password: '',
//       confirmPassword: '',
//       role: member.role as 'waiter' | 'supervisor',
//       active: member.active,
//       avatarUrl: member.avatarUrl ?? '',
//     });
//     setFormAvatarFile(null);
//     setShowForm(true);
//     setError('');
//   };

//   const handleSubmit = async () => {
//     if (!form.name || !form.username || !form.email || !form.phone) {
//       setError('Name, username, email and phone number are all required');
//       return;
//     }
//     const usernameError = validateUsername(form.username);
//     if (usernameError) {
//       setError(usernameError);
//       return;
//     }
//     if (!isValidContactEmailFormat(form.email)) {
//       setError('Enter a valid email address.');
//       return;
//     }
//     if (!isValidPhone(form.phone)) {
//       setError('Phone number must be exactly 10 digits.');
//       return;
//     }
//     if (passwordRequired && !passwordValid) {
//       setError(
//         'Password must meet all strength requirements (8+ characters, upper & lower case, number and special character).'
//       );
//       return;
//     }
//     if (passwordRequired && passwordsMismatch) {
//       setError('Password and Confirm Password do not match.');
//       return;
//     }
//     if (!editingId && form.role === 'supervisor' && supervisorsFull) {
//       setError(
//         `Maximum ${MAX_SUPERVISORS} Supervisor accounts allowed — deactivate or remove one first.`
//       );
//       return;
//     }
//     const editingMember = editingId ? users.find((u) => u.id === editingId) : undefined;
//     if (
//       editingMember &&
//       form.role === 'supervisor' &&
//       editingMember.role !== 'supervisor' &&
//       supervisorsFull
//     ) {
//       setError(
//         `Maximum ${MAX_SUPERVISORS} Supervisor accounts allowed — deactivate or remove one first.`
//       );
//       return;
//     }
//     const normalizedUsername = form.username.trim().toLowerCase();
//     if (
//       users.some(
//         (u) => u.id !== editingId && (u.username ?? '').toLowerCase() === normalizedUsername
//       )
//     ) {
//       setError('That username is already taken by another account.');
//       return;
//     }
//     if (
//       users.some(
//         (u) =>
//           u.id !== editingId && (u.email ?? '').toLowerCase() === form.email.trim().toLowerCase()
//       )
//     ) {
//       setError('That email address is already in use by another account.');
//       return;
//     }
//     if (users.some((u) => u.id !== editingId && u.phone === form.phone)) {
//       setError('That phone number is already in use by another account.');
//       return;
//     }

//     setSaving(true);
//     setError('');
//     try {
//       if (editingId) {
//         const rest = {
//           name: form.name,
//           username: normalizedUsername,
//           email: form.email,
//           phone: form.phone,
//           role: form.role,
//           active: form.active,
//           avatarUrl: form.avatarUrl,
//         };
//         await updateStaff(editingId, rest);
//       } else {
//         const rest = {
//           name: form.name,
//           username: normalizedUsername,
//           email: form.email,
//           phone: form.phone,
//           password: form.password,
//           role: form.role,
//           active: form.active,
//           avatarUrl: formAvatarFile ? undefined : form.avatarUrl || undefined,
//         };
//         await createStaff({ ...rest, avatarFile: formAvatarFile ?? undefined });
//       }
//       setShowForm(false);
//       setEditingId(null);
//       setForm(emptyForm);
//       setFormAvatarFile(null);
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Could not save the staff account.');
//     } finally {
//       setSaving(false);
//     }
//   };

//   const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

//   const handleDelete = (id: string, name: string) => {
//     setDeleteConfirm({ id, name });
//   };

//   const confirmDelete = async () => {
//     if (!deleteConfirm) return;
//     const { id } = deleteConfirm;
//     setDeleteConfirm(null);
//     setError('');
//     try {
//       await deleteStaff(id);
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Could not delete the staff account.');
//     }
//   };

//   return (
//     <div className="space-y-4">
//       <div className="flex items-center justify-between">
//         <h2 className="text-xl font-bold text-slate-900">Staff Accounts</h2>
//         <button
//           onClick={openCreate}
//           className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
//         >
//           <UserPlus size={16} /> Add Staff
//         </button>
//       </div>
//       {staff.length === 0 ? (
//         <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
//           <User size={40} className="mx-auto mb-3 text-slate-300" />
//           <p className="text-slate-500">No staff accounts yet. Add waiters or supervisors.</p>
//         </div>
//       ) : (
//         <div className="space-y-2">
//           {staff.map((member) => (
//             <div
//               key={member.id}
//               className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
//             >
//               <button
//                 onClick={() => setDetailsMember(member)}
//                 className="flex items-center gap-3 text-left"
//                 title="View details"
//               >
//                 <Avatar
//                   name={member.name}
//                   src={member.avatarUrl}
//                   role={member.role}
//                   className="h-10 w-10 text-base"
//                 />
//                 <div>
//                   <p className="font-semibold text-slate-900">{member.name}</p>
//                   <p className="text-xs text-slate-500 capitalize">
//                     {member.role} • {member.email}
//                   </p>
//                 </div>
//               </button>
//               <div className="flex items-center gap-2">
//                 <span
//                   className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
//                     member.active
//                       ? 'bg-emerald-100 text-emerald-700'
//                       : 'bg-slate-100 text-slate-500'
//                   }`}
//                 >
//                   {member.active ? 'Active' : 'Inactive'}
//                 </span>
//                 <button
//                   onClick={() => openEdit(member)}
//                   className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-orange-100 hover:text-orange-600"
//                   title="Edit"
//                 >
//                   <Edit2 size={14} />
//                 </button>
//                 <button
//                   onClick={() => handleDelete(member.id, member.name)}
//                   className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-red-100 hover:text-red-600"
//                   title="Delete"
//                 >
//                   <Trash2 size={14} />
//                 </button>
//               </div>
//             </div>
//           ))}
//         </div>
//       )}

//       {showForm && (
//         <div
//           className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay"
//           onClick={() => !saving && setShowForm(false)}
//         >
//           <div
//             className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <div className="mb-4 flex items-start justify-between">
//               <h3 className="text-xl font-bold text-slate-900">
//                 {editingId ? 'Edit Staff' : 'Add Staff'}
//               </h3>
//               <button
//                 onClick={() => !saving && setShowForm(false)}
//                 disabled={saving}
//                 className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
//                 aria-label="Close"
//               >
//                 <X size={18} />
//               </button>
//             </div>

//             {error && (
//               <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
//                 {error}
//               </div>
//             )}

//             <div className="max-h-[60vh] space-y-3 overflow-y-auto">
//               <div>
//                 <label className="mb-1 block text-sm font-semibold text-slate-700">
//                   Full Name *
//                 </label>
//                 <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
//                   <User size={16} className="text-slate-400" />
//                   <input
//                     type="text"
//                     value={form.name}
//                     onChange={(e) => setForm({ ...form, name: e.target.value })}
//                     placeholder="Full name"
//                     className="w-full py-2 text-sm outline-none"
//                     disabled={saving}
//                   />
//                 </div>
//               </div>

//               <AvatarUpload
//                 label="Staff Profile Photo"
//                 currentImageUrl={form.avatarUrl}
//                   onImageSelected={(file, previewUrl) => {
//                     setForm({ ...form, avatarUrl: previewUrl });
//                     setFormAvatarFile(file);
//                   }}
//                   onImageRemoved={() => {
//                     setForm({ ...form, avatarUrl: '' });
//                     setFormAvatarFile(null);
//                   }}
//                   userId={editingId ?? undefined}
//                 />

//               <div>
//                 <label className="mb-1 block text-sm font-semibold text-slate-700">
//                   Username *
//                 </label>
//                 <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
//                   <User size={16} className="text-slate-400" />
//                   <input
//                     type="text"
//                     value={form.username}
//                     onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
//                     placeholder="staffusername"
//                     className="w-full py-2 text-sm outline-none"
//                     disabled={saving}
//                   />
//                 </div>
//                 <p className="mt-1 text-[11px] text-slate-400">
//                   The username used to log in (not email)
//                 </p>
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-semibold text-slate-700">Email *</label>
//                 <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
//                   <Mail size={16} className="text-slate-400" />
//                   <input
//                     type="email"
//                     value={form.email}
//                     onChange={(e) => setForm({ ...form, email: e.target.value })}
//                     placeholder="staff@example.com"
//                     className="w-full py-2 text-sm outline-none"
//                     disabled={saving}
//                   />
//                 </div>
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-semibold text-slate-700">Phone *</label>
//                 <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
//                   <Phone size={16} className="text-slate-400" />
//                   <input
//                     value={form.phone}
//                     onChange={(e) =>
//                       setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
//                     }
//                     placeholder="9876543210"
//                     className="w-full py-2 text-sm outline-none"
//                     disabled={saving}
//                   />
//                 </div>
//                 <p className="mt-1 text-[11px] text-slate-400">Exactly 10 digits</p>
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-semibold text-slate-700">
//                   Password {editingId ? '(leave blank to keep current)' : '*'}
//                 </label>
//                 <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
//                   <Lock size={16} className="text-slate-400" />
//                   <input
//                     type="password"
//                     value={form.password}
//                     onChange={(e) => setForm({ ...form, password: e.target.value })}
//                     placeholder={editingId ? '•••••••• (unchanged)' : 'Strong password'}
//                     className="w-full py-2 text-sm outline-none"
//                     disabled={saving}
//                   />
//                 </div>
//                 {form.password.length > 0 && (
//                   <ul className="mt-2 space-y-1">
//                     {passwordChecks.map((rule) => (
//                       <li
//                         key={rule.label}
//                         className={`flex items-center gap-1.5 text-xs font-medium ${rule.ok ? 'text-emerald-600' : 'text-red-500'}`}
//                       >
//                         {rule.ok ? <CheckCircle2 size={12} /> : <Circle size={12} />}
//                         {rule.label}
//                       </li>
//                     ))}
//                   </ul>
//                 )}
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-semibold text-slate-700">
//                   Confirm Password *
//                 </label>
//                 <div
//                   className={`flex items-center gap-2 rounded-xl border px-3 ${
//                     passwordsMismatch ? 'border-red-300 bg-red-50' : 'border-slate-200'
//                   }`}
//                 >
//                   <Lock size={16} className="text-slate-400" />
//                   <input
//                     type="password"
//                     value={form.confirmPassword}
//                     onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
//                     placeholder="Re-enter password"
//                     className="w-full py-2 text-sm outline-none"
//                     disabled={saving}
//                   />
//                 </div>
//                 {passwordsMismatch && (
//                   <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600">
//                     <AlertCircle size={12} /> Passwords do not match
//                   </p>
//                 )}
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-semibold text-slate-700">Role</label>
//                 <select
//                   value={form.role}
//                   onChange={(e) =>
//                     setForm({ ...form, role: e.target.value as 'waiter' | 'supervisor' })
//                   }
//                   className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
//                   disabled={saving}
//                 >
//                   <option value="waiter">Waiter</option>
//                   <option value="supervisor" disabled={supervisorsFull}>
//                     Supervisor {supervisorsFull ? '(limit reached — max 2)' : ''}
//                   </option>
//                 </select>
//               </div>

//               <div className="flex items-center gap-2">
//                 <input
//                   type="checkbox"
//                   checked={form.active}
//                   onChange={(e) => setForm({ ...form, active: e.target.checked })}
//                   className="h-4 w-4"
//                   disabled={saving}
//                 />
//                 <label className="text-sm text-slate-700">Active (can log in)</label>
//               </div>
//             </div>

//             <div className="mt-6 flex gap-2">
//               <button
//                 onClick={() => setShowForm(false)}
//                 className="flex-1 rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={handleSubmit}
//                 disabled={saving || !canSubmit}
//                 className="flex-1 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
//               >
//                 {saving
//                   ? editingId
//                     ? 'Saving…'
//                     : 'Creating…'
//                   : editingId
//                     ? 'Save Changes'
//                     : 'Create Account'}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Staff Details Modal */}
//       {detailsMember && (
//         <div
//           className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay"
//           onClick={() => setDetailsMember(null)}
//         >
//           <div
//             className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <div className="mb-4 flex items-start justify-between">
//               <h3 className="text-xl font-bold text-slate-900">Staff Details</h3>
//               <button
//                 onClick={() => setDetailsMember(null)}
//                 className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
//                 aria-label="Close"
//               >
//                 <X size={18} />
//               </button>
//             </div>

//             <div className="flex flex-col items-center text-center">
//               <Avatar
//                 name={detailsMember.name}
//                 src={detailsMember.avatarUrl}
//                 role={detailsMember.role}
//                 className="h-24 w-24 text-3xl"
//               />
//               <p className="mt-3 text-lg font-bold text-slate-900">{detailsMember.name}</p>
//               <span className="mt-1 flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-bold text-orange-700 capitalize">
//                 {detailsMember.role}
//               </span>
//             </div>

//             <div className="mt-5 space-y-2.5 text-sm">
//               <div className="flex items-center gap-2 text-slate-600">
//                 <Mail size={15} className="shrink-0 text-slate-400" />
//                 {detailsMember.email}
//               </div>
//               {detailsMember.phone && (
//                 <div className="flex items-center gap-2 text-slate-600">
//                   <Phone size={15} className="shrink-0 text-slate-400" />
//                   {detailsMember.phone}
//                 </div>
//               )}
//               <div className="flex items-center gap-2 text-slate-600">
//                 <BadgeCheck size={15} className="shrink-0 text-slate-400" />
//                 <span className="capitalize">{detailsMember.id}</span>
//               </div>
//               <div className="flex items-center gap-2 text-slate-600">
//                 <Calendar size={15} className="shrink-0 text-slate-400" />
//                 {new Date(detailsMember.createdAt).toLocaleDateString('en-IN', {
//                   day: 'numeric',
//                   month: 'short',
//                   year: 'numeric',
//                 })}
//               </div>
//             </div>

//             <div className="mt-3 flex items-center justify-center">
//               <span
//                 className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
//                   detailsMember.active
//                     ? 'bg-emerald-100 text-emerald-700'
//                     : 'bg-slate-100 text-slate-500'
//                 }`}
//               >
//                 {detailsMember.active ? 'Active' : 'Inactive'}
//               </span>
//             </div>

//             <div className="mt-6 flex gap-2">
//               <button
//                 onClick={() => {
//                   setDetailsMember(null);
//                   openEdit(detailsMember);
//                 }}
//                 className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
//               >
//                 <Edit2 size={16} /> Edit
//               </button>
//               <button
//                 onClick={() => {
//                   const member = detailsMember;
//                   setDetailsMember(null);
//                   handleDelete(member.id, member.name);
//                 }}
//                 className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100"
//               >
//                 <Trash2 size={16} /> Delete
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Delete Confirmation Modal */}
//       {deleteConfirm && (
//         <div
//           className="fixed inset-0 z-70 flex items-center justify-center overflow-y-auto bg-black/40 p-4 bh-modal-overlay"
//           onClick={() => setDeleteConfirm(null)}
//         >
//           <div
//             className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
//               <AlertTriangle className="text-rose-600" size={24} />
//             </div>
//             <h3 className="text-lg font-bold text-slate-900">Delete staff account?</h3>
//             <p className="mt-1 text-sm text-slate-500">
//               Delete staff account "{deleteConfirm.name}"?
//             </p>
//             <p className="mt-1 text-xs text-slate-400">This action cannot be undone.</p>
//             <div className="mt-6 flex justify-end gap-2">
//               <button
//                 onClick={() => setDeleteConfirm(null)}
//                 className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={confirmDelete}
//                 className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
//               >
//                 Delete
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }


import { useState } from 'react';
import { useAuth, MAX_SUPERVISORS, type UserAccount } from '../context/AuthContext';
import Avatar from './Avatar';
import AvatarUpload from './AvatarUpload';
import { isValidContactEmailFormat, isValidPhone } from '../services/firebase/userService';
import { validateUsername } from '../lib/username';
import {
  UserPlus,
  Edit2,
  Trash2,
  Mail,
  Phone,
  Lock,
  User,
  X,
  Calendar,
  BadgeCheck,
  CheckCircle2,
  Circle,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';

type StaffFormData = {
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  role: 'waiter' | 'supervisor';
  active: boolean;
  avatarUrl?: string;
};

const emptyForm: StaffFormData = {
  name: '',
  username: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  role: 'waiter',
  active: true,
  avatarUrl: '',
};

const PASSWORD_RULES: { label: string; test: (pwd: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0-9)', test: (p) => /[0-9]/.test(p) },
  { label: 'One special character (!@#$…)', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export default function AdminStaffManagement() {
  const { createStaff, updateStaff, deleteStaff, listStaff, users } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffFormData>(emptyForm);
  const [formAvatarFile, setFormAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [detailsMember, setDetailsMember] = useState<UserAccount | null>(null);

  const staff = listStaff();
  const supervisorCount = users.filter((u) => u.role === 'supervisor').length;
  const supervisorsFull = supervisorCount >= MAX_SUPERVISORS;

  const passwordChecks = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) }));
  const passwordValid = form.password.length > 0 && passwordChecks.every((r) => r.ok);
  const passwordsMismatch =
    form.confirmPassword.length > 0 && form.confirmPassword !== form.password;
  const passwordRequired = !editingId || form.password.length > 0;
  const passwordOk = !passwordRequired || passwordValid;
  const confirmOk = !passwordRequired || (!passwordsMismatch && form.confirmPassword.length > 0);
  const canSubmit = passwordOk && confirmOk;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormAvatarFile(null);
    setShowForm(true);
    setError('');
    setEditSaved(false);
  };

  const openEdit = (member: UserAccount) => {
    setEditingId(member.id);
    setForm({
      name: member.name,
      username: member.username,
      email: member.email,
      phone: member.phone,
      password: '',
      confirmPassword: '',
      role: member.role as 'waiter' | 'supervisor',
      active: member.active,
      avatarUrl: member.avatarUrl ?? '',
    });
    setFormAvatarFile(null);
    setShowForm(true);
    setError('');
    setEditSaved(false);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.username || !form.email || !form.phone) {
      setError('Name, username, email and phone number are all required');
      return;
    }
    const usernameError = validateUsername(form.username);
    if (usernameError) {
      setError(usernameError);
      return;
    }
    if (!isValidContactEmailFormat(form.email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!isValidPhone(form.phone)) {
      setError('Phone number must be exactly 10 digits.');
      return;
    }
    if (passwordRequired && !passwordValid) {
      setError(
        'Password must meet all strength requirements (8+ characters, upper & lower case, number and special character).'
      );
      return;
    }
    if (passwordRequired && passwordsMismatch) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    if (!editingId && form.role === 'supervisor' && supervisorsFull) {
      setError(
        `Maximum ${MAX_SUPERVISORS} Supervisor accounts allowed — deactivate or remove one first.`
      );
      return;
    }
    const editingMember = editingId ? users.find((u) => u.id === editingId) : undefined;
    if (
      editingMember &&
      form.role === 'supervisor' &&
      editingMember.role !== 'supervisor' &&
      supervisorsFull
    ) {
      setError(
        `Maximum ${MAX_SUPERVISORS} Supervisor accounts allowed — deactivate or remove one first.`
      );
      return;
    }
    const normalizedUsername = form.username.trim().toLowerCase();
    if (
      users.some(
        (u) => u.id !== editingId && (u.username ?? '').toLowerCase() === normalizedUsername
      )
    ) {
      setError('That username is already taken by another account.');
      return;
    }
    if (
      users.some(
        (u) =>
          u.id !== editingId && (u.email ?? '').toLowerCase() === form.email.trim().toLowerCase()
      )
    ) {
      setError('That email address is already in use by another account.');
      return;
    }
    if (users.some((u) => u.id !== editingId && u.phone === form.phone)) {
      setError('That phone number is already in use by another account.');
      return;
    }

    setSaving(true);
    setError('');
    try {
  if (editingId) {
    // Password is optional on edit: only sent when the admin typed a new one.
    const rest: Parameters<typeof updateStaff>[1] = {
      name: form.name,
      username: normalizedUsername,
      email: form.email,
      phone: form.phone,
      role: form.role,
      active: form.active,
      avatarUrl: form.avatarUrl,
    };

    if (form.password.length > 0) {
      rest.password = form.password;
    }

    await updateStaff(editingId, rest);

    // Keep Edit Staff modal open and show Saved.
    setEditSaved(true);
  } else {
    const rest = {
      name: form.name,
      username: normalizedUsername,
      email: form.email,
      phone: form.phone,
      password: form.password,
      role: form.role,
      active: form.active,
      avatarUrl: formAvatarFile ? undefined : form.avatarUrl || undefined,
    };

    await createStaff({
      ...rest,
      avatarFile: formAvatarFile ?? undefined,
    });

    // Create Staff keeps the existing behavior.
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormAvatarFile(null);
  }
} catch (err) {
  setEditSaved(false);
  setError(
    err instanceof Error
      ? err.message
      : 'Could not save the staff account.'
  );
} finally {
  setSaving(false);
}
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    setError('');
    try {
      await deleteStaff(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the staff account.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Staff Accounts</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
        >
          <UserPlus size={16} /> Add Staff
        </button>
      </div>
      {staff.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <User size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">No staff accounts yet. Add waiters or supervisors.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
            >
              <button
                onClick={() => setDetailsMember(member)}
                className="flex items-center gap-3 text-left"
                title="View details"
              >
                <Avatar
                  name={member.name}
                  src={member.avatarUrl}
                  role={member.role}
                  className="h-10 w-10 text-base"
                />
                <div>
                  <p className="font-semibold text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    {member.role} • {member.email}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    member.active
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {member.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => openEdit(member)}
                  className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-orange-100 hover:text-orange-600"
                  title="Edit"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(member.id, member.name)}
                  className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-red-100 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay"
          onClick={() => !saving && setShowForm(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-xl font-bold text-slate-900">
                {editingId ? 'Edit Staff' : 'Add Staff'}
              </h3>
              <button
                onClick={() => !saving && setShowForm(false)}
                disabled={saving}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Full Name *
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <User size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Full name"
                    className="w-full py-2 text-sm outline-none"
                    disabled={saving}
                  />
                </div>
              </div>

              <AvatarUpload
                label="Staff Profile Photo"
                currentImageUrl={form.avatarUrl}
                onImageSelected={(file, previewUrl) => {
                  setForm({ ...form, avatarUrl: previewUrl });
                  setFormAvatarFile(file);
                }}
                onImageRemoved={() => {
                  setForm({ ...form, avatarUrl: '' });
                  setFormAvatarFile(null);
                }}
                userId={editingId ?? undefined}
              />

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Username *
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                  <User size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                    placeholder="staffusername"
                    className="w-full py-2 text-sm outline-none"
                    disabled={saving}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  The username used to log in (not email)
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Email *</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                  <Mail size={16} className="text-slate-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="staff@example.com"
                    className="w-full py-2 text-sm outline-none"
                    disabled={saving}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Phone *</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                  <Phone size={16} className="text-slate-400" />
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                    }
                    placeholder="9876543210"
                    className="w-full py-2 text-sm outline-none"
                    disabled={saving}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Exactly 10 digits</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Password {editingId ? '(leave blank to keep current)' : '*'}
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                  <Lock size={16} className="text-slate-400" />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId ? '•••••••• (unchanged)' : 'Strong password'}
                    className="w-full py-2 text-sm outline-none"
                    disabled={saving}
                  />
                </div>
                {form.password.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {passwordChecks.map((rule) => (
                      <li
                        key={rule.label}
                        className={`flex items-center gap-1.5 text-xs font-medium ${rule.ok ? 'text-emerald-600' : 'text-red-500'}`}
                      >
                        {rule.ok ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Confirm Password {editingId && form.password.length === 0 ? '' : '*'}
                </label>
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 ${
                    passwordsMismatch ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                >
                  <Lock size={16} className="text-slate-400" />
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                    className="w-full py-2 text-sm outline-none"
                    disabled={saving}
                  />
                </div>
                {passwordsMismatch && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                    <AlertCircle size={12} /> Passwords do not match
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Role</label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as 'waiter' | 'supervisor' })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
                  disabled={saving}
                >
                  <option value="waiter">Waiter</option>
                  <option value="supervisor" disabled={supervisorsFull}>
                    Supervisor {supervisorsFull ? '(limit reached — max 2)' : ''}
                  </option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4"
                  disabled={saving}
                />
                <label className="text-sm text-slate-700">Active (can log in)</label>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
  onClick={handleSubmit}
  disabled={saving || !canSubmit || editSaved}
  className={`flex-1 rounded-xl px-4 py-2 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${
    editSaved
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  }`}
>
  {saving ? (
    editingId ? (
      'Saving…'
    ) : (
      'Creating…'
    )
  ) : editSaved && editingId ? (
    <span className="flex items-center justify-center gap-2">
      <CheckCircle2 size={16} />
      Saved
    </span>
  ) : editingId ? (
    'Save Changes'
  ) : (
    'Create Account'
  )}
</button>
            </div>
          </div>
        </div>
      )}

      {detailsMember && (
        <div
          className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay"
          onClick={() => setDetailsMember(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-xl font-bold text-slate-900">Staff Details</h3>
              <button
                onClick={() => setDetailsMember(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col items-center text-center">
              <Avatar
                name={detailsMember.name}
                src={detailsMember.avatarUrl}
                role={detailsMember.role}
                className="h-24 w-24 text-3xl"
              />
              <p className="mt-3 text-lg font-bold text-slate-900">{detailsMember.name}</p>
              <span className="mt-1 flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-bold text-orange-700 capitalize">
                {detailsMember.role}
              </span>
            </div>

            <div className="mt-5 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail size={15} className="shrink-0 text-slate-400" />
                {detailsMember.email}
              </div>
              {detailsMember.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone size={15} className="shrink-0 text-slate-400" />
                  {detailsMember.phone}
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-600">
                <BadgeCheck size={15} className="shrink-0 text-slate-400" />
                <span className="capitalize">{detailsMember.id}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar size={15} className="shrink-0 text-slate-400" />
                {new Date(detailsMember.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  detailsMember.active
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {detailsMember.active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => {
                  setDetailsMember(null);
                  openEdit(detailsMember);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              >
                <Edit2 size={16} /> Edit
              </button>
              <button
                onClick={() => {
                  const member = detailsMember;
                  setDetailsMember(null);
                  handleDelete(member.id, member.name);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center overflow-y-auto bg-black/40 p-4 bh-modal-overlay"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle className="text-rose-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Delete staff account?</h3>
            <p className="mt-1 text-sm text-slate-500">
              Delete staff account "{deleteConfirm.name}"?
            </p>
            <p className="mt-1 text-xs text-slate-400">This action cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
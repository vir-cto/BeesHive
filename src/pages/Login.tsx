import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, Lock, LogIn, HelpCircle, Table2, Receipt, BarChart3, ChefHat, Loader2, ArrowLeft, User, Mail } from 'lucide-react'
import BeeLogo from '../components/BeeLogo'
import { normalizeUsername } from '../lib/username'

export default function Login() {
  const { login, loginWithFirebase, firebaseMode, sendOtp, verifyOtp, resetPassword, sendPasswordReset } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [emailForRecovery, setEmailForRecovery] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Forgot password flow state
  const [forgotStep, setForgotStep] = useState<'login' | 'email' | 'otp' | 'reset'>('login')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [otpSentTo, setOtpSentTo] = useState('')

  const resetForgotState = () => {
    setForgotStep('login')
    setOtpError('')
    setInfoMessage('')
    setOtpSentTo('')
    setOtp('')
    setNewPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmed = username.trim()
    if (!trimmed || !password) return setError('Username and password are required')

    // Normalize the username for login (trim + lowercase)
    const normalized = normalizeUsername(trimmed)

    setIsLoading(true)
    try {
      let found: import('../context/AuthContext').UserAccount | null = null
      
      if (firebaseMode) {
        // In Firebase mode, authenticate using username@beeshive.local
        found = await loginWithFirebase(normalized, password)
      } else {
        // Mock mode uses the legacy directory login with username
        found = login(normalized, password)
      }
      
      if (!found) {
        setError('Invalid username or password.')
        setIsLoading(false)
        return
      }
      const route = found.role === 'admin' ? '/admin' : found.role === 'waiter' ? '/waiter' : '/supervisor'
      navigate(route, { replace: true })
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Sign-in could not be completed. Please try again.'
      )
      setIsLoading(false)
    }
  }

  const handleForgotSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setOtpError('')
    setInfoMessage('')
    
    // Support both username and email for password recovery
    const trimmed = (otpSentTo || emailForRecovery).trim()
    if (!trimmed) return setOtpError('Username or email is required')

    // Production: Firebase Authentication owns password recovery and emails a
    // signed reset link. Nothing is stored or verified by this application, and
    // the response never reveals whether the address has an account.
    if (firebaseMode) {
      // AuthContext resolves the typed identifier (username or email) through
      // the login-identifier mappings to the account's Firebase Auth identity
      // and requests the reset there — so the link lands in the operator's
      // real inbox for accounts whose Auth identity is a real mailbox.
      const accepted = await sendPasswordReset(trimmed)
      if (accepted) {
        setInfoMessage(
          `If an account exists for "${trimmed}", a password reset link has been emailed. Check the inbox and the spam folder.`,
        )
      } else {
        setOtpError('The reset email could not be sent. Please check the address and try again.')
      }
      return
    }

    // Mock mode: use OTP flow
    const sent = await sendOtp(trimmed, 'email')
    if (sent) {
      setForgotStep('otp')
      setInfoMessage('A 6-digit OTP has been sent to your email. It expires in 5 minutes.')
    } else {
      setOtpError('No active admin account found with that email.')
    }
  }

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setOtpError('')
    setInfoMessage('')
    const valid = await verifyOtp(otpSentTo, otp)
    if (valid) {
      setForgotStep('reset')
    } else {
      setOtpError('Invalid or expired OTP. Please try again.')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setOtpError('')
    setInfoMessage('')
    if (!newPassword || newPassword.length < 6) {
      return setOtpError('Password must be at least 6 characters')
    }
    const success = await resetPassword(otpSentTo, newPassword, otp)
    if (success) {
      resetForgotState()
      setInfoMessage('Password reset successful! Please log in.')
    } else {
      setOtpError('Could not reset password. Please try again.')
    }
  }

  // Forgot Password View
  if (forgotStep !== 'login') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50/50">
        <div className="w-full max-w-md rounded-3xl border border-orange-100 bg-white/95 p-6 sm:p-8 shadow-[0_24px_60px_-20px_rgba(120,53,15,0.35)]">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Forgot Password</h1>
            <button
              onClick={resetForgotState}
              className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-900 transition"
            >
              <ArrowLeft size={16} /> Back to login
            </button>
          </div>

          {infoMessage && (
            <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm text-emerald-800">
              {infoMessage}
            </div>
          )}

          {otpError && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm text-red-700">
              {otpError}
            </div>
          )}

          {forgotStep === 'email' && (
            <form onSubmit={handleForgotSendOtp} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Email address</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={otpSentTo}
                  onChange={(e) => setOtpSentTo(e.target.value)}
                  placeholder="you@restaurant.com"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base sm:text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200/50 transition"
                  required
                />
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-orange-600 active:scale-[0.99]"
              >
                <Mail size={18} /> {firebaseMode ? 'Send reset link' : 'Send OTP'}
              </button>
            </form>
          )}

          {forgotStep === 'otp' && (
            <form onSubmit={handleForgotVerify} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Enter OTP sent to {otpSentTo}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit OTP"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.2em] outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200/50 transition"
                  maxLength={6}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={otp.length < 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50 active:scale-[0.99]"
              >
                Verify OTP
              </button>
            </form>
          )}

          {forgotStep === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">New password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-10 text-base sm:text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200/50 transition"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    aria-label="Toggle new password visibility"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-orange-600 active:scale-[0.99]"
              >
                Reset Password
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // Main Login View
  return (
    <div className="min-h-screen bg-[#f7f9fc] lg:grid lg:grid-cols-[minmax(0,1.1fr),minmax(440px,0.9fr)]">
      {/* Left brand panel (lg+) */}
      <aside className="relative hidden overflow-hidden bg-linear-to-br from-blue-950 via-blue-900 to-slate-950 lg:flex lg:min-h-screen lg:flex-col lg:justify-center lg:px-[clamp(3rem,8vw,9rem)]">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full border border-amber-300/15" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-120 w-120 rounded-full bg-blue-500/15 blur-2xl" />
        <div className="pointer-events-none absolute right-[14%] top-[18%] h-32 w-32 rounded-full border border-amber-300/30" />
        <div className="pointer-events-none absolute bottom-[20%] left-[15%] h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_24px_8px_rgba(252,211,77,0.3)]" />

        <div className="relative max-w-xl">
          <div className="mb-8 flex items-center gap-4">
            <BeeLogo className="h-16 w-16" id="beeGradLogin" />
            <div>
              <h1 className="font-brand text-4xl font-extrabold tracking-tight text-white">Bee&apos;s Hive</h1>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.35em] text-amber-300">Restaurant</p>
            </div>
          </div>

        <p className="max-w-lg text-3xl font-bold leading-tight tracking-tight text-white">
          Everything your restaurant needs, in one calm command centre.
        </p>
        <p className="mt-4 max-w-lg text-base leading-7 text-blue-100/75">
          Coordinate tables, orders, billing, staff and inventory with a clear view of every service.
        </p>

        <ul className="mt-8 grid max-w-xl grid-cols-2 gap-3 text-sm text-blue-100/90">
          <li className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3"><Table2 size={17} className="text-amber-300" /> Live tables</li>
          <li className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3"><Receipt size={17} className="text-amber-300" /> Faster billing</li>
          <li className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3"><BarChart3 size={17} className="text-amber-300" /> Clear analytics</li>
          <li className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3"><ChefHat size={17} className="text-amber-300" /> Smarter inventory</li>
        </ul>
        </div>

        <div className="absolute bottom-8 left-[clamp(3rem,8vw,9rem)] text-xs font-medium tracking-wide text-blue-200/50">Gorantla · Guntur</div>
      </aside>

      {/* Right login card */}
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-6 lg:min-h-screen lg:p-12">
        <div className="pointer-events-none absolute -right-32 -top-32 hidden h-72 w-72 rounded-full bg-amber-100/70 blur-3xl lg:block" />
        <div className="relative w-full max-w-md rounded-4xl border border-slate-200/80 bg-white p-7 shadow-[0_25px_70px_-25px_rgba(15,23,42,0.28)] sm:p-10">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center">
              <BeeLogo className="h-14 w-14 drop-shadow-[0_8px_16px_rgba(217,119,6,0.3)] transition-transform duration-300 hover:scale-105" id="beeGradLoginCard" />
            </div>
            {/* Mobile app header badge */}
            <div className="inline-block lg:hidden mb-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                Bee&apos;s Hive
              </span>
            </div>
            <h1 className="font-brand text-2xl tracking-tight text-slate-900">Welcome back</h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Sign in to your restaurant workspace</p>
          </div>

          {infoMessage && (
            <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm text-emerald-800">
              {infoMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Username</label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-10 text-base sm:text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-200/50"
                  required
                  disabled={isLoading}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Username, email or 10-digit phone number</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-10 pr-10 text-base sm:text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-200/50"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end text-xs">
              <button
                type="button"
                onClick={() => {
                  setForgotStep('email')
                  setOtpError('')
                  setInfoMessage('')
                  if (username) setEmailForRecovery(username)
                }}
                className="flex items-center gap-1 font-semibold text-slate-500 hover:text-orange-600 transition"
              >
                <HelpCircle size={13} /> Forgot password?
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!username || !password || isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-br from-orange-500 to-amber-500 px-4 py-3.5 font-bold text-white shadow-[0_10px_22px_-8px_rgba(249,115,22,0.6)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Sign in
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
            Role-based access for waiters, supervisors and admins.
          </p>
        </div>
      </main>
    </div>
  )
}
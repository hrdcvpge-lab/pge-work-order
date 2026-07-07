import { type FormEvent, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from '../App'
import type { Role, TeamMember } from '../types/workOrder'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthState = 'checking' | 'signed-out' | 'signed-in'

type ProfileRow = {
  id: string
  full_name: string
  employee_code: string | null
  role: Role
  is_active: boolean
}

const VALID_ROLES: Role[] = ['admin', 'ppic', 'operator', 'qc', 'packing', 'manager']

function normalizePhone(input: string): string | null {
  const stripped = input.trim().replace(/[\s().-]/g, '')

  if (/^08\d{7,13}$/.test(stripped)) return `+62${stripped.slice(1)}`
  if (/^62\d{7,13}$/.test(stripped)) return `+${stripped}`
  if (/^\+62\d{7,13}$/.test(stripped)) return stripped

  return null
}

function buildInternalAlias(phone: string) {
  return `phone-${phone.replace(/\D/g, '')}@login.pge.internal`
}

function profileToTeamMember(profile: ProfileRow): TeamMember {
  return {
    id: profile.id,
    name: profile.full_name,
    role: profile.role,
    stations: [],
  }
}

async function getActiveProfile(session: Session): Promise<TeamMember> {
  const client = supabase
  if (!client) throw new Error('Supabase belum dikonfigurasi.')

  const { data, error } = await client.rpc('get_my_profile')
  if (error) throw new Error('Profil PGE tidak dapat dimuat. Hubungi Admin.')

  const profile = Array.isArray(data) ? data[0] : data
  if (!profile || typeof profile !== 'object') {
    throw new Error('Profil PGE belum ditemukan. Hubungi Admin.')
  }

  const row = profile as ProfileRow
  if (!row.is_active) throw new Error('Akun Anda sudah tidak aktif. Hubungi Admin.')
  if (!VALID_ROLES.includes(row.role)) throw new Error('Role akun tidak valid. Hubungi Admin.')
  if (row.id !== session.user.id) throw new Error('Profil akun tidak cocok. Hubungi Admin.')

  return profileToTeamMember(row)
}

export function AuthGate() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null)
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setAuthState('signed-out')
      return
    }

    let cancelled = false

    const loadSession = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) {
          setCurrentUser(null)
          setAuthState('signed-out')
        }
        return
      }

      try {
        const user = await getActiveProfile(session)
        if (!cancelled) {
          setCurrentUser(user)
          setAuthState('signed-in')
          setMessage('')
        }
      } catch (error) {
        await client.auth.signOut()
        if (!cancelled) {
          setCurrentUser(null)
          setAuthState('signed-out')
          setMessage(error instanceof Error ? error.message : 'Akun tidak dapat dimuat.')
        }
      }
    }

    void client.auth.getSession().then(({ data }) => loadSession(data.session))

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      void loadSession(session)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const client = supabase
    if (!client) return

    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      setMessage('Masukkan nomor HP Indonesia yang valid, misalnya 081234567890.')
      return
    }

    if (!/^\d{8}$/.test(pin)) {
      setMessage('PIN harus terdiri dari 8 angka.')
      return
    }

    setSubmitting(true)
    setMessage('')

    const { error } = await client.auth.signInWithPassword({
      email: buildInternalAlias(normalizedPhone),
      password: pin,
    })

    if (error) {
      setMessage('Nomor HP atau PIN tidak sesuai.')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
  }

  const signOut = async () => {
    const client = supabase
    if (!client) return
    await client.auth.signOut()
    setPhone('')
    setPin('')
    setMessage('Anda sudah keluar dari sistem.')
  }

  if (!isSupabaseConfigured) return <ConfigurationScreen />

  if (authState === 'checking') {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-card--loading" aria-live="polite">
          <span className="auth-mark">PGE</span>
          <h1>Memeriksa akses</h1>
          <p>Mohon tunggu, sistem sedang memverifikasi akun Anda.</p>
          <span className="auth-loader" />
        </section>
      </main>
    )
  }

  if (authState === 'signed-in' && currentUser) {
    return <App currentUser={currentUser} onSignOut={() => void signOut()} />
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span className="auth-mark">PGE</span>
          <div>
            <span>Production control</span>
            <h1>Work Order</h1>
          </div>
        </div>

        <div className="auth-card__intro">
          <p className="auth-card__eyebrow">Akses internal PGE</p>
          <h2>Masuk ke akun kerja Anda</h2>
          <p>Gunakan nomor HP dan PIN yang diberikan Admin.</p>
        </div>

        <form className="auth-form" onSubmit={signIn}>
          <label>
            <span>Nomor HP</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="081234567890"
              disabled={submitting}
              required
            />
          </label>
          <label>
            <span>PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="8 angka"
              minLength={8}
              maxLength={8}
              disabled={submitting}
              required
            />
          </label>

          {message ? <p className="auth-message" role="alert">{message}</p> : null}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Memeriksa akun…' : 'Masuk'}
          </button>
        </form>

        <div className="auth-card__help">
          <b>Butuh bantuan?</b>
          <span>Hubungi Admin PGE untuk perubahan nomor HP atau reset PIN.</span>
        </div>
      </section>
    </main>
  )
}

function ConfigurationScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-card auth-card--error">
        <span className="auth-mark">PGE</span>
        <p className="auth-card__eyebrow">Konfigurasi belum lengkap</p>
        <h1>Aplikasi belum terhubung ke Supabase</h1>
        <p>Pastikan GitHub Actions menerima <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> saat proses build.</p>
      </section>
    </main>
  )
}

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { supabase } from '../lib/supabase'

type AppRole = 'admin' | 'ppic' | 'operator' | 'qc' | 'packing' | 'manager'
type DbStationCode = 'printing' | 'cutting' | 'sewing_assembly' | 'finishing' | 'qc' | 'packing' | 'warehouse'

type Profile = {
  id: string
  full_name: string
  employee_code: string | null
  phone: string | null
  role: AppRole
  is_active: boolean
}

type Station = {
  id: string
  code: DbStationCode
  name: string
  sort_order: number
}

type StationAccess = {
  id: string
  user_id: string
  station_id: string
  is_active: boolean
  default_work_area: string | null
  can_receive_reports: boolean
}

type ReportingLine = {
  id: string
  user_id: string
  report_to_user_id: string
  is_primary: boolean
}

type CreateEmployeePayload = {
  fullName: string
  employeeCode: string
  phone: string
  role: AppRole
  stationCodes: DbStationCode[]
  reportToUserId: string | null
  defaultWorkArea: string
}

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  ppic: 'PPIC',
  operator: 'Operator',
  qc: 'QC',
  packing: 'Packing',
  manager: 'Manager',
}

const ROLE_ORDER: AppRole[] = ['admin', 'ppic', 'manager', 'operator', 'qc', 'packing']

const WORK_AREAS = [
  'Area Printing · Mimaki Eco Solvent 01',
  'Area Printing · Mimaki Sublim 01',
  'Area Cutting',
  'Rak WIP Cetak',
  'Rak WIP Jahit',
  'Area Warehouse / Material',
  'Area Warehouse / Receiving',
  'Meja Jahit 1',
  'Meja Jahit 2',
  'Area Finishing',
  'Area QC',
  'Area Packing',
  'Gudang / Pengiriman',
  'Area Produksi Umum',
]

function normalizePhone(input: string): string | null {
  const value = input.trim().replace(/[\s().-]/g, '')
  if (/^08\d{7,13}$/.test(value)) return `+62${value.slice(1)}`
  if (/^62\d{7,13}$/.test(value)) return `+${value}`
  if (/^\+62\d{7,13}$/.test(value)) return value
  return null
}

function roleBadgeClass(role: AppRole) {
  return `live-people-role live-people-role--${role}`
}

function phoneForDisplay(phone: string | null) {
  if (!phone) return 'No phone login'
  return phone.replace(/^\+62/, '0')
}

export function LivePeopleStation() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [accessRows, setAccessRows] = useState<StationAccess[]>([])
  const [reportingLines, setReportingLines] = useState<ReportingLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const load = async () => {
    const client = supabase
    if (!client) return

    setLoading(true)
    setError('')

    const [profileResult, stationResult, accessResult, reportingResult] = await Promise.all([
      client.from('profiles').select('id, full_name, employee_code, phone, role, is_active').order('full_name'),
      client.from('stations').select('id, code, name, sort_order').order('sort_order'),
      client.from('user_station_access').select('id, user_id, station_id, is_active, default_work_area, can_receive_reports'),
      client.from('user_reporting_lines').select('id, user_id, report_to_user_id, is_primary'),
    ])

    const firstError = profileResult.error || stationResult.error || accessResult.error || reportingResult.error
    if (firstError) {
      setError('People & Station tidak dapat dimuat. Pastikan Anda masuk sebagai Admin dan Migration 001–004 sudah berhasil dijalankan.')
      setLoading(false)
      return
    }

    setProfiles((profileResult.data || []) as Profile[])
    setStations((stationResult.data || []) as Station[])
    setAccessRows((accessResult.data || []) as StationAccess[])
    setReportingLines((reportingResult.data || []) as ReportingLine[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const planners = useMemo(
    () => profiles.filter((person) => person.is_active && ['admin', 'ppic', 'manager'].includes(person.role)),
    [profiles],
  )

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return [...profiles]
      .filter((person) => !needle || `${person.full_name} ${person.employee_code || ''} ${person.phone || ''}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
        return roleDiff || a.full_name.localeCompare(b.full_name, 'id')
      })
  }, [profiles, search])

  const stationAccessFor = (userId: string, stationId: string) => accessRows.find((row) => row.user_id === userId && row.station_id === stationId)
  const reportToFor = (userId: string) => reportingLines.find((line) => line.user_id === userId && line.is_primary)?.report_to_user_id || ''

  const updateProfileActive = async (person: Profile, next: boolean) => {
    const client = supabase
    if (!client) return
    setBusyUserId(person.id)
    setNotice('')
    const { error: updateError } = await client.from('profiles').update({ is_active: next }).eq('id', person.id)
    if (updateError) setError('Status akun tidak dapat diperbarui.')
    else {
      setProfiles((current) => current.map((item) => item.id === person.id ? { ...item, is_active: next } : item))
      setNotice(`${person.full_name} ${next ? 'diaktifkan' : 'dinonaktifkan'}.`)
    }
    setBusyUserId(null)
  }

  const toggleStation = async (person: Profile, station: Station, next: boolean) => {
    const client = supabase
    if (!client) return

    setBusyUserId(person.id)
    setNotice('')
    const existing = stationAccessFor(person.id, station.id)

    if (existing) {
      const { error: updateError } = await client.from('user_station_access').update({ is_active: next }).eq('id', existing.id)
      if (updateError) {
        setError('Akses stasiun tidak dapat diperbarui.')
      } else {
        setAccessRows((current) => current.map((item) => item.id === existing.id ? { ...item, is_active: next } : item))
        setNotice(`Akses ${station.name} untuk ${person.full_name} diperbarui.`)
      }
    } else if (next) {
      const { data, error: insertError } = await client
        .from('user_station_access')
        .insert({ user_id: person.id, station_id: station.id, is_active: true, can_receive_reports: ['admin', 'ppic', 'manager'].includes(person.role) })
        .select('id, user_id, station_id, is_active, default_work_area, can_receive_reports')
        .single()

      if (insertError || !data) {
        setError('Akses stasiun tidak dapat ditambahkan.')
      } else {
        setAccessRows((current) => [...current, data as StationAccess])
        setNotice(`${station.name} ditambahkan untuk ${person.full_name}.`)
      }
    }

    setBusyUserId(null)
  }

  const updateReportTo = async (person: Profile, reportToUserId: string) => {
    const client = supabase
    if (!client) return

    setBusyUserId(person.id)
    setNotice('')

    const { error: clearError } = await client
      .from('user_reporting_lines')
      .delete()
      .eq('user_id', person.id)
      .eq('is_primary', true)

    if (clearError) {
      setError('Jalur laporan tidak dapat diperbarui.')
      setBusyUserId(null)
      return
    }

    if (reportToUserId) {
      const { data, error: addError } = await client
        .from('user_reporting_lines')
        .insert({ user_id: person.id, report_to_user_id: reportToUserId, is_primary: true })
        .select('id, user_id, report_to_user_id, is_primary')
        .single()

      if (addError || !data) {
        setError('Jalur laporan tidak dapat disimpan.')
        setBusyUserId(null)
        await load()
        return
      }

      setReportingLines((current) => [
        ...current.filter((line) => !(line.user_id === person.id && line.is_primary)),
        data as ReportingLine,
      ])
    } else {
      setReportingLines((current) => current.filter((line) => !(line.user_id === person.id && line.is_primary)))
    }

    setNotice(`Jalur laporan ${person.full_name} diperbarui.`)
    setBusyUserId(null)
  }

  return (
    <section className="view-content people-station-view live-people-view">
      <article className="surface-card people-station-intro">
        <header className="surface-card__header live-people-header">
          <div>
            <p className="eyebrow">Data live · Admin only</p>
            <h2>People & Station Access</h2>
            <span>Buat akun kerja, aktifkan stasiun yang boleh dikerjakan, dan tetapkan jalur laporan. Hanya personel dengan akun aktif serta akses stasiun yang dapat dipilih sebagai PIC saat WO dideploy.</span>
          </div>
          <button className="button button--primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" /> Tambah karyawan
          </button>
        </header>
        <div className="callout">
          <Icon name="check" />
          <span><b>PIN awal akun baru: 00000000.</b> Akun memakai nomor HP untuk masuk; tidak ada email atau SMS yang dikirim ke karyawan.</span>
        </div>
        {notice ? <p className="success-note">{notice}</p> : null}
        {error ? <p className="live-people-error">{error}</p> : null}
      </article>

      <article className="surface-card">
        <div className="filter-row live-people-filter">
          <label className="search-field"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, kode karyawan, atau nomor HP" /></label>
          <button className="button button--secondary button--compact" onClick={() => void load()} disabled={loading}>Muat ulang</button>
        </div>

        {loading ? <div className="empty-state empty-state--large">Memuat data karyawan…</div> : null}
        {!loading && !rows.length ? <div className="empty-state empty-state--large">Belum ada akun karyawan. Tambahkan PPIC, operator, QC, packing, atau manager dari tombol di atas.</div> : null}

        {!loading && rows.length ? <div className="people-grid">
          {rows.map((person) => {
            const reportToUserId = reportToFor(person.id)
            return <article className={`person-access-card${person.is_active ? '' : ' person-access-card--inactive'}`} key={person.id}>
              <header>
                <div>
                  <b>{person.full_name}</b>
                  <small>{person.employee_code || 'Belum ada kode'} · {phoneForDisplay(person.phone)}</small>
                  <span className={roleBadgeClass(person.role)}>{ROLE_LABELS[person.role]}</span>
                </div>
                <label className="switch-field">
                  <input type="checkbox" checked={person.is_active} disabled={busyUserId === person.id} onChange={(event) => void updateProfileActive(person, event.target.checked)} />
                  <span>Aktif</span>
                </label>
              </header>

              <section>
                <span className="people-label">Stasiun yang diperbolehkan</span>
                <div className="station-check-grid">
                  {stations.map((station) => {
                    const access = stationAccessFor(person.id, station.id)
                    return <label key={station.id}>
                      <input type="checkbox" checked={Boolean(access?.is_active)} disabled={busyUserId === person.id} onChange={(event) => void toggleStation(person, station, event.target.checked)} />
                      {station.name}
                    </label>
                  })}
                </div>
              </section>

              <section className="form-grid">
                <label>
                  <span>Default lapor ke</span>
                  <select value={reportToUserId} disabled={busyUserId === person.id} onChange={(event) => void updateReportTo(person, event.target.value)}>
                    <option value="">Pilih saat perencanaan WO</option>
                    {planners.filter((planner) => planner.id !== person.id).map((planner) => <option key={planner.id} value={planner.id}>{planner.full_name} · {ROLE_LABELS[planner.role]}</option>)}
                  </select>
                </label>
                <div className="live-people-status-box">
                  <span>Status akses</span>
                  <b>{person.is_active ? 'Akun aktif' : 'Akun nonaktif'}</b>
                  <small>{accessRows.filter((row) => row.user_id === person.id && row.is_active).length} stasiun aktif</small>
                </div>
              </section>
            </article>
          })}
        </div> : null}
      </article>

      {showCreate ? <CreateEmployeeModal
        stations={stations}
        planners={planners}
        onClose={() => setShowCreate(false)}
        onCreated={async (fullName) => {
          setShowCreate(false)
          setNotice(`Akun ${fullName} dibuat dengan PIN awal 00000000.`)
          await load()
        }}
      /> : null}
    </section>
  )
}

function CreateEmployeeModal({ stations, planners, onClose, onCreated }: {
  stations: Station[]
  planners: Profile[]
  onClose: () => void
  onCreated: (fullName: string) => Promise<void>
}) {
  const [form, setForm] = useState<CreateEmployeePayload>({
    fullName: '',
    employeeCode: '',
    phone: '',
    role: 'operator',
    stationCodes: [],
    reportToUserId: planners.find((person) => person.role === 'ppic')?.id || planners[0]?.id || null,
    defaultWorkArea: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleStation = (code: DbStationCode, checked: boolean) => {
    setForm((current) => ({
      ...current,
      stationCodes: checked
        ? [...new Set([...current.stationCodes, code])]
        : current.stationCodes.filter((stationCode) => stationCode !== code),
    }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const client = supabase
    if (!client) return

    const phone = normalizePhone(form.phone)
    if (!phone) {
      setError('Nomor HP harus valid, contoh 081234567890.')
      return
    }

    if (!form.fullName.trim() || !form.employeeCode.trim()) {
      setError('Nama lengkap dan kode karyawan wajib diisi.')
      return
    }

    if (['operator', 'qc', 'packing'].includes(form.role) && !form.stationCodes.length) {
      setError('Pilih minimal satu stasiun untuk akun produksi.')
      return
    }

    setSaving(true)
    setError('')

    const { error: invokeError } = await client.functions.invoke('admin-create-employee', {
      body: {
        ...form,
        fullName: form.fullName.trim(),
        employeeCode: form.employeeCode.trim().toUpperCase(),
        phone,
      },
    })

    if (invokeError) {
      setError(invokeError.message || 'Akun karyawan tidak dapat dibuat. Pastikan Edge Function admin-create-employee sudah dideploy.')
      setSaving(false)
      return
    }

    await onCreated(form.fullName.trim())
    setSaving(false)
  }

  return <Modal title="Tambah akun karyawan" subtitle="Akun baru akan menggunakan nomor HP + PIN awal 00000000. Tidak ada email atau SMS yang dikirim." onClose={onClose} wide>
    <form className="form-stack live-people-create-form" onSubmit={submit}>
      <div className="callout callout--warning"><Icon name="warning" /><span><b>Nomor HP harus milik satu orang.</b> Jangan membuat akun stasiun bersama karena sistem perlu mencatat PIC sebenarnya untuk setiap proses.</span></div>
      <div className="form-grid">
        <label><span>Nama lengkap *</span><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Contoh: Bagus Pratama" required /></label>
        <label><span>Kode karyawan *</span><input value={form.employeeCode} onChange={(event) => setForm({ ...form, employeeCode: event.target.value.toUpperCase() })} placeholder="Contoh: PGE-003" required /></label>
        <label><span>Nomor HP *</span><input type="tel" inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="081234567890" required /></label>
        <label><span>Role sistem *</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AppRole })}>{ROLE_ORDER.map((role) => <option value={role} key={role}>{ROLE_LABELS[role]}</option>)}</select></label>
      </div>

      <section className="live-people-create-section">
        <div><p className="eyebrow">Hak stasiun</p><h3>Stasiun yang boleh dikerjakan</h3><span>Hanya stasiun yang dicentang akan muncul sebagai opsi PIC ketika Admin atau PPIC merencanakan Work Order.</span></div>
        <div className="station-check-grid">
          {stations.map((station) => <label key={station.id}><input type="checkbox" checked={form.stationCodes.includes(station.code)} onChange={(event) => toggleStation(station.code, event.target.checked)} />{station.name}</label>)}
        </div>
      </section>

      <div className="form-grid">
        <label><span>Default lapor ke</span><select value={form.reportToUserId || ''} onChange={(event) => setForm({ ...form, reportToUserId: event.target.value || null })}><option value="">Pilih saat perencanaan WO</option>{planners.map((planner) => <option value={planner.id} key={planner.id}>{planner.full_name} · {ROLE_LABELS[planner.role]}</option>)}</select></label>
        <label><span>Default area kerja</span><select value={form.defaultWorkArea} onChange={(event) => setForm({ ...form, defaultWorkArea: event.target.value })}><option value="">Pilih saat perencanaan WO</option>{WORK_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
      </div>

      {error ? <p className="live-people-error">{error}</p> : null}
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" disabled={saving} onClick={onClose}>Batal</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Membuat akun…' : 'Buat akun karyawan'}</button></footer>
    </form>
  </Modal>
}

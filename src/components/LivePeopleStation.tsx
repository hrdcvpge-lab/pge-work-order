import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { supabase } from '../lib/supabase'

type AppRole = 'admin' | 'ppic' | 'operator' | 'qc' | 'packing' | 'manager'
type DbStationCode = 'printing' | 'cutting' | 'sewing_assembly' | 'finishing' | 'qc' | 'packing' | 'warehouse'
type EmployeeAccessMode = 'self_service' | 'admin_assisted' | 'no_system_access'

type Employee = {
  id: string
  profile_id: string | null
  full_name: string
  employee_code: string
  phone: string | null
  role: AppRole
  access_mode: EmployeeAccessMode
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
  employee_id: string
  station_id: string
  is_active: boolean
  default_work_area: string | null
  can_receive_reports: boolean
}

type ReportingLine = {
  id: string
  employee_id: string
  report_to_employee_id: string
  is_primary: boolean
}

type CreateEmployeePayload = {
  fullName: string
  phone: string
  role: AppRole
  accessMode: EmployeeAccessMode
  stationCodes: DbStationCode[]
  reportToEmployeeId: string | null
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

const ACCESS_MODE_COPY: Record<EmployeeAccessMode, { label: string; description: string }> = {
  self_service: {
    label: 'Login mandiri',
    description: 'Memakai nomor HP + PIN untuk melihat dan memperbarui proses sendiri.',
  },
  admin_assisted: {
    label: 'Update dibantu Admin',
    description: 'Tidak memakai aplikasi. PIC tetap karyawan ini, tetapi Admin/PPIC yang mencatat progress.',
  },
  no_system_access: {
    label: 'Tanpa akses aplikasi',
    description: 'Tersimpan sebagai data karyawan, tanpa akun login dan tanpa update proses dari aplikasi.',
  },
}

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
  if (!value) return null
  if (/^08\d{7,13}$/.test(value)) return `+62${value.slice(1)}`
  if (/^62\d{7,13}$/.test(value)) return `+${value}`
  if (/^\+62\d{7,13}$/.test(value)) return value
  return null
}

function roleBadgeClass(role: AppRole) {
  return `live-people-role live-people-role--${role}`
}

function accessModeBadgeClass(mode: EmployeeAccessMode) {
  return `live-people-access-mode live-people-access-mode--${mode}`
}

function phoneForDisplay(phone: string | null) {
  if (!phone) return 'Tidak ada nomor HP'
  return phone.replace(/^\+62/, '0')
}

function isPlannerRole(role: AppRole) {
  return ['admin', 'ppic', 'manager'].includes(role)
}

function isProductionRole(role: AppRole) {
  return ['operator', 'qc', 'packing'].includes(role)
}

export function LivePeopleStation() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [accessRows, setAccessRows] = useState<StationAccess[]>([])
  const [reportingLines, setReportingLines] = useState<ReportingLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [busyEmployeeId, setBusyEmployeeId] = useState<string | null>(null)

  const load = async () => {
    const client = supabase
    if (!client) return

    setLoading(true)
    setError('')

    const [employeeResult, stationResult, accessResult, reportingResult] = await Promise.all([
      client.from('employees').select('id, profile_id, full_name, employee_code, phone, role, access_mode, is_active').order('full_name'),
      client.from('stations').select('id, code, name, sort_order').order('sort_order'),
      client.from('employee_station_access').select('id, employee_id, station_id, is_active, default_work_area, can_receive_reports'),
      client.from('employee_reporting_lines').select('id, employee_id, report_to_employee_id, is_primary'),
    ])

    const firstError = employeeResult.error || stationResult.error || accessResult.error || reportingResult.error
    if (firstError) {
      setError('Data karyawan tidak dapat dimuat. Jalankan Migration 005 terlebih dahulu, lalu masuk kembali sebagai Admin.')
      setLoading(false)
      return
    }

    setEmployees((employeeResult.data || []) as Employee[])
    setStations((stationResult.data || []) as Station[])
    setAccessRows((accessResult.data || []) as StationAccess[])
    setReportingLines((reportingResult.data || []) as ReportingLine[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const planners = useMemo(
    () => employees.filter((person) => person.is_active && isPlannerRole(person.role)),
    [employees],
  )

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return [...employees]
      .filter((person) => !needle || `${person.full_name} ${person.employee_code} ${person.phone || ''}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
        return roleDiff || a.full_name.localeCompare(b.full_name, 'id')
      })
  }, [employees, search])

  const stationAccessFor = (employeeId: string, stationId: string) => accessRows.find((row) => row.employee_id === employeeId && row.station_id === stationId)
  const reportToFor = (employeeId: string) => reportingLines.find((line) => line.employee_id === employeeId && line.is_primary)?.report_to_employee_id || ''

  const updateEmployeeActive = async (person: Employee, next: boolean) => {
    const client = supabase
    if (!client) return

    setBusyEmployeeId(person.id)
    setNotice('')
    setError('')

    const employeeUpdate = client.from('employees').update({ is_active: next }).eq('id', person.id)
    const profileUpdate = person.profile_id
      ? client.from('profiles').update({ is_active: next }).eq('id', person.profile_id)
      : Promise.resolve({ error: null })

    const [employeeResult, profileResult] = await Promise.all([employeeUpdate, profileUpdate])

    if (employeeResult.error || profileResult.error) {
      setError('Status karyawan tidak dapat diperbarui. Coba muat ulang halaman sebelum mengulanginya.')
    } else {
      setEmployees((current) => current.map((item) => item.id === person.id ? { ...item, is_active: next } : item))
      setNotice(`${person.full_name} ${next ? 'diaktifkan' : 'dinonaktifkan'}. ${person.profile_id ? 'Akses login juga diperbarui.' : ''}`)
    }

    setBusyEmployeeId(null)
  }

  const toggleStation = async (person: Employee, station: Station, next: boolean) => {
    const client = supabase
    if (!client) return

    setBusyEmployeeId(person.id)
    setNotice('')
    setError('')
    const existing = stationAccessFor(person.id, station.id)

    if (existing) {
      const { error: updateError } = await client.from('employee_station_access').update({ is_active: next }).eq('id', existing.id)
      if (updateError) {
        setError('Hak stasiun tidak dapat diperbarui.')
      } else {
        setAccessRows((current) => current.map((item) => item.id === existing.id ? { ...item, is_active: next } : item))
        setNotice(`Hak ${station.name} untuk ${person.full_name} diperbarui.`)
      }
    } else if (next) {
      const { data, error: insertError } = await client
        .from('employee_station_access')
        .insert({
          employee_id: person.id,
          station_id: station.id,
          is_active: true,
          can_receive_reports: isPlannerRole(person.role),
        })
        .select('id, employee_id, station_id, is_active, default_work_area, can_receive_reports')
        .single()

      if (insertError || !data) {
        setError('Hak stasiun tidak dapat ditambahkan.')
      } else {
        setAccessRows((current) => [...current, data as StationAccess])
        setNotice(`${station.name} ditambahkan untuk ${person.full_name}.`)
      }
    }

    setBusyEmployeeId(null)
  }

  const updateReportTo = async (person: Employee, reportToEmployeeId: string) => {
    const client = supabase
    if (!client) return

    setBusyEmployeeId(person.id)
    setNotice('')
    setError('')

    const { error: clearError } = await client
      .from('employee_reporting_lines')
      .delete()
      .eq('employee_id', person.id)
      .eq('is_primary', true)

    if (clearError) {
      setError('Jalur laporan tidak dapat diperbarui.')
      setBusyEmployeeId(null)
      return
    }

    if (reportToEmployeeId) {
      const { data, error: addError } = await client
        .from('employee_reporting_lines')
        .insert({ employee_id: person.id, report_to_employee_id: reportToEmployeeId, is_primary: true })
        .select('id, employee_id, report_to_employee_id, is_primary')
        .single()

      if (addError || !data) {
        setError('Jalur laporan tidak dapat disimpan.')
        setBusyEmployeeId(null)
        await load()
        return
      }

      setReportingLines((current) => [
        ...current.filter((line) => !(line.employee_id === person.id && line.is_primary)),
        data as ReportingLine,
      ])
    } else {
      setReportingLines((current) => current.filter((line) => !(line.employee_id === person.id && line.is_primary)))
    }

    setNotice(`Jalur laporan ${person.full_name} diperbarui.`)
    setBusyEmployeeId(null)
  }

  return (
    <section className="view-content people-station-view live-people-view">
      <article className="surface-card people-station-intro">
        <header className="surface-card__header live-people-header">
          <div>
            <p className="eyebrow">Data live · Admin only</p>
            <h2>Karyawan, PIC & Akses Sistem</h2>
            <span>Tambahkan semua pekerja nyata ke master karyawan. Akun login hanya dibuat untuk orang yang memang memakai aplikasi.</span>
          </div>
          <button className="button button--primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" /> Tambah karyawan
          </button>
        </header>
        <div className="callout">
          <Icon name="check" />
          <span><b>Untuk operator jahit tanpa perangkat, pilih “Update dibantu Admin”.</b> Operator tetap tercatat sebagai PIC Jahit; Admin/PPIC hanya bertindak sebagai pencatat progress.</span>
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
        {!loading && !rows.length ? <div className="empty-state empty-state--large">Belum ada data karyawan. Tambahkan personel produksi, PPIC, QC, packing, atau manager dari tombol di atas.</div> : null}

        {!loading && rows.length ? <div className="people-grid">
          {rows.map((person) => {
            const reportToEmployeeId = reportToFor(person.id)
            const activeStations = accessRows.filter((row) => row.employee_id === person.id && row.is_active).length
            const accessCopy = ACCESS_MODE_COPY[person.access_mode]

            return <article className={`person-access-card${person.is_active ? '' : ' person-access-card--inactive'}`} key={person.id}>
              <header>
                <div>
                  <b>{person.full_name}</b>
                  <small>{person.employee_code} · {person.phone ? phoneForDisplay(person.phone) : 'Tanpa nomor login'}</small>
                  <span className={roleBadgeClass(person.role)}>{ROLE_LABELS[person.role]}</span>
                  <span className={accessModeBadgeClass(person.access_mode)}>{accessCopy.label}</span>
                </div>
                <label className="switch-field">
                  <input type="checkbox" checked={person.is_active} disabled={busyEmployeeId === person.id} onChange={(event) => void updateEmployeeActive(person, event.target.checked)} />
                  <span>Aktif</span>
                </label>
              </header>

              <div className="live-people-access-summary">
                <Icon name={person.access_mode === 'admin_assisted' ? 'user' : person.access_mode === 'self_service' ? 'check' : 'list'} />
                <span>{accessCopy.description}</span>
              </div>

              <section>
                <span className="people-label">Stasiun yang diperbolehkan</span>
                <div className="station-check-grid">
                  {stations.map((station) => {
                    const access = stationAccessFor(person.id, station.id)
                    return <label key={station.id}>
                      <input type="checkbox" checked={Boolean(access?.is_active)} disabled={busyEmployeeId === person.id} onChange={(event) => void toggleStation(person, station, event.target.checked)} />
                      <span>{station.name}</span>
                    </label>
                  })}
                </div>
              </section>

              <section className="form-grid">
                <label>
                  <span>Default lapor ke</span>
                  <select value={reportToEmployeeId} disabled={busyEmployeeId === person.id} onChange={(event) => void updateReportTo(person, event.target.value)}>
                    <option value="">Pilih saat perencanaan WO</option>
                    {planners.filter((planner) => planner.id !== person.id).map((planner) => <option key={planner.id} value={planner.id}>{planner.full_name} · {ROLE_LABELS[planner.role]}</option>)}
                  </select>
                </label>
                <div className="live-people-status-box">
                  <span>Status karyawan</span>
                  <b>{person.is_active ? 'Aktif' : 'Nonaktif'}</b>
                  <small>{activeStations} stasiun aktif · {person.profile_id ? 'akun login terhubung' : 'tanpa akun login'}</small>
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
        onCreated={async (fullName, accessMode, employeeCode) => {
          setShowCreate(false)
          const codeCopy = employeeCode ? ` (${employeeCode})` : ''
          setNotice(accessMode === 'self_service'
            ? `Data dan akun login ${fullName}${codeCopy} dibuat dengan PIN awal 00000000.`
            : `Data ${fullName}${codeCopy} dibuat tanpa akun login. Progress akan ditangani sesuai mode akses yang dipilih.`)
          await load()
        }}
      /> : null}
    </section>
  )
}

function CreateEmployeeModal({ stations, planners, onClose, onCreated }: {
  stations: Station[]
  planners: Employee[]
  onClose: () => void
  onCreated: (fullName: string, accessMode: EmployeeAccessMode, employeeCode: string) => Promise<void>
}) {
  const [form, setForm] = useState<CreateEmployeePayload>({
    fullName: '',
    phone: '',
    role: 'operator',
    accessMode: 'self_service',
    stationCodes: [],
    reportToEmployeeId: planners.find((person) => person.role === 'ppic')?.id || planners[0]?.id || null,
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
    if (form.accessMode === 'self_service' && !phone) {
      setError('Nomor HP untuk login wajib diisi, contoh 081234567890.')
      return
    }

    if (form.phone.trim() && !phone) {
      setError('Format nomor HP belum valid, contoh 081234567890.')
      return
    }

    if (!form.fullName.trim()) {
      setError('Nama lengkap wajib diisi.')
      return
    }

    if (isProductionRole(form.role) && !form.stationCodes.length) {
      setError('Pilih minimal satu stasiun untuk peran produksi.')
      return
    }

    if (form.accessMode === 'no_system_access' && !form.stationCodes.length && isProductionRole(form.role)) {
      setError('Pekerja produksi tetap memerlukan stasiun agar dapat dipetakan sebagai resource.')
      return
    }

    setSaving(true)
    setError('')

    const { data, error: invokeError } = await client.functions.invoke<{ employee?: { employeeCode?: string } }>('admin-create-employee', {
      body: {
        ...form,
        fullName: form.fullName.trim(),
        phone: phone || '',
      },
    })

    if (invokeError) {
      setError(invokeError.message || 'Data karyawan tidak dapat dibuat. Pastikan Edge Function admin-create-employee versi terbaru sudah dideploy.')
      setSaving(false)
      return
    }

    await onCreated(form.fullName.trim(), form.accessMode, data?.employee?.employeeCode || '')
    setSaving(false)
  }

  const accountRequired = form.accessMode === 'self_service'
  const modeCopy = ACCESS_MODE_COPY[form.accessMode]

  return <Modal title="Tambah karyawan" subtitle="Buat data pekerja lebih dulu. Kode karyawan dibuat otomatis oleh sistem." onClose={onClose} wide>
    <form className="form-stack live-people-create-form" onSubmit={submit}>
      <div className="form-grid">
        <label><span>Nama lengkap *</span><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Contoh: Bagus Pratama" required /></label>
        <div className="live-people-status-box live-people-status-box--modal">
          <span>Kode karyawan</span>
          <b>Otomatis</b>
          <small>Sistem memakai nomor berikutnya, misalnya PGE-003.</small>
        </div>
        <label><span>Peran kerja *</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AppRole })}>{ROLE_ORDER.map((role) => <option value={role} key={role}>{ROLE_LABELS[role]}</option>)}</select></label>
        <label><span>Mode akses *</span><select value={form.accessMode} onChange={(event) => setForm({ ...form, accessMode: event.target.value as EmployeeAccessMode })}>{(Object.keys(ACCESS_MODE_COPY) as EmployeeAccessMode[]).map((mode) => <option value={mode} key={mode}>{ACCESS_MODE_COPY[mode].label}</option>)}</select></label>
      </div>

      <div className={`live-people-mode-callout live-people-mode-callout--${form.accessMode}`}>
        <Icon name="warning" />
        <span><b>{modeCopy.label}.</b> {modeCopy.description}{accountRequired ? ' PIN awal untuk akun baru adalah 00000000.' : ''}</span>
      </div>

      <div className="form-grid">
        <label>
          <span>{accountRequired ? 'Nomor HP untuk login *' : 'Nomor HP kontak (opsional)'}</span>
          <input type="tel" inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="081234567890" required={accountRequired} />
        </label>
        <div className="live-people-status-box live-people-status-box--modal">
          <span>Akun aplikasi</span>
          <b>{accountRequired ? 'Dibuat' : 'Tidak dibuat'}</b>
          <small>{accountRequired ? 'Nomor HP + PIN 00000000' : 'PIC tetap dapat dicatat tanpa login'}</small>
        </div>
      </div>

      <section className="live-people-create-section">
        <div><p className="eyebrow">Hak stasiun</p><h3>Stasiun yang boleh dikerjakan</h3><span>Stasiun ini menentukan siapa yang dapat dipilih sebagai PIC. Untuk Jahit tanpa perangkat, pilih Sewing / Assembly dan mode “Update dibantu Admin”.</span></div>
        <div className="station-check-grid">
          {stations.map((station) => <label key={station.id}><input type="checkbox" checked={form.stationCodes.includes(station.code)} onChange={(event) => toggleStation(station.code, event.target.checked)} /><span>{station.name}</span></label>)}
        </div>
      </section>

      <div className="form-grid">
        <label><span>Default lapor ke</span><select value={form.reportToEmployeeId || ''} onChange={(event) => setForm({ ...form, reportToEmployeeId: event.target.value || null })}><option value="">Pilih saat perencanaan WO</option>{planners.map((planner) => <option value={planner.id} key={planner.id}>{planner.full_name} · {ROLE_LABELS[planner.role]}</option>)}</select></label>
        <label><span>Default area kerja</span><select value={form.defaultWorkArea} onChange={(event) => setForm({ ...form, defaultWorkArea: event.target.value })}><option value="">Pilih saat perencanaan WO</option>{WORK_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
      </div>

      {error ? <p className="live-people-error">{error}</p> : null}
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" disabled={saving} onClick={onClose}>Batal</button><button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Menyimpan…' : accountRequired ? 'Buat akun & data karyawan' : 'Simpan data karyawan'}</button></footer>
    </form>
  </Modal>
}

import { useEffect, useMemo, useState } from 'react'
import { Badge } from './components/Badge'
import { Icon } from './components/Icon'
import { Modal } from './components/Modal'
import { WorkOrderDrawer } from './components/WorkOrderDrawer'
import { initialWorkOrders, routeTemplates, teamMembers } from './data/mockData'
import type { ArtworkApprovalStatus, Priority, ProcessStep, Role, Station, TeamMember, WorkOrder, WorkOrderHistoryItem, WorkOrderReferenceImage, WorkOrderType } from './types/workOrder'
import {
  artworkApprovalLabels,
  deriveOrderStatus,
  deriveStepStatus,
  formatDate,
  formatDuration,
  formatNumber,
  getApprovedPrimaryArtwork,
  getArtworkReadiness,
  getAvailableInputCap,
  getBlockerSummary,
  getCurrentProcess,
  getOrderActiveSeconds,
  getProgress,
  getStepRecordedQty,
  getWipBalance,
  isOverdue,
  priorityLabels,
  roleLabels,
  sortWorkOrders,
  stationLabels,
  statusLabels,
  typeLabels,
} from './utils/workOrder'

type View = 'dashboard' | 'orders' | 'station' | 'wip' | 'reports'
type ModalState =
  | { type: 'create' }
  | { type: 'schedule'; workOrder: WorkOrder }
  | { type: 'assign'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'log-result'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'hold'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'qc'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'manage-artwork'; workOrder: WorkOrder }
  | { type: 'confirm-artwork'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'confirm-close'; workOrder: WorkOrder }
  | { type: 'confirm-cancel'; workOrder: WorkOrder }
  | null

const NAV: Array<{ id: View; label: string; icon: Parameters<typeof Icon>[0]['name'] }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'orders', label: 'Work Order', icon: 'list' },
  { id: 'station', label: 'Stasiun Saya', icon: 'station' },
  { id: 'wip', label: 'WIP', icon: 'boxes' },
  { id: 'reports', label: 'Laporan', icon: 'chart' },
]

const CUSTOM_OPTIONS: Array<{ id: 'printing' | 'cutting' | 'lining' | 'zipper' | 'sewing' | 'finishing'; label: string }> = [
  { id: 'printing', label: 'Cetak motif' },
  { id: 'cutting', label: 'Potong bahan' },
  { id: 'lining', label: 'Siapkan furing' },
  { id: 'zipper', label: 'Siapkan resleting / tali' },
  { id: 'sewing', label: 'Jahit / rakit' },
  { id: 'finishing', label: 'Finishing / rapikan' },
]

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function makeHistory(actor: TeamMember | 'system', title: string, note?: string): WorkOrderHistoryItem {
  return {
    id: createId('hist'),
    at: new Date().toISOString(),
    actor: actor === 'system' ? 'Sistem' : actor.name,
    role: actor === 'system' ? 'system' : actor.role,
    title,
    note,
  }
}

function getNextCode(workOrders: WorkOrder[]) {
  const currentYear = new Date().getFullYear()
  const prefix = `WO-${currentYear}-`
  const sequence = Math.max(
    70,
    ...workOrders.map((order) => Number(order.code.replace(prefix, '')) || 0),
  ) + 1
  return `${prefix}${String(sequence).padStart(3, '0')}`
}

function stationForRole(role: Role) {
  if (role === 'qc') return 'qc'
  if (role === 'packing') return 'packing'
  return undefined
}

function canUseProcess(currentUser: TeamMember, step: ProcessStep) {
  if (currentUser.role === 'operator') return step.assignedUserId === currentUser.id && !['qc', 'packing'].includes(step.station)
  if (currentUser.role === 'qc') return step.assignedUserId === currentUser.id && step.station === 'qc'
  if (currentUser.role === 'packing') return step.assignedUserId === currentUser.id && step.station === 'packing'
  return false
}

function buildSteps(template: string, qty: number, customRoute: string[]) {
  const step = (sequence: number, name: string, station: Station, inputs: string[], output: string): ProcessStep => ({
    id: createId('step'),
    sequence,
    name,
    station,
    plannedQty: qty,
    inputs,
    output,
    status: 'not_ready',
    qtyGood: 0,
    qtyRework: 0,
    qtyReject: 0,
    activeSeconds: 0,
  })

  const direct = [
    step(1, 'Buat produk', 'general', [], 'Produk siap QC'),
    step(2, 'QC akhir', 'qc', ['Produk siap QC'], 'Produk lolos QC'),
    step(3, 'Packing', 'packing', ['Produk lolos QC'], 'Produk terpacking'),
  ]

  if (template === 'direct') return direct
  if (template === 'print-sew') {
    return [
      step(1, 'Cetak gambar / motif', 'printing', [], 'Bahan bergambar'),
      step(2, 'Potong bahan', 'cutting', ['Bahan bergambar'], 'Bahan siap jahit'),
      step(3, 'Jahit / rakit produk', 'sewing', ['Bahan siap jahit'], 'Produk siap QC'),
      step(4, 'QC akhir', 'qc', ['Produk siap QC'], 'Produk lolos QC'),
      step(5, 'Packing', 'packing', ['Produk lolos QC'], 'Produk terpacking'),
    ]
  }
  if (template === 'multi-part') {
    return [
      step(1, 'Cetak gambar / motif', 'printing', [], 'Panel cetak'),
      step(2, 'Potong bahan', 'cutting', ['Panel cetak'], 'Panel potong'),
      step(3, 'Siapkan furing', 'component', [], 'Set furing'),
      step(4, 'Siapkan resleting / tali', 'component', [], 'Set resleting'),
      step(5, 'Jahit / rakit produk', 'sewing', ['Panel potong', 'Set furing', 'Set resleting'], 'Produk siap finishing'),
      step(6, 'Finishing / rapikan', 'finishing', ['Produk siap finishing'], 'Produk siap QC'),
      step(7, 'QC akhir', 'qc', ['Produk siap QC'], 'Produk lolos QC'),
      step(8, 'Packing', 'packing', ['Produk lolos QC'], 'Produk terpacking'),
    ]
  }

  const selected = customRoute.length ? customRoute : ['sewing']
  const customSteps: ProcessStep[] = []
  const has = (key: string) => selected.includes(key)
  const output = {
    printing: 'Bahan bergambar',
    cutting: 'Bahan siap jahit',
    lining: 'Set furing',
    zipper: 'Set resleting',
    sewing: has('finishing') ? 'Produk siap finishing' : 'Produk siap QC',
    finishing: 'Produk siap QC',
  }

  if (has('printing')) customSteps.push(step(customSteps.length + 1, 'Cetak gambar / motif', 'printing', [], output.printing))
  if (has('cutting')) customSteps.push(step(customSteps.length + 1, 'Potong bahan', 'cutting', has('printing') ? [output.printing] : [], output.cutting))
  if (has('lining')) customSteps.push(step(customSteps.length + 1, 'Siapkan furing', 'component', [], output.lining))
  if (has('zipper')) customSteps.push(step(customSteps.length + 1, 'Siapkan resleting / tali', 'component', [], output.zipper))
  if (has('sewing')) {
    const sewingInputs = [has('cutting') ? output.cutting : has('printing') ? output.printing : '', has('lining') ? output.lining : '', has('zipper') ? output.zipper : ''].filter(Boolean)
    customSteps.push(step(customSteps.length + 1, 'Jahit / rakit produk', 'sewing', sewingInputs, output.sewing))
  }
  if (has('finishing')) customSteps.push(step(customSteps.length + 1, 'Finishing / rapikan', 'finishing', has('sewing') ? [output.sewing] : [], output.finishing))

  const beforeQc = customSteps.at(-1)?.output || 'Produk siap QC'
  customSteps.push(step(customSteps.length + 1, 'QC akhir', 'qc', [beforeQc], 'Produk lolos QC'))
  customSteps.push(step(customSteps.length + 1, 'Packing', 'packing', ['Produk lolos QC'], 'Produk terpacking'))
  return customSteps
}

function replaceWorkOrder(list: WorkOrder[], updated: WorkOrder) {
  return list.map((order) => order.id === updated.id ? updated : order)
}

function updateStep(workOrder: WorkOrder, stepId: string, patch: Partial<ProcessStep>) {
  return {
    ...workOrder,
    steps: workOrder.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step),
  }
}

export default function App() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders)
  const [currentUserId, setCurrentUserId] = useState('u-admin')
  const [view, setView] = useState<View>('dashboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | WorkOrder['status']>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all')
  const [clock, setClock] = useState(() => Date.now())
  const [toast, setToast] = useState('')

  const currentUser = teamMembers.find((member) => member.id === currentUserId) || teamMembers[0]
  const selectedWorkOrder = workOrders.find((order) => order.id === selectedId) || null

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const sortedOrders = useMemo(() => [...workOrders].sort(sortWorkOrders), [workOrders])

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('id-ID')
    return sortedOrders.filter((order) => {
      const status = deriveOrderStatus(order)
      const matchesSearch = !needle || `${order.code} ${order.product} ${order.source}`.toLocaleLowerCase('id-ID').includes(needle)
      const matchesStatus = statusFilter === 'all' || status === statusFilter
      const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter
      return matchesSearch && matchesStatus && matchesPriority
    })
  }, [priorityFilter, search, sortedOrders, statusFilter])

  const readyTasks = useMemo(() => sortedOrders.flatMap((order) => order.steps
    .filter((step) => deriveStepStatus(order, step) === 'ready')
    .map((step) => ({ order, step }))), [sortedOrders])

  const waitingTasks = useMemo(() => sortedOrders.flatMap((order) => order.steps
    .filter((step) => deriveStepStatus(order, step) === 'waiting_wip')
    .map((step) => ({ order, step }))), [sortedOrders])

  const holdTasks = useMemo(() => sortedOrders.flatMap((order) => order.steps
    .filter((step) => deriveStepStatus(order, step) === 'hold')
    .map((step) => ({ order, step }))), [sortedOrders])

  const qcTasks = useMemo(() => readyTasks.filter(({ step }) => step.station === 'qc'), [readyTasks])
  const stationTasks = useMemo(() => sortedOrders.flatMap((order) => order.steps
    .filter((step) => step.assignedUserId === currentUser.id && ['ready', 'in_progress', 'hold', 'waiting_wip'].includes(deriveStepStatus(order, step)))
    .map((step) => ({ order, step }))), [currentUser.id, sortedOrders])

  const activeOrders = workOrders.filter((order) => !['done', 'closed', 'cancelled'].includes(deriveOrderStatus(order)))
  const overdueOrders = activeOrders.filter(isOverdue)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3_200)
  }

  const applyOrderUpdate = (order: WorkOrder, note?: string) => {
    setWorkOrders((current) => replaceWorkOrder(current, order))
    if (note) showToast(note)
  }

  const openOrder = (order: WorkOrder) => setSelectedId(order.id)

  const beginStep = (order: WorkOrder, step: ProcessStep, artworkImageId?: string) => {
    const status = deriveStepStatus(order, step)
    if (status !== 'ready') return showToast('Proses belum siap. Periksa WIP atau HOLD terlebih dahulu.')
    const now = new Date().toISOString()
    const updated = updateStep(order, step.id, {
      status: 'in_progress',
      startedAt: now,
      ...(artworkImageId ? {
        artworkConfirmedBy: currentUser.name,
        artworkConfirmedAt: now,
        artworkConfirmedImageId: artworkImageId,
      } : {}),
    })
    updated.history = [
      ...(artworkImageId ? [makeHistory(currentUser, 'Artwork diverifikasi sebelum cetak', `FINAL PRINT FILE sudah dibuka dan dikonfirmasi sebelum ${step.name} dimulai.`)] : []),
      makeHistory(currentUser, `Mulai proses · ${step.name}`, `Timer mulai di ${step.location || stationLabels[step.station]}.`),
      ...order.history,
    ]
    applyOrderUpdate(updated, artworkImageId ? 'Artwork dikonfirmasi. Timer Printing dimulai.' : 'Timer proses dimulai.')
  }

  const startStep = (order: WorkOrder, step: ProcessStep) => {
    if (step.station !== 'printing') return beginStep(order, step)
    const readiness = getArtworkReadiness(order)
    if (!readiness.ready) return showToast(`Printing diblokir. ${readiness.reason}`)
    setModal({ type: 'confirm-artwork', workOrder: order, step })
  }

  const pauseStep = (order: WorkOrder, step: ProcessStep) => {
    if (!step.startedAt) return
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(step.startedAt).getTime()) / 1_000))
    const updated = updateStep(order, step.id, { status: 'ready', activeSeconds: step.activeSeconds + elapsed, startedAt: undefined })
    updated.history = [makeHistory(currentUser, `Jeda proses · ${step.name}`, `Waktu aktif tersimpan: ${formatDuration(step.activeSeconds + elapsed)}.`), ...order.history]
    applyOrderUpdate(updated, 'Timer dijeda. Waktu aktif tersimpan.')
  }

  const resumeStep = (order: WorkOrder, step: ProcessStep) => {
    const updated = updateStep(order, step.id, { holdReason: undefined, status: 'ready' })
    updated.history = [makeHistory(currentUser, `HOLD dibuka · ${step.name}`, 'Proses kembali ke antrean siap dikerjakan.'), ...order.history]
    applyOrderUpdate(updated, 'HOLD dibuka.')
  }

  const closeOrder = (order: WorkOrder) => {
    const updated: WorkOrder = {
      ...order,
      status: 'closed',
      history: [makeHistory(currentUser, 'WO ditutup', 'Administrasi penutupan dan pembaruan stok akan diproses backend nanti.'), ...order.history],
    }
    applyOrderUpdate(updated, 'WO ditutup.')
    setModal(null)
  }

  const cancelOrder = (order: WorkOrder) => {
    const updated: WorkOrder = {
      ...order,
      status: 'cancelled',
      history: [makeHistory(currentUser, 'WO dibatalkan', 'Draft dibatalkan sebelum masuk jadwal produksi.'), ...order.history],
    }
    applyOrderUpdate(updated, 'Draft dibatalkan.')
    setModal(null)
  }

  const renderTaskRow = (order: WorkOrder, step: ProcessStep, index?: number) => {
    const stepStatus = deriveStepStatus(order, step)
    return (
      <button className="queue-row" key={step.id} onClick={() => openOrder(order)}>
        <span className="queue-row__index">{index ?? step.sequence}</span>
        <span className="queue-row__copy">
          <b>{step.name} <small>· {order.code}</small></b>
          <span>{order.product}</span>
          <em>{step.assignedUserId ? teamMembers.find((member) => member.id === step.assignedUserId)?.name : 'PIC belum ditentukan'} · Target {formatNumber(step.plannedQty)}</em>
        </span>
        <span className="queue-row__right"><Badge kind="priority" value={order.priority} /><Badge kind="process" value={stepStatus} /></span>
      </button>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__eyebrow">Pusat Grosir Eceran</span>
          <strong className="brand__name">WO <em>Control</em></strong>
          <p>Perintah kerja, proses nyata, WIP, QC, packing, dan blocker dalam satu tampilan.</p>
        </div>

        <nav className="side-nav" aria-label="Navigasi Work Order">
          {NAV.map((item) => (
            <button key={item.id} className={`side-nav__item${view === item.id ? ' side-nav__item--active' : ''}`} onClick={() => setView(item.id)}>
              <Icon name={item.icon} /> <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__note">
          <b>Fase frontend</b>
          <span>Role dan data masih simulasi. Saat Supabase terhubung, tombol akan mengikuti login serta penugasan stasiun sebenarnya.</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Kontrol produksi PGE</p>
            <h1>{view === 'dashboard' ? 'Setiap proses harus terlihat.' : view === 'orders' ? 'Daftar Work Order' : view === 'station' ? 'Stasiun Saya' : view === 'wip' ? 'WIP / Barang Setengah Jadi' : 'Ringkasan Operasional'}</h1>
            <p className="topbar__subtitle">{view === 'dashboard'
              ? 'Prioritaskan pesanan customer, lihat langkah yang benar-benar siap, dan tindak blocker sebelum pekerjaan hilang di tengah proses.'
              : view === 'station'
                ? 'Tampilan mobile-first untuk pekerjaan yang memang ditugaskan kepada pengguna aktif.'
                : 'Frontend demo dengan alur proses dan WIP. Data akan tersimpan permanen setelah backend Supabase dihubungkan.'}</p>
          </div>
          <div className="topbar__actions">
            <label className="user-switcher">
              <Icon name="user" />
              <span><b>{currentUser.name}</b><small>{roleLabels[currentUser.role]}</small></span>
              <select aria-label="Pilih pengguna demo" value={currentUserId} onChange={(event) => setCurrentUserId(event.target.value)}>
                {teamMembers.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
              </select>
            </label>
            {currentUser.role === 'admin' ? <button className="button button--primary" onClick={() => setModal({ type: 'create' })}><Icon name="plus" /> Buat WO</button> : null}
          </div>
        </header>

        {view === 'dashboard' ? (
          <section className="view-content">
            <div className="metric-grid">
              <article className="metric-card metric-card--ink"><span>WO aktif</span><b>{formatNumber(activeOrders.length)}</b><small>Belum ditutup</small></article>
              <article className="metric-card metric-card--blue"><span>Proses siap</span><b>{formatNumber(readyTasks.length)}</b><small>WIP / input tersedia</small></article>
              <article className="metric-card metric-card--purple"><span>QC menunggu</span><b>{formatNumber(qcTasks.length)}</b><small>Perlu keputusan QC</small></article>
              <article className="metric-card metric-card--amber"><span>Menunggu WIP</span><b>{formatNumber(waitingTasks.length)}</b><small>Input belum cukup</small></article>
              <article className="metric-card metric-card--red"><span>HOLD aktif</span><b>{formatNumber(holdTasks.length)}</b><small>Butuh pemilik keputusan</small></article>
              <article className="metric-card metric-card--danger"><span>Lewat target</span><b>{formatNumber(overdueOrders.length)}</b><small>Prioritas pemulihan</small></article>
            </div>

            <div className="dashboard-grid">
              <article className="surface-card surface-card--large">
                <header className="surface-card__header"><div><p className="eyebrow">Prioritas saat ini</p><h2>Proses yang sudah bisa dikerjakan</h2><span>Urutan diprioritaskan: HOLD, terlambat, MTO, lalu P1–P4.</span></div><Badge kind="plain" value={`${readyTasks.length} proses siap`} /></header>
                <div className="queue-list">{readyTasks.length ? readyTasks.slice(0, 6).map(({ order, step }, index) => renderTaskRow(order, step, index + 1)) : <div className="empty-state">Tidak ada proses siap. Selesaikan langkah sebelumnya atau jadwalkan WO draft.</div>}</div>
              </article>
              <article className="surface-card">
                <header className="surface-card__header"><div><p className="eyebrow">Aturan kerja</p><h2>Yang tidak boleh dilanggar</h2></div></header>
                <ol className="rule-list">
                  <li><b>WO harus dibuat sebelum proses dimulai.</b> Perintah lisan tetap harus masuk sistem.</li>
                  <li><b>WIP wajib memiliki jumlah dan lokasi.</b> “Sudah jadi” bukan informasi yang cukup.</li>
                  <li><b>QC lulus belum berarti selesai.</b> Produk baru selesai setelah packing tercatat.</li>
                  <li><b>HOLD harus punya alasan dan pemilik keputusan.</b> Bukan status untuk menyembunyikan keterlambatan.</li>
                </ol>
              </article>
            </div>

            <div className="dashboard-grid dashboard-grid--bottom">
              <article className="surface-card">
                <header className="surface-card__header"><div><p className="eyebrow">Blocker</p><h2>Menunggu WIP</h2><span>Jangan menyalahkan stasiun berikutnya sebelum input benar-benar tersedia.</span></div></header>
                <div className="queue-list queue-list--compact">{waitingTasks.length ? waitingTasks.slice(0, 4).map(({ order, step }, index) => renderTaskRow(order, step, index + 1)) : <div className="empty-state">Tidak ada proses yang tertahan karena WIP.</div>}</div>
              </article>
              <article className="surface-card">
                <header className="surface-card__header"><div><p className="eyebrow">HOLD</p><h2>Butuh keputusan</h2><span>Semua HOLD perlu tindakan nyata, bukan hanya catatan.</span></div></header>
                <div className="queue-list queue-list--compact">{holdTasks.length ? holdTasks.map(({ order, step }, index) => renderTaskRow(order, step, index + 1)) : <div className="empty-state">Tidak ada HOLD aktif. Pertahankan disiplin pencatatan.</div>}</div>
              </article>
            </div>
          </section>
        ) : null}

        {view === 'orders' ? (
          <section className="view-content">
            <article className="surface-card">
              <header className="surface-card__header"><div><p className="eyebrow">Daftar utama</p><h2>Kontrol Work Order</h2><span>Klik satu WO untuk melihat rute, WIP, PIC, timer, dan histori.</span></div><Badge kind="plain" value={`${filteredOrders.length} WO`} /></header>
              <div className="filter-row">
                <label className="search-field"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode WO, produk, atau sumber order" /></label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Semua status</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}><option value="all">Semua prioritas</option>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
              </div>
              <div className="table-wrap"><table className="wo-table"><thead><tr><th>WO</th><th>Tipe / sumber</th><th>Produk</th><th>Target</th><th>Progress</th><th>Status / blocker</th><th>PIC saat ini</th><th /></tr></thead><tbody>
                {filteredOrders.map((order) => {
                  const current = getCurrentProcess(order)
                  const status = deriveOrderStatus(order)
                  return <tr key={order.id} onClick={() => openOrder(order)}>
                    <td><b>{order.code}</b><small>Dibuat {formatDate(order.createdAt.slice(0, 10))}</small></td>
                    <td><Badge kind="type" value={order.type} /><small>{order.source}</small></td>
                    <td><b>{order.product}</b><small>{order.referenceNote || 'Tidak ada catatan referensi'}</small></td>
                    <td><b className={isOverdue(order) ? 'text-danger' : ''}>{formatDate(order.dueDate)}</b><Badge kind="priority" value={order.priority} /></td>
                    <td><b>{getProgress(order)}%</b><small>{formatNumber(order.steps.filter((step) => step.station === 'packing').reduce((total, step) => total + step.qtyGood, 0))}/{formatNumber(order.qty)} terpacking</small></td>
                    <td><Badge kind="status" value={status} />{getBlockerSummary(order) ? <small className="text-warning">{getBlockerSummary(order)}</small> : null}</td>
                    <td><b>{current?.assignedUserId ? teamMembers.find((member) => member.id === current.assignedUserId)?.name : 'Belum ditetapkan'}</b><small>{current ? current.name : 'Tidak ada proses aktif'}</small></td>
                    <td><button className="row-open" onClick={(event) => { event.stopPropagation(); openOrder(order) }}>Buka <Icon name="arrow" /></button></td>
                  </tr>
                })}
              </tbody></table></div>
            </article>
          </section>
        ) : null}

        {view === 'station' ? (
          <section className="view-content station-view">
            <div className="station-hero">
              <div><p className="eyebrow">Tampilan operator</p><h2>{currentUser.name}</h2><span>{roleLabels[currentUser.role]} · {currentUser.stations.map((station) => stationLabels[station]).join(', ')}</span></div>
              <div className="station-hero__note"><Icon name="package" /><span>Hanya langkah yang ditugaskan ke akun ini yang muncul di sini.</span></div>
            </div>
            <div className="station-task-list">
              {stationTasks.length ? stationTasks.map(({ order, step }) => {
                const status = deriveStepStatus(order, step)
                const operationAllowed = canUseProcess(currentUser, step)
                const isPrinting = step.station === 'printing'
                const finalArtwork = getApprovedPrimaryArtwork(order)
                const artworkReadiness = getArtworkReadiness(order)
                return <article key={step.id} className="station-task-card">
                  <header><div><Badge kind="priority" value={order.priority} /><span>{order.code}</span></div><Badge kind="process" value={status} /></header>
                  <h3>{step.name}</h3><p>{order.product}</p>
                  {isPrinting ? finalArtwork ? <section className="station-artwork-briefing">
                    <button type="button" className="station-artwork-briefing__preview" onClick={() => openOrder(order)}><img src={finalArtwork.dataUrl} alt={`FINAL PRINT FILE ${finalArtwork.name}`} /></button>
                    <div><span><Icon name="check" /> FINAL PRINT FILE · {finalArtwork.version}</span><h4>{finalArtwork.name}</h4><p>{finalArtwork.printNote || 'Buka detail WO untuk membaca instruksi cetak.'}</p><small>{finalArtwork.approvedBy ? `Disetujui oleh ${finalArtwork.approvedBy}` : 'Disetujui untuk cetak'}</small></div>
                  </section> : <div className="station-artwork-blocked"><Icon name="warning" /><div><b>Printing diblokir</b><span>{artworkReadiness.reason}</span></div></div> : null}
                  <div className="station-task-card__details"><span>Target <b>{formatNumber(step.plannedQty)}</b></span><span>Hasil baik <b>{formatNumber(step.qtyGood)}</b></span><span>WIP input <b>{Number.isFinite(getAvailableInputCap(order, step)) ? formatNumber(getAvailableInputCap(order, step)) : '—'}</b></span><span>Timer <b>{formatDuration(getOrderActiveSeconds({ ...order, steps: [step] }, clock))}</b></span></div>
                  {step.holdReason ? <div className="hold-box"><Icon name="warning" /> {step.holdReason}</div> : null}
                  <footer><button className="button button--secondary" onClick={() => openOrder(order)}>Lihat WO</button>{operationAllowed && status === 'ready' ? <button className="button button--primary" disabled={isPrinting && !artworkReadiness.ready} title={isPrinting && !artworkReadiness.ready ? artworkReadiness.reason : undefined} onClick={() => startStep(order, step)}><Icon name="play" /> {isPrinting ? 'Review & mulai cetak' : 'Mulai'}</button> : null}{operationAllowed && status === 'in_progress' ? <><button className="button button--secondary" onClick={() => pauseStep(order, step)}><Icon name="pause" /> Jeda</button>{step.station === 'qc' ? <button className="button button--primary" onClick={() => setModal({ type: 'qc', workOrder: order, step })}>Keputusan QC</button> : <button className="button button--primary" onClick={() => setModal({ type: 'log-result', workOrder: order, step })}>Catat hasil</button>}</> : null}{operationAllowed && ['ready', 'in_progress'].includes(status) ? <button className="button button--danger-soft" onClick={() => setModal({ type: 'hold', workOrder: order, step })}>HOLD</button> : null}{operationAllowed && status === 'hold' ? <button className="button button--success-soft" onClick={() => resumeStep(order, step)}>Lanjutkan</button> : null}</footer>
                </article>
              }) : <div className="empty-state empty-state--large">Tidak ada proses aktif untuk akun ini. Pilih pengguna lain di kanan atas untuk melihat antrean stasiun lain.</div>}
            </div>
          </section>
        ) : null}

        {view === 'wip' ? (
          <section className="view-content">
            <article className="surface-card">
              <header className="surface-card__header"><div><p className="eyebrow">Ketersediaan proses</p><h2>WIP per Work Order</h2><span>WIP tidak sama dengan stok gudang. Ini adalah hasil proses di dalam WO yang menunggu dipakai langkah berikutnya.</span></div></header>
              <div className="wip-summary-grid">
                <div><span>Total WIP tersedia</span><b>{formatNumber(sortedOrders.flatMap((order) => order.steps.flatMap((step) => step.inputs.map((input) => getWipBalance(order, input)))).reduce((total, value) => total + value, 0))}</b><small>Unit di antarastasiun</small></div>
                <div><span>WO dengan WIP</span><b>{formatNumber(sortedOrders.filter((order) => order.steps.some((step) => step.inputs.some((input) => getWipBalance(order, input) > 0))).length)}</b><small>WO belum selesai</small></div>
                <div><span>WIP siap QC</span><b>{formatNumber(sortedOrders.reduce((total, order) => total + getWipBalance(order, 'Produk siap QC'), 0))}</b><small>Produk menunggu QC</small></div>
              </div>
              <div className="table-wrap"><table className="wo-table"><thead><tr><th>WIP</th><th>WO / Produk</th><th>Tersedia</th><th>Langkah berikutnya</th><th>Lokasi</th><th /></tr></thead><tbody>
                {sortedOrders.flatMap((order) => Array.from(new Set(order.steps.flatMap((step) => step.inputs))).map((input) => ({ order, input, available: getWipBalance(order, input) })).filter((row) => row.available > 0)).map(({ order, input, available }) => {
                  const nextStep = order.steps.find((step) => step.inputs.includes(input) && deriveStepStatus(order, step) !== 'completed')
                  const sourceStep = order.steps.find((step) => step.output === input)
                  return <tr key={`${order.id}-${input}`} onClick={() => openOrder(order)}><td><b>{input}</b><small>Dari: {sourceStep?.name || '—'}</small></td><td><b>{order.code}</b><small>{order.product}</small></td><td><b>{formatNumber(available)} unit</b></td><td><b>{nextStep?.name || 'Tidak ada'}</b><small>{nextStep ? stationLabels[nextStep.station] : '—'}</small></td><td>{sourceStep?.location || 'Belum dicatat'}</td><td><button className="row-open" onClick={(event) => { event.stopPropagation(); openOrder(order) }}>Buka <Icon name="arrow" /></button></td></tr>
                })}
              </tbody></table></div>
            </article>
          </section>
        ) : null}

        {view === 'reports' ? (
          <section className="view-content">
            <div className="report-grid">
              <article className="surface-card"><p className="eyebrow">Kepatuhan proses</p><h2>{formatNumber(workOrders.filter((order) => order.history.length > 1).length)} WO</h2><span>Sudah punya riwayat selain pembuatan WO.</span></article>
              <article className="surface-card"><p className="eyebrow">Rework</p><h2>{formatNumber(workOrders.reduce((total, order) => total + order.reworkCount, 0))} kejadian</h2><span>Dipakai untuk analisis akar masalah, bukan KPI individu saat ini.</span></article>
              <article className="surface-card"><p className="eyebrow">Waktu aktif</p><h2>{formatDuration(workOrders.reduce((total, order) => total + getOrderActiveSeconds(order, clock), 0))}</h2><span>Data harus stabil sebelum dijadikan dasar evaluasi kinerja.</span></article>
            </div>
            <article className="surface-card report-note"><Icon name="warning" /><div><h2>Catatan implementasi</h2><p>Frontend ini menunjukkan bagaimana role, penugasan stasiun, WIP, timer, QC, packing, dan HOLD akan tampil. Data belum aman untuk penggunaan produksi sampai Supabase Auth, Row Level Security, dan database transition function diterapkan.</p></div></article>
          </section>
        ) : null}
      </main>

      {selectedWorkOrder ? <WorkOrderDrawer
        workOrder={selectedWorkOrder}
        currentUser={currentUser}
        team={teamMembers}
        clock={clock}
        onClose={() => setSelectedId(null)}
        onSchedule={() => setModal({ type: 'schedule', workOrder: selectedWorkOrder })}
        onAssign={(step) => setModal({ type: 'assign', workOrder: selectedWorkOrder, step })}
        onStart={(step) => startStep(selectedWorkOrder, step)}
        onPause={(step) => pauseStep(selectedWorkOrder, step)}
        onLogResult={(step) => setModal({ type: 'log-result', workOrder: selectedWorkOrder, step })}
        onHold={(step) => setModal({ type: 'hold', workOrder: selectedWorkOrder, step })}
        onResume={(step) => resumeStep(selectedWorkOrder, step)}
        onQcDecision={(step) => setModal({ type: 'qc', workOrder: selectedWorkOrder, step })}
        onCloseOrder={() => setModal({ type: 'confirm-close', workOrder: selectedWorkOrder })}
        onCancel={() => setModal({ type: 'confirm-cancel', workOrder: selectedWorkOrder })}
        onManageArtwork={() => setModal({ type: 'manage-artwork', workOrder: selectedWorkOrder })}
      /> : null}

      {modal?.type === 'create' ? <CreateWorkOrderModal
        onClose={() => setModal(null)}
        onCreate={(data) => {
          const created: WorkOrder = {
            id: createId('wo'),
            code: getNextCode(workOrders),
            type: data.type,
            source: data.source,
            product: data.product,
            referenceNote: data.referenceNote,
            referenceImages: data.referenceImages,
            qty: data.qty,
            dueDate: data.dueDate,
            priority: data.priority,
            status: 'draft',
            reworkCount: 0,
            createdAt: new Date().toISOString(),
            createdBy: currentUser.name,
            steps: buildSteps(data.template, data.qty, data.customRoute),
            history: [makeHistory(currentUser, 'WO draft dibuat', `Alur ${routeTemplates.find((template) => template.id === data.template)?.title || 'custom'} dipilih.`)],
          }
          setWorkOrders((current) => [created, ...current])
          setModal(null)
          setSelectedId(created.id)
          showToast(`${created.code} dibuat sebagai draft.`)
        }}
      /> : null}

      {modal?.type === 'schedule' ? <ScheduleModal
        workOrder={modal.workOrder}
        onClose={() => setModal(null)}
        onSave={(data) => {
          const firstStep = modal.workOrder.steps.find((step) => !step.inputs.length) || modal.workOrder.steps[0]
          const updated: WorkOrder = {
            ...modal.workOrder,
            status: 'scheduled',
            machine: data.machine,
            scheduledDate: data.scheduledDate,
            steps: modal.workOrder.steps.map((step) => step.id === firstStep.id ? { ...step, assignedUserId: data.assignedUserId, location: data.location, status: 'ready' } : step),
            history: [makeHistory(currentUser, 'WO dijadwalkan', `Langkah pertama: ${firstStep.name} · ${data.machine} · ${data.scheduledDate}.`), ...modal.workOrder.history],
          }
          applyOrderUpdate(updated, 'WO dijadwalkan dan siap dirilis ke stasiun pertama.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'assign' ? <AssignProcessModal
        workOrder={modal.workOrder}
        step={modal.step}
        onClose={() => setModal(null)}
        onSave={(data) => {
          const updated = updateStep(modal.workOrder, modal.step.id, { assignedUserId: data.assignedUserId, location: data.location, status: 'ready' })
          updated.history = [makeHistory(currentUser, `PIC ditetapkan · ${modal.step.name}`, `Lokasi ${data.location || 'belum diisi'}.`), ...modal.workOrder.history]
          applyOrderUpdate(updated, 'PIC proses diperbarui.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'log-result' ? <LogResultModal
        workOrder={modal.workOrder}
        step={modal.step}
        onClose={() => setModal(null)}
        onSave={(data) => {
          const total = data.good + data.rework + data.reject
          const cap = Math.min(modal.step.plannedQty - getStepRecordedQty(modal.step), getAvailableInputCap(modal.workOrder, modal.step))
          if (total <= 0) return showToast('Isi minimal satu hasil proses.')
          if (total > cap) return showToast(`Total hasil tidak boleh melebihi ${formatNumber(cap)} unit.`)
          const elapsed = modal.step.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(modal.step.startedAt).getTime()) / 1_000)) : 0
          const updated = updateStep(modal.workOrder, modal.step.id, {
            qtyGood: modal.step.qtyGood + data.good,
            qtyRework: modal.step.qtyRework + data.rework,
            qtyReject: modal.step.qtyReject + data.reject,
            activeSeconds: modal.step.activeSeconds + elapsed,
            startedAt: undefined,
            status: getStepRecordedQty({ ...modal.step, qtyGood: modal.step.qtyGood + data.good, qtyRework: modal.step.qtyRework + data.rework, qtyReject: modal.step.qtyReject + data.reject }) >= modal.step.plannedQty ? 'completed' : 'ready',
            location: data.location || modal.step.location,
          })
          updated.history = [makeHistory(currentUser, `Hasil dicatat · ${modal.step.name}`, `Baik ${data.good}, rework ${data.rework}, reject ${data.reject}. ${data.note || ''}`), ...modal.workOrder.history]
          applyOrderUpdate(updated, 'Hasil proses tersimpan. Timer otomatis dijeda.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'hold' ? <HoldModal
        step={modal.step}
        onClose={() => setModal(null)}
        onSave={(reason) => {
          const elapsed = modal.step.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(modal.step.startedAt).getTime()) / 1_000)) : 0
          const updated = updateStep(modal.workOrder, modal.step.id, { holdReason: reason, status: 'hold', activeSeconds: modal.step.activeSeconds + elapsed, startedAt: undefined })
          updated.history = [makeHistory(currentUser, `HOLD · ${modal.step.name}`, reason), ...modal.workOrder.history]
          applyOrderUpdate(updated, 'Proses masuk HOLD.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'qc' ? <QcModal
        workOrder={modal.workOrder}
        step={modal.step}
        onClose={() => setModal(null)}
        onSave={(data) => {
          if (data.decision === 'pass') {
            const elapsed = modal.step.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(modal.step.startedAt).getTime()) / 1_000)) : 0
            const updated = updateStep(modal.workOrder, modal.step.id, {
              qtyGood: modal.step.qtyGood + data.qty,
              qtyReject: modal.step.qtyReject + data.reject,
              activeSeconds: modal.step.activeSeconds + elapsed,
              startedAt: undefined,
              status: modal.step.qtyGood + data.qty + modal.step.qtyReject + data.reject >= modal.step.plannedQty ? 'completed' : 'ready',
            })
            updated.history = [makeHistory(currentUser, 'QC diputuskan · Lulus', `Lulus ${data.qty}, reject final ${data.reject}. ${data.note || ''}`), ...modal.workOrder.history]
            applyOrderUpdate(updated, 'Keputusan QC disimpan.')
          } else {
            const previous = modal.workOrder.steps.find((step) => step.sequence === modal.step.sequence - 1)
            const reworkStep: ProcessStep = {
              id: createId('rework'),
              sequence: modal.step.sequence,
              name: `Rework · ${previous?.name || 'Produksi'}`,
              station: previous?.station || 'sewing',
              assignedUserId: previous?.assignedUserId,
              plannedQty: data.qty,
              inputs: [],
              output: 'Produk siap QC',
              status: 'ready',
              qtyGood: 0,
              qtyRework: 0,
              qtyReject: 0,
              activeSeconds: 0,
              location: previous?.location,
            }
            const patchedQc = { ...modal.step, status: 'ready' as const, startedAt: undefined }
            const updated: WorkOrder = {
              ...modal.workOrder,
              reworkCount: modal.workOrder.reworkCount + 1,
              steps: modal.workOrder.steps.flatMap((step) => step.id === modal.step.id ? [reworkStep, patchedQc] : [step]).map((step, index) => ({ ...step, sequence: index + 1 })),
              history: [makeHistory(currentUser, 'QC dikembalikan ke rework', `${data.qty} unit kembali ke ${reworkStep.name}. ${data.note || ''}`), ...modal.workOrder.history],
            }
            applyOrderUpdate(updated, 'QC mengembalikan produk ke rework.')
          }
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'manage-artwork' ? <ArtworkManagerModal
        workOrder={modal.workOrder}
        currentUser={currentUser}
        onClose={() => setModal(null)}
        onSave={(referenceImages, changeSummary) => {
          const updated: WorkOrder = {
            ...modal.workOrder,
            referenceImages,
            history: [makeHistory(currentUser, 'Kontrol artwork diperbarui', changeSummary), ...modal.workOrder.history],
          }
          applyOrderUpdate(updated, 'Artwork, versi, dan persetujuan berhasil diperbarui.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'confirm-artwork' ? <ConfirmArtworkModal
        workOrder={modal.workOrder}
        step={modal.step}
        onClose={() => setModal(null)}
        onConfirm={(imageId) => {
          beginStep(modal.workOrder, modal.step, imageId)
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'confirm-close' ? <ConfirmModal title="Tutup Work Order" description="Pastikan packing dan hasil akhir sudah benar. Setelah ditutup, perubahan harus dilakukan melalui proses revisi/audit." confirmLabel="Tutup WO" onClose={() => setModal(null)} onConfirm={() => closeOrder(modal.workOrder)} /> : null}
      {modal?.type === 'confirm-cancel' ? <ConfirmModal title="Batalkan Draft" description="Draft tidak akan masuk antrean produksi. Hanya draft yang boleh dibatalkan." confirmLabel="Batalkan Draft" danger onClose={() => setModal(null)} onConfirm={() => cancelOrder(modal.workOrder)} /> : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}

type CreateData = {
  type: WorkOrderType
  source: string
  product: string
  referenceNote: string
  referenceImages: WorkOrderReferenceImage[]
  qty: number
  dueDate: string
  priority: Priority
  template: string
  customRoute: string[]
}

const MAX_ARTWORK_IMAGES = 6
const MAX_ARTWORK_FILE_BYTES = 8 * 1024 * 1024
const MAX_ARTWORK_DIMENSION = 1600

function routeNeedsArtwork(template: string, customRoute: string[]) {
  return template === 'print-sew' || template === 'multi-part' || (template === 'custom' && customRoute.includes('printing'))
}

function readArtworkFile(file: File): Promise<WorkOrderReferenceImage> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error(`${file.name}: gunakan JPG, PNG, atau WEBP.`))
      return
    }

    if (file.size > MAX_ARTWORK_FILE_BYTES) {
      reject(new Error(`${file.name}: ukuran maksimal 8 MB per gambar.`))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Gagal membaca ${file.name}.`))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error(`${file.name}: file gambar tidak dapat diproses.`))
      image.onload = () => {
        const scale = Math.min(1, MAX_ARTWORK_DIMENSION / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error(`Gagal menyiapkan preview ${file.name}.`))
          return
        }

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const name = `${file.name.replace(/\.[^/.]+$/, '') || 'artwork'}.jpg`
        resolve({
          id: createId('artwork'),
          name,
          dataUrl: canvas.toDataURL('image/jpeg', 0.84),
          createdAt: new Date().toISOString(),
          version: 'V1',
          approvalStatus: 'pending',
          isPrimary: false,
          printNote: '',
        })
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function CreateWorkOrderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: CreateData) => void }) {
  const [type, setType] = useState<WorkOrderType>('mto')
  const [template, setTemplate] = useState('multi-part')
  const [customRoute, setCustomRoute] = useState<string[]>(['printing', 'cutting', 'lining', 'zipper', 'sewing', 'finishing'])
  const [form, setForm] = useState({ source: '', product: '', referenceNote: '', qty: 100, dueDate: new Date().toISOString().slice(0, 10), priority: 'p3' as Priority })
  const [referenceImages, setReferenceImages] = useState<WorkOrderReferenceImage[]>([])
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const needsArtwork = routeNeedsArtwork(template, customRoute)
  const toggleCustom = (id: string) => setCustomRoute((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])

  const addArtworkFiles = async (fileList: FileList | File[] | null) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return

    const availableSlots = MAX_ARTWORK_IMAGES - referenceImages.length
    if (availableSlots <= 0) {
      setUploadError(`Maksimal ${MAX_ARTWORK_IMAGES} gambar motif untuk satu WO.`)
      return
    }

    setUploadError('')
    setIsUploading(true)
    try {
      const candidates = incoming.slice(0, availableSlots)
      const results = await Promise.allSettled(candidates.map(readArtworkFile))
      const successful = results
        .filter((result): result is PromiseFulfilledResult<WorkOrderReferenceImage> => result.status === 'fulfilled')
        .map((result) => result.value)
      const failed = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason instanceof Error ? result.reason.message : 'Gagal menambahkan gambar.')

      if (successful.length) {
        setReferenceImages((current) => [...current, ...successful].map((image, index) => ({ ...image, isPrimary: current.length === 0 && index === 0 ? true : image.isPrimary })))
      }
      if (incoming.length > availableSlots) {
        failed.push(`Hanya ${availableSlots} gambar yang dapat ditambahkan. Maksimal ${MAX_ARTWORK_IMAGES} gambar per WO.`)
      }
      if (failed.length) setUploadError(failed.join(' '))
    } finally {
      setIsUploading(false)
    }
  }

  const removeArtwork = (id: string) => {
    setReferenceImages((current) => current.filter((image) => image.id !== id))
    setUploadError('')
  }

  return <Modal title="Buat Work Order" subtitle="Draft belum masuk ke lantai produksi. PPIC harus menjadwalkan sebelum proses pertama bisa dimulai." onClose={onClose} wide>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      if (needsArtwork && referenceImages.length === 0) {
        setUploadError('Rute dengan proses Printing wajib memiliki minimal satu gambar artwork / motif agar operator mencetak desain yang benar.')
        return
      }
      onCreate({ type, template, customRoute, referenceImages, ...form, qty: Number(form.qty) })
    }}>
      <div className="form-section-label">1. Sumber dan produk</div>
      <div className="segmented-control"><button className={type === 'mto' ? 'is-active' : ''} type="button" onClick={() => setType('mto')}>Pesanan customer / MTO</button><button className={type === 'mts' ? 'is-active' : ''} type="button" onClick={() => setType('mts')}>Buat stok / MTS</button></div>
      <div className="form-grid">
        <label><span>{type === 'mto' ? 'Nomor order / customer' : 'Alasan buat stok'}</span><input required value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder={type === 'mto' ? 'Contoh: Shopee #PGE-260707-001' : 'Contoh: Stok campaign Agustus'} /></label>
        <label><span>Jumlah rencana</span><input required min="1" type="number" value={form.qty} onChange={(event) => setForm({ ...form, qty: Number(event.target.value) })} /></label>
        <label className="form-grid__wide"><span>Deskripsi produk</span><input required value={form.product} onChange={(event) => setForm({ ...form, product: event.target.value })} placeholder="Contoh: Cover passport Korea, maroon, motif landmark, resleting putih" /></label>
        <label className="form-grid__wide"><span>Referensi / lokasi artwork</span><input value={form.referenceNote} onChange={(event) => setForm({ ...form, referenceNote: event.target.value })} placeholder="Contoh: Canva / Produk Juli / Korea final V3" /></label>
        <div className="form-grid__wide artwork-field">
          <span>Artwork / motif untuk printing {needsArtwork ? <b>· wajib</b> : '· opsional'}</span>
          <div className="artwork-upload">
            <input id="artworkUpload" className="artwork-upload__input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void addArtworkFiles(event.target.files); event.currentTarget.value = '' }} />
            <label className="artwork-upload__dropzone" htmlFor="artworkUpload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addArtworkFiles(event.dataTransfer.files) }}>
              <Icon name="upload" />
              <span><b>{isUploading ? 'Menyiapkan gambar...' : 'Upload gambar motif / artwork'}</b><small>JPG, PNG, atau WEBP · maksimal 6 gambar · maksimal 8 MB per gambar. Gambar diperkecil agar lebih aman dibuka di ponsel operator.</small></span>
            </label>
            {referenceImages.length ? <div className="artwork-upload__grid">
              {referenceImages.map((image, index) => <article className="artwork-upload__thumb" key={image.id}>
                <img src={image.dataUrl} alt={`Artwork ${index + 1}: ${image.name}`} />
                <div><b>{image.isPrimary ? 'Kandidat file utama' : `Motif ${index + 1}`}</b><small>{image.name} · {image.version} · menunggu persetujuan</small></div>
                <button type="button" onClick={() => removeArtwork(image.id)} aria-label={`Hapus ${image.name}`}>×</button>
              </article>)}
            </div> : <p className="artwork-upload__empty">Belum ada gambar motif. File pertama otomatis menjadi kandidat file utama, tetapi tetap harus disetujui sebagai FINAL PRINT FILE oleh Admin/PPIC setelah WO dibuat.</p>}
            {uploadError ? <p className="artwork-upload__error">{uploadError}</p> : null}
          </div>
        </div>
        <label><span>Target selesai</span><input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
        <label><span>Prioritas</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="form-section-label">2. Pilih rute produksi</div>
      <div className="route-template-grid">{routeTemplates.map((item) => <button type="button" key={item.id} className={`route-template${template === item.id ? ' route-template--active' : ''}`} onClick={() => setTemplate(item.id)}><b>{item.title}</b><span>{item.description}</span></button>)}</div>
      {template === 'custom' ? <div className="custom-route-builder"><div><b>Proses dipilih</b><span>QC akhir dan packing ditambahkan otomatis. Rute yang sudah punya hasil tidak dapat diubah setelah produksi dimulai.</span></div><div className="custom-route-options">{CUSTOM_OPTIONS.map((item) => <button type="button" key={item.id} className={customRoute.includes(item.id) ? 'is-active' : ''} onClick={() => toggleCustom(item.id)}>{customRoute.includes(item.id) ? '✓ ' : '+ '}{item.label}</button>)}</div></div> : null}
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className="button button--primary" disabled={isUploading}>Buat draft WO</button></footer>
    </form>
  </Modal>
}


function nextArtworkVersion(images: WorkOrderReferenceImage[]) {
  const versions = images
    .map((image) => Number(image.version.replace(/[^0-9]/g, '')) || 0)
    .filter(Boolean)
  return `V${Math.max(0, ...versions) + 1}`
}

function ArtworkManagerModal({
  workOrder,
  currentUser,
  onClose,
  onSave,
}: {
  workOrder: WorkOrder
  currentUser: TeamMember
  onClose: () => void
  onSave: (images: WorkOrderReferenceImage[], changeSummary: string) => void
}) {
  const [images, setImages] = useState<WorkOrderReferenceImage[]>(() => (workOrder.referenceImages || []).map((image) => ({ ...image })))
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const updateImage = (id: string, patch: Partial<WorkOrderReferenceImage>) => {
    setImages((current) => current.map((image) => image.id === id ? { ...image, ...patch } : image))
  }

  const setPrimary = (id: string) => {
    setImages((current) => current.map((image) => ({ ...image, isPrimary: image.id === id })))
  }

  const setApproval = (id: string, approvalStatus: ArtworkApprovalStatus) => {
    setImages((current) => current.map((image) => image.id === id
      ? {
          ...image,
          approvalStatus,
          approvedBy: approvalStatus === 'approved' ? currentUser.name : undefined,
          approvedAt: approvalStatus === 'approved' ? new Date().toISOString() : undefined,
        }
      : image))
  }

  const addArtworkFiles = async (fileList: FileList | File[] | null) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return
    const availableSlots = MAX_ARTWORK_IMAGES - images.length
    if (availableSlots <= 0) return setUploadError(`Maksimal ${MAX_ARTWORK_IMAGES} file per WO.`)
    setUploadError('')
    setIsUploading(true)
    try {
      const results = await Promise.allSettled(incoming.slice(0, availableSlots).map(readArtworkFile))
      const successful = results
        .filter((result): result is PromiseFulfilledResult<WorkOrderReferenceImage> => result.status === 'fulfilled')
        .map((result) => result.value)
      const failed = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason instanceof Error ? result.reason.message : 'Gagal menambahkan file.')
      if (successful.length) {
        setImages((current) => {
          const start = nextArtworkVersion(current)
          const startNumber = Number(start.replace('V', ''))
          return [...current, ...successful.map((image, index) => ({
            ...image,
            version: `V${startNumber + index}`,
            isPrimary: current.length === 0 && index === 0,
          }))]
        })
      }
      if (failed.length) setUploadError(failed.join(' '))
    } finally {
      setIsUploading(false)
    }
  }

  const removeImage = (id: string) => {
    setImages((current) => {
      const next = current.filter((image) => image.id !== id)
      if (next.length && !next.some((image) => image.isPrimary)) next[0] = { ...next[0], isPrimary: true }
      return next
    })
  }

  const save = () => {
    const primary = images.find((image) => image.isPrimary)
    if (primary?.approvalStatus === 'superseded') {
      setUploadError('File utama tidak boleh berstatus versi lama / diganti.')
      return
    }
    const final = images.find((image) => image.isPrimary && image.approvalStatus === 'approved')
    const summary = final
      ? `FINAL PRINT FILE: ${final.name} · ${final.version} · disetujui untuk cetak.`
      : 'Artwork diperbarui, tetapi belum ada FINAL PRINT FILE yang disetujui untuk cetak.'
    onSave(images, summary)
  }

  return <Modal title="Kelola Artwork & Versi" subtitle="Tetapkan satu FINAL PRINT FILE yang disetujui. File lain boleh disimpan sebagai referensi atau versi lama, tetapi operator hanya boleh mencetak file final." onClose={onClose} wide>
    <div className="form-stack artwork-manager">
      <div className="callout"><Icon name="warning" /><span><b>Aturan:</b> satu WO hanya boleh mempunyai satu file utama. Agar Printing dapat dimulai, file utama harus memiliki status <b>Disetujui untuk cetak</b>.</span></div>
      <input id="artworkRevisionUpload" className="artwork-upload__input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void addArtworkFiles(event.target.files); event.currentTarget.value = '' }} />
      <label className="artwork-upload__dropzone" htmlFor="artworkRevisionUpload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addArtworkFiles(event.dataTransfer.files) }}>
        <Icon name="upload" /><span><b>{isUploading ? 'Menyiapkan file revisi...' : 'Tambah artwork / revisi baru'}</b><small>Drag & drop atau klik. File baru ditambahkan sebagai versi berikutnya dan tetap menunggu persetujuan.</small></span>
      </label>
      {uploadError ? <p className="artwork-upload__error">{uploadError}</p> : null}
      {images.length ? <div className="artwork-manager__list">
        {images.map((image) => <article className={`artwork-manager-card${image.isPrimary ? ' artwork-manager-card--primary' : ''}`} key={image.id}>
          <img src={image.dataUrl} alt={image.name} />
          <div className="artwork-manager-card__fields">
            <div className="artwork-manager-card__titleline"><b>{image.isPrimary ? 'FINAL PRINT FILE candidate' : 'Artwork reference'}</b><button type="button" className="text-button text-button--danger" onClick={() => removeImage(image.id)}>Hapus</button></div>
            <div className="form-grid">
              <label className="form-grid__wide"><span>Nama file / judul motif</span><input value={image.name} onChange={(event) => updateImage(image.id, { name: event.target.value })} /></label>
              <label><span>Versi</span><input value={image.version} onChange={(event) => updateImage(image.id, { version: event.target.value || 'V1' })} placeholder="V3" /></label>
              <label><span>Status</span><select value={image.approvalStatus} onChange={(event) => setApproval(image.id, event.target.value as ArtworkApprovalStatus)}>{Object.entries(artworkApprovalLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="form-grid__wide"><span>Instruksi cetak</span><textarea value={image.printNote || ''} onChange={(event) => updateImage(image.id, { printNote: event.target.value })} placeholder="Contoh: Gunakan warna maroon; cek posisi logo; cetak 1 panel depan per unit." /></label>
            </div>
            <div className="artwork-manager-card__actions"><button type="button" className={`button button--compact ${image.isPrimary ? 'button--primary' : 'button--secondary'}`} onClick={() => setPrimary(image.id)}>{image.isPrimary ? <><Icon name="check" /> File utama untuk cetak</> : 'Jadikan file utama'}</button>{image.approvalStatus === 'approved' ? <span className="approval-note"><Icon name="check" /> Disetujui oleh {image.approvedBy || currentUser.name}</span> : image.approvalStatus === 'superseded' ? <span className="approval-note approval-note--old">Versi lama — jangan dicetak</span> : <span className="approval-note approval-note--pending">Belum disetujui</span>}</div>
          </div>
        </article>)}
      </div> : <div className="empty-state">Belum ada artwork. Tambahkan file agar Printing bisa memiliki file final yang jelas.</div>}
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="button" className="button button--primary" onClick={save}>Simpan kontrol artwork</button></footer>
    </div>
  </Modal>
}

function ConfirmArtworkModal({ workOrder, step, onClose, onConfirm }: { workOrder: WorkOrder; step: ProcessStep; onClose: () => void; onConfirm: (imageId: string) => void }) {
  const finalArtwork = getApprovedPrimaryArtwork(workOrder)
  const [isConfirmed, setIsConfirmed] = useState(false)
  if (!finalArtwork) return <Modal title="Printing diblokir" subtitle="Tidak ada file final yang disetujui untuk cetak." onClose={onClose}><div className="form-stack"><div className="artwork-missing"><Icon name="warning" /><span><b>FINAL PRINT FILE belum tersedia.</b> Minta Admin atau PPIC menetapkan file utama dan status persetujuannya.</span></div><footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Tutup</button></footer></div></Modal>

  return <Modal title="Review FINAL PRINT FILE" subtitle="Sebelum timer Printing dimulai, operator wajib membuka dan mencocokkan motif, warna, versi, serta instruksi cetak." onClose={onClose} wide>
    <div className="form-stack artwork-confirm">
      <section className="artwork-confirm__file"><img src={finalArtwork.dataUrl} alt={`FINAL PRINT FILE ${finalArtwork.name}`} /><div><span><Icon name="check" /> FINAL PRINT FILE · {finalArtwork.version}</span><h3>{finalArtwork.name}</h3><p>{finalArtwork.printNote || 'Tidak ada instruksi cetak tambahan.'}</p><small>Disetujui oleh {finalArtwork.approvedBy || 'PPIC / R&D'}{finalArtwork.approvedAt ? ` · ${new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(finalArtwork.approvedAt))}` : ''}</small></div></section>
      <div className="callout"><Icon name="image" /><span><b>{workOrder.code}</b> · {step.name}. Pastikan contoh pada layar sama dengan file di mesin dan produk yang akan dicetak.</span></div>
      <label className="artwork-confirm__check"><input type="checkbox" checked={isConfirmed} onChange={(event) => setIsConfirmed(event.target.checked)} /><span>Saya sudah membuka FINAL PRINT FILE <b>{finalArtwork.version}</b> dan memastikan motif, warna, posisi, serta instruksi cetak sesuai sebelum memulai produksi.</span></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="button" className="button button--primary" disabled={!isConfirmed} onClick={() => onConfirm(finalArtwork.id)}><Icon name="play" /> Konfirmasi & mulai cetak</button></footer>
    </div>
  </Modal>
}

function ScheduleModal({ workOrder, onClose, onSave }: { workOrder: WorkOrder; onClose: () => void; onSave: (data: { assignedUserId: string; machine: string; scheduledDate: string; location: string }) => void }) {
  const available = teamMembers.filter((member) => member.role === 'operator')
  const [data, setData] = useState({ assignedUserId: available[0]?.id || '', machine: 'Mimaki Eco Solvent 01', scheduledDate: new Date().toISOString().slice(0, 10), location: 'Area produksi' })
  const firstStep = workOrder.steps.find((step) => !step.inputs.length) || workOrder.steps[0]
  const artworkReadiness = getArtworkReadiness(workOrder)
  return <Modal title="Jadwalkan Work Order" subtitle="PPIC dapat memesan kapasitas lebih awal. Namun proses Printing tetap tidak bisa dimulai sampai FINAL PRINT FILE disetujui." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave(data) }}>
      <div className="callout"><Icon name="calendar" /><span><b>{workOrder.code}</b> · Langkah pertama: <b>{firstStep.name}</b></span></div>
      {!artworkReadiness.ready ? <div className="callout callout--warning"><Icon name="warning" /><span><b>Artwork belum siap untuk cetak.</b> {artworkReadiness.reason} WO tetap dapat dijadwalkan, tetapi tombol mulai cetak akan terkunci sampai file final disetujui.</span></div> : null}
      <label><span>Operator langkah pertama</span><select value={data.assignedUserId} onChange={(event) => setData({ ...data, assignedUserId: event.target.value })}>{available.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
      <label><span>Mesin / sumber daya</span><input value={data.machine} onChange={(event) => setData({ ...data, machine: event.target.value })} /></label>
      <div className="form-grid"><label><span>Tanggal jadwal</span><input type="date" value={data.scheduledDate} onChange={(event) => setData({ ...data, scheduledDate: event.target.value })} /></label><label><span>Lokasi</span><input value={data.location} onChange={(event) => setData({ ...data, location: event.target.value })} /></label></div>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className="button button--primary">Jadwalkan WO</button></footer>
    </form>
  </Modal>
}

function AssignProcessModal({ workOrder, step, onClose, onSave }: { workOrder: WorkOrder; step: ProcessStep; onClose: () => void; onSave: (data: { assignedUserId: string; location: string }) => void }) {
  const eligible = teamMembers.filter((member) => member.stations.includes(step.station) || (step.station === 'general' && member.role === 'operator'))
  const [assignedUserId, setAssignedUserId] = useState(step.assignedUserId || eligible[0]?.id || '')
  const [location, setLocation] = useState(step.location || '')
  return <Modal title="Atur PIC proses" subtitle="Setelah proses memiliki hasil atau timer, penugasan rute akan dikunci untuk menjaga audit trail." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave({ assignedUserId, location }) }}>
      <div className="callout"><Icon name="station" /><span><b>{workOrder.code}</b> · {step.name} · {stationLabels[step.station]}</span></div>
      <label><span>PIC / stasiun</span><select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>{eligible.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label><span>Lokasi kerja atau lokasi output WIP</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Contoh: Meja Jahit 2 / Rak WIP Jahit" /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className="button button--primary">Simpan penugasan</button></footer>
    </form>
  </Modal>
}

function LogResultModal({ workOrder, step, onClose, onSave }: { workOrder: WorkOrder; step: ProcessStep; onClose: () => void; onSave: (data: { good: number; rework: number; reject: number; location: string; note: string }) => void }) {
  const cap = Math.min(step.plannedQty - getStepRecordedQty(step), getAvailableInputCap(workOrder, step))
  const [data, setData] = useState({ good: 0, rework: 0, reject: 0, location: step.location || '', note: '' })
  const total = data.good + data.rework + data.reject
  return <Modal title="Catat hasil proses" subtitle="Timer akan otomatis dijeda ketika hasil dicatat. Total hasil tidak boleh melebihi target yang masih tersedia." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave(data) }}>
      <div className="result-summary"><div><span>Batas dapat dicatat</span><b>{formatNumber(cap)}</b></div><div><span>Draft sekarang</span><b className={total > cap ? 'text-danger' : ''}>{formatNumber(total)}</b></div><div><span>Sisa target</span><b>{formatNumber(Math.max(0, cap - total))}</b></div></div>
      <div className="form-grid"><label><span>Hasil baik</span><input min="0" type="number" value={data.good} onChange={(event) => setData({ ...data, good: Number(event.target.value) })} /></label><label><span>Perlu rework</span><input min="0" type="number" value={data.rework} onChange={(event) => setData({ ...data, rework: Number(event.target.value) })} /></label><label><span>Reject</span><input min="0" type="number" value={data.reject} onChange={(event) => setData({ ...data, reject: Number(event.target.value) })} /></label><label><span>Lokasi hasil WIP</span><input value={data.location} onChange={(event) => setData({ ...data, location: event.target.value })} placeholder="Rak WIP / area berikutnya" /></label></div>
      <label><span>Catatan hasil</span><textarea required value={data.note} onChange={(event) => setData({ ...data, note: event.target.value })} placeholder="Contoh: 50 panel baik masuk Rak WIP Jahit; 2 potongan miring." /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className="button button--primary" disabled={total <= 0 || total > cap}>Simpan hasil</button></footer>
    </form>
  </Modal>
}

function HoldModal({ step, onClose, onSave }: { step: ProcessStep; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return <Modal title="Tahan proses / HOLD" subtitle="HOLD wajib menjelaskan fakta masalah dan pemilik keputusan. Tidak boleh dipakai untuk menyembunyikan pekerjaan terlambat." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave(reason) }}>
      <div className="callout callout--warning"><Icon name="warning" /><span><b>{step.name}</b> akan berhenti sampai ada keputusan tercatat.</span></div>
      <label><span>Alasan HOLD</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: resleting ukuran 20 cm belum datang; keputusan pembelian oleh Kepala Produksi." /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className="button button--danger">Masukkan HOLD</button></footer>
    </form>
  </Modal>
}

function QcModal({ workOrder, step, onClose, onSave }: { workOrder: WorkOrder; step: ProcessStep; onClose: () => void; onSave: (data: { decision: 'pass' | 'rework'; qty: number; reject: number; note: string }) => void }) {
  const cap = Math.min(step.plannedQty - getStepRecordedQty(step), getAvailableInputCap(workOrder, step))
  const [decision, setDecision] = useState<'pass' | 'rework'>('pass')
  const [qty, setQty] = useState(cap)
  const [reject, setReject] = useState(0)
  const [note, setNote] = useState('')
  return <Modal title="Keputusan QC" subtitle="Produk yang lulus masuk antrean packing. Produk yang perlu rework akan membuat langkah perbaikan baru dan kembali ke produksi." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave({ decision, qty, reject: decision === 'pass' ? reject : 0, note }) }}>
      <div className="segmented-control"><button type="button" className={decision === 'pass' ? 'is-active' : ''} onClick={() => setDecision('pass')}>Lulus QC</button><button type="button" className={decision === 'rework' ? 'is-active' : ''} onClick={() => setDecision('rework')}>Kembali ke rework</button></div>
      <div className="result-summary"><div><span>WIP siap diperiksa</span><b>{formatNumber(cap)}</b></div><div><span>Qty keputusan</span><b>{formatNumber(qty)}</b></div><div><span>Reject final</span><b>{decision === 'pass' ? formatNumber(reject) : '—'}</b></div></div>
      <div className="form-grid"><label><span>{decision === 'pass' ? 'Qty lulus QC' : 'Qty dikembalikan'}</span><input min="1" max={cap} type="number" value={qty} onChange={(event) => setQty(Number(event.target.value))} /></label>{decision === 'pass' ? <label><span>Reject final</span><input min="0" max={cap - qty} type="number" value={reject} onChange={(event) => setReject(Number(event.target.value))} /></label> : <label><span>Tujuan rework</span><input disabled value="Kembali ke stasiun proses sebelumnya" /></label>}</div>
      <label><span>Catatan QC</span><textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder={decision === 'pass' ? 'Contoh: jahitan, resleting, dan cetak sesuai sample.' : 'Contoh: 4 unit resleting tidak lurus, kembalikan ke jahit.'} /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" disabled={qty <= 0 || qty > cap || (decision === 'pass' && qty + reject > cap)} className={`button ${decision === 'pass' ? 'button--primary' : 'button--warning'}`}>{decision === 'pass' ? 'Simpan lulus QC' : 'Buat rework'}</button></footer>
    </form>
  </Modal>
}

function ConfirmModal({ title, description, confirmLabel, danger = false, onClose, onConfirm }: { title: string; description: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Modal title={title} onClose={onClose}><div className="form-stack"><p className="confirm-copy">{description}</p><footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="button" className={`button ${danger ? 'button--danger' : 'button--primary'}`} onClick={onConfirm}>{confirmLabel}</button></footer></div></Modal>
}

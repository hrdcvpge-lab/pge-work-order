import { useMemo, useState } from 'react'
import { initialWorkOrders, teamMembers } from './data/mockData'
import type { Priority, TeamMember, WorkOrder, WorkOrderHistoryItem, WorkOrderStatus } from './types/workOrder'
import { boardColumns, formatDate, roleLabels } from './utils/workOrder'
import { Icon } from './components/Icon'
import { RolePicker } from './components/RolePicker'
import { WorkOrderCard } from './components/WorkOrderCard'
import { WorkOrderDetail } from './components/WorkOrderDetail'
import { ConfirmActionModal, CreateWorkOrderModal, OutputModal, QcResultModal, ScheduleModal } from './components/Modal'

type ModalState =
  | { type: 'create' }
  | { type: 'schedule'; workOrder: WorkOrder }
  | { type: 'start'; workOrder: WorkOrder }
  | { type: 'output'; workOrder: WorkOrder }
  | { type: 'qc'; workOrder: WorkOrder }
  | { type: 'close'; workOrder: WorkOrder }
  | { type: 'cancel'; workOrder: WorkOrder }
  | null

function makeHistory(actor: TeamMember, action: string, note?: string): WorkOrderHistoryItem {
  return {
    id: `h-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    actor: actor.name,
    role: actor.role,
    action,
    note: note || undefined,
    timestamp: new Date().toISOString(),
  }
}

function nextCode(workOrders: WorkOrder[]) {
  const sequence = Math.max(...workOrders.map((item) => Number(item.code.split('-').pop() || 0)), 70) + 1
  return `WO-2026-${String(sequence).padStart(3, '0')}`
}

export default function App() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders)
  const [currentUser, setCurrentUser] = useState<TeamMember>(teamMembers[0])
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all')
  const [showCancelled, setShowCancelled] = useState(false)

  const visibleOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('id-ID')
    return workOrders.filter((workOrder) => {
      const matchesSearch = !needle || `${workOrder.code} ${workOrder.product}`.toLocaleLowerCase('id-ID').includes(needle)
      const matchesPriority = priorityFilter === 'all' || workOrder.priority === priorityFilter
      const matchesStatus = showCancelled || workOrder.status !== 'cancelled'
      return matchesSearch && matchesPriority && matchesStatus
    })
  }, [workOrders, search, priorityFilter, showCancelled])

  const activeCount = workOrders.filter((item) => !['closed', 'cancelled'].includes(item.status)).length
  const qcCount = workOrders.filter((item) => item.status === 'qc').length
  const reworkCount = workOrders.filter((item) => item.reworkCount > 0 && !['closed', 'cancelled'].includes(item.status)).length
  const overdueCount = workOrders.filter((item) => !['done', 'closed', 'cancelled'].includes(item.status) && new Date(`${item.dueDate}T23:59:59`) < new Date('2026-07-07T08:00:00')).length

  const boardColumnsToRender = showCancelled
    ? [...boardColumns, { status: 'cancelled' as WorkOrderStatus, title: 'Dibatalkan', subtitle: 'Tidak akan diproses' }]
    : boardColumns

  function updateWorkOrder(id: string, updater: (current: WorkOrder) => WorkOrder) {
    setWorkOrders((current) => current.map((workOrder) => workOrder.id === id ? updater(workOrder) : workOrder))
    setSelectedWorkOrder((current) => current?.id === id ? updater(current) : current)
  }

  function appendHistory(current: WorkOrder, item: WorkOrderHistoryItem) {
    return { ...current, history: [...current.history, item] }
  }

  function createWorkOrder(data: Pick<WorkOrder, 'product' | 'qty' | 'dueDate' | 'priority'>) {
    const now = new Date().toISOString()
    const created: WorkOrder = {
      id: `wo-${Date.now()}`,
      code: nextCode(workOrders),
      product: data.product,
      qty: data.qty,
      dueDate: data.dueDate,
      priority: data.priority,
      status: 'draft',
      reworkCount: 0,
      createdBy: currentUser.name,
      createdAt: now,
      history: [makeHistory(currentUser, 'Membuat Work Order', 'Work Order dibuat sebagai Draft dan menunggu jadwal PPIC.')],
    }
    setWorkOrders((current) => [created, ...current])
    setModal(null)
  }

  function scheduleWorkOrder(workOrder: WorkOrder, data: { operatorId: string; machine: string; scheduledDate: string; note: string }) {
    const operator = teamMembers.find((member) => member.id === data.operatorId)
    if (!operator) return
    updateWorkOrder(workOrder.id, (current) => appendHistory({
      ...current,
      status: 'scheduled',
      operatorId: operator.id,
      operatorName: operator.name,
      machine: data.machine,
      scheduledDate: data.scheduledDate,
    }, makeHistory(currentUser, 'Menjadwalkan Work Order', data.note || `Operator ${operator.name.split(' – ')[0]} | ${data.machine} | ${formatDate(data.scheduledDate)}`)))
    setModal(null)
  }

  function startWorkOrder(workOrder: WorkOrder) {
    updateWorkOrder(workOrder.id, (current) => appendHistory({ ...current, status: 'in_progress' }, makeHistory(currentUser, 'Memulai produksi')))
    setModal(null)
  }

  function submitOutput(workOrder: WorkOrder, data: { qtyProduced: number; qtyReject: number; note: string }) {
    updateWorkOrder(workOrder.id, (current) => appendHistory({
      ...current,
      status: 'qc',
      qtyProduced: data.qtyProduced,
      qtyReject: data.qtyReject,
    }, makeHistory(currentUser, 'Mengirim hasil ke QC', data.note || `Hasil produksi: ${data.qtyProduced.toLocaleString('id-ID')} pcs | Reject awal: ${data.qtyReject.toLocaleString('id-ID')} pcs`)))
    setModal(null)
  }

  function setQcResult(workOrder: WorkOrder, result: 'pass' | 'rework', note: string) {
    const isPass = result === 'pass'
    updateWorkOrder(workOrder.id, (current) => appendHistory({
      ...current,
      status: isPass ? 'done' : 'in_progress',
      reworkCount: isPass ? current.reworkCount : current.reworkCount + 1,
    }, makeHistory(currentUser, isPass ? 'QC lulus' : 'QC menolak hasil — rework', note || (isPass ? 'Hasil sesuai standar QC.' : undefined))))
    setModal(null)
  }

  function cancelWorkOrder(workOrder: WorkOrder) {
    updateWorkOrder(workOrder.id, (current) => appendHistory({ ...current, status: 'cancelled' }, makeHistory(currentUser, 'Membatalkan Work Order', 'Work Order dibatalkan saat masih berada di tahap Draft.')))
    setModal(null)
  }

  function closeWorkOrder(workOrder: WorkOrder) {
    updateWorkOrder(workOrder.id, (current) => appendHistory({ ...current, status: 'closed' }, makeHistory(currentUser, 'Menutup Work Order', 'Work Order telah diarsipkan. Integrasi inventori akan ditambahkan di backend.')))
    setModal(null)
  }

  function openAction(type: string, workOrder: WorkOrder) {
    if (type === 'schedule') setModal({ type: 'schedule', workOrder })
    if (type === 'start') setModal({ type: 'start', workOrder })
    if (type === 'submitQc') setModal({ type: 'output', workOrder })
    if (type === 'qcResult') setModal({ type: 'qc', workOrder })
    if (type === 'close') setModal({ type: 'close', workOrder })
    if (type === 'cancel') setModal({ type: 'cancel', workOrder })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="PGE">
          <span className="brand-mark__p">P</span><span className="brand-mark__ge">GE</span>
        </div>
        <div className="sidebar__label">Sistem Operasional</div>
        <nav className="side-nav" aria-label="Navigasi utama">
          <a className="side-nav__item side-nav__item--active" href="#board"><Icon name="clipboard" />Work Order</a>
          <a className="side-nav__item" href="#overview"><Icon name="box" />Ringkasan produksi</a>
          <a className="side-nav__item" href="#history"><Icon name="history" />Riwayat aktivitas</a>
        </nav>
        <div className="sidebar__footer"><span className="sidebar__live-dot" />Mode prototype · data contoh</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Pusat Grosir Eceran</p>
            <h1>Work Order</h1>
          </div>
          <div className="topbar__actions">
            <RolePicker teamMembers={teamMembers} currentUser={currentUser} onChange={setCurrentUser} />
            {currentUser.role === 'admin' ? <button className="button button--primary" onClick={() => setModal({ type: 'create' })}><Icon name="plus" />Work Order baru</button> : null}
          </div>
        </header>

        <section id="overview" className="stat-grid" aria-label="Ringkasan produksi">
          <article className="stat-card"><div className="stat-card__icon"><Icon name="clipboard" /></div><div><span>WO aktif</span><strong>{activeCount}</strong><small>Belum ditutup atau dibatalkan</small></div></article>
          <article className="stat-card"><div className="stat-card__icon stat-card__icon--orange"><Icon name="box" /></div><div><span>Menunggu QC</span><strong>{qcCount}</strong><small>Perlu keputusan quality control</small></div></article>
          <article className="stat-card"><div className="stat-card__icon stat-card__icon--warning"><Icon name="arrowRight" /></div><div><span>Rework berjalan</span><strong>{reworkCount}</strong><small>Perlu perhatian operator dan QC</small></div></article>
          <article className="stat-card"><div className="stat-card__icon stat-card__icon--danger"><Icon name="alert" /></div><div><span>Lewat jatuh tempo</span><strong>{overdueCount}</strong><small>Butuh evaluasi PPIC / admin</small></div></article>
        </section>

        <section id="board" className="board-section">
          <header className="board-section__header">
            <div><p className="eyebrow">Dashboard {roleLabels[currentUser.role]}</p><h2>Alur produksi hari ini</h2><p className="board-section__helper">Tindakan yang muncul mengikuti peran pengguna. Dalam versi produksi, backend tetap menjadi pengaman utama.</p></div>
            <div className="board-filters"><label className="search-field"><Icon name="filter" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode atau produk" /></label><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)} aria-label="Filter prioritas"><option value="all">Semua prioritas</option><option value="urgent">Mendesak</option><option value="high">Tinggi</option><option value="normal">Normal</option></select></div>
          </header>

          <div className="board-scroll" aria-label="Papan Work Order">
            <div className="kanban-board">
              {boardColumnsToRender.map((column) => {
                const cards = visibleOrders.filter((workOrder) => workOrder.status === column.status)
                return (
                  <section className="kanban-column" key={column.status}>
                    <header className="kanban-column__header"><div><h3>{column.title}</h3><p>{column.subtitle}</p></div><span>{cards.length}</span></header>
                    <div className="kanban-column__cards">{cards.length ? cards.map((workOrder) => <WorkOrderCard key={workOrder.id} workOrder={workOrder} currentRole={currentUser.role} currentUserId={currentUser.id} onOpen={setSelectedWorkOrder} onAction={openAction} />) : <div className="empty-column">Tidak ada Work Order</div>}</div>
                  </section>
                )
              })}
            </div>
          </div>
          <button className="cancelled-toggle" onClick={() => setShowCancelled((value) => !value)}>{showCancelled ? 'Sembunyikan' : 'Tampilkan'} WO dibatalkan</button>
        </section>
      </main>

      <WorkOrderDetail workOrder={selectedWorkOrder} onClose={() => setSelectedWorkOrder(null)} />
      {modal?.type === 'create' ? <CreateWorkOrderModal onClose={() => setModal(null)} onSubmit={createWorkOrder} /> : null}
      {modal?.type === 'schedule' ? <ScheduleModal workOrder={modal.workOrder} operators={teamMembers.filter((member) => member.role === 'operator')} onClose={() => setModal(null)} onSubmit={(data) => scheduleWorkOrder(modal.workOrder, data)} /> : null}
      {modal?.type === 'start' ? <ConfirmActionModal title={`Mulai ${modal.workOrder.code}?`} description={`Status akan berubah dari Terjadwal ke Dikerjakan. Pastikan operator, mesin, dan bahan sudah siap.`} confirmLabel="Mulai produksi" onClose={() => setModal(null)} onConfirm={() => startWorkOrder(modal.workOrder)} /> : null}
      {modal?.type === 'output' ? <OutputModal workOrder={modal.workOrder} onClose={() => setModal(null)} onSubmit={(data) => submitOutput(modal.workOrder, data)} /> : null}
      {modal?.type === 'qc' ? <QcResultModal workOrder={modal.workOrder} onClose={() => setModal(null)} onSubmit={(result, note) => setQcResult(modal.workOrder, result, note)} /> : null}
      {modal?.type === 'cancel' ? <ConfirmActionModal title={`Batalkan ${modal.workOrder.code}?`} description="Work Order hanya boleh dibatalkan selama masih Draft. Tindakan ini akan dicatat pada riwayat dan tidak dapat dipulihkan dari frontend ini." confirmLabel="Batalkan Work Order" tone="danger" onClose={() => setModal(null)} onConfirm={() => cancelWorkOrder(modal.workOrder)} /> : null}
      {modal?.type === 'close' ? <ConfirmActionModal title={`Tutup ${modal.workOrder.code}?`} description="Work Order akan dipindahkan ke arsip. Pada tahap backend, tindakan ini harus memperbarui inventori dalam transaksi yang sama." confirmLabel="Tutup Work Order" onClose={() => setModal(null)} onConfirm={() => closeWorkOrder(modal.workOrder)} /> : null}
    </div>
  )
}

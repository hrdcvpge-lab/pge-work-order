import { useMemo, type ReactNode } from 'react'
import type { StaffDirectoryMember, TeamMember, WorkOrder, WorkOrderStatus } from '../../types/workOrder'
import { getWorkOrderCurrentAction, type WorkOrderCurrentAction } from '../../utils/workOrderActions'
import {
  deriveStepStatus,
  formatDate,
  formatNumber,
  getApprovedPrimaryArtwork,
  getArtworkReadiness,
  getBlockerSummary,
  getCurrentProcess,
  getProgress,
  isOverdue,
  priorityLabels,
  stationLabels,
  statusLabels,
  typeLabels,
} from '../../utils/workOrder'
import { Icon } from '../Icon'

type WorkOrderKanbanBoardProps = {
  workOrders: WorkOrder[]
  currentUser: TeamMember
  staffDirectory: StaffDirectoryMember[]
  canMoveStatus: boolean
  onMoveStatus: (workOrder: WorkOrder, targetStatus: WorkOrderStatus) => Promise<boolean>
  onOpenOrder: (workOrder: WorkOrder) => void
  onOpenAction: (workOrder: WorkOrder, action: WorkOrderCurrentAction) => void
}

type KanbanColumn = {
  id: WorkOrderStatus
  title: string
  note: string
}

type GroupedKanbanColumn = KanbanColumn & {
  orders: WorkOrder[]
  plannedQty: number
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'draft', title: statusLabels.draft, note: 'Belum masuk lantai produksi' },
  { id: 'scheduled', title: statusLabels.scheduled, note: 'Sudah dijadwalkan PPIC' },
  { id: 'in_progress', title: statusLabels.in_progress, note: 'Sedang diproses' },
  { id: 'qc', title: statusLabels.qc, note: 'Menunggu / proses QC' },
  { id: 'packing', title: 'Packing / Gudang', note: 'Finalisasi akhir' },
  { id: 'done', title: statusLabels.done, note: 'Menunggu close PPIC' },
]

const TERMINAL_STATUSES: WorkOrderStatus[] = ['done', 'closed', 'cancelled']

function getDirectoryName(id: string | undefined, directory: StaffDirectoryMember[]) {
  if (!id) return 'Belum ditetapkan'
  return directory.find((member) => member.id === id)?.name || 'Belum ditetapkan'
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'WO'
}

function getCurrentPicName(workOrder: WorkOrder, directory: StaffDirectoryMember[]) {
  const activeStep = workOrder.steps.find((step) => deriveStepStatus(workOrder, step) === 'in_progress')
  const currentStep = activeStep || getCurrentProcess(workOrder) || workOrder.steps.find((step) => step.assignedUserId)
  return getDirectoryName(currentStep?.assignedUserId, directory)
}

function getCompletedStepCount(workOrder: WorkOrder) {
  return workOrder.steps.filter((step) => deriveStepStatus(workOrder, step) === 'completed').length
}

function getCardBlocker(workOrder: WorkOrder) {
  const holdStep = workOrder.steps.find((step) => deriveStepStatus(workOrder, step) === 'hold')
  if (holdStep?.holdReason) return holdStep.holdReason
  return getBlockerSummary(workOrder)
}

function getVisibleArtwork(workOrder: WorkOrder) {
  return getApprovedPrimaryArtwork(workOrder) || workOrder.referenceImages?.find((image) => image.isPrimary) || workOrder.referenceImages?.[0]
}

function needsStatusReview(workOrder: WorkOrder) {
  const progress = getProgress(workOrder)
  return progress >= 100 && !TERMINAL_STATUSES.includes(workOrder.status)
}

type DocketContentProps = {
  workOrder: WorkOrder
  currentUser: TeamMember
  staffDirectory: StaffDirectoryMember[]
  actionSlot?: ReactNode
}

function DocketContent({ workOrder, currentUser, staffDirectory, actionSlot }: DocketContentProps) {
  const status = workOrder.status
  const currentStep = getCurrentProcess(workOrder)
  const progress = getProgress(workOrder)
  const artwork = getVisibleArtwork(workOrder)
  const artworkReadiness = getArtworkReadiness(workOrder)
  const blocker = getCardBlocker(workOrder)
  const overdue = isOverdue(workOrder)
  const completedSteps = getCompletedStepCount(workOrder)
  const totalSteps = Math.max(1, workOrder.steps.length)
  const picName = getCurrentPicName(workOrder, staffDirectory)
  const currentAction = getWorkOrderCurrentAction(workOrder, currentUser.role)
  const reviewNeeded = needsStatusReview(workOrder)
  const isClosed = status === 'closed'

  return (
    <>
      <span className="ka-docket__priority-strip" aria-hidden="true" />
      <div className="ka-docket__top">
        <div className="ka-docket__identity">
          <strong className="ka-docket__code">{workOrder.code}</strong>
          <h3>{workOrder.product}</h3>
          <p>{typeLabels[workOrder.type]} · {formatNumber(workOrder.qty)} unit</p>
        </div>
        {artwork ? (
          <img className="ka-docket__thumb" src={artwork.dataUrl} alt={`Artwork ${workOrder.code}`} />
        ) : (
          <div className="ka-docket__fallback-thumb" aria-hidden="true">{getInitials(workOrder.product)}</div>
        )}
      </div>

      <div className="ka-docket__meta-line">
        <span className={`ka-pill ka-pill--${workOrder.type}`}>{typeLabels[workOrder.type]}</span>
        <span className={`ka-pill ka-pill--${workOrder.priority}`}>{priorityLabels[workOrder.priority]}</span>
        {reviewNeeded ? <span className="ka-pill ka-pill--review">Perlu review status</span> : null}
      </div>

      <div className="ka-docket__perforation" />

      <div className="ka-docket__bottom">
        <div className="ka-docket__due">
          <Icon name="clock" />
          <span>Due {formatDate(workOrder.dueDate)}</span>
          {overdue && !isClosed ? <b>Terlambat</b> : null}
        </div>

        {isClosed ? (
          <div className="ka-docket__closed-note"><Icon name="check" /> <span>Ditutup · data produksi terkunci</span></div>
        ) : blocker ? (
          <div className="ka-docket__blocked-note"><Icon name="pause" /> <span>{blocker}</span></div>
        ) : (
          <div className="ka-docket__pic-line">
            <span>{currentStep ? stationLabels[currentStep.station] : statusLabels[status]}</span>
            <b>PIC: {picName}</b>
          </div>
        )}

        {workOrder.artworkApprovalRequired && !artworkReadiness.ready ? (
          <div className="ka-docket__artwork-warning"><Icon name="warning" /> {artworkReadiness.reason}</div>
        ) : null}

        {!isClosed ? (
          <div className="ka-segments" aria-label={`${completedSteps} dari ${totalSteps} proses selesai`}>
            {workOrder.steps.map((step) => <span key={step.id} className={deriveStepStatus(workOrder, step) === 'completed' ? 'is-done' : ''} />)}
          </div>
        ) : null}

        <div className="ka-docket__footer">
          <span>
            {isClosed
              ? `${formatNumber(workOrder.qty)} unit · ${statusLabels.closed}`
              : `${formatNumber(completedSteps)}/${formatNumber(totalSteps)} proses · ${progress}%`}
          </span>
          {actionSlot || <span>{currentAction.title}</span>}
        </div>
      </div>
    </>
  )
}

type DocketProps = {
  workOrder: WorkOrder
  currentUser: TeamMember
  staffDirectory: StaffDirectoryMember[]
  onOpenOrder: (workOrder: WorkOrder) => void
  onOpenAction: (workOrder: WorkOrder, action: WorkOrderCurrentAction) => void
}

function Docket({ workOrder, currentUser, staffDirectory, onOpenOrder, onOpenAction }: DocketProps) {
  const blocker = getCardBlocker(workOrder)
  const overdue = isOverdue(workOrder)
  const currentAction = getWorkOrderCurrentAction(workOrder, currentUser.role)
  const reviewNeeded = needsStatusReview(workOrder)

  const handlePrimaryAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (currentAction.opensModal && currentAction.kind !== 'close_order') {
      onOpenAction(workOrder, currentAction)
      return
    }
    onOpenOrder(workOrder)
  }

  const actionLabel = reviewNeeded ? 'Review WO' : 'Buka detail'
  const actionSeverity = reviewNeeded ? 'warning' : 'neutral'

  return (
    <article
      className={`ka-docket ka-docket--readonly ka-docket--${workOrder.priority}${overdue ? ' ka-docket--overdue' : ''}${blocker ? ' ka-docket--blocked' : ''}${reviewNeeded ? ' ka-docket--review' : ''}`}
      onClick={() => onOpenOrder(workOrder)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenOrder(workOrder)
        }
      }}
      aria-label={`${workOrder.code} ${workOrder.product}`}
    >
      <DocketContent
        workOrder={workOrder}
        currentUser={currentUser}
        staffDirectory={staffDirectory}
        actionSlot={(
          <button
            className={`ka-docket__action ka-docket__action--${actionSeverity}`}
            type="button"
            onClick={handlePrimaryAction}
            title={reviewNeeded ? 'Output terlihat penuh, tetapi status WO belum terminal. Review dari detail WO.' : 'Buka detail WO'}
          >
            {actionLabel}
          </button>
        )}
      />
    </article>
  )
}

type KanbanColumnViewProps = {
  column: GroupedKanbanColumn
  currentUser: TeamMember
  staffDirectory: StaffDirectoryMember[]
  onOpenOrder: (workOrder: WorkOrder) => void
  onOpenAction: (workOrder: WorkOrder, action: WorkOrderCurrentAction) => void
}

function KanbanColumnView({ column, currentUser, staffDirectory, onOpenOrder, onOpenAction }: KanbanColumnViewProps) {
  return (
    <section
      className={`ka-column${column.orders.length ? '' : ' ka-column--empty-state'}`}
      key={column.id}
      aria-labelledby={`ka-column-${column.id}`}
    >
      <header className="ka-column__header">
        <div>
          <h4 id={`ka-column-${column.id}`}>{column.title}</h4>
          <span>{column.note}</span>
          <small>{formatNumber(column.orders.length)} WO · {formatNumber(column.plannedQty)} unit</small>
        </div>
        <strong>{formatNumber(column.orders.length)}</strong>
      </header>

      <div className="ka-column__cards">
        {column.orders.length ? column.orders.map((order) => (
          <Docket
            key={order.id}
            workOrder={order}
            currentUser={currentUser}
            staffDirectory={staffDirectory}
            onOpenOrder={onOpenOrder}
            onOpenAction={onOpenAction}
          />
        )) : <div className="ka-column__empty">Tidak ada WO.</div>}
      </div>
    </section>
  )
}

export function WorkOrderKanbanBoard({ workOrders, currentUser, staffDirectory, canMoveStatus, onOpenOrder, onOpenAction }: WorkOrderKanbanBoardProps) {
  const boardWorkOrders = useMemo(
    () => workOrders.filter((order) => order.status !== 'closed' && order.status !== 'cancelled'),
    [workOrders],
  )

  const grouped = useMemo(() => KANBAN_COLUMNS.map((column) => {
    const orders = boardWorkOrders.filter((order) => order.status === column.id)
    const plannedQty = orders.reduce((sum, order) => sum + order.qty, 0)
    return { ...column, orders, plannedQty }
  }), [boardWorkOrders])

  const hiddenClosedCount = useMemo(() => workOrders.filter((order) => order.status === 'closed').length, [workOrders])
  const hiddenCancelledCount = useMemo(() => workOrders.filter((order) => order.status === 'cancelled').length, [workOrders])
  const reviewCount = useMemo(() => boardWorkOrders.filter(needsStatusReview).length, [boardWorkOrders])

  return (
    <section className="ka-board-shell ka-board-shell--readonly" aria-label="Papan Work Order Kartu Antrian">
      <div className="ka-readonly-banner">
        <Icon name="warning" />
        <div>
          <strong>Papan Monitoring hanya untuk melihat posisi WO.</strong>
          <span> Drag status dinonaktifkan karena eksekusi resmi tetap melalui detail/modal WO. {canMoveStatus ? 'Admin/PPIC tetap bisa membuka detail untuk koreksi status.' : 'Role ini hanya dapat melihat papan.'}</span>
        </div>
      </div>

      <div className="ka-board-shell__legend ka-board-shell__legend--compact" aria-label="Keterangan status kartu">
        <span><i className="ka-legend-dot ka-legend-dot--p1" /> P1</span>
        <span><i className="ka-legend-dot ka-legend-dot--hold" /> HOLD</span>
        <span><i className="ka-legend-dot ka-legend-dot--late" /> Terlambat</span>
        {reviewCount ? <span><i className="ka-legend-dot ka-legend-dot--review" /> {formatNumber(reviewCount)} perlu review</span> : null}
      </div>

      <div className="ka-board">
        {grouped.map((column) => (
          <KanbanColumnView
            key={column.id}
            column={column}
            currentUser={currentUser}
            staffDirectory={staffDirectory}
            onOpenOrder={onOpenOrder}
            onOpenAction={onOpenAction}
          />
        ))}
      </div>

      {(hiddenClosedCount || hiddenCancelledCount) ? (
        <div className="ka-hidden-history-note">
          <Icon name="archive" />
          <span>
            {hiddenClosedCount ? `${formatNumber(hiddenClosedCount)} WO ditutup` : null}
            {hiddenClosedCount && hiddenCancelledCount ? ' · ' : null}
            {hiddenCancelledCount ? `${formatNumber(hiddenCancelledCount)} WO dibatalkan` : null}
            {' '}tidak ditampilkan di papan monitoring. Gunakan tab Ditutup atau Laporan untuk histori.
          </span>
        </div>
      ) : null}
    </section>
  )
}

import { useState } from 'react'
import type { StaffDirectoryMember, TeamMember, WorkOrder, WorkOrderStatus } from '../../types/workOrder'
import {
  deriveOrderStatus,
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
  processLabels,
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
}

type KanbanColumn = {
  id: WorkOrderStatus
  title: string
  note: string
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'draft', title: statusLabels.draft, note: 'Belum masuk lantai produksi' },
  { id: 'scheduled', title: statusLabels.scheduled, note: 'Sudah dijadwalkan PPIC' },
  { id: 'in_progress', title: statusLabels.in_progress, note: 'Sedang diproses' },
  { id: 'qc', title: statusLabels.qc, note: 'Menunggu / proses QC' },
  { id: 'packing', title: 'Packing / Gudang', note: 'Finalisasi akhir' },
  { id: 'done', title: statusLabels.done, note: 'Menunggu close PPIC' },
  { id: 'closed', title: statusLabels.closed, note: 'Sudah ditutup' },
]

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

function isTargetPastArtworkGate(targetStatus: WorkOrderStatus) {
  return ['in_progress', 'qc', 'packing', 'done'].includes(targetStatus)
}

type WorkOrderKanbanCardProps = {
  workOrder: WorkOrder
  currentUser: TeamMember
  staffDirectory: StaffDirectoryMember[]
  canMoveStatus: boolean
  isDragging: boolean
  isMoving: boolean
  isStamped: boolean
  onDragStart: (workOrder: WorkOrder) => void
  onDragEnd: () => void
  onOpenOrder: (workOrder: WorkOrder) => void
}

function WorkOrderKanbanCard({
  workOrder,
  currentUser,
  staffDirectory,
  canMoveStatus,
  isDragging,
  isMoving,
  isStamped,
  onDragStart,
  onDragEnd,
  onOpenOrder,
}: WorkOrderKanbanCardProps) {
  const status = deriveOrderStatus(workOrder)
  const currentStep = getCurrentProcess(workOrder)
  const currentStepStatus = currentStep ? deriveStepStatus(workOrder, currentStep) : undefined
  const progress = getProgress(workOrder)
  const artwork = getVisibleArtwork(workOrder)
  const artworkReadiness = getArtworkReadiness(workOrder)
  const blocker = getCardBlocker(workOrder)
  const overdue = isOverdue(workOrder)
  const completedSteps = getCompletedStepCount(workOrder)
  const totalSteps = Math.max(1, workOrder.steps.length)
  const picName = getCurrentPicName(workOrder, staffDirectory)
  const isFloorRole = !['admin', 'ppic', 'manager'].includes(currentUser.role)
  const assignedCurrentStep = currentStep?.assignedUserId === currentUser.id
  const canFinishOwnStep = isFloorRole && assignedCurrentStep && ['ready', 'in_progress', 'partial_paused'].includes(currentStepStatus || 'not_ready')
  const dragEnabled = canMoveStatus && status !== 'closed' && !isMoving

  return (
    <article
      className={`ka-docket ka-docket--${workOrder.priority}${overdue ? ' ka-docket--overdue' : ''}${blocker ? ' ka-docket--blocked' : ''}${isDragging ? ' ka-docket--dragging' : ''}${isMoving ? ' ka-docket--moving' : ''}${isStamped ? ' ka-docket--stamped' : ''}`}
      draggable={dragEnabled}
      onDragStart={(event) => {
        if (!dragEnabled) return
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', workOrder.id)
        onDragStart(workOrder)
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpenOrder(workOrder)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenOrder(workOrder)
        }
      }}
      aria-label={`${workOrder.code} ${workOrder.product}`}
    >
      <span className="ka-docket__priority-strip" aria-hidden="true" />
      <span className="ka-docket__stamp" aria-hidden="true">PINDAH</span>
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
        {dragEnabled ? <span className="ka-pill ka-pill--drag">Drag</span> : null}
      </div>

      <div className="ka-docket__perforation" />

      <div className="ka-docket__bottom">
        <div className="ka-docket__due">
          <Icon name="clock" />
          <span>Due {formatDate(workOrder.dueDate)}</span>
          {overdue ? <b>Terlambat</b> : null}
        </div>

        {blocker ? (
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

        <div className="ka-segments" aria-label={`${completedSteps} dari ${totalSteps} proses selesai`}>
          {workOrder.steps.map((step) => <span key={step.id} className={deriveStepStatus(workOrder, step) === 'completed' ? 'is-done' : ''} />)}
        </div>

        <div className="ka-docket__footer">
          <span>{formatNumber(completedSteps)}/{formatNumber(totalSteps)} proses · {progress}%</span>
          {canFinishOwnStep ? <button type="button" onClick={(event) => event.stopPropagation()}>Selesai</button> : <span>{currentStepStatus ? processLabels[currentStepStatus] : statusLabels[status]}</span>}
        </div>
      </div>
    </article>
  )
}

export function WorkOrderKanbanBoard({ workOrders, currentUser, staffDirectory, canMoveStatus, onMoveStatus, onOpenOrder }: WorkOrderKanbanBoardProps) {
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null)
  const [movingOrderId, setMovingOrderId] = useState<string | null>(null)
  const [stampedOrderId, setStampedOrderId] = useState<string | null>(null)
  const [dropTargetStatus, setDropTargetStatus] = useState<WorkOrderStatus | null>(null)
  const [dropError, setDropError] = useState('')

  const grouped = KANBAN_COLUMNS.map((column) => {
    const orders = workOrders.filter((order) => deriveOrderStatus(order) === column.id)
    const plannedQty = orders.reduce((sum, order) => sum + order.qty, 0)
    return { ...column, orders, plannedQty }
  })

  const cancelledOrders = workOrders.filter((order) => deriveOrderStatus(order) === 'cancelled')
  const draggedOrder = draggedOrderId ? workOrders.find((order) => order.id === draggedOrderId) : undefined

  const rejectDrop = (message: string, targetStatus: WorkOrderStatus) => {
    setDropError(message)
    setDropTargetStatus(targetStatus)
    window.setTimeout(() => {
      setDropError('')
      setDropTargetStatus(null)
    }, 2_800)
  }

  const handleDrop = async (targetStatus: WorkOrderStatus) => {
    setDropTargetStatus(null)
    if (!draggedOrder) return

    const sourceStatus = deriveOrderStatus(draggedOrder)
    if (sourceStatus === targetStatus) return

    if (!canMoveStatus) {
      rejectDrop('Role ini hanya bisa melihat papan. Perpindahan bebas hanya untuk Admin, PPIC, atau Manager.', targetStatus)
      return
    }

    if (targetStatus === 'closed') {
      rejectDrop('Close WO tetap memakai tombol Close WO, bukan drag kanban.', targetStatus)
      return
    }

    const artworkReadiness = getArtworkReadiness(draggedOrder)
    if (draggedOrder.artworkApprovalRequired && !artworkReadiness.ready && isTargetPastArtworkGate(targetStatus)) {
      rejectDrop(artworkReadiness.reason || 'Artwork belum siap untuk melewati tahap awal.', targetStatus)
      return
    }

    setMovingOrderId(draggedOrder.id)
    const moved = await onMoveStatus(draggedOrder, targetStatus)
    setMovingOrderId(null)

    if (moved) {
      setStampedOrderId(draggedOrder.id)
      window.setTimeout(() => setStampedOrderId(null), 900)
    }
  }

  return (
    <section className="ka-board-shell" aria-label="Papan Work Order Kartu Antrian">
      <header className="ka-board-shell__header">
        <div>
          <p className="eyebrow">Coba tampilan baru</p>
          <h3>Papan Kartu Antrian</h3>
          <span>{canMoveStatus ? 'Admin / PPIC / Manager dapat drag kartu untuk koreksi status. Close WO tetap lewat tombol Close WO.' : 'Mode baca: role produksi menyelesaikan proses lewat tiket masing-masing.'}</span>
        </div>
        <div className="ka-board-shell__legend" aria-label="Keterangan status kartu">
          <span><i className="ka-legend-dot ka-legend-dot--p1" /> P1</span>
          <span><i className="ka-legend-dot ka-legend-dot--hold" /> HOLD</span>
          <span><i className="ka-legend-dot ka-legend-dot--late" /> Terlambat</span>
        </div>
      </header>

      {dropError ? <div className="ka-drop-error"><Icon name="warning" /> {dropError}</div> : null}

      <div className="ka-board">
        {grouped.map((column) => (
          <section
            className={`ka-column${dropTargetStatus === column.id ? ' ka-column--drop-error' : ''}${draggedOrderId && canMoveStatus ? ' ka-column--droppable' : ''}`}
            key={column.id}
            aria-labelledby={`ka-column-${column.id}`}
            onDragOver={(event) => {
              if (!draggedOrderId || !canMoveStatus) return
              event.preventDefault()
              event.dataTransfer.dropEffect = column.id === 'closed' ? 'none' : 'move'
              setDropTargetStatus(column.id)
            }}
            onDragLeave={() => setDropTargetStatus((current) => current === column.id ? null : current)}
            onDrop={(event) => {
              event.preventDefault()
              void handleDrop(column.id)
            }}
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
                <WorkOrderKanbanCard
                  key={order.id}
                  workOrder={order}
                  currentUser={currentUser}
                  staffDirectory={staffDirectory}
                  canMoveStatus={canMoveStatus}
                  isDragging={draggedOrderId === order.id}
                  isMoving={movingOrderId === order.id}
                  isStamped={stampedOrderId === order.id}
                  onDragStart={(nextOrder) => setDraggedOrderId(nextOrder.id)}
                  onDragEnd={() => {
                    setDraggedOrderId(null)
                    setDropTargetStatus(null)
                  }}
                  onOpenOrder={onOpenOrder}
                />
              )) : <div className="ka-column__empty">Tidak ada WO.</div>}
            </div>
          </section>
        ))}
      </div>

      {cancelledOrders.length ? (
        <details className="ka-cancelled-lane">
          <summary>{formatNumber(cancelledOrders.length)} WO dibatalkan</summary>
          <div>
            {cancelledOrders.map((order) => <button type="button" key={order.id} onClick={() => onOpenOrder(order)}>{order.code} · {order.product}</button>)}
          </div>
        </details>
      ) : null}
    </section>
  )
}

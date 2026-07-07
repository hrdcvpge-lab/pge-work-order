import type { Role, WorkOrder } from '../types/workOrder'
import { formatDate, isOverdue, priorityLabels } from '../utils/workOrder'
import { Icon } from './Icon'

interface WorkOrderCardProps {
  workOrder: WorkOrder
  currentRole: Role
  currentUserId: string
  onOpen: (workOrder: WorkOrder) => void
  onAction: (type: string, workOrder: WorkOrder) => void
}

function getPrimaryAction(workOrder: WorkOrder, role: Role, currentUserId: string) {
  if (role === 'admin' && workOrder.status === 'draft') return { label: 'Batalkan WO', type: 'cancel', icon: 'x' as const }
  if (role === 'ppic' && workOrder.status === 'draft') return { label: 'Jadwalkan', type: 'schedule', icon: 'calendar' as const }
  if (role === 'operator' && workOrder.status === 'scheduled' && workOrder.operatorId === currentUserId) return { label: 'Mulai kerja', type: 'start', icon: 'play' as const }
  if (role === 'operator' && workOrder.status === 'in_progress' && workOrder.operatorId === currentUserId) return { label: 'Kirim ke QC', type: 'submitQc', icon: 'arrowRight' as const }
  if (role === 'qc' && workOrder.status === 'qc') return { label: 'Periksa QC', type: 'qcResult', icon: 'check' as const }
  if (role === 'admin' && workOrder.status === 'done') return { label: 'Tutup WO', type: 'close', icon: 'check' as const }
  return null
}

export function WorkOrderCard({ workOrder, currentRole, currentUserId, onOpen, onAction }: WorkOrderCardProps) {
  const action = getPrimaryAction(workOrder, currentRole, currentUserId)
  const overdue = isOverdue(workOrder)

  return (
    <article className={`wo-card ${overdue ? 'wo-card--overdue' : ''}`}>
      <button className="wo-card__body" onClick={() => onOpen(workOrder)}>
        <div className="wo-card__topline">
          <span className={`priority-chip priority-chip--${workOrder.priority}`}>{priorityLabels[workOrder.priority]}</span>
          {overdue ? <span className="overdue-flag"><Icon name="alert" />Lewat jatuh tempo</span> : null}
        </div>
        <p className="wo-code">{workOrder.code}</p>
        <h3>{workOrder.product}</h3>
        <div className="wo-card__qty-row">
          <span><Icon name="box" /> {workOrder.qty.toLocaleString('id-ID')} pcs</span>
          {workOrder.reworkCount > 0 ? <span className="rework-pill">Rework {workOrder.reworkCount}×</span> : null}
        </div>
        <dl className="wo-card__meta">
          <div><dt><Icon name="calendar" /> Jatuh tempo</dt><dd>{formatDate(workOrder.dueDate)}</dd></div>
          {workOrder.operatorName ? <div><dt><Icon name="user" /> Operator</dt><dd>{workOrder.operatorName.split(' – ')[0]}</dd></div> : null}
          {workOrder.machine ? <div><dt><Icon name="machine" /> Mesin / area</dt><dd>{workOrder.machine}</dd></div> : null}
        </dl>
      </button>

      {action ? (
        <button className="wo-card__action" onClick={() => onAction(action.type, workOrder)}>
          <Icon name={action.icon} />
          {action.label}
        </button>
      ) : null}
    </article>
  )
}

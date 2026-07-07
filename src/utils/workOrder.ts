import type { Priority, Role, WorkOrder, WorkOrderStatus } from '../types/workOrder'

export const boardColumns: Array<{
  status: WorkOrderStatus
  title: string
  subtitle: string
}> = [
  { status: 'draft', title: 'Draft', subtitle: 'Menunggu perencanaan PPIC' },
  { status: 'scheduled', title: 'Terjadwal', subtitle: 'Siap dimulai operator' },
  { status: 'in_progress', title: 'Dikerjakan', subtitle: 'Produksi sedang berjalan' },
  { status: 'qc', title: 'Pemeriksaan QC', subtitle: 'Menunggu keputusan QC' },
  { status: 'done', title: 'Selesai', subtitle: 'Lolos QC, siap ditutup' },
  { status: 'closed', title: 'Ditutup', subtitle: 'Arsip dan stok diperbarui' },
]

export const roleLabels: Record<Role, string> = {
  admin: 'Admin',
  ppic: 'PPIC / Planner',
  operator: 'Operator',
  qc: 'QC',
  manager: 'Manager',
}

export const priorityLabels: Record<Priority, string> = {
  normal: 'Normal',
  high: 'Tinggi',
  urgent: 'Mendesak',
}

export const statusLabels: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  in_progress: 'Dikerjakan',
  qc: 'Pemeriksaan QC',
  done: 'Selesai',
  closed: 'Ditutup',
  cancelled: 'Dibatalkan',
}

export function getAvailableAction(
  workOrder: WorkOrder,
  role: Role,
): string | null {
  if (role === 'admin' && workOrder.status === 'draft') return 'cancel'
  if (role === 'admin' && workOrder.status === 'done') return 'close'
  if (role === 'ppic' && workOrder.status === 'draft') return 'schedule'
  if (role === 'operator' && workOrder.status === 'scheduled') return 'start'
  if (role === 'operator' && workOrder.status === 'in_progress') return 'submitQc'
  if (role === 'qc' && workOrder.status === 'qc') return 'qcResult'

  return null
}

export function formatDate(value?: string) {
  if (!value) return '–'

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function isOverdue(workOrder: WorkOrder) {
  if (['done', 'closed', 'cancelled'].includes(workOrder.status)) {
    return false
  }

  const dueDate = new Date(`${workOrder.dueDate}T23:59:59`)
  const referenceDate = new Date('2026-07-07T08:00:00')

  return dueDate < referenceDate
}

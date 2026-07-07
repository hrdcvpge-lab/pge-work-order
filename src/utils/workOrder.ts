import type { ArtworkApprovalStatus, Priority, ProcessStatus, ProcessStep, Role, Station, WorkOrder, WorkOrderReferenceImage, WorkOrderStatus, WorkOrderType } from '../types/workOrder'


export const artworkApprovalLabels: Record<ArtworkApprovalStatus, string> = {
  pending: 'Menunggu persetujuan',
  approved: 'Disetujui untuk cetak',
  superseded: 'Versi lama / diganti',
}

export const getPrimaryArtwork = (workOrder: WorkOrder): WorkOrderReferenceImage | undefined =>
  (workOrder.referenceImages || []).find((image) => image.isPrimary)

export const getApprovedPrimaryArtwork = (workOrder: WorkOrder): WorkOrderReferenceImage | undefined =>
  (workOrder.referenceImages || []).find((image) => image.isPrimary && image.approvalStatus === 'approved')

export const hasPrintingStep = (workOrder: WorkOrder) =>
  workOrder.steps.some((step) => step.station === 'printing')

export const getArtworkReadiness = (workOrder: WorkOrder) => {
  if (!hasPrintingStep(workOrder)) return { ready: true, reason: '' }

  // Artwork is optional by default. Admin / PPIC may enable this control only
  // for WOs where the motif, artwork version, or print instruction must be verified.
  if (!workOrder.artworkApprovalRequired) return { ready: true, reason: '' }

  const images = workOrder.referenceImages || []
  if (!images.length) return { ready: false, reason: 'WO ini mewajibkan artwork, tetapi belum ada gambar motif untuk proses Printing.' }
  const primary = getPrimaryArtwork(workOrder)
  if (!primary) return { ready: false, reason: 'WO ini mewajibkan FINAL PRINT FILE, tetapi belum ada file utama yang dipilih.' }
  if (primary.approvalStatus !== 'approved') return { ready: false, reason: 'FINAL PRINT FILE belum disetujui untuk cetak.' }
  return { ready: true, reason: '' }
}

export const roleLabels: Record<Role, string> = {
  admin: 'Admin Operasional',
  ppic: 'PPIC / Planner',
  operator: 'Operator Produksi',
  qc: 'QC',
  packing: 'Packing',
  manager: 'Manager',
}

export const stationLabels: Record<Station, string> = {
  printing: 'Printing',
  cutting: 'Cutting',
  sewing: 'Sewing / Assembly',
  finishing: 'Finishing',
  qc: 'QC',
  packing: 'Packing',
  warehouse: 'Warehouse',
}

export const priorityLabels: Record<Priority, string> = {
  p1: 'P1 · Sangat mendesak',
  p2: 'P2 · Mendesak',
  p3: 'P3 · Normal',
  p4: 'P4 · Rendah',
}

export const typeLabels: Record<WorkOrderType, string> = {
  mto: 'MTO · Pesanan customer',
  mts: 'MTS · Buat stok',
}

export const statusLabels: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  in_progress: 'Produksi',
  qc: 'QC',
  packing: 'Packing',
  done: 'Selesai',
  closed: 'Ditutup',
  cancelled: 'Dibatalkan',
}

export const processLabels: Record<ProcessStatus, string> = {
  not_ready: 'Belum siap',
  ready: 'Siap dikerjakan',
  in_progress: 'Sedang dikerjakan',
  waiting_wip: 'Menunggu WIP',
  hold: 'HOLD',
  completed: 'Selesai',
}

export const formatNumber = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0)

export const formatDate = (value?: string) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

export const formatDateTime = (value?: string) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remainder = safe % 60
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':')
}

export const getStepRecordedQty = (step: ProcessStep) => step.qtyGood + step.qtyRework + step.qtyReject

export const getStepTimerSeconds = (step: ProcessStep, clock = Date.now()) => {
  if (!step.startedAt) return step.activeSeconds
  const started = new Date(step.startedAt).getTime()
  return step.activeSeconds + Math.max(0, Math.floor((clock - started) / 1000))
}

export const isFinalStep = (step: ProcessStep) => step.station === 'packing'

export const getWipBalance = (workOrder: WorkOrder, wipName: string) => {
  const produced = workOrder.steps
    .filter((step) => step.output === wipName)
    .reduce((total, step) => total + step.qtyGood, 0)

  const used = workOrder.steps
    .filter((step) => step.inputs.includes(wipName))
    .reduce((total, step) => total + getStepRecordedQty(step), 0)

  return Math.max(0, produced - used)
}

export const getAvailableInputCap = (workOrder: WorkOrder, step: ProcessStep) => {
  if (!step.inputs.length) return Number.POSITIVE_INFINITY
  return Math.min(...step.inputs.map((input) => getWipBalance(workOrder, input)))
}

export const getStepRemaining = (step: ProcessStep) => Math.max(0, step.plannedQty - getStepRecordedQty(step))

export const deriveStepStatus = (workOrder: WorkOrder, step: ProcessStep): ProcessStatus => {
  if (['draft', 'closed', 'cancelled'].includes(workOrder.status)) return 'not_ready'
  if (step.holdReason) return 'hold'
  if (getStepRecordedQty(step) >= step.plannedQty) return 'completed'
  if (step.status === 'in_progress') return 'in_progress'

  const inputCap = getAvailableInputCap(workOrder, step)
  if (inputCap === 0) return step.inputs.length ? 'waiting_wip' : 'ready'
  return 'ready'
}

export const getCurrentProcess = (workOrder: WorkOrder) => {
  const running = workOrder.steps.find((step) => deriveStepStatus(workOrder, step) === 'in_progress')
  if (running) return running
  const ready = workOrder.steps.find((step) => ['ready', 'waiting_wip'].includes(deriveStepStatus(workOrder, step)))
  return ready
}

export const deriveOrderStatus = (workOrder: WorkOrder): WorkOrderStatus => {
  if (['draft', 'closed', 'cancelled'].includes(workOrder.status)) return workOrder.status

  const packed = workOrder.steps
    .filter((step) => step.station === 'packing')
    .reduce((total, step) => total + step.qtyGood + step.qtyReject, 0)

  if (packed >= workOrder.qty) return 'done'

  const current = getCurrentProcess(workOrder)
  if (current?.station === 'qc') return 'qc'
  if (current?.station === 'packing') return 'packing'
  if (workOrder.steps.some((step) => deriveStepStatus(workOrder, step) === 'in_progress')) return 'in_progress'

  return 'scheduled'
}

export const getProgress = (workOrder: WorkOrder) => {
  const packed = workOrder.steps
    .filter((step) => step.station === 'packing')
    .reduce((total, step) => total + step.qtyGood + step.qtyReject, 0)
  return Math.min(100, Math.round((packed / Math.max(1, workOrder.qty)) * 100))
}

export const isOverdue = (workOrder: WorkOrder) => {
  const status = deriveOrderStatus(workOrder)
  if (['done', 'closed', 'cancelled'].includes(status)) return false
  const deadline = new Date(`${workOrder.dueDate}T23:59:59`)
  return deadline < new Date()
}

export const getBlockerSummary = (workOrder: WorkOrder) => {
  const holds = workOrder.steps.filter((step) => deriveStepStatus(workOrder, step) === 'hold')
  if (holds.length) return `HOLD · ${holds[0].name}`

  const waiting = workOrder.steps.filter((step) => deriveStepStatus(workOrder, step) === 'waiting_wip')
  if (waiting.length) return `Menunggu WIP · ${waiting[0].name}`

  return ''
}

export const getOrderActiveSeconds = (workOrder: WorkOrder, clock = Date.now()) =>
  workOrder.steps.reduce((total, step) => total + getStepTimerSeconds(step, clock), 0)

export const sortWorkOrders = (a: WorkOrder, b: WorkOrder) => {
  const priorityScore: Record<Priority, number> = { p1: 1, p2: 2, p3: 3, p4: 4 }
  const statusA = deriveOrderStatus(a)
  const statusB = deriveOrderStatus(b)
  const holdA = getBlockerSummary(a).startsWith('HOLD') ? 0 : 1
  const holdB = getBlockerSummary(b).startsWith('HOLD') ? 0 : 1
  const mtoA = a.type === 'mto' ? 0 : 1
  const mtoB = b.type === 'mto' ? 0 : 1

  return (
    holdA - holdB ||
    Number(isOverdue(b)) - Number(isOverdue(a)) ||
    mtoA - mtoB ||
    priorityScore[a.priority] - priorityScore[b.priority] ||
    a.dueDate.localeCompare(b.dueDate) ||
    statusA.localeCompare(statusB)
  )
}

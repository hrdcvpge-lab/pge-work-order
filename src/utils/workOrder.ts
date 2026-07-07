import type {
  ArtworkApprovalStatus,
  Priority,
  ProcessStatus,
  ProcessStep,
  Role,
  ShortfallStatus,
  Station,
  WorkOrder,
  WorkOrderReferenceImage,
  WorkOrderStatus,
  WorkOrderType,
} from '../types/workOrder'

export const artworkApprovalLabels: Record<ArtworkApprovalStatus, string> = {
  pending: 'Menunggu persetujuan',
  approved: 'Disetujui untuk cetak',
  superseded: 'Versi lama / diganti',
}

export const shortfallStatusLabels: Record<ShortfallStatus, string> = {
  action_required: 'Butuh keputusan',
  replacement_planned: 'Penggantian direncanakan',
  approved_short_shipment: 'Kirim kurang disetujui',
  cancelled_remaining: 'Sisa dibatalkan',
  resolved: 'Terpenuhi',
}

export const getPrimaryArtwork = (workOrder: WorkOrder): WorkOrderReferenceImage | undefined =>
  (workOrder.referenceImages || []).find((image) => image.isPrimary)

export const getApprovedPrimaryArtwork = (workOrder: WorkOrder): WorkOrderReferenceImage | undefined =>
  (workOrder.referenceImages || []).find((image) => image.isPrimary && image.approvalStatus === 'approved')

export const hasPrintingStep = (workOrder: WorkOrder) =>
  workOrder.steps.some((step) => step.station === 'printing')

export const getArtworkReadiness = (workOrder: WorkOrder) => {
  if (!hasPrintingStep(workOrder)) return { ready: true, reason: '' }
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

export const getPackingGood = (workOrder: WorkOrder) => workOrder.steps
  .filter((step) => step.station === 'packing')
  .reduce((total, step) => total + step.qtyGood, 0)

export const getPackingReject = (workOrder: WorkOrder) => workOrder.steps
  .filter((step) => step.station === 'packing')
  .reduce((total, step) => total + step.qtyReject, 0)

export const getShortfallSummary = (workOrder: WorkOrder) => {
  const shortfalls = workOrder.shortfalls || []
  const packedGood = getPackingGood(workOrder)
  const approvedShortShipmentQty = shortfalls
    .filter((item) => item.status === 'approved_short_shipment')
    .reduce((total, item) => total + item.qty, 0)
  const cancelledRemainingQty = shortfalls
    .filter((item) => item.status === 'cancelled_remaining')
    .reduce((total, item) => total + item.qty, 0)
  const actionRequiredQty = shortfalls
    .filter((item) => item.status === 'action_required')
    .reduce((total, item) => total + item.qty, 0)
  const replacementPlannedQty = shortfalls
    .filter((item) => item.status === 'replacement_planned')
    .reduce((total, item) => total + item.qty, 0)
  const approvedQty = approvedShortShipmentQty + cancelledRemainingQty
  const remainingQty = Math.max(0, workOrder.qty - packedGood - approvedQty)
  const replacementRemainingQty = remainingQty > 0 ? Math.min(replacementPlannedQty, remainingQty) : 0
  const requiresActionQty = actionRequiredQty + Math.max(0, remainingQty - replacementRemainingQty - actionRequiredQty)

  return {
    shortfalls,
    packedGood,
    approvedShortShipmentQty,
    cancelledRemainingQty,
    approvedQty,
    actionRequiredQty,
    replacementPlannedQty,
    replacementRemainingQty,
    remainingQty,
    requiresActionQty,
    isFulfilled: remainingQty === 0 && actionRequiredQty === 0,
  }
}

export const getCloseReadiness = (workOrder: WorkOrder) => {
  const summary = getShortfallSummary(workOrder)
  if (summary.actionRequiredQty > 0) {
    return { ready: false, reason: `${formatNumber(summary.actionRequiredQty)} unit reject/kurang belum diputuskan oleh Admin atau PPIC.` }
  }
  if (summary.remainingQty > 0) {
    return { ready: false, reason: `Masih kurang ${formatNumber(summary.remainingQty)} unit dari target WO. Selesaikan penggantian atau setujui pengiriman kurang/sisa dibatalkan.` }
  }
  return { ready: true, reason: '' }
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

  const summary = getShortfallSummary(workOrder)
  if (summary.isFulfilled) return 'done'

  const current = getCurrentProcess(workOrder)
  if (current?.station === 'qc') return 'qc'
  if (current?.station === 'packing') return 'packing'
  if (workOrder.steps.some((step) => deriveStepStatus(workOrder, step) === 'in_progress')) return 'in_progress'

  return 'scheduled'
}

export const getProgress = (workOrder: WorkOrder) => {
  const summary = getShortfallSummary(workOrder)
  return Math.min(100, Math.round(((summary.packedGood + summary.approvedQty) / Math.max(1, workOrder.qty)) * 100))
}

export const isOverdue = (workOrder: WorkOrder) => {
  const status = deriveOrderStatus(workOrder)
  if (['done', 'closed', 'cancelled'].includes(status)) return false
  const deadline = new Date(`${workOrder.dueDate}T23:59:59`)
  return deadline < new Date()
}

export const getBlockerSummary = (workOrder: WorkOrder) => {
  const shortfall = getShortfallSummary(workOrder)
  if (shortfall.actionRequiredQty > 0) return `Kekurangan ${formatNumber(shortfall.actionRequiredQty)} unit · butuh keputusan`
  if (shortfall.replacementRemainingQty > 0) return `Penggantian ${formatNumber(shortfall.replacementRemainingQty)} unit berjalan`

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
  const summaryA = getShortfallSummary(a)
  const summaryB = getShortfallSummary(b)
  const actionA = summaryA.actionRequiredQty > 0 ? 0 : 1
  const actionB = summaryB.actionRequiredQty > 0 ? 0 : 1
  const holdA = getBlockerSummary(a).startsWith('HOLD') ? 0 : 1
  const holdB = getBlockerSummary(b).startsWith('HOLD') ? 0 : 1
  const mtoA = a.type === 'mto' ? 0 : 1
  const mtoB = b.type === 'mto' ? 0 : 1

  return (
    actionA - actionB ||
    holdA - holdB ||
    Number(isOverdue(b)) - Number(isOverdue(a)) ||
    mtoA - mtoB ||
    priorityScore[a.priority] - priorityScore[b.priority] ||
    a.dueDate.localeCompare(b.dueDate) ||
    statusA.localeCompare(statusB)
  )
}

import type { ProcessStep, Role, WorkOrder, WorkOrderShortfall } from '../types/workOrder'
import {
  deriveStepStatus,
  getArtworkReadiness,
  getCurrentProcess,
  getShortfallSummary,
  isWorkOrderFulfilled,
  processLabels,
  stationLabels,
  statusLabels,
} from './workOrder'

export type WorkOrderActionKind =
  | 'schedule'
  | 'start_step'
  | 'log_result'
  | 'qc_decision'
  | 'resolve_rework'
  | 'shortfall_decision'
  | 'review_shortfall'
  | 'close_order'
  | 'archive_order'
  | 'open_detail'
  | 'blocked'
  | 'none'

export type WorkOrderActionSeverity = 'neutral' | 'primary' | 'warning' | 'danger' | 'success'

export type WorkOrderCurrentAction = {
  kind: WorkOrderActionKind
  label: string
  title: string
  note: string
  severity: WorkOrderActionSeverity
  step?: ProcessStep
  shortfall?: WorkOrderShortfall
  opensModal: boolean
  /**
   * True when a kanban drag would skip required execution data. The board should open
   * the existing WO modal/action instead of silently changing status.
   */
  requiresModalBeforeStatusMove: boolean
}

const canCloseOrder = (role: Role) => role === 'ppic'
const canPlanOrder = (role: Role) => role === 'admin' || role === 'ppic' || role === 'manager'

function findShortfall(workOrder: WorkOrder, statuses: WorkOrderShortfall['status'][]) {
  return (workOrder.shortfalls || []).find((shortfall) => statuses.includes(shortfall.status))
}

const detailAction = (title: string, note: string): WorkOrderCurrentAction => ({
  kind: 'open_detail',
  label: 'Buka detail',
  title,
  note,
  severity: 'neutral',
  opensModal: false,
  requiresModalBeforeStatusMove: false,
})

export function getWorkOrderCurrentAction(workOrder: WorkOrder, role: Role): WorkOrderCurrentAction {
  // MVP safety: use the stored database WO status for terminal actions.
  // Progress-derived fulfillment must not make Kanban show Close WO too early.
  const status = workOrder.status
  const summary = getShortfallSummary(workOrder)

  if (workOrder.isArchived) {
    return detailAction('WO sudah diarsipkan', 'Buka detail atau laporan untuk melihat riwayat.')
  }

  if (status === 'cancelled') {
    return detailAction('WO dibatalkan', 'Tidak ada aksi produksi aktif.')
  }

  if (status === 'closed') {
    return detailAction('WO sudah ditutup', 'Data produksi sudah terkunci untuk laporan.')
  }

  if (summary.pendingReworkQty > 0) {
    return {
      kind: 'resolve_rework',
      label: 'Selesaikan rework',
      title: 'Pending rework perlu diselesaikan',
      note: `${summary.pendingReworkQty} unit masih pending rework sebelum WO bisa selesai.`,
      severity: 'warning',
      opensModal: true,
      requiresModalBeforeStatusMove: true,
    }
  }

  const actionRequiredShortfall = findShortfall(workOrder, ['action_required'])
  if (actionRequiredShortfall) {
    return {
      kind: 'shortfall_decision',
      label: 'Keputusan PPIC',
      title: 'Butuh keputusan shortfall',
      note: 'Customer order memiliki kekurangan yang perlu diputuskan PPIC.',
      severity: 'danger',
      shortfall: actionRequiredShortfall,
      opensModal: true,
      requiresModalBeforeStatusMove: true,
    }
  }

  const awaitingApprovalShortfall = findShortfall(workOrder, ['awaiting_approval'])
  if (awaitingApprovalShortfall) {
    return {
      kind: 'review_shortfall',
      label: 'Review persetujuan',
      title: 'Menunggu persetujuan shortfall',
      note: 'Ada keputusan pengiriman kurang / pembatalan sisa yang perlu direview.',
      severity: 'warning',
      shortfall: awaitingApprovalShortfall,
      opensModal: true,
      requiresModalBeforeStatusMove: true,
    }
  }

  if (status === 'done') {
    return {
      kind: canCloseOrder(role) ? 'close_order' : 'open_detail',
      label: canCloseOrder(role) ? 'Close WO' : 'Lihat hasil',
      title: 'WO selesai diproses',
      note: canCloseOrder(role) ? 'Status WO sudah Selesai. WO siap ditutup PPIC.' : 'WO selesai dan menunggu close PPIC.',
      severity: 'success',
      opensModal: canCloseOrder(role),
      requiresModalBeforeStatusMove: false,
    }
  }

  if (isWorkOrderFulfilled(workOrder)) {
    return {
      kind: 'open_detail',
      label: 'Review WO',
      title: 'Output terpenuhi, status belum Selesai',
      note: 'Output produksi sudah terpenuhi, tetapi status WO belum done. Buka detail untuk mengecek proses akhir sebelum close.',
      severity: 'neutral',
      opensModal: false,
      requiresModalBeforeStatusMove: false,
    }
  }

  if (status === 'draft') {
    return {
      kind: canPlanOrder(role) ? 'schedule' : 'open_detail',
      label: canPlanOrder(role) ? 'Rencanakan WO' : 'Buka detail',
      title: 'WO masih draft',
      note: canPlanOrder(role) ? 'Tetapkan tanggal, PIC, lapor ke, dan area sebelum deploy.' : 'WO belum dideploy ke produksi.',
      severity: 'primary',
      opensModal: canPlanOrder(role),
      requiresModalBeforeStatusMove: false,
    }
  }

  const currentStep = getCurrentProcess(workOrder)
  if (!currentStep) {
    return detailAction(statusLabels[status], 'Tidak ada proses aktif yang perlu tindakan langsung.')
  }

  const stepStatus = deriveStepStatus(workOrder, currentStep)
  const stepLabel = `${currentStep.name} · ${stationLabels[currentStep.station]}`

  if (stepStatus === 'hold') {
    return {
      kind: 'blocked',
      label: 'Lihat HOLD',
      title: `${currentStep.name} sedang HOLD`,
      note: currentStep.holdReason || 'Proses ditahan dan perlu dicek dari detail WO.',
      severity: 'warning',
      step: currentStep,
      opensModal: false,
      requiresModalBeforeStatusMove: true,
    }
  }

  if (stepStatus === 'waiting_wip') {
    return {
      kind: 'blocked',
      label: 'Lihat input',
      title: `${currentStep.name} menunggu input`,
      note: 'Proses sebelumnya belum menghasilkan input yang cukup.',
      severity: 'warning',
      step: currentStep,
      opensModal: false,
      requiresModalBeforeStatusMove: true,
    }
  }

  const artworkReadiness = getArtworkReadiness(workOrder)
  if (currentStep.station === 'printing' && workOrder.artworkApprovalRequired && !artworkReadiness.ready) {
    return {
      kind: 'open_detail',
      label: 'Cek artwork',
      title: 'Artwork belum siap',
      note: artworkReadiness.reason,
      severity: 'warning',
      step: currentStep,
      opensModal: false,
      requiresModalBeforeStatusMove: true,
    }
  }

  if (stepStatus === 'ready' || stepStatus === 'partial_paused') {
    return {
      kind: 'start_step',
      label: stepStatus === 'partial_paused' ? 'Lanjutkan proses' : 'Mulai proses',
      title: stepLabel,
      note: `${processLabels[stepStatus]} · buka modal untuk mulai / lanjutkan proses.`,
      severity: 'primary',
      step: currentStep,
      opensModal: true,
      requiresModalBeforeStatusMove: true,
    }
  }

  if (stepStatus === 'in_progress') {
    const isQc = currentStep.station === 'qc'
    return {
      kind: isQc ? 'qc_decision' : 'log_result',
      label: isQc ? 'Keputusan QC' : 'Catat hasil',
      title: stepLabel,
      note: isQc ? 'QC sedang berjalan. Catat hasil QC dari modal yang sama.' : 'Proses sedang berjalan. Catat output, reject, rework, dan catatan hasil.',
      severity: 'primary',
      step: currentStep,
      opensModal: true,
      requiresModalBeforeStatusMove: true,
    }
  }

  return detailAction(statusLabels[status], 'Buka detail WO untuk melihat tindakan berikutnya.')
}

export function shouldOpenModalBeforeKanbanMove(workOrder: WorkOrder, role: Role, targetStatus: WorkOrder['status']) {
  if (!['qc', 'packing', 'done'].includes(targetStatus)) return false
  const action = getWorkOrderCurrentAction(workOrder, role)
  return action.requiresModalBeforeStatusMove
}

export type Role = 'admin' | 'ppic' | 'operator' | 'qc' | 'packing' | 'manager'

/** Approved production stations for PGE Work Order planning. */
export type Station =
  | 'printing'
  | 'cutting'
  | 'sewing'
  | 'finishing'
  | 'qc'
  | 'packing'
  | 'warehouse'

export type WorkOrderStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'qc'
  | 'packing'
  | 'done'
  | 'closed'
  | 'cancelled'

export type ProcessStatus =
  | 'not_ready'
  | 'ready'
  | 'in_progress'
  | 'waiting_wip'
  | 'hold'
  | 'completed'

export type Priority = 'p1' | 'p2' | 'p3' | 'p4'
export type WorkOrderType = 'mto' | 'mts'
export type ArtworkApprovalStatus = 'pending' | 'approved' | 'superseded'

/**
 * Quantity that cannot reach Packing yet because a process rejected it or QC
 * issued a final reject. Admin / PPIC must decide the next action.
 */
export type ShortfallOrigin = 'process_reject' | 'qc_final_reject'
export type ShortfallStatus =
  | 'action_required'
  | 'replacement_planned'
  | 'approved_short_shipment'
  | 'cancelled_remaining'
  | 'resolved'

export interface TeamMember {
  id: string
  name: string
  role: Role
  stations: Station[]
}

/** Company directory used by Admin / PPIC when planning a Work Order. */
export interface StaffDirectoryMember {
  id: string
  name: string
  employeeNumber?: string
  kind: 'staff' | 'planner'
}

export interface ProcessStep {
  id: string
  sequence: number
  name: string
  station: Station
  assignedUserId?: string
  /** Optional escalation / reporting owner selected before WO deployment. */
  reportToUserId?: string
  plannedQty: number
  inputs: string[]
  output: string
  status: ProcessStatus
  qtyGood: number
  qtyRework: number
  qtyReject: number
  activeSeconds: number
  startedAt?: string
  location?: string
  holdReason?: string
  artworkConfirmedBy?: string
  artworkConfirmedAt?: string
  artworkConfirmedImageId?: string
  /** A controlled extra process created to fulfill a shortfall or rework lot. */
  isReplacement?: boolean
  /** Links a replacement process to the rejected quantity it is expected to recover. */
  replacementForShortfallId?: string
}

export interface WorkOrderShortfall {
  id: string
  origin: ShortfallOrigin
  sourceStepId: string
  sourceStepName: string
  sourceStation: Station
  qty: number
  status: ShortfallStatus
  createdAt: string
  note?: string
  replacementStartStepId?: string
  replacementStepIds?: string[]
  resolvedBy?: string
  resolvedAt?: string
  resolutionNote?: string
}

export interface WorkOrderHistoryItem {
  id: string
  at: string
  actor: string
  role: Role | 'system'
  title: string
  note?: string
}

export interface WorkOrderReferenceImage {
  id: string
  name: string
  dataUrl: string
  createdAt: string
  version: string
  approvalStatus: ArtworkApprovalStatus
  isPrimary: boolean
  printNote?: string
  approvedBy?: string
  approvedAt?: string
}

export interface WorkOrder {
  id: string
  code: string
  type: WorkOrderType
  source: string
  product: string
  referenceNote?: string
  referenceImages?: WorkOrderReferenceImage[]
  /** When true, Printing is locked until one primary artwork is approved. */
  artworkApprovalRequired?: boolean
  qty: number
  dueDate: string
  priority: Priority
  machine?: string
  scheduledDate?: string
  /** Saved so a Draft can safely rebuild its route before deployment. */
  routeTemplateId?: RouteTemplate['id']
  customRoute?: string[]
  status: WorkOrderStatus
  reworkCount: number
  createdAt: string
  createdBy: string
  steps: ProcessStep[]
  /** Reject/shortfall decisions remain visible until recovery, approval, or cancellation. */
  shortfalls?: WorkOrderShortfall[]
  history: WorkOrderHistoryItem[]
}

export interface RouteTemplate {
  id: 'direct' | 'print-sew' | 'multi-part' | 'custom'
  title: string
  description: string
}

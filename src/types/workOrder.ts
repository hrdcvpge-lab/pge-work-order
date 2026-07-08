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

export type DefectCategory =
  | 'print_color_mismatch'
  | 'wrong_artwork'
  | 'print_position_shifted'
  | 'cutting_not_neat'
  | 'stitching_not_neat'
  | 'zipper_issue'
  | 'material_defect'
  | 'lining_issue'
  | 'branding_incorrect'
  | 'packaging_issue'
  | 'other'

/** Quantity that cannot reach Packing yet because a process rejected it or QC issued a final reject. */
export type ShortfallOrigin = 'process_reject' | 'qc_final_reject'
export type ShortfallStatus =
  | 'action_required'
  | 'replacement_planned'
  | 'awaiting_approval'
  | 'approved_short_shipment'
  | 'cancelled_remaining'
  | 'resolved'

export type ShortfallRequestedAction = 'short_shipment' | 'cancel_remaining'

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
  isActive?: boolean
  /** Explicit eligibility list. Empty/undefined means not yet configured for production assignment. */
  allowedStations?: Station[]
  defaultReportToUserId?: string
  defaultWorkArea?: string
  canReceiveEscalation?: boolean
}

export interface QualityEvidence {
  id: string
  name: string
  dataUrl: string
  createdAt: string
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
  /** Planned execution date for this specific process step. */
  scheduledDate?: string
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
  /** QC/quality record, captured after a QC decision or a reject result. Evidence is optional. */
  defectCategory?: DefectCategory
  defectNote?: string
  defectEvidence?: QualityEvidence[]
  inspectedQty?: number
  qualityRecordedAt?: string
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
  /** For MTO short shipment/cancellation, Admin or PPIC requests and Manager approves. */
  requestedAction?: ShortfallRequestedAction
  requestedBy?: string
  requestedAt?: string
  decisionBy?: string
  decisionAt?: string
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

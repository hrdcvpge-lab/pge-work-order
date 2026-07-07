export type Role = 'admin' | 'ppic' | 'operator' | 'qc' | 'packing' | 'manager'

export type Station =
  | 'printing'
  | 'cutting'
  | 'component'
  | 'sewing'
  | 'finishing'
  | 'qc'
  | 'packing'
  | 'general'

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

export interface TeamMember {
  id: string
  name: string
  role: Role
  stations: Station[]
}

export interface ProcessStep {
  id: string
  sequence: number
  name: string
  station: Station
  assignedUserId?: string
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
}

export interface WorkOrderHistoryItem {
  id: string
  at: string
  actor: string
  role: Role | 'system'
  title: string
  note?: string
}

export interface WorkOrder {
  id: string
  code: string
  type: WorkOrderType
  source: string
  product: string
  referenceNote?: string
  qty: number
  dueDate: string
  priority: Priority
  machine?: string
  scheduledDate?: string
  status: WorkOrderStatus
  reworkCount: number
  createdAt: string
  createdBy: string
  steps: ProcessStep[]
  history: WorkOrderHistoryItem[]
}

export interface RouteTemplate {
  id: 'direct' | 'print-sew' | 'multi-part' | 'custom'
  title: string
  description: string
}

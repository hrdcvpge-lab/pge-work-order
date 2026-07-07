export type Role = 'admin' | 'ppic' | 'operator' | 'qc' | 'manager'

export type WorkOrderStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'qc'
  | 'done'
  | 'closed'
  | 'cancelled'

export type Priority = 'normal' | 'high' | 'urgent'

export interface TeamMember {
  id: string
  name: string
  role: Role
}

export interface WorkOrderHistoryItem {
  id: string
  actor: string
  role: Role
  action: string
  note?: string
  timestamp: string
}

export interface WorkOrder {
  id: string
  code: string
  product: string
  qty: number
  dueDate: string
  priority: Priority
  status: WorkOrderStatus
  operatorId?: string
  operatorName?: string
  machine?: string
  scheduledDate?: string
  qtyProduced?: number
  qtyReject?: number
  reworkCount: number
  createdBy: string
  createdAt: string
  history: WorkOrderHistoryItem[]
}

export interface ActionContext {
  currentUser: TeamMember
  workOrder: WorkOrder
}

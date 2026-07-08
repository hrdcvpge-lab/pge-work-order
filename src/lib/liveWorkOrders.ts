import { supabase } from './supabase'
import type { Priority, ProcessStep, Station, WorkOrder, WorkOrderStatus, WorkOrderType } from '../types/workOrder'

type DbStationCode = 'printing' | 'cutting' | 'sewing_assembly' | 'finishing' | 'qc' | 'packing' | 'warehouse'
type DbStepStatus = 'planned' | 'ready' | 'in_progress' | 'blocked' | 'done' | 'cancelled'

type DbWorkOrderRow = {
  id: string
  code: string
  wo_type: WorkOrderType
  source_type: string | null
  source_detail: string | null
  product_description: string
  reference_note: string | null
  artwork_approval_required: boolean | null
  quantity_planned: number | string
  due_date: string
  priority: Priority
  status: WorkOrderStatus
  scheduled_date: string | null
  created_at: string
  created_by: string
  work_order_steps?: DbStepRow[] | null
}

type DbAssignmentRow = {
  employee_id: string | null
  assignment_type: 'executor' | 'report_to'
  is_active: boolean
}

type DbStepRow = {
  id: string
  sequence_no: number
  process_name: string
  station_id: string
  input_wip_name: string | null
  output_wip_name: string | null
  planned_qty: number | string
  status: DbStepStatus
  scheduled_date: string | null
  work_area: string | null
  machine_name: string | null
  started_at: string | null
  completed_at: string | null
  hold_reason: string | null
  work_order_assignments?: DbAssignmentRow[] | null
}

type DbStationRow = {
  id: string
  code: DbStationCode
  name: string
}

export type DraftWorkOrderInput = {
  type: WorkOrderType
  source: string
  product: string
  referenceNote: string
  artworkApprovalRequired: boolean
  qty: number
  dueDate: string
  priority: Priority
  routeTemplateId: string
  customRoute: string[]
  steps: ProcessStep[]
}

export type ScheduleWorkOrderInput = {
  workOrderId: string
  scheduledDate: string
  machine: string
  steps: Array<{
    stepId: string
    station: Station
    assignedEmployeeId: string
    reportToEmployeeId: string
    workArea: string
    scheduledDate: string
  }>
}

const stationToDbCode: Record<Station, DbStationCode> = {
  printing: 'printing',
  cutting: 'cutting',
  sewing: 'sewing_assembly',
  finishing: 'finishing',
  qc: 'qc',
  packing: 'packing',
  warehouse: 'warehouse',
}

const dbCodeToStation: Record<DbStationCode, Station> = {
  printing: 'printing',
  cutting: 'cutting',
  sewing_assembly: 'sewing',
  finishing: 'finishing',
  qc: 'qc',
  packing: 'packing',
  warehouse: 'warehouse',
}

function dbStepStatusToUi(status: DbStepStatus): ProcessStep['status'] {
  if (status === 'ready') return 'ready'
  if (status === 'in_progress') return 'in_progress'
  if (status === 'blocked') return 'hold'
  if (status === 'done') return 'completed'
  return 'not_ready'
}

function parseNumber(value: number | string | null | undefined) {
  return Number(value || 0)
}

function mapStep(row: DbStepRow, stationsById: Map<string, DbStationRow>): ProcessStep {
  const stationCode = stationsById.get(row.station_id)?.code || 'warehouse'
  const assignments = (row.work_order_assignments || []).filter((assignment) => assignment.is_active)
  const executor = assignments.find((assignment) => assignment.assignment_type === 'executor')
  const reportTo = assignments.find((assignment) => assignment.assignment_type === 'report_to')

  return {
    id: row.id,
    sequence: row.sequence_no,
    name: row.process_name,
    station: dbCodeToStation[stationCode],
    plannedQty: parseNumber(row.planned_qty),
    inputs: row.input_wip_name ? [row.input_wip_name] : [],
    output: row.output_wip_name || 'Output proses',
    status: dbStepStatusToUi(row.status),
    assignedUserId: executor?.employee_id || undefined,
    reportToUserId: reportTo?.employee_id || undefined,
    scheduledDate: row.scheduled_date || undefined,
    qtyGood: 0,
    qtyRework: 0,
    qtyReject: 0,
    activeSeconds: 0,
    startedAt: row.started_at || undefined,
    location: row.work_area || undefined,
    holdReason: row.hold_reason || undefined,
  }
}

function mapWorkOrder(row: DbWorkOrderRow, stationsById: Map<string, DbStationRow>): WorkOrder {
  const source = row.source_detail || row.source_type || '-'

  return {
    id: row.id,
    code: row.code,
    type: row.wo_type,
    source,
    product: row.product_description,
    referenceNote: row.reference_note || undefined,
    referenceImages: [],
    artworkApprovalRequired: Boolean(row.artwork_approval_required),
    qty: parseNumber(row.quantity_planned),
    dueDate: row.due_date,
    priority: row.priority,
    scheduledDate: row.scheduled_date || undefined,
    routeTemplateId: undefined,
    customRoute: [],
    status: row.status,
    reworkCount: 0,
    createdAt: row.created_at,
    createdBy: row.created_by,
    steps: [...(row.work_order_steps || [])]
      .sort((left, right) => left.sequence_no - right.sequence_no)
      .map((step) => mapStep(step, stationsById)),
    shortfalls: [],
    history: [],
  }
}

export async function fetchLiveWorkOrders(): Promise<WorkOrder[]> {
  if (!supabase) return []

  const [{ data: stations, error: stationsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase
      .from('stations')
      .select('id, code, name'),
    supabase
      .from('work_orders')
      .select(`
        id,
        code,
        wo_type,
        source_type,
        source_detail,
        product_description,
        reference_note,
        artwork_approval_required,
        quantity_planned,
        due_date,
        priority,
        status,
        scheduled_date,
        created_at,
        created_by,
        work_order_steps (
          id,
          sequence_no,
          process_name,
          station_id,
          input_wip_name,
          output_wip_name,
          planned_qty,
          status,
          scheduled_date,
          work_area,
          machine_name,
          started_at,
          completed_at,
          hold_reason,
          work_order_assignments (
            employee_id,
            assignment_type,
            is_active
          )
        )
      `)
      .order('created_at', { ascending: false }),
  ])

  if (stationsError) throw new Error(stationsError.message)
  if (ordersError) throw new Error(ordersError.message)

  const stationRows = (stations || []) as DbStationRow[]
  const orderRows = (orders || []) as DbWorkOrderRow[]
  const stationsById = new Map<string, DbStationRow>(stationRows.map((station) => [station.id, station]))
  return orderRows.map((order) => mapWorkOrder(order, stationsById))
}

export async function createLiveDraftWorkOrder(input: DraftWorkOrderInput): Promise<{ id: string; code: string }> {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')

  const routeSteps = input.steps.map((step) => ({
    sequence_no: step.sequence,
    process_name: step.name,
    station_code: stationToDbCode[step.station],
    input_wip_name: step.inputs[0] || null,
    output_wip_name: step.output,
    planned_qty: input.qty,
  }))

  const { data, error } = await supabase.rpc('create_draft_work_order', {
    payload: {
      wo_type: input.type,
      source_detail: input.source,
      product_description: input.product,
      reference_note: input.referenceNote || null,
      artwork_approval_required: input.artworkApprovalRequired,
      quantity_planned: input.qty,
      due_date: input.dueDate,
      priority: input.priority,
      route_template_id: input.routeTemplateId,
      custom_route: input.customRoute,
      route_steps: routeSteps,
    },
  })

  if (error) throw new Error(error.message)

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || !('id' in row) || !('code' in row)) {
    throw new Error('WO berhasil dibuat, tetapi respon database tidak lengkap.')
  }

  return { id: String(row.id), code: String(row.code) }
}

export async function deleteLiveDraftWorkOrder(workOrderId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')

  const { error } = await supabase.rpc('delete_draft_work_order', {
    target_work_order_id: workOrderId,
  })

  if (error) throw new Error(error.message)
}


export async function scheduleLiveWorkOrder(input: ScheduleWorkOrderInput): Promise<void> {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')

  const { error } = await supabase.rpc('schedule_work_order', {
    target_work_order_id: input.workOrderId,
    payload: {
      scheduled_date: input.scheduledDate,
      main_machine: input.machine,
      steps: input.steps.map((step) => ({
        step_id: step.stepId,
        station_code: stationToDbCode[step.station],
        executor_employee_id: step.assignedEmployeeId,
        report_to_employee_id: step.reportToEmployeeId,
        work_area: step.workArea,
        scheduled_date: step.scheduledDate,
      })),
    },
  })

  if (error) throw new Error(error.message)
}

import { supabase } from './supabase'
import type { Role, StaffDirectoryMember, Station } from '../types/workOrder'

type DbStationCode = 'printing' | 'cutting' | 'sewing_assembly' | 'finishing' | 'qc' | 'packing' | 'warehouse'

type EmployeeRow = {
  id: string
  profile_id: string | null
  full_name: string
  employee_code: string | null
  role: Role
  access_mode: 'self_service' | 'admin_assisted' | 'no_system_access'
  is_active: boolean
}

type StationRow = {
  id: string
  code: DbStationCode
}

type StationAccessRow = {
  employee_id: string
  station_id: string
  is_active: boolean
  default_work_area: string | null
  can_receive_reports: boolean
}

type ReportingLineRow = {
  employee_id: string
  report_to_employee_id: string
  is_primary: boolean
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

function isPlannerRole(role: Role) {
  return ['admin', 'ppic', 'manager'].includes(role)
}

export async function fetchLiveStaffDirectory(): Promise<StaffDirectoryMember[]> {
  if (!supabase) return []

  const [employeeResult, stationResult, accessResult, reportingResult] = await Promise.all([
    supabase
      .from('employees')
      .select('id, profile_id, full_name, employee_code, role, access_mode, is_active')
      .order('full_name'),
    supabase
      .from('stations')
      .select('id, code'),
    supabase
      .from('employee_station_access')
      .select('employee_id, station_id, is_active, default_work_area, can_receive_reports'),
    supabase
      .from('employee_reporting_lines')
      .select('employee_id, report_to_employee_id, is_primary'),
  ])

  const firstError = employeeResult.error || stationResult.error || accessResult.error || reportingResult.error
  if (firstError) throw new Error(firstError.message)

  const employees = (employeeResult.data || []) as EmployeeRow[]
  const stations = (stationResult.data || []) as StationRow[]
  const accessRows = (accessResult.data || []) as StationAccessRow[]
  const reportingRows = (reportingResult.data || []) as ReportingLineRow[]
  const stationById = new Map(stations.map((station) => [station.id, station]))

  return employees.map((employee) => {
    const activeAccess = accessRows.filter((access) => access.employee_id === employee.id && access.is_active)
    const allowedStations = activeAccess
      .map((access) => stationById.get(access.station_id)?.code)
      .filter((code): code is DbStationCode => Boolean(code))
      .map((code) => dbCodeToStation[code])

    const defaultWorkArea = activeAccess.find((access) => access.default_work_area)?.default_work_area || undefined
    const reportTo = reportingRows.find((line) => line.employee_id === employee.id && line.is_primary)?.report_to_employee_id
    const planner = isPlannerRole(employee.role)

    return {
      id: employee.id,
      name: employee.full_name,
      employeeNumber: employee.employee_code || undefined,
      kind: planner ? 'planner' : 'staff',
      isActive: employee.is_active,
      accessMode: employee.access_mode,
      profileId: employee.profile_id || undefined,
      allowedStations,
      defaultReportToUserId: reportTo,
      defaultWorkArea,
      canReceiveEscalation: planner || activeAccess.some((access) => access.can_receive_reports),
    }
  })
}

import type { Priority, ProcessStatus, Station, WorkOrderStatus, WorkOrderType } from '../types/workOrder'
import { priorityLabels, processLabels, stationLabels, statusLabels, typeLabels } from '../utils/workOrder'

type Props = {
  kind: 'priority' | 'status' | 'process' | 'station' | 'type' | 'plain'
  value: Priority | ProcessStatus | Station | WorkOrderStatus | WorkOrderType | string
}

export function Badge({ kind, value }: Props) {
  const label =
    kind === 'priority' ? priorityLabels[value as Priority] :
    kind === 'status' ? statusLabels[value as WorkOrderStatus] :
    kind === 'process' ? processLabels[value as ProcessStatus] :
    kind === 'station' ? stationLabels[value as Station] :
    kind === 'type' ? typeLabels[value as WorkOrderType] :
    value

  return <span className={`badge badge--${kind} badge--${String(value)}`}>{label}</span>
}

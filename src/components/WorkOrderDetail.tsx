import type { WorkOrder } from '../types/workOrder'
import { formatDate, formatDateTime, priorityLabels, roleLabels, statusLabels } from '../utils/workOrder'
import { Icon } from './Icon'

interface WorkOrderDetailProps {
  workOrder: WorkOrder | null
  onClose: () => void
}

export function WorkOrderDetail({ workOrder, onClose }: WorkOrderDetailProps) {
  if (!workOrder) return null

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Detail Work Order">
      <button className="drawer-layer__backdrop" onClick={onClose} aria-label="Tutup detail" />
      <aside className="wo-drawer">
        <header className="wo-drawer__header">
          <div>
            <span className="eyebrow">Detail Work Order</span>
            <h2>{workOrder.code}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button>
        </header>

        <section className="wo-drawer__summary">
          <div className="summary-status">
            <span className={`status-dot status-dot--${workOrder.status}`} />
            <div><small>Status sekarang</small><strong>{statusLabels[workOrder.status]}</strong></div>
          </div>
          <span className={`priority-chip priority-chip--${workOrder.priority}`}>{priorityLabels[workOrder.priority]}</span>
        </section>

        <section className="drawer-section">
          <h3>Informasi produksi</h3>
          <dl className="detail-grid">
            <div><dt>Produk</dt><dd>{workOrder.product}</dd></div>
            <div><dt>Target</dt><dd>{workOrder.qty.toLocaleString('id-ID')} pcs</dd></div>
            <div><dt>Jatuh tempo</dt><dd>{formatDate(workOrder.dueDate)}</dd></div>
            <div><dt>Jadwal produksi</dt><dd>{formatDate(workOrder.scheduledDate)}</dd></div>
            <div><dt>Operator</dt><dd>{workOrder.operatorName || 'Belum ditentukan'}</dd></div>
            <div><dt>Mesin / area</dt><dd>{workOrder.machine || 'Belum ditentukan'}</dd></div>
            <div><dt>Hasil produksi</dt><dd>{workOrder.qtyProduced?.toLocaleString('id-ID') ?? '–'} pcs</dd></div>
            <div><dt>Reject</dt><dd>{workOrder.qtyReject?.toLocaleString('id-ID') ?? '–'} pcs</dd></div>
            <div><dt>Jumlah rework</dt><dd>{workOrder.reworkCount} kali</dd></div>
          </dl>
        </section>

        <section className="drawer-section">
          <div className="section-heading"><div><span className="eyebrow">Audit trail</span><h3>Riwayat aktivitas</h3></div><Icon name="history" /></div>
          <ol className="history-list">
            {[...workOrder.history].reverse().map((item) => (
              <li key={item.id}>
                <span className={`history-list__dot history-list__dot--${item.role}`} />
                <div className="history-list__content">
                  <div className="history-list__topline"><strong>{item.action}</strong><time>{formatDateTime(item.timestamp)}</time></div>
                  <p><b>{item.actor}</b> · {roleLabels[item.role]}</p>
                  {item.note ? <blockquote>{item.note}</blockquote> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  )
}

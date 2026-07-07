import { useEffect, useState, type FormEvent } from 'react'
import type { TeamMember, WorkOrder, WorkOrderStatus } from '../types/workOrder'
import { Icon } from './Icon'

interface ModalProps {
  title: string
  children: React.ReactNode
  onClose: () => void
}

export function Modal({ title, children, onClose }: ModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-layer__backdrop" onClick={onClose} aria-label="Tutup" />
      <section className="modal-card">
        <header className="modal-card__header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button></header>
        {children}
      </section>
    </div>
  )
}

interface CreateWorkOrderModalProps {
  onClose: () => void
  onSubmit: (data: Pick<WorkOrder, 'product' | 'qty' | 'dueDate' | 'priority'>) => void
}

export function CreateWorkOrderModal({ onClose, onSubmit }: CreateWorkOrderModalProps) {
  const [product, setProduct] = useState('')
  const [qty, setQty] = useState('')
  const [dueDate, setDueDate] = useState('2026-07-15')
  const [priority, setPriority] = useState<WorkOrder['priority']>('normal')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!product.trim() || Number(qty) <= 0) return
    onSubmit({ product: product.trim(), qty: Number(qty), dueDate, priority })
  }

  return (
    <Modal title="Buat Work Order baru" onClose={onClose}>
      <form className="form-stack" onSubmit={handleSubmit}>
        <label><span>Nama produk</span><input autoFocus value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Contoh: Dompet Pouch Landmark Jepang" required /></label>
        <div className="form-grid"><label><span>Target produksi</span><input type="number" min="1" value={qty} onChange={(event) => setQty(event.target.value)} placeholder="0" required /><small>pcs</small></label><label><span>Jatuh tempo</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label></div>
        <label><span>Prioritas</span><select value={priority} onChange={(event) => setPriority(event.target.value as WorkOrder['priority'])}><option value="normal">Normal</option><option value="high">Tinggi</option><option value="urgent">Mendesak</option></select></label>
        <footer className="modal-card__footer"><button type="button" className="button button--ghost" onClick={onClose}>Batal</button><button type="submit" className="button button--primary"><Icon name="plus" />Buat Draft</button></footer>
      </form>
    </Modal>
  )
}

interface ScheduleModalProps {
  workOrder: WorkOrder
  operators: TeamMember[]
  onClose: () => void
  onSubmit: (data: { operatorId: string; machine: string; scheduledDate: string; note: string }) => void
}

export function ScheduleModal({ workOrder, operators, onClose, onSubmit }: ScheduleModalProps) {
  const [operatorId, setOperatorId] = useState(operators[0]?.id ?? '')
  const [machine, setMachine] = useState('Mimaki Eco Solvent 01')
  const [scheduledDate, setScheduledDate] = useState('2026-07-08')
  const [note, setNote] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!operatorId || !machine.trim() || !scheduledDate) return
    onSubmit({ operatorId, machine: machine.trim(), scheduledDate, note: note.trim() })
  }

  return (
    <Modal title={`Jadwalkan ${workOrder.code}`} onClose={onClose}>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="compact-summary"><span>{workOrder.product}</span><strong>{workOrder.qty.toLocaleString('id-ID')} pcs</strong></div>
        <label><span>Operator</span><select value={operatorId} onChange={(event) => setOperatorId(event.target.value)}>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select></label>
        <div className="form-grid"><label><span>Mesin / area</span><input value={machine} onChange={(event) => setMachine(event.target.value)} required /></label><label><span>Tanggal produksi</span><input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required /></label></div>
        <label><span>Catatan PPIC <em>opsional</em></span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Contoh: Pastikan bahan PVC dan resleting sudah disiapkan sebelum mulai." rows={3} /></label>
        <footer className="modal-card__footer"><button type="button" className="button button--ghost" onClick={onClose}>Batal</button><button type="submit" className="button button--primary"><Icon name="calendar" />Simpan jadwal</button></footer>
      </form>
    </Modal>
  )
}

interface OutputModalProps {
  workOrder: WorkOrder
  onClose: () => void
  onSubmit: (data: { qtyProduced: number; qtyReject: number; note: string }) => void
}

export function OutputModal({ workOrder, onClose, onSubmit }: OutputModalProps) {
  const [qtyProduced, setQtyProduced] = useState(String(workOrder.qty))
  const [qtyReject, setQtyReject] = useState('0')
  const [note, setNote] = useState('')
  const total = Number(qtyProduced || 0)
  const reject = Number(qtyReject || 0)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (total <= 0 || reject < 0 || reject > total) return
    onSubmit({ qtyProduced: total, qtyReject: reject, note: note.trim() })
  }

  return (
    <Modal title={`Kirim ${workOrder.code} ke QC`} onClose={onClose}>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="compact-summary"><span>Target Work Order</span><strong>{workOrder.qty.toLocaleString('id-ID')} pcs</strong></div>
        <div className="form-grid"><label><span>Jumlah hasil</span><input type="number" min="1" value={qtyProduced} onChange={(event) => setQtyProduced(event.target.value)} required /><small>pcs</small></label><label><span>Reject awal</span><input type="number" min="0" max={total} value={qtyReject} onChange={(event) => setQtyReject(event.target.value)} required /><small>pcs</small></label></div>
        {reject > total ? <p className="form-error">Jumlah reject tidak boleh lebih besar dari hasil produksi.</p> : null}
        <label><span>Catatan operator <em>opsional</em></span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Masukkan kendala, kelebihan produksi, atau catatan penting." rows={3} /></label>
        <footer className="modal-card__footer"><button type="button" className="button button--ghost" onClick={onClose}>Batal</button><button type="submit" className="button button--primary"><Icon name="arrowRight" />Kirim ke QC</button></footer>
      </form>
    </Modal>
  )
}

interface QcResultModalProps {
  workOrder: WorkOrder
  onClose: () => void
  onSubmit: (result: 'pass' | 'rework', note: string) => void
}

export function QcResultModal({ workOrder, onClose, onSubmit }: QcResultModalProps) {
  const [result, setResult] = useState<'pass' | 'rework'>('pass')
  const [note, setNote] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (result === 'rework' && !note.trim()) return
    onSubmit(result, note.trim())
  }

  return (
    <Modal title={`Keputusan QC · ${workOrder.code}`} onClose={onClose}>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="qc-result-picker">
          <button type="button" className={result === 'pass' ? 'qc-choice qc-choice--selected qc-choice--pass' : 'qc-choice'} onClick={() => setResult('pass')}><Icon name="check" /><span><strong>Lulus QC</strong><small>Hasil dapat diproses untuk penutupan.</small></span></button>
          <button type="button" className={result === 'rework' ? 'qc-choice qc-choice--selected qc-choice--rework' : 'qc-choice'} onClick={() => setResult('rework')}><Icon name="arrowRight" /><span><strong>Perlu rework</strong><small>Kembalikan ke operator dengan instruksi perbaikan.</small></span></button>
        </div>
        <label><span>Catatan QC {result === 'rework' ? <b className="required-mark">wajib</b> : <em>opsional</em>}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={result === 'pass' ? 'Contoh: Ukuran, cetak, dan jahitan sesuai standar.' : 'Jelaskan bagian yang harus diperbaiki agar operator dapat melakukan rework.'} rows={4} required={result === 'rework'} /></label>
        <footer className="modal-card__footer"><button type="button" className="button button--ghost" onClick={onClose}>Batal</button><button type="submit" className={result === 'pass' ? 'button button--primary' : 'button button--warning'}>{result === 'pass' ? <><Icon name="check" />Setujui QC</> : <><Icon name="arrowRight" />Kirim untuk rework</>}</button></footer>
      </form>
    </Modal>
  )
}

interface ConfirmActionModalProps {
  title: string
  description: string
  confirmLabel: string
  status?: WorkOrderStatus
  tone?: 'primary' | 'danger'
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmActionModal({ title, description, confirmLabel, tone = 'primary', onClose, onConfirm }: ConfirmActionModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="confirm-content"><p>{description}</p><footer className="modal-card__footer"><button type="button" className="button button--ghost" onClick={onClose}>Batal</button><button type="button" className={`button ${tone === 'danger' ? 'button--danger' : 'button--primary'}`} onClick={onConfirm}><Icon name="check" />{confirmLabel}</button></footer></div>
    </Modal>
  )
}

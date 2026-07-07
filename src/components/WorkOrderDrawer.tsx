import { useState } from 'react'
import { Badge } from './Badge'
import { Icon } from './Icon'
import type { ProcessStep, TeamMember, WorkOrder, WorkOrderReferenceImage } from '../types/workOrder'
import {
  deriveOrderStatus,
  deriveStepStatus,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  getAvailableInputCap,
  getBlockerSummary,
  getOrderActiveSeconds,
  getProgress,
  getStepRecordedQty,
  getStepRemaining,
  getStepTimerSeconds,
  getWipBalance,
  isOverdue,
  stationLabels,
} from '../utils/workOrder'

type Props = {
  workOrder: WorkOrder
  currentUser: TeamMember
  team: TeamMember[]
  clock: number
  onClose: () => void
  onSchedule: () => void
  onAssign: (step: ProcessStep) => void
  onStart: (step: ProcessStep) => void
  onPause: (step: ProcessStep) => void
  onLogResult: (step: ProcessStep) => void
  onHold: (step: ProcessStep) => void
  onResume: (step: ProcessStep) => void
  onQcDecision: (step: ProcessStep) => void
  onCloseOrder: () => void
  onCancel: () => void
}

const getMemberName = (id: string | undefined, team: TeamMember[]) => team.find((member) => member.id === id)?.name || 'Belum ditugaskan'

function canOperateStep(currentUser: TeamMember, step: ProcessStep) {
  if (currentUser.role === 'manager') return false
  if (currentUser.role === 'operator') return step.assignedUserId === currentUser.id && !['qc', 'packing'].includes(step.station)
  if (currentUser.role === 'qc') return step.assignedUserId === currentUser.id && step.station === 'qc'
  if (currentUser.role === 'packing') return step.assignedUserId === currentUser.id && step.station === 'packing'
  return false
}

export function WorkOrderDrawer({
  workOrder,
  currentUser,
  team,
  clock,
  onClose,
  onSchedule,
  onAssign,
  onStart,
  onPause,
  onLogResult,
  onHold,
  onResume,
  onQcDecision,
  onCloseOrder,
  onCancel,
}: Props) {
  const status = deriveOrderStatus(workOrder)
  const progress = getProgress(workOrder)
  const blocker = getBlockerSummary(workOrder)
  const currentStep = workOrder.steps.find((step) => deriveStepStatus(workOrder, step) === 'in_progress')
    || workOrder.steps.find((step) => ['ready', 'waiting_wip'].includes(deriveStepStatus(workOrder, step)))

  const totalGood = workOrder.steps.filter((step) => step.station === 'packing').reduce((total, step) => total + step.qtyGood, 0)
  const totalReject = workOrder.steps.filter((step) => step.station === 'packing').reduce((total, step) => total + step.qtyReject, 0)
  const artworkImages = workOrder.referenceImages || []
  const [activeArtwork, setActiveArtwork] = useState<WorkOrderReferenceImage | null>(null)

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-layer__backdrop" aria-label="Tutup detail" onClick={onClose} />
      <aside className="wo-drawer" aria-label={`Detail ${workOrder.code}`}>
        <header className="wo-drawer__header">
          <div>
            <p className="eyebrow">Work Order</p>
            <h2>{workOrder.code}</h2>
            <p className="drawer-product">{workOrder.product}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Tutup detail"><Icon name="close" /></button>
        </header>

        <section className="drawer-status-band">
          <div>
            <div className="drawer-status-band__topline">
              <Badge kind="status" value={status} />
              <Badge kind="priority" value={workOrder.priority} />
              <Badge kind="type" value={workOrder.type} />
            </div>
            <strong>{currentStep ? `${currentStep.name} · ${stationLabels[currentStep.station]}` : 'WO sudah selesai'}</strong>
            <span>{blocker || (isOverdue(workOrder) ? 'Melewati target tanggal' : 'Tidak ada blocker aktif')}</span>
          </div>
          <div className="drawer-progress-number">
            <b>{progress}%</b>
            <span>Progress packing</span>
          </div>
        </section>

        <section className="drawer-section">
          <div className="detail-grid detail-grid--four">
            <div><span>Target</span><b>{formatNumber(workOrder.qty)} unit</b></div>
            <div><span>Target selesai</span><b className={isOverdue(workOrder) ? 'text-danger' : ''}>{formatDate(workOrder.dueDate)}</b></div>
            <div><span>Waktu aktif</span><b>{formatDuration(getOrderActiveSeconds(workOrder, clock))}</b></div>
            <div><span>Hasil akhir</span><b>{formatNumber(totalGood)} baik · {formatNumber(totalReject)} reject</b></div>
          </div>
          <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
        </section>

        <section className="drawer-section artwork-section">
          <div className="section-heading"><div><p className="eyebrow">Artwork & motif</p><h3>Referensi visual untuk operator</h3></div><span>{artworkImages.length} gambar</span></div>
          {artworkImages.length ? <>
            <p className="artwork-section__hint">Operator Printing harus membuka gambar ini sebelum mulai, terutama bila satu produk memiliki beberapa motif atau variasi desain.</p>
            <div className="artwork-gallery">
              {artworkImages.map((image, index) => <button type="button" className="artwork-gallery__item" key={image.id} onClick={() => setActiveArtwork(image)}>
                <img src={image.dataUrl} alt={`Artwork ${index + 1}: ${image.name}`} />
                <span><b>Motif {index + 1}</b><small>{image.name}</small></span>
              </button>)}
            </div>
          </> : <div className="artwork-missing"><Icon name="image" /><span><b>Belum ada gambar motif.</b> Tambahkan artwork sebelum proses Printing dimulai agar operator tidak hanya mengandalkan deskripsi teks.</span></div>}
        </section>

        <section className="drawer-section drawer-section--actions">
          {currentUser.role === 'ppic' && status === 'draft' ? <button className="button button--primary" onClick={onSchedule}>Jadwalkan WO</button> : null}
          {currentUser.role === 'admin' && status === 'draft' ? <button className="button button--danger-soft" onClick={onCancel}>Batalkan Draft</button> : null}
          {currentUser.role === 'admin' && status === 'done' ? <button className="button button--primary" onClick={onCloseOrder}>Tutup WO & Perbarui Stok</button> : null}
          {currentUser.role === 'manager' ? <span className="read-only-note">Mode manager: hanya melihat laporan dan histori.</span> : null}
        </section>

        <section className="drawer-section">
          <div className="section-heading"><div><p className="eyebrow">Alur proses</p><h3>Rute, WIP, dan pemilik langkah</h3></div><span>{workOrder.steps.length} proses</span></div>
          <div className="route-flow">
            {workOrder.steps.map((step, index) => {
              const stepStatus = deriveStepStatus(workOrder, step)
              return (
                <div className="route-flow__group" key={step.id}>
                  {index ? <Icon name="arrow" className="route-flow__arrow" /> : null}
                  <article className={`route-card route-card--${stepStatus}`}>
                    <span>P{String(index + 1).padStart(2, '0')}</span>
                    <b>{step.name}</b>
                    <small>{stationLabels[step.station]}</small>
                    <Badge kind="process" value={stepStatus} />
                  </article>
                </div>
              )
            })}
          </div>
        </section>

        <section className="drawer-section">
          <div className="section-heading"><div><p className="eyebrow">Tiket proses</p><h3>Catat pekerjaan per stasiun</h3></div></div>
          <div className="process-ticket-list">
            {workOrder.steps.map((step, index) => {
              const stepStatus = deriveStepStatus(workOrder, step)
              const inputCap = getAvailableInputCap(workOrder, step)
              const canOperate = canOperateStep(currentUser, step)
              const isAssigned = Boolean(step.assignedUserId)
              const canAssign = currentUser.role === 'ppic' && getStepRecordedQty(step) === 0 && !step.startedAt
              const capText = Number.isFinite(inputCap) ? `${formatNumber(inputCap)} tersedia` : 'Mulai langsung'
              return (
                <article className="process-ticket" key={step.id}>
                  <header>
                    <div>
                      <span className="process-ticket__index">P{String(index + 1).padStart(2, '0')} · {stationLabels[step.station]}</span>
                      <h4>{step.name}</h4>
                      <p>PIC: <b>{getMemberName(step.assignedUserId, team)}</b> · Lokasi: {step.location || 'Belum ditetapkan'}</p>
                    </div>
                    <Badge kind="process" value={stepStatus} />
                  </header>

                  <div className="process-ticket__metrics">
                    <div><span>Target</span><b>{formatNumber(step.plannedQty)}</b></div>
                    <div><span>Baik</span><b>{formatNumber(step.qtyGood)}</b></div>
                    <div><span>Rework</span><b>{formatNumber(step.qtyRework)}</b></div>
                    <div><span>Reject</span><b>{formatNumber(step.qtyReject)}</b></div>
                  </div>

                  <div className="process-ticket__meta-grid">
                    <div><span>Input WIP</span><b>{step.inputs.length ? step.inputs.join(' + ') : 'Tidak menunggu WIP'}</b><small>{step.inputs.length ? capText : 'Boleh dimulai setelah PPIC merilis WO'}</small></div>
                    <div><span>Output WIP</span><b>{step.output}</b><small>Sisa target: {formatNumber(getStepRemaining(step))}</small></div>
                  </div>

                  {step.station === 'printing' ? <div className="printing-artwork-panel">
                    <div><Icon name="image" /><span><b>Motif yang harus dicetak</b><small>{artworkImages.length ? `${artworkImages.length} gambar referensi tersedia. Buka gambar sebelum mulai cetak.` : 'Belum ada artwork visual. Tahan proses dan minta Admin / PPIC menambahkan gambar.'}</small></span></div>
                    {artworkImages.length ? <div className="printing-artwork-panel__thumbs">{artworkImages.map((image, index) => <button type="button" key={image.id} onClick={() => setActiveArtwork(image)}><img src={image.dataUrl} alt={`Motif ${index + 1}`} /><span>{index + 1}</span></button>)}</div> : null}
                  </div> : null}

                  {step.inputs.length ? (
                    <div className="wip-chip-row">
                      {step.inputs.map((input) => <span key={input} className="wip-chip">{input}: <b>{formatNumber(getWipBalance(workOrder, input))}</b></span>)}
                    </div>
                  ) : null}

                  {step.holdReason ? <div className="hold-box"><Icon name="warning" /> <span><b>HOLD</b> · {step.holdReason}</span></div> : null}

                  <div className="process-ticket__footer">
                    <span className={`timer-inline${step.startedAt ? ' timer-inline--running' : ''}`}><Icon name="clock" /> {formatDuration(getStepTimerSeconds(step, clock))}</span>
                    <div className="process-ticket__actions">
                      {canAssign ? <button className="button button--small button--secondary" onClick={() => onAssign(step)}>Atur PIC</button> : null}
                      {canOperate && stepStatus === 'ready' ? <button className="button button--small button--primary" onClick={() => onStart(step)}><Icon name="play" /> Mulai</button> : null}
                      {canOperate && stepStatus === 'in_progress' ? <button className="button button--small button--secondary" onClick={() => onPause(step)}><Icon name="pause" /> Jeda</button> : null}
                      {canOperate && stepStatus === 'in_progress' && step.station === 'qc' ? <button className="button button--small button--primary" onClick={() => onQcDecision(step)}>Keputusan QC</button> : null}
                      {canOperate && stepStatus === 'in_progress' && step.station !== 'qc' ? <button className="button button--small button--primary" onClick={() => onLogResult(step)}>Catat hasil</button> : null}
                      {canOperate && ['ready', 'in_progress'].includes(stepStatus) ? <button className="button button--small button--danger-soft" onClick={() => onHold(step)}>HOLD</button> : null}
                      {canOperate && stepStatus === 'hold' ? <button className="button button--small button--success-soft" onClick={() => onResume(step)}>Lanjutkan</button> : null}
                      {!isAssigned && currentUser.role === 'operator' ? <span className="quiet-action">Belum ditugaskan ke Anda</span> : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="drawer-section">
          <div className="section-heading"><div><p className="eyebrow">Riwayat</p><h3>Jejak keputusan WO</h3></div></div>
          <ol className="history-list">
            {workOrder.history.map((item) => (
              <li key={item.id}>
                <span className={`history-list__dot history-list__dot--${item.role}`} />
                <div>
                  <div className="history-list__topline"><b>{item.title}</b><time>{formatDateTime(item.at)}</time></div>
                  <p><strong>{item.actor}</strong>{item.note ? ` · ${item.note}` : ''}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </aside>
      {activeArtwork ? <div className="artwork-lightbox" role="dialog" aria-modal="true" aria-label={`Preview ${activeArtwork.name}`} onMouseDown={() => setActiveArtwork(null)}>
        <button type="button" className="artwork-lightbox__backdrop" aria-label="Tutup preview" />
        <figure onMouseDown={(event) => event.stopPropagation()}>
          <button type="button" className="icon-button" aria-label="Tutup preview" onClick={() => setActiveArtwork(null)}><Icon name="close" /></button>
          <img src={activeArtwork.dataUrl} alt={activeArtwork.name} />
          <figcaption><b>{activeArtwork.name}</b><span>Pastikan motif, warna, dan versi artwork sesuai sebelum proses Printing dimulai.</span></figcaption>
        </figure>
      </div> : null}
    </div>
  )
}

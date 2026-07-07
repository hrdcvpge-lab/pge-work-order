import { useState } from 'react'
import { Badge } from './Badge'
import { Icon } from './Icon'
import type { ProcessStep, StaffDirectoryMember, TeamMember, WorkOrder, WorkOrderReferenceImage } from '../types/workOrder'
import {
  artworkApprovalLabels,
  deriveOrderStatus,
  deriveStepStatus,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  getApprovedPrimaryArtwork,
  getArtworkReadiness,
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
  staffDirectory: StaffDirectoryMember[]
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
  onManageArtwork: () => void
}

const getMemberName = (id: string | undefined, team: TeamMember[], staffDirectory: StaffDirectoryMember[], fallback = 'Belum ditugaskan') => {
  if (!id) return fallback
  return staffDirectory.find((member) => member.id === id)?.name || team.find((member) => member.id === id)?.name || fallback
}

function canOperateStep(currentUser: TeamMember, step: ProcessStep) {
  // Assignment, not broad station membership, controls the frontend task scope.
  // The backend will repeat this rule with authenticated user IDs.
  return !['admin', 'ppic', 'manager'].includes(currentUser.role)
    && Boolean(step.assignedUserId)
    && step.assignedUserId === currentUser.id
}

function approvalClass(image: WorkOrderReferenceImage) {
  if (image.approvalStatus === 'approved') return 'artwork-status artwork-status--approved'
  if (image.approvalStatus === 'superseded') return 'artwork-status artwork-status--superseded'
  return 'artwork-status artwork-status--pending'
}

export function WorkOrderDrawer({
  workOrder,
  currentUser,
  team,
  staffDirectory,
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
  onManageArtwork,
}: Props) {
  const status = deriveOrderStatus(workOrder)
  const progress = getProgress(workOrder)
  const blocker = getBlockerSummary(workOrder)
  const currentStep = workOrder.steps.find((step) => deriveStepStatus(workOrder, step) === 'in_progress')
    || workOrder.steps.find((step) => ['ready', 'waiting_wip'].includes(deriveStepStatus(workOrder, step)))
  const currentStation = currentStep?.station || 'warehouse'
  const statusHeadline = status === 'draft'
    ? 'Draft · belum dijadwalkan'
    : currentStep
      ? `${currentStep.name} · ${stationLabels[currentStep.station]}`
      : status === 'closed'
        ? 'WO sudah ditutup'
        : 'WO sudah selesai'
  const statusNote = status === 'draft'
    ? 'Admin atau PPIC perlu menetapkan alur, PIC, penerima laporan, dan area kerja sebelum WO dideploy.'
    : blocker || (isOverdue(workOrder) ? 'Melewati target tanggal' : 'Tidak ada blocker aktif')
  const totalGood = workOrder.steps.filter((step) => step.station === 'packing').reduce((total, step) => total + step.qtyGood, 0)
  const totalReject = workOrder.steps.filter((step) => step.station === 'packing').reduce((total, step) => total + step.qtyReject, 0)
  const artworkImages = workOrder.referenceImages || []
  const finalArtwork = getApprovedPrimaryArtwork(workOrder)
  const artworkReadiness = getArtworkReadiness(workOrder)
  const artworkApprovalRequired = Boolean(workOrder.artworkApprovalRequired)
  const [activeArtwork, setActiveArtwork] = useState<WorkOrderReferenceImage | null>(null)
  const canManageArtwork = ['admin', 'ppic'].includes(currentUser.role)
  const canViewAllProcessTickets = ['admin', 'ppic', 'manager'].includes(currentUser.role)
  const visibleProcessTickets = canViewAllProcessTickets
    ? workOrder.steps
    : workOrder.steps.filter((step) => step.assignedUserId === currentUser.id)

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

        <section className={`drawer-status-band drawer-status-band--station-${currentStation}`}>
          <div>
            <div className="drawer-status-band__topline"><Badge kind="status" value={status} /><Badge kind="priority" value={workOrder.priority} /><Badge kind="type" value={workOrder.type} />{currentStep ? <Badge kind="station" value={currentStep.station} /> : null}</div>
            <strong>{statusHeadline}</strong>
            <span>{statusNote}</span>
          </div>
          <div className="drawer-progress-number"><b>{progress}%</b><span>Progress packing</span></div>
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
          <div className="section-heading">
            <div><p className="eyebrow">Artwork & motif</p><h3>{artworkApprovalRequired ? 'Kontrol file sebelum Printing' : 'Artwork sebagai referensi opsional'}</h3></div>
            <div className="section-heading__actions"><span>{artworkApprovalRequired ? 'Approval wajib' : 'Opsional'} · {artworkImages.length} file</span>{canManageArtwork ? <button type="button" className="button button--secondary button--compact" onClick={onManageArtwork}>Kelola artwork</button> : null}</div>
          </div>

          {finalArtwork ? <article className="final-artwork-card">
            <button type="button" className="final-artwork-card__image" onClick={() => setActiveArtwork(finalArtwork)}><img src={finalArtwork.dataUrl} alt={`${artworkApprovalRequired ? 'FINAL PRINT FILE' : 'Artwork reference'} ${finalArtwork.name}`} /></button>
            <div className="final-artwork-card__copy">
              <span className="final-artwork-card__eyebrow"><Icon name="check" /> {artworkApprovalRequired ? 'FINAL PRINT FILE' : 'ARTWORK REFERENCE · OPSIONAL'}</span>
              <h4>{finalArtwork.name}</h4>
              <p>{artworkApprovalRequired ? <>Versi <b>{finalArtwork.version}</b> · disetujui untuk cetak oleh <b>{finalArtwork.approvedBy || 'PPIC / R&D'}</b>.</> : <>Versi <b>{finalArtwork.version}</b> · file ini tersedia sebagai referensi, tanpa mengunci Printing.</>}</p>
              {finalArtwork.printNote ? <div className="final-artwork-card__note">{finalArtwork.printNote}</div> : null}
              <button type="button" className="button button--primary button--compact" onClick={() => setActiveArtwork(finalArtwork)}><Icon name="image" /> {artworkApprovalRequired ? 'Buka file final' : 'Buka artwork'}</button>
            </div>
          </article> : artworkApprovalRequired ? <div className="artwork-missing"><Icon name="warning" /><span><b>Printing belum boleh dimulai.</b> {artworkReadiness.reason}{canManageArtwork ? ' Kelola artwork untuk menetapkan versi final dan persetujuan.' : ''}</span></div> : null}

          {artworkImages.length ? <>
            <p className="artwork-section__hint">{artworkApprovalRequired ? <>Hanya file bertanda <b>FINAL PRINT FILE</b> yang boleh dijadikan acuan produksi. Versi lama tetap disimpan untuk audit, tetapi tidak boleh dicetak.</> : 'Artwork pada WO ini bersifat referensi. Admin / PPIC dapat mengaktifkan approval wajib melalui Kelola artwork bila file final perlu dikunci.'}</p>
            <div className="artwork-gallery">
              {artworkImages.map((image) => <button type="button" className={`artwork-gallery__item${image.isPrimary ? ' artwork-gallery__item--primary' : ''}`} key={image.id} onClick={() => setActiveArtwork(image)}>
                <img src={image.dataUrl} alt={`${image.name} ${image.version}`} />
                <span><small>{image.version}</small><b>{image.isPrimary ? (artworkApprovalRequired ? 'FINAL PRINT FILE' : 'Artwork reference') : image.name}</b><em className={approvalClass(image)}>{artworkApprovalLabels[image.approvalStatus]}</em></span>
              </button>)}
            </div>
          </> : !artworkApprovalRequired ? <div className="artwork-missing"><Icon name="image" /><span><b>Tidak ada gambar artwork.</b> Tidak masalah—artwork tidak diwajibkan untuk WO ini. Tambahkan file hanya bila motif perlu menjadi acuan operator.</span></div> : null}
        </section>

        <section className="drawer-section drawer-section--actions">
          {['admin', 'ppic'].includes(currentUser.role) && status === 'draft' ? <button className="button button--primary" onClick={onSchedule}>Rencanakan & deploy WO</button> : null}
          {currentUser.role === 'admin' && status === 'draft' ? <button className="button button--danger-soft" onClick={onCancel}>Batalkan Draft</button> : null}
          {currentUser.role === 'admin' && status === 'done' ? <button className="button button--primary" onClick={onCloseOrder}>Tutup WO & Perbarui Stok</button> : null}
          {currentUser.role === 'manager' ? <span className="read-only-note">Mode manager: hanya melihat laporan dan histori.</span> : null}
        </section>

        <section className="drawer-section">
          <div className="section-heading"><div><p className="eyebrow">Alur proses</p><h3>Rute, WIP, dan pemilik langkah</h3></div><span>{workOrder.steps.length} proses</span></div>
          <div className="route-flow">
            {workOrder.steps.map((step, index) => {
              const stepStatus = deriveStepStatus(workOrder, step)
              const isCurrent = currentStep?.id === step.id
              return <div className="route-flow__group" key={step.id}>{index ? <Icon name="arrow" className="route-flow__arrow" /> : null}<article className={`route-card route-card--${stepStatus} route-card--station-${step.station}${isCurrent ? ' route-card--current' : ''}`}><span>P{String(index + 1).padStart(2, '0')}</span><b>{step.name}</b><small>{stationLabels[step.station]}</small><div className="route-card__badges"><Badge kind="station" value={step.station} /><Badge kind="process" value={stepStatus} /></div></article></div>
            })}
          </div>
        </section>

        <section className="drawer-section">
          <div className="section-heading"><div><p className="eyebrow">Tiket proses</p><h3>{canViewAllProcessTickets ? 'Catat pekerjaan per stasiun' : 'Tiket proses saya'}</h3></div></div>
          {!canViewAllProcessTickets ? <div className="assignment-scope-banner"><Icon name="user" /><span>Anda hanya dapat melihat dan menjalankan tiket yang ditugaskan langsung kepada akun Anda. Alur di atas tetap terlihat sebagai konteks WO.</span><b>{visibleProcessTickets.length} tiket</b></div> : null}
          <div className="process-ticket-list">
            {visibleProcessTickets.length ? visibleProcessTickets.map((step) => {
              const stepStatus = deriveStepStatus(workOrder, step)
              const inputCap = getAvailableInputCap(workOrder, step)
              const canOperate = canOperateStep(currentUser, step)
              const canAssign = ['admin', 'ppic'].includes(currentUser.role) && getStepRecordedQty(step) === 0 && !step.startedAt
              const isPrinting = step.station === 'printing'
              const startBlocked = isPrinting && !artworkReadiness.ready
              const isCurrent = currentStep?.id === step.id
              return <article className={`process-ticket process-ticket--station-${step.station}${isCurrent ? ' process-ticket--current' : ''}`} key={step.id}>
                <header><div><span className="process-ticket__index">P{String(step.sequence).padStart(2, '0')} · {stationLabels[step.station]}</span><h4>{step.name}</h4><p>PIC: <b>{getMemberName(step.assignedUserId, team, staffDirectory)}</b> · Lapor ke: <b>{getMemberName(step.reportToUserId, team, staffDirectory, 'Belum ditetapkan')}</b> · Area: {step.location || 'Belum ditetapkan'}</p></div><div className="process-ticket__header-badges"><Badge kind="station" value={step.station} /><Badge kind="process" value={stepStatus} /></div></header>
                <div className="process-ticket__meta-grid"><div><span>Target</span><b>{formatNumber(step.plannedQty)}</b></div><div><span>Hasil baik</span><b>{formatNumber(step.qtyGood)}</b></div><div><span>Sisa</span><b>{formatNumber(getStepRemaining(step))}</b></div><div><span>Timer</span><b>{formatDuration(getStepTimerSeconds(step, clock))}</b></div></div>
                <div className="process-ticket__inputs"><b>Input WIP</b><span>{step.inputs.length ? step.inputs.map((input) => `${input}: ${formatNumber(getWipBalance(workOrder, input))}`).join(' · ') : 'Mulai langsung'}</span><small>{Number.isFinite(inputCap) ? `Maksimal dapat diproses sekarang: ${formatNumber(inputCap)} unit` : 'Tidak menunggu WIP dari proses sebelumnya.'}</small></div>
                {isPrinting && finalArtwork ? <div className="printing-final-panel">
                  <button type="button" onClick={() => setActiveArtwork(finalArtwork)}><img src={finalArtwork.dataUrl} alt={finalArtwork.name} /></button><div><span>{artworkApprovalRequired ? `FINAL PRINT FILE · ${finalArtwork.version}` : `Artwork reference · ${finalArtwork.version} · opsional`}</span><b>{finalArtwork.name}</b><small>{finalArtwork.printNote || (artworkApprovalRequired ? 'Buka file final sebelum mulai cetak.' : 'File ini dapat dipakai sebagai referensi operator.')}</small>{artworkApprovalRequired ? (step.artworkConfirmedAt ? <em><Icon name="check" /> Diverifikasi oleh {step.artworkConfirmedBy} · {formatDateTime(step.artworkConfirmedAt)}</em> : <em><Icon name="warning" /> Operator wajib review dan konfirmasi file final saat mulai.</em>) : <em><Icon name="check" /> Approval artwork tidak diwajibkan untuk WO ini.</em>}</div>
                </div> : null}
                {isPrinting && artworkApprovalRequired && !finalArtwork ? <div className="printing-final-panel printing-final-panel--blocked"><Icon name="warning" /><div><b>Printing diblokir</b><small>{artworkReadiness.reason}</small></div></div> : null}
                {step.holdReason ? <div className="hold-box"><Icon name="warning" /> {step.holdReason}</div> : null}
                <footer className="process-ticket__footer"><div className="process-ticket__actions">
                  {canAssign ? <button className="button button--secondary" onClick={() => onAssign(step)}>Atur PIC</button> : null}
                  {canOperate && stepStatus === 'ready' ? <button className="button button--primary" disabled={startBlocked} title={startBlocked ? artworkReadiness.reason : undefined} onClick={() => onStart(step)}><Icon name="play" /> {isPrinting ? (artworkApprovalRequired ? 'Review & mulai cetak' : 'Mulai cetak') : 'Mulai proses'}</button> : null}
                  {canOperate && stepStatus === 'in_progress' ? <button className="button button--secondary" onClick={() => onPause(step)}><Icon name="pause" /> Jeda</button> : null}
                  {canOperate && stepStatus === 'in_progress' && step.station === 'qc' ? <button className="button button--primary" onClick={() => onQcDecision(step)}>Keputusan QC</button> : null}
                  {canOperate && stepStatus === 'in_progress' && step.station !== 'qc' ? <button className="button button--primary" onClick={() => onLogResult(step)}>Catat hasil</button> : null}
                  {canOperate && ['ready', 'in_progress'].includes(stepStatus) ? <button className="button button--danger-soft" onClick={() => onHold(step)}>HOLD</button> : null}
                  {canOperate && stepStatus === 'hold' ? <button className="button button--success-soft" onClick={() => onResume(step)}>Lanjutkan</button> : null}
                </div></footer>
              </article>
            }) : <div className="empty-state">Belum ada tiket proses yang ditugaskan langsung kepada akun ini.</div>}
          </div>
        </section>

        <section className="drawer-section">
          <div className="section-heading"><div><p className="eyebrow">Riwayat</p><h3>Audit aktivitas WO</h3></div></div>
          <div className="history-list">{workOrder.history.map((item) => <article className="history-item" key={item.id}><span className="history-item__dot" /><div><b>{item.title}</b><p>{item.actor}{item.note ? ` · ${item.note}` : ''}</p></div><time>{formatDateTime(item.at)}</time></article>)}</div>
        </section>
      </aside>

      {activeArtwork ? <div className="artwork-lightbox" role="dialog" aria-modal="true" aria-label="Preview artwork"><button className="artwork-lightbox__backdrop" onClick={() => setActiveArtwork(null)} aria-label="Tutup preview" /><figure><button type="button" className="icon-button" onClick={() => setActiveArtwork(null)} aria-label="Tutup preview"><Icon name="close" /></button><img src={activeArtwork.dataUrl} alt={activeArtwork.name} /><figcaption><span className={approvalClass(activeArtwork)}>{activeArtwork.isPrimary ? 'FINAL PRINT FILE · ' : ''}{artworkApprovalLabels[activeArtwork.approvalStatus]}</span><b>{activeArtwork.name} · {activeArtwork.version}</b><span>{activeArtwork.printNote || 'Tidak ada instruksi cetak tambahan.'}</span></figcaption></figure></div> : null}
    </div>
  )
}

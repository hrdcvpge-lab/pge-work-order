import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { Icon } from './Icon'
import type { ProcessStep, StaffDirectoryMember, TeamMember, WorkOrder, WorkOrderReferenceImage, WorkOrderShortfall } from '../types/workOrder'
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
  getCloseReadiness,
  getOrderActiveSeconds,
  getPackingGood,
  getFinalProcessStep,
  isFinalStockInStep,
  isFinalPackingStep,
  getProgress,
  getShortfallSummary,
  getStepExtraQty,
  getStepGradeBQty,
  getStepHoldSortirQty,
  getStepPendingReworkQty,
  getStepScrapQty,
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
  onArchiveOrder: () => void
  onCancel: () => void
  onManageArtwork: () => void
  onResolveShortfall: (shortfall: WorkOrderShortfall) => void
  onReviewShortfall: (shortfall: WorkOrderShortfall) => void
  onResolveRework: () => void
}

const getMemberName = (id: string | undefined, team: TeamMember[], staffDirectory: StaffDirectoryMember[], fallback = 'Belum ditugaskan') => {
  if (!id) return fallback
  return staffDirectory.find((member) => member.id === id)?.name || fallback
}

const getMemberAccessMode = (id: string | undefined, staffDirectory: StaffDirectoryMember[]) => {
  if (!id) return undefined
  return staffDirectory.find((member) => member.id === id)?.accessMode
}

function canOperateStep(currentUser: TeamMember, step: ProcessStep) {
  // Admin and PPIC may record progress for admin-assisted employees, such as Sewing.
  // Floor users still only operate tickets explicitly assigned to their own login account.
  if (['admin', 'ppic'].includes(currentUser.role)) return Boolean(step.assignedUserId)
  if (currentUser.role === 'manager') return false
  return Boolean(step.assignedUserId) && step.assignedUserId === currentUser.id
}

function typeLabelsForDrawer(type: WorkOrder['type']) {
  return type === 'mts' ? 'Produksi Stok' : 'Pesanan Customer'
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
  onArchiveOrder,
  onCancel,
  onManageArtwork,
  onResolveShortfall,
  onReviewShortfall,
  onResolveRework,
}: Props) {
  const status = deriveOrderStatus(workOrder)
  const progress = getProgress(workOrder)
  const blocker = getBlockerSummary(workOrder)
  const shortfallSummary = getShortfallSummary(workOrder)
  const pendingReworkQty = shortfallSummary.pendingReworkQty
  const hasPendingRework = pendingReworkQty > 0
  const isTerminalFulfilled = status === 'done' || status === 'closed' || status === 'cancelled' || shortfallSummary.isFulfilled
  const activeStep = hasPendingRework || isTerminalFulfilled ? undefined : workOrder.steps.find((step) => deriveStepStatus(workOrder, step) === 'in_progress')
  const currentStep = hasPendingRework || isTerminalFulfilled ? undefined : activeStep
    || workOrder.steps.find((step) => ['ready', 'waiting_wip', 'partial_paused'].includes(deriveStepStatus(workOrder, step)))
  const currentStation = hasPendingRework ? 'qc' : currentStep?.station || 'warehouse'
  const showLiveProcessIndicator = ['admin', 'ppic'].includes(currentUser.role) && Boolean(activeStep)
  const statusHeadline = status === 'draft'
    ? 'Draft · belum dijadwalkan'
    : hasPendingRework
      ? 'Pending rework perlu diselesaikan'
      : isTerminalFulfilled
        ? (status === 'closed' ? 'WO sudah ditutup' : 'WO selesai diproses')
        : currentStep
        ? `${currentStep.name} · ${stationLabels[currentStep.station]}`
        : 'Tidak ada proses aktif'
  const closeReadiness = getCloseReadiness(workOrder)
  const statusNote = status === 'draft'
    ? 'Admin atau PPIC perlu menetapkan alur, PIC, penerima laporan, dan area kerja sebelum WO dideploy.'
    : hasPendingRework
      ? `${formatNumber(pendingReworkQty)} unit pending rework harus diselesaikan atau diklasifikasikan sebelum WO selesai.`
      : isTerminalFulfilled
        ? (status === 'closed' ? 'WO sudah read-only. Gunakan Laporan untuk evaluasi.' : 'Target WO sudah terpenuhi. Tidak ada proses lama yang boleh dijalankan ulang. PPIC dapat Close WO.')
        : shortfallSummary.actionRequiredQty > 0
      ? `Kekurangan ${formatNumber(shortfallSummary.actionRequiredQty)} unit membutuhkan keputusan Admin / PPIC.`
      : shortfallSummary.replacementRemainingQty > 0
        ? `Penggantian ${formatNumber(shortfallSummary.replacementRemainingQty)} unit sedang berjalan.`
        : blocker || (isOverdue(workOrder) ? 'Melewati target tanggal' : 'Tidak ada blocker aktif')
  const finalStep = getFinalProcessStep(workOrder)
  const totalGood = getPackingGood(workOrder) || finalStep?.qtyGood || 0
  const totalReject = workOrder.steps.reduce((total, step) => total + step.qtyReject + getStepGradeBQty(step) + getStepHoldSortirQty(step) + getStepScrapQty(step), 0)
  const extraQty = shortfallSummary.extraQty
  const isStockProduction = workOrder.type === 'mts'
  const finalStepLabel = isStockProduction ? 'Masuk Gudang / Stok Tersedia' : 'Packing / Siap Kirim'
  const currentActionTitle = hasPendingRework
    ? 'Pending rework perlu diselesaikan'
    : isTerminalFulfilled
      ? (status === 'closed' ? 'WO sudah ditutup' : 'WO selesai diproses')
      : currentStep
      ? deriveStepStatus(workOrder, currentStep) === 'in_progress'
        ? `${currentStep.name} sedang dikerjakan`
        : `${currentStep.name} siap ditindaklanjuti`
      : 'Tidak ada aksi aktif'
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

  const [expandedStepId, setExpandedStepId] = useState<string | undefined>(undefined)

  useEffect(() => {
    setExpandedStepId(currentStep?.id || visibleProcessTickets[0]?.id || workOrder.steps[0]?.id)
  }, [workOrder.id, currentStep?.id, visibleProcessTickets.length])

  const closeDetail = () => {
    setActiveArtwork(null)
    onClose()
  }


  const renderProcessDetail = (step: ProcessStep) => {
    const stepStatus = deriveStepStatus(workOrder, step)
    const inputCap = getAvailableInputCap(workOrder, step)
    const canOperate = !isTerminalFulfilled && canOperateStep(currentUser, step)
    const normalActionBlockedByRework = hasPendingRework && stepStatus !== 'in_progress'
    const canAssign = !isTerminalFulfilled && ['admin', 'ppic'].includes(currentUser.role) && getStepRecordedQty(step) === 0 && !step.startedAt
    const performerAccessMode = getMemberAccessMode(step.assignedUserId, staffDirectory)
    const isAdminAssisted = performerAccessMode === 'admin_assisted' && ['admin', 'ppic'].includes(currentUser.role)
    const isPrinting = step.station === 'printing'
    const isStockInStep = isFinalStockInStep(workOrder, step)
    const isPackingStep = isFinalPackingStep(workOrder, step)
    const resultQtyLabel = isStockInStep ? 'Masuk gudang' : isPackingStep ? 'Siap kirim' : 'Hasil baik'
    const stepExtra = getStepExtraQty(step)
    const stepPendingRework = getStepPendingReworkQty(step)
    const stepClassifiedQty = getStepGradeBQty(step) + getStepHoldSortirQty(step) + getStepScrapQty(step)
    const logResultLabel = isStockInStep ? 'Catat stok masuk' : isPackingStep ? 'Catat packing' : isAdminAssisted ? 'Catat hasil PIC' : 'Catat hasil'
    const startBlocked = isPrinting && !artworkReadiness.ready
    const isCurrent = currentStep?.id === step.id
    const isLive = showLiveProcessIndicator && activeStep?.id === step.id
    const cannotOperateAssignedScope = !canViewAllProcessTickets && step.assignedUserId !== currentUser.id

    return <article className={`process-ticket route-step-detail process-ticket--station-${step.station}${step.isReplacement ? ' process-ticket--replacement' : ''}${isCurrent ? ' process-ticket--current' : ''}${isLive ? ' process-ticket--live' : ''}`}>
      <header>
        <div>
          <span className="process-ticket__index">P{String(step.sequence).padStart(2, '0')} · {stationLabels[step.station]}</span>
          <h4>{step.name}</h4>
          <p>PIC: <b>{getMemberName(step.assignedUserId, team, staffDirectory)}</b> · Lapor ke: <b>{getMemberName(step.reportToUserId, team, staffDirectory, 'Belum ditetapkan')}</b> · Area: {step.location || 'Belum ditetapkan'} · Rencana: {step.scheduledDate ? formatDate(step.scheduledDate) : 'Belum dijadwalkan'}{step.isReplacement ? ' · Rute penggantian' : ''}</p>
        </div>
        <div className="process-ticket__header-badges"><Badge kind="station" value={step.station} /><Badge kind="process" value={stepStatus} />{step.isReplacement ? <em className="replacement-indicator">↻ Penggantian</em> : null}{isLive ? <em className="current-process-indicator">● Aktif sekarang</em> : null}</div>
      </header>

      <div className="process-ticket__meta-grid route-step-detail__metrics">
        <div><span>Target</span><b>{formatNumber(step.plannedQty)}</b></div>
        <div><span>{resultQtyLabel}</span><b>{formatNumber(step.qtyGood)}</b></div>
        <div><span>Sisa</span><b>{formatNumber(getStepRemaining(step))}</b></div>
        <div><span>Timer</span><b>{formatDuration(getStepTimerSeconds(step, clock))}</b></div>
        {stepExtra > 0 ? <div><span>Extra produksi</span><b className="text-warning">+{formatNumber(stepExtra)}</b></div> : null}
        {stepPendingRework > 0 ? <div><span>Pending rework</span><b className="text-danger">{formatNumber(stepPendingRework)}</b></div> : null}
        {stepClassifiedQty > 0 ? <div><span>Grade/Hold/Scrap</span><b>{formatNumber(stepClassifiedQty)}</b></div> : null}
      </div>

      <div className="process-ticket__input-panel route-step-detail__input-panel">
        <div className="process-ticket__input-hero">
          <span>Input proses</span>
          <b>{step.inputs.length ? 'Perlu input proses' : 'Mulai langsung'}</b>
          <small>{step.inputs.length ? `${step.inputs.length} sumber input dibutuhkan` : 'Tidak menunggu hasil proses sebelumnya.'}</small>
        </div>
        <div className="process-ticket__input-chips">
          <span>Detail input</span>
          {step.inputs.length ? step.inputs.map((input) => <em key={input}>{input}<strong>{formatNumber(getWipBalance(workOrder, input))}</strong></em>) : <em>Tanpa input sebelumnya<strong>Siap</strong></em>}
        </div>
        <div className="process-ticket__input-capacity">
          <span>Kapasitas saat ini</span>
          <b>{Number.isFinite(inputCap) ? `${formatNumber(inputCap)} unit` : 'Siap'}</b>
          <small>{Number.isFinite(inputCap) ? 'Maksimal dapat diproses sekarang' : 'Proses dapat langsung dimulai'}</small>
        </div>
      </div>

      {isPrinting && finalArtwork ? <div className="printing-final-panel">
        <button type="button" onClick={() => setActiveArtwork(finalArtwork)}><img src={finalArtwork.dataUrl} alt={finalArtwork.name} /></button><div><span>{artworkApprovalRequired ? `FINAL PRINT FILE · ${finalArtwork.version}` : `Artwork reference · ${finalArtwork.version} · opsional`}</span><b>{finalArtwork.name}</b><small>{finalArtwork.printNote || (artworkApprovalRequired ? 'Buka file final sebelum mulai cetak.' : 'File ini dapat dipakai sebagai referensi operator.')}</small>{artworkApprovalRequired ? (step.artworkConfirmedAt ? <em><Icon name="check" /> Diverifikasi oleh {step.artworkConfirmedBy} · {formatDateTime(step.artworkConfirmedAt)}</em> : <em><Icon name="warning" /> Operator wajib review dan konfirmasi file final saat mulai.</em>) : <em><Icon name="check" /> Approval artwork tidak diwajibkan untuk WO ini.</em>}</div>
      </div> : null}
      {isPrinting && artworkApprovalRequired && !finalArtwork ? <div className="printing-final-panel printing-final-panel--blocked"><Icon name="warning" /><div><b>Printing diblokir</b><small>{artworkReadiness.reason}</small></div></div> : null}
      {step.holdReason ? <div className="hold-box"><Icon name="warning" /> {step.holdReason}</div> : null}
      {isAdminAssisted ? <div className="assisted-progress-box"><Icon name="user" /><span><b>Update dibantu Admin/PPIC.</b> PIC aktual tetap {getMemberName(step.assignedUserId, team, staffDirectory)}, tetapi progress dicatat oleh akun yang sedang login.</span></div> : null}
      {cannotOperateAssignedScope ? <div className="process-ticket__locked-note"><Icon name="user" /> Tiket ini tidak ditugaskan ke akun Anda. Detail ditampilkan sebagai konteks alur.</div> : null}
      {isTerminalFulfilled ? <div className="process-ticket__locked-note"><Icon name="check" /> WO sudah terpenuhi. Tiket proses dikunci untuk mencegah input ganda.</div> : null}

      <footer className="process-ticket__footer"><div className="process-ticket__actions">
        {canAssign ? <button className="button button--secondary" onClick={() => onAssign(step)}>Atur PIC</button> : null}
        {canOperate && !normalActionBlockedByRework && ['ready', 'partial_paused'].includes(stepStatus) ? <button className="button button--primary" disabled={startBlocked} title={startBlocked ? artworkReadiness.reason : undefined} onClick={() => onStart(step)}><Icon name="play" /> {stepStatus === 'partial_paused' ? 'Lanjutkan proses' : isPrinting ? (artworkApprovalRequired ? 'Review & mulai cetak' : 'Mulai cetak') : isAdminAssisted ? 'Mulai atas nama PIC' : 'Mulai proses'}</button> : null}
        {canOperate && stepStatus === 'in_progress' ? <button className="button button--secondary" onClick={() => onPause(step)}><Icon name="pause" /> Jeda</button> : null}
        {canOperate && stepStatus === 'in_progress' && step.station === 'qc' ? <button className="button button--primary" onClick={() => onQcDecision(step)}>Keputusan QC</button> : null}
        {canOperate && stepStatus === 'in_progress' && step.station !== 'qc' ? <button className="button button--primary" onClick={() => onLogResult(step)}>{logResultLabel}</button> : null}
        {canOperate && !normalActionBlockedByRework && ['ready', 'partial_paused', 'in_progress'].includes(stepStatus) ? <button className="button button--danger-soft" onClick={() => onHold(step)}>HOLD</button> : null}
        {canOperate && stepStatus === 'hold' ? <button className="button button--success-soft" onClick={() => onResume(step)}>Lanjutkan</button> : null}
      </div></footer>
    </article>
  }

  const actionButtons = <>
    {['admin', 'ppic'].includes(currentUser.role) && status === 'draft' ? <button className="button button--primary" onClick={onSchedule}>Rencanakan & deploy WO</button> : null}
    {currentUser.role === 'admin' && status === 'draft' ? <button className="button button--danger-soft" onClick={onCancel}>Batalkan Draft</button> : null}
    {currentUser.role === 'ppic' && status === 'done' ? <button className="button button--primary" onClick={onCloseOrder}>Close WO</button> : null}
    {currentUser.role === 'ppic' && status === 'closed' && !workOrder.isArchived ? <button className="button button--secondary" onClick={onArchiveOrder}>Archive WO</button> : null}
    {currentUser.role === 'manager' ? <span className="read-only-note">Mode manager: hanya melihat laporan dan histori.</span> : null}
  </>

  return (
    <div className="drawer-layer wo-modal-layer" role="dialog" aria-modal="true" aria-label={`Detail ${workOrder.code}`}>
      <div className="drawer-layer__backdrop wo-modal-layer__backdrop" aria-hidden="true" />
      <aside className="wo-drawer wo-detail-modal" aria-label={`Detail ${workOrder.code}`}>
        <header className="wo-drawer__header">
          <div>
            <p className="eyebrow">{workOrder.code}</p>
            <h2>{workOrder.product}</h2>
            <p className="drawer-product">{typeLabelsForDrawer(workOrder.type)} · Target {formatNumber(workOrder.qty)} unit · Due {formatDate(workOrder.dueDate)}</p>
          </div>
          <button className="icon-button" type="button" onClick={closeDetail} aria-label="Tutup detail"><Icon name="close" /></button>
        </header>

        <div className="wo-detail-modal__body">
        <section className={`drawer-status-band drawer-status-band--station-${currentStation}${showLiveProcessIndicator ? ' drawer-status-band--live' : ''}`}>
          <div>
            <div className="drawer-status-band__topline"><Badge kind="status" value={status} /><Badge kind="priority" value={workOrder.priority} /><Badge kind="type" value={workOrder.type} />{currentStep ? <Badge kind="station" value={currentStep.station} /> : null}</div>
            <strong>{statusHeadline}</strong>
            {showLiveProcessIndicator ? <em className="live-process-banner">● Proses aktif sekarang</em> : null}
            <span>{statusNote}</span>
          </div>
          <div className="drawer-progress-number"><b>{progress}%</b><span>{isStockProduction ? 'Progress masuk gudang' : 'Progress siap kirim'}</span></div>
        </section>

        <section className="drawer-section current-action-panel">
          <div className="current-action-panel__copy">
            <p className="eyebrow">Aksi saat ini</p>
            <h3>{currentActionTitle}</h3>
            {hasPendingRework ? <p><b>{formatNumber(pendingReworkQty)} unit</b> belum bisa dihitung selesai. Pilih hasil akhirnya: stok baik, Grade B, Hold Sortir, atau Scrap.</p> : isTerminalFulfilled ? <p>{status === 'closed' ? 'WO sudah read-only. Gunakan Laporan untuk evaluasi.' : 'Semua kuantitas sudah terpenuhi. Proses lama dikunci agar tidak terjadi input ganda.'}</p> : currentStep ? <p>PIC: <b>{getMemberName(currentStep.assignedUserId, team, staffDirectory)}</b> · Input proses: <b>{currentStep.inputs.length ? currentStep.inputs.join(', ') : 'Mulai langsung'}</b></p> : <p>Tidak ada proses yang menunggu tindakan.</p>}
          </div>
          {hasPendingRework && ['admin', 'ppic'].includes(currentUser.role) ? <button type="button" className="button button--warning" onClick={onResolveRework}>Selesaikan rework</button> : isTerminalFulfilled ? <div className="current-action-panel__metric current-action-panel__metric--done"><span>Status</span><b>{status === 'closed' ? 'Read-only' : 'Siap Close WO'}</b></div> : currentStep ? <div className="current-action-panel__metric"><span>Kapasitas saat ini</span><b>{Number.isFinite(getAvailableInputCap(workOrder, currentStep)) ? `${formatNumber(getAvailableInputCap(workOrder, currentStep))} unit` : 'Siap'}</b></div> : null}
        </section>

        <section className="drawer-section">
          <div className="detail-grid detail-grid--four">
            <div><span>Target</span><b>{formatNumber(workOrder.qty)} unit</b></div>
            <div><span>Target selesai</span><b className={isOverdue(workOrder) ? 'text-danger' : ''}>{formatDate(workOrder.dueDate)}</b></div>
            <div><span>Waktu aktif</span><b>{formatDuration(getOrderActiveSeconds(workOrder, clock))}</b></div>
            <div><span>Hasil akhir</span><b>{formatNumber(totalGood)} {isStockProduction ? 'masuk gudang' : 'siap kirim'} · {formatNumber(totalReject)} klasifikasi/reject</b></div>
          </div>
          <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
        </section>

        <section className={`drawer-section shortfall-section${shortfallSummary.actionRequiredQty > 0 ? ' shortfall-section--action' : shortfallSummary.awaitingApprovalQty > 0 ? ' shortfall-section--pending' : shortfallSummary.replacementRemainingQty > 0 ? ' shortfall-section--replacement' : ''}`}>
          <div className="section-heading">
            <div><p className="eyebrow">{isStockProduction ? 'Hasil stok & reject' : 'Kekurangan & penggantian'}</p><h3>{isStockProduction ? 'Reject stok dicatat ke gudang, tanpa approval shortfall' : 'Target customer harus tetap dipertanggungjawabkan'}</h3></div>
            <div className="section-heading__actions">{shortfallSummary.actionRequiredQty > 0 ? <Badge kind="shortfall" value="action_required" /> : shortfallSummary.awaitingApprovalQty > 0 ? <Badge kind="shortfall" value="awaiting_approval" /> : shortfallSummary.replacementRemainingQty > 0 ? <Badge kind="shortfall" value="replacement_planned" /> : <Badge kind="shortfall" value="resolved" />}</div>
          </div>
          <div className="shortfall-metric-grid">
            <div><span>Target WO</span><b>{formatNumber(workOrder.qty)}</b></div>
            <div><span>{isStockProduction ? 'Masuk gudang' : 'Terpacking'}</span><b>{formatNumber(shortfallSummary.packedGood)}</b></div>
            <div><span>{isStockProduction ? 'Reject / klasifikasi gudang' : 'Keputusan disetujui'}</span><b>{formatNumber(shortfallSummary.approvedQty)}</b></div>
            <div><span>Masih perlu dipenuhi</span><b className={shortfallSummary.remainingQty > 0 ? 'text-danger' : ''}>{formatNumber(shortfallSummary.remainingQty)}</b></div>
            <div><span>Extra produksi</span><b className={extraQty > 0 ? 'text-warning' : ''}>{extraQty > 0 ? `+${formatNumber(extraQty)}` : '0'}</b></div>
            <div><span>Pending rework</span><b className={pendingReworkQty > 0 ? 'text-danger' : ''}>{formatNumber(pendingReworkQty)}</b></div>
          </div>
          {pendingReworkQty > 0 ? <div className="shortfall-close-note"><Icon name="warning" /><span>{formatNumber(pendingReworkQty)} unit masih pending rework. Selesaikan atau klasifikasikan sebelum WO dianggap selesai.</span>{['admin', 'ppic'].includes(currentUser.role) ? <button type="button" className="button button--warning button--compact" onClick={onResolveRework}>Selesaikan rework</button> : null}</div> : null}
          {extraQty > 0 ? <div className="shortfall-empty shortfall-empty--warning"><Icon name="check" /> Extra produksi +{formatNumber(extraQty)} unit tercatat. Target WO tidak berubah.</div> : null}
          {workOrder.shortfalls?.length ? <div className="shortfall-list">
            {workOrder.shortfalls.map((item) => <article className={`shortfall-row shortfall-row--${item.status}`} key={item.id}>
              <div className="shortfall-row__copy"><b>{formatNumber(item.qty)} unit · {item.sourceStepName}</b><span>{item.origin === 'qc_final_reject' ? 'Reject final QC' : 'Reject proses'} · {item.note || 'Tidak ada catatan tambahan.'}</span>{item.resolutionNote ? <small>Keputusan: {item.resolutionNote}</small> : null}</div>
              <div className="shortfall-row__right"><Badge kind="shortfall" value={item.status} />{['admin', 'ppic'].includes(currentUser.role) && item.status === 'action_required' ? <button type="button" className="button button--warning button--compact" onClick={() => onResolveShortfall(item)}>Tentukan tindakan</button> : null}{currentUser.role === 'manager' && item.status === 'awaiting_approval' ? <button type="button" className="button button--primary button--compact" onClick={() => onReviewShortfall(item)}>Tinjau permohonan</button> : null}</div>
            </article>)}
          </div> : <div className="shortfall-empty"><Icon name="check" /> {isStockProduction ? 'Belum ada reject stok yang perlu diklasifikasikan.' : 'Target WO belum memiliki reject atau kekurangan yang memerlukan keputusan.'}</div>}
          {!closeReadiness.ready && ['admin', 'ppic'].includes(currentUser.role) ? <div className="shortfall-close-note"><Icon name="warning" /><span>{closeReadiness.reason}</span></div> : null}
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

        <section className="drawer-section process-accordion-section">
          <div className="section-heading"><div><p className="eyebrow">Alur proses</p><h3>Klik proses untuk melihat tiket & aksi</h3></div><span>{workOrder.steps.length} proses</span></div>
          {!canViewAllProcessTickets ? <div className="assignment-scope-banner assignment-scope-banner--compact"><Icon name="user" /><span>Anda hanya bisa menjalankan tiket yang ditugaskan ke akun Anda. Proses lain tetap bisa dilihat sebagai konteks.</span><b>{visibleProcessTickets.length} tiket</b></div> : null}
          <div className="route-flow route-flow--accordion">
            {workOrder.steps.map((step, index) => {
              const stepStatus = deriveStepStatus(workOrder, step)
              const isCurrent = currentStep?.id === step.id
              const isLive = showLiveProcessIndicator && activeStep?.id === step.id
              const isExpanded = expandedStepId === step.id
              return <div className={`route-flow__group route-flow__group--accordion${isExpanded ? ' route-flow__group--expanded' : ''}`} key={step.id}>
                {index ? <Icon name="arrow" className="route-flow__arrow" /> : null}
                <button type="button" className={`route-card route-card--clickable route-card--${stepStatus} route-card--station-${step.station}${step.isReplacement ? ' route-card--replacement' : ''}${isCurrent ? ' route-card--current' : ''}${isLive ? ' route-card--live' : ''}${isExpanded ? ' route-card--expanded' : ''}`} onClick={() => setExpandedStepId(isExpanded ? undefined : step.id)} aria-expanded={isExpanded}>
                  <span>P{String(index + 1).padStart(2, '0')}</span>
                  <b>{step.name}</b>
                  <small>{stationLabels[step.station]}</small>
                  <div className="route-card__badges"><Badge kind="station" value={step.station} /><Badge kind="process" value={stepStatus} />{step.isReplacement ? <em className="replacement-indicator">↻ Penggantian</em> : null}{isLive ? <em className="current-process-indicator">● Aktif sekarang</em> : null}</div>
                  <em className="route-card__toggle">{isExpanded ? 'Tutup' : 'Detail'}</em>
                </button>
                {isExpanded ? renderProcessDetail(step) : null}
              </div>
            })}
          </div>
        </section>

        {workOrder.history.length ? <section className="drawer-section">
          <div className="section-heading"><div><p className="eyebrow">Riwayat</p><h3>Audit aktivitas WO</h3></div></div>
          <div className="history-list">{workOrder.history.map((item) => <article className="history-item" key={item.id}><span className="history-item__dot" /><div><b>{item.title}</b><p>{item.actor}{item.note ? ` · ${item.note}` : ''}</p></div><time>{formatDateTime(item.at)}</time></article>)}</div>
        </section> : null}
        </div>

        <footer className="wo-detail-modal__footer">
          <div className="wo-detail-modal__footer-actions">{actionButtons}</div>
          <button type="button" className="button button--secondary" onClick={closeDetail}>Tutup</button>
        </footer>
      </aside>

      {activeArtwork ? <div className="artwork-lightbox" role="dialog" aria-modal="true" aria-label="Preview artwork"><button className="artwork-lightbox__backdrop" onClick={() => setActiveArtwork(null)} aria-label="Tutup preview" /><figure><button type="button" className="icon-button" onClick={() => setActiveArtwork(null)} aria-label="Tutup preview"><Icon name="close" /></button><img src={activeArtwork.dataUrl} alt={activeArtwork.name} /><figcaption><span className={approvalClass(activeArtwork)}>{activeArtwork.isPrimary ? 'FINAL PRINT FILE · ' : ''}{artworkApprovalLabels[activeArtwork.approvalStatus]}</span><b>{activeArtwork.name} · {activeArtwork.version}</b><span>{activeArtwork.printNote || 'Tidak ada instruksi cetak tambahan.'}</span></figcaption></figure></div> : null}
    </div>
  )
}

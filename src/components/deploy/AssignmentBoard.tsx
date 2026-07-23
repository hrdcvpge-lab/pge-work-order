import type { Dispatch, SetStateAction } from 'react'
import { Icon } from '../Icon'
import type { ProcessStep, StaffDirectoryMember, Station, TeamMember } from '../../types/workOrder'
import { stationLabels } from '../../utils/workOrder'

type AssignmentBoardProps = {
  plannedSteps: ProcessStep[]
  activePlanStep: ProcessStep | undefined
  activePlanIndex: number
  completedPlanCount: number
  allPlansComplete: boolean
  directory: StaffDirectoryMember[]
  team: TeamMember[]
  workAreas: string[]
  availablePicCards: StaffDirectoryMember[]
  picSearch: string
  setPicSearch: Dispatch<SetStateAction<string>>
  picStationFilter: Station | 'all'
  setPicStationFilter: Dispatch<SetStateAction<Station | 'all'>>
  draggedPicId: string
  setDraggedPicId: Dispatch<SetStateAction<string>>
  dragOverStepId: string
  setDragOverStepId: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string>>
  setActivePlanStepId: Dispatch<SetStateAction<string>>
  isPlanStepComplete: (step: ProcessStep) => boolean
  updatePlan: (stepId: string, patch: Partial<ProcessStep>) => void
  assignPicToStep: (step: ProcessStep, picId: string) => void
  goToNextPlanStep: () => void
  getDirectoryName: (id: string | undefined, directory?: StaffDirectoryMember[], fallback?: string) => string
  getEligibleAssignees: (station: Station, directory: StaffDirectoryMember[], team: TeamMember[]) => StaffDirectoryMember[]
  getEscalationReceivers: (directory: StaffDirectoryMember[], team: TeamMember[]) => StaffDirectoryMember[]
  getStablePicTone: (value: string | undefined) => string
}

export function AssignmentBoard({
  plannedSteps,
  activePlanStep,
  activePlanIndex,
  completedPlanCount,
  allPlansComplete,
  directory,
  team,
  workAreas,
  availablePicCards,
  picSearch,
  setPicSearch,
  picStationFilter,
  setPicStationFilter,
  draggedPicId,
  setDraggedPicId,
  dragOverStepId,
  setDragOverStepId,
  setError,
  setActivePlanStepId,
  isPlanStepComplete,
  updatePlan,
  assignPicToStep,
  goToNextPlanStep,
  getDirectoryName,
  getEligibleAssignees,
  getEscalationReceivers,
  getStablePicTone,
}: AssignmentBoardProps) {
  const activeAssignedPic = activePlanStep ? directory.find((member) => member.id === activePlanStep.assignedUserId) : undefined
  const activeAssignedReportTo = activePlanStep ? getDirectoryName(activePlanStep.reportToUserId, directory, 'Lapor ke belum dipilih') : ''
  const activeDraggedPic = directory.find((member) => member.id === draggedPicId)
  const isActiveDragOver = Boolean(activePlanStep && dragOverStepId === activePlanStep.id)
  const isActiveInvalidDrop = Boolean(isActiveDragOver && activePlanStep && activeDraggedPic && !activeDraggedPic.allowedStations?.includes(activePlanStep.station))
  const progressPercent = plannedSteps.length ? Math.round((completedPlanCount / plannedSteps.length) * 100) : 0

  return <div className="assignment-board-v2">
    <aside className="assignment-board-v2__pic-panel">
      <header className="assignment-board-v2__pic-head">
        <div>
          <p className="eyebrow">PIC tersedia</p>
          <h4>Drag ke proses aktif</h4>
          <span>Lapor ke dan area otomatis mengikuti People & Station.</span>
        </div>
        <div className="assignment-board-v2__filters">
          <input value={picSearch} onChange={(event) => setPicSearch(event.target.value)} placeholder="Cari PIC / kode" />
          <select value={picStationFilter} onChange={(event) => setPicStationFilter(event.target.value as Station | 'all')}>
            <option value="all">Semua stasiun</option>
            {Object.entries(stationLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>
      </header>

      <div className="assignment-board-v2__pic-list">
        {availablePicCards.length ? availablePicCards.map((member) => {
          const primaryStation = picStationFilter !== 'all' && member.allowedStations?.includes(picStationFilter) ? picStationFilter : member.allowedStations?.[0]
          const accessLabel = member.accessMode === 'self_service' ? 'Login mandiri' : member.accessMode === 'admin_assisted' ? 'Bantu admin' : 'Tanpa login'
          const tone = getStablePicTone(member.id)
          return <article
            className={`pic-list-row pic-list-row--tone-${tone} pic-list-row--station-${primaryStation || 'none'}${draggedPicId === member.id ? ' is-dragging' : ''}`}
            key={member.id}
            draggable
            onDragStart={(event) => {
              setDraggedPicId(member.id)
              event.dataTransfer.setData('text/plain', member.id)
              event.dataTransfer.effectAllowed = 'copy'
            }}
            onDragEnd={() => { setDraggedPicId(''); setDragOverStepId('') }}
          >
            <span className="pic-list-row__marker" aria-hidden="true" />
            <div className="pic-list-row__body">
              <b>{member.name}</b>
              <small>{member.employeeNumber || 'Tanpa kode'} · {accessLabel}</small>
              <small>Lapor: {member.defaultReportToUserId ? getDirectoryName(member.defaultReportToUserId, directory, '—') : 'Belum diatur'}</small>
              <div className="pic-list-row__stations">{(member.allowedStations || []).map((station) => <span className={`station-chip station-chip--${station}`} key={station}>{stationLabels[station]}</span>)}</div>
            </div>
          </article>
        }) : <div className="assignment-board-v2__empty">Tidak ada PIC aktif sesuai filter. Atur akses personel di People & Station.</div>}
      </div>
    </aside>

    <main className="assignment-board-v2__work-area">
      <section className="assignment-board-v2__current">
        <header className="assignment-board-v2__current-head">
          <div>
            <p className="eyebrow">Proses aktif untuk diisi</p>
            <h3>{activePlanStep ? `P${String(activePlanIndex + 1).padStart(2, '0')} · ${activePlanStep.name}` : 'Tidak ada proses'}</h3>
            <span>{activePlanStep ? `${stationLabels[activePlanStep.station]} · ${activePlanStep.inputs.length ? `Butuh: ${activePlanStep.inputs.join(' + ')}` : 'Mulai langsung'} · Hasil: ${activePlanStep.output}` : 'Semua proses sudah lengkap.'}</span>
          </div>
          <div className="assignment-board-v2__progress" aria-label={`${completedPlanCount} dari ${plannedSteps.length} proses lengkap`}>
            <b>{completedPlanCount}/{plannedSteps.length}</b>
            <span><i style={{ width: `${progressPercent}%` }} /></span>
          </div>
        </header>

        {activePlanStep ? <article
          className={`assignment-work-card deployment-step--station-${activePlanStep.station}${isActiveDragOver ? ' deployment-step--drag-over' : ''}${isActiveInvalidDrop ? ' deployment-step--drag-invalid' : ''}`}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragOverStepId(activePlanStep.id) }}
          onDragLeave={() => setDragOverStepId('')}
          onDrop={(event) => {
            event.preventDefault()
            const picId = event.dataTransfer.getData('text/plain') || draggedPicId
            setDragOverStepId('')
            assignPicToStep(activePlanStep, picId)
          }}
        >
          <div className="assignment-work-card__dropzone">
            <Icon name={activeAssignedPic ? 'check' : 'user'} />
            <div>
              <b>{activeAssignedPic ? activeAssignedPic.name : 'Drop PIC di sini'}</b>
              <span>{activeAssignedPic ? `${activeAssignedPic.employeeNumber || 'Tanpa kode'} · Lapor: ${activeAssignedReportTo}` : `Hanya PIC dengan akses ${stationLabels[activePlanStep.station]} yang bisa dipakai.`}</span>
            </div>
          </div>

          <div className="assignment-work-card__fields">
            <label><span>Tanggal rencana *</span><input type="date" value={activePlanStep.scheduledDate || ''} onChange={(event) => updatePlan(activePlanStep.id, { scheduledDate: event.target.value })} /></label>
            <label><span>Stasiun</span><select value={activePlanStep.station} onChange={(event) => updatePlan(activePlanStep.id, { station: event.target.value as Station })}>{Object.entries(stationLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span className="field-label-with-help">PIC pelaksana *<span className="field-help" tabIndex={0} aria-label="Bantuan PIC">?<span className="field-help__tooltip">Hanya PIC yang punya akses ke stasiun ini yang bisa dipilih. Default lapor ke dan area kerja akan mengikuti pengaturan People & Station.</span></span></span><select value={activePlanStep.assignedUserId || ''} onChange={(event) => updatePlan(activePlanStep.id, { assignedUserId: event.target.value })}><option value="">Pilih PIC sesuai stasiun</option>{getEligibleAssignees(activePlanStep.station, directory, team).map((member) => <option value={member.id} key={member.id}>{member.name}{member.employeeNumber ? ` · ${member.employeeNumber}` : ''}</option>)}</select></label>
            <label><span>Lapor ke *</span><select value={activePlanStep.reportToUserId || ''} onChange={(event) => updatePlan(activePlanStep.id, { reportToUserId: event.target.value })}><option value="">Pilih penerima laporan</option>{getEscalationReceivers(directory, team).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select>{activePlanStep.assignedUserId && !directory.find((member) => member.id === activePlanStep.assignedUserId)?.defaultReportToUserId ? <small className="field-hint field-hint--warning">PIC ini belum punya default lapor ke. Pilih manual atau atur di People & Station.</small> : null}</label>
            <label className="assignment-work-card__wide"><span>Area kerja / laporan hasil *</span><select value={activePlanStep.location || ''} onChange={(event) => updatePlan(activePlanStep.id, { location: event.target.value })}><option value="">Pilih area</option>{workAreas.map((area) => <option value={area} key={area}>{area}</option>)}</select></label>
          </div>

          <footer className="assignment-work-card__actions">
            {activePlanIndex > 0 ? <button type="button" className="button button--secondary button--compact" onClick={() => { const previous = plannedSteps[Math.max(0, activePlanIndex - 1)]; if (previous) setActivePlanStepId(previous.id) }}>Sebelumnya</button> : <span />}
            {!allPlansComplete ? <button type="button" className="button button--primary" onClick={goToNextPlanStep}>Simpan & lanjut</button> : <span className="assignment-wizard-card__ready"><Icon name="check" /> Semua proses lengkap. Lanjut deploy WO.</span>}
          </footer>
        </article> : null}
      </section>

      <section className="assignment-route-summary" aria-label="Ringkasan proses yang akan dideploy">
        <div className="assignment-route-summary__title"><b>Rute assignment</b><span>{completedPlanCount}/{plannedSteps.length} siap</span></div>
        <div className="assignment-route-summary__list">
          {plannedSteps.map((step, index) => {
            const assignedPic = directory.find((member) => member.id === step.assignedUserId)
            const assignedReportTo = getDirectoryName(step.reportToUserId, directory, 'Lapor ke belum dipilih')
            const complete = isPlanStepComplete(step)
            const active = activePlanStep?.id === step.id
            return <button type="button" className={`assignment-route-chip${active ? ' assignment-route-chip--active' : ''}${complete ? ' assignment-route-chip--complete' : ''}`} key={step.id} onClick={() => { setError(''); setActivePlanStepId(step.id) }}>
              <span>P{String(index + 1).padStart(2, '0')}</span>
              <b>{step.name}</b>
              <small>{assignedPic ? `${assignedPic.name} → ${assignedReportTo}` : 'Belum ada PIC'}</small>
              <em>{complete ? '✓ Lengkap' : active ? 'Isi sekarang' : 'Belum lengkap'}</em>
            </button>
          })}
        </div>
      </section>
    </main>
  </div>
}

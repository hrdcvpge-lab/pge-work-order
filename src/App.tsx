import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Badge } from './components/Badge'
import { Icon } from './components/Icon'
import { Modal } from './components/Modal'
import { WorkOrderDrawer } from './components/WorkOrderDrawer'
import { LivePeopleStation } from './components/LivePeopleStation'
import { routeTemplates, teamMembers, workAreas } from './data/mockData'
import { archiveLiveWorkOrder, closeLiveWorkOrder, createLiveDraftWorkOrder, deleteLiveDraftWorkOrder, fetchLiveWorkOrders, recordLiveQcDecision, recordLiveWorkOrderStepOutput, resolveLivePendingRework, scheduleLiveWorkOrder, startLiveWorkOrderStep } from './lib/liveWorkOrders'
import { fetchLiveStaffDirectory } from './lib/livePeopleDirectory'
import type { ArtworkApprovalStatus, DefectCategory, Priority, ProcessStep, QualityEvidence, Role, StaffDirectoryMember, Station, TeamMember, WorkOrder, WorkOrderHistoryItem, WorkOrderReferenceImage, WorkOrderShortfall, WorkOrderType } from './types/workOrder'
import {
  artworkApprovalLabels,
  defectCategoryLabels,
  deriveOrderStatus,
  deriveStepStatus,
  formatDate,
  formatDuration,
  formatNumber,
  getApprovedPrimaryArtwork,
  getArtworkReadiness,
  getAvailableInputCap,
  getBlockerSummary,
  getCloseReadiness,
  getCurrentProcess,
  getOrderActiveSeconds,
  getPackingGood,
  getFinalProcessStep,
  isFinalStockInStep,
  isFinalPackingStep,
  getProgress,
  getShortfallSummary,
  shortfallStatusLabels,
  getStepExtraQty,
  getStepGradeBQty,
  getStepHoldSortirQty,
  getStepPendingReworkQty,
  getStepScrapQty,
  getStepRecordedQty,
  getStepResolvedQty,
  getStepTimerSeconds,
  getWipBalance,
  isOverdue,
  priorityLabels,
  roleLabels,
  sortWorkOrders,
  stationLabels,
  statusLabels,
  typeLabels,
} from './utils/workOrder'

type View = 'dashboard' | 'orders' | 'station' | 'wip' | 'reports' | 'people'
type ModalState =
  | { type: 'create' }
  | { type: 'schedule'; workOrder: WorkOrder }
  | { type: 'assign'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'confirm-start'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'log-result'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'hold'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'qc'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'shortfall-action'; workOrder: WorkOrder; shortfall: WorkOrderShortfall }
  | { type: 'review-shortfall'; workOrder: WorkOrder; shortfall: WorkOrderShortfall }
  | { type: 'resolve-rework'; workOrder: WorkOrder }
  | { type: 'manage-artwork'; workOrder: WorkOrder }
  | { type: 'confirm-artwork'; workOrder: WorkOrder; step: ProcessStep }
  | { type: 'confirm-close'; workOrder: WorkOrder }
  | { type: 'confirm-archive'; workOrder: WorkOrder }
  | { type: 'confirm-cancel'; workOrder: WorkOrder }
  | { type: 'finished-notice'; workOrder: WorkOrder }
  | null

const NAV: Array<{ id: View; label: string; icon: Parameters<typeof Icon>[0]['name'] }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'orders', label: 'Work Order', icon: 'list' },
  { id: 'station', label: 'Stasiun Saya', icon: 'station' },
  { id: 'wip', label: 'Barang Proses', icon: 'boxes' },
  { id: 'reports', label: 'Laporan', icon: 'chart' },
  { id: 'people', label: 'People & Station', icon: 'user' },
]

const CUSTOM_OPTIONS: Array<{ id: 'printing' | 'cutting' | 'lining' | 'zipper' | 'sewing' | 'finishing'; label: string }> = [
  { id: 'printing', label: 'Cetak motif' },
  { id: 'cutting', label: 'Potong bahan' },
  { id: 'lining', label: 'Siapkan furing' },
  { id: 'zipper', label: 'Siapkan resleting / tali' },
  { id: 'sewing', label: 'Jahit / rakit' },
  { id: 'finishing', label: 'Finishing / rapikan' },
]

const MACHINE_OPTIONS = [
  'Mimaki Eco Solvent 01',
  'Mimaki Sublim 01',
  'Meja Cutting',
  'Mesin Jahit / Rakit',
  'Area Finishing',
  'Meja QC',
  'Area Packing',
  'Manual / tidak memakai mesin',
]

function getDirectoryName(id: string | undefined, directory: StaffDirectoryMember[] = [], fallback = 'Belum ditetapkan') {
  if (!id) return fallback
  return directory.find((member) => member.id === id)?.name || fallback
}

function defaultLocationForStation(station: Station) {
  const prefixes: Record<Station, string> = {
    printing: 'Area Printing',
    cutting: 'Area Cutting',
    sewing: 'Meja Jahit',
    finishing: 'Area Finishing',
    qc: 'Area QC',
    packing: 'Area Packing',
    warehouse: 'Area Warehouse',
  }
  return workAreas.find((area) => area.startsWith(prefixes[station])) || 'Area Warehouse / Material'
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function makeHistory(actor: TeamMember | 'system', title: string, note?: string): WorkOrderHistoryItem {
  return {
    id: createId('hist'),
    at: new Date().toISOString(),
    actor: actor === 'system' ? 'Sistem' : actor.name,
    role: actor === 'system' ? 'system' : actor.role,
    title,
    note,
  }
}

function getNextCode(workOrders: WorkOrder[]) {
  const currentYear = new Date().getFullYear()
  const prefix = `WO-${currentYear}-`
  const sequence = Math.max(
    70,
    ...workOrders.map((order) => Number(order.code.replace(prefix, '')) || 0),
  ) + 1
  return `${prefix}${String(sequence).padStart(3, '0')}`
}

function hasFullWorkOrderAccess(currentUser: TeamMember) {
  return ['admin', 'ppic', 'manager'].includes(currentUser.role)
}

/**
 * Floor users may open and act on a process only when Admin / PPIC assigned
 * that exact process to their account. Station membership alone is not enough.
 */
function canUseProcess(currentUser: TeamMember, step: ProcessStep) {
  return !hasFullWorkOrderAccess(currentUser)
    && Boolean(step.assignedUserId)
    && step.assignedUserId === currentUser.id
}

function canViewWorkOrder(currentUser: TeamMember, workOrder: WorkOrder) {
  return hasFullWorkOrderAccess(currentUser)
    || workOrder.steps.some((step) => step.assignedUserId === currentUser.id)
}


function getCombinedDirectory(directory: StaffDirectoryMember[], _team: TeamMember[] = []) {
  // Planning dropdowns must use the live Employee Master only.
  // Mock Team PGE rows are intentionally not mixed in here.
  return directory
}

function getEligibleAssignees(station: Station, directory: StaffDirectoryMember[], team: TeamMember[]) {
  return getCombinedDirectory(directory, team).filter((member) => {
    if (member.kind !== 'staff' || member.isActive === false) return false
    return Boolean(member.allowedStations?.includes(station))
  })
}

function getEscalationReceivers(directory: StaffDirectoryMember[], team: TeamMember[]) {
  return getCombinedDirectory(directory, team).filter((member) => member.canReceiveEscalation || member.kind === 'planner')
}

function readQualityEvidenceFile(file: File): Promise<QualityEvidence> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Gunakan JPG, PNG, atau WEBP untuk bukti foto.'))
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Ukuran bukti foto maksimal 8 MB.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Bukti foto tidak dapat dibaca.'))
    reader.onload = () => resolve({ id: createId('qc-evidence'), name: file.name, dataUrl: String(reader.result), createdAt: new Date().toISOString() })
    reader.readAsDataURL(file)
  })
}

function buildSteps(template: string, qty: number, customRoute: string[], workOrderType: WorkOrderType = 'mto') {
  const step = (sequence: number, name: string, station: Station, inputs: string[], output: string): ProcessStep => ({
    id: createId('step'),
    sequence,
    name,
    station,
    plannedQty: qty,
    inputs,
    output,
    status: 'not_ready',
    qtyGood: 0,
    qtyRework: 0,
    qtyReject: 0,
    activeSeconds: 0,
  })

  const finalStep = (sequence: number) => workOrderType === 'mts'
    ? step(sequence, 'Masuk Gudang / Stok Tersedia', 'warehouse', ['Produk lolos QC'], 'Stok tersedia')
    : step(sequence, 'Packing / Siap Kirim', 'packing', ['Produk lolos QC'], 'Produk siap kirim')

  const direct = [
    step(1, 'Buat produk', 'sewing', [], 'Produk siap QC'),
    step(2, 'QC akhir', 'qc', ['Produk siap QC'], 'Produk lolos QC'),
    finalStep(3),
  ]

  if (template === 'direct') return direct
  if (template === 'print-sew') {
    return [
      step(1, 'Cetak gambar / motif', 'printing', [], 'Bahan bergambar'),
      step(2, 'Potong bahan', 'cutting', ['Bahan bergambar'], 'Bahan siap jahit'),
      step(3, 'Jahit / rakit produk', 'sewing', ['Bahan siap jahit'], 'Produk siap QC'),
      step(4, 'QC akhir', 'qc', ['Produk siap QC'], 'Produk lolos QC'),
      finalStep(5),
    ]
  }
  if (template === 'multi-part') {
    return [
      step(1, 'Cetak gambar / motif', 'printing', [], 'Panel cetak'),
      step(2, 'Potong bahan', 'cutting', ['Panel cetak'], 'Panel potong'),
      step(3, 'Siapkan furing dari warehouse', 'warehouse', [], 'Set furing'),
      step(4, 'Siapkan resleting / tali dari warehouse', 'warehouse', [], 'Set resleting'),
      step(5, 'Jahit / rakit produk', 'sewing', ['Panel potong', 'Set furing', 'Set resleting'], 'Produk siap finishing'),
      step(6, 'Finishing / rapikan', 'finishing', ['Produk siap finishing'], 'Produk siap QC'),
      step(7, 'QC akhir', 'qc', ['Produk siap QC'], 'Produk lolos QC'),
      finalStep(8),
    ]
  }

  const selected = customRoute.length ? customRoute : ['sewing']
  const customSteps: ProcessStep[] = []
  const has = (key: string) => selected.includes(key)
  const output = {
    printing: 'Bahan bergambar',
    cutting: 'Bahan siap jahit',
    lining: 'Set furing',
    zipper: 'Set resleting',
    sewing: has('finishing') ? 'Produk siap finishing' : 'Produk siap QC',
    finishing: 'Produk siap QC',
  }

  if (has('printing')) customSteps.push(step(customSteps.length + 1, 'Cetak gambar / motif', 'printing', [], output.printing))
  if (has('cutting')) customSteps.push(step(customSteps.length + 1, 'Potong bahan', 'cutting', has('printing') ? [output.printing] : [], output.cutting))
  if (has('lining')) customSteps.push(step(customSteps.length + 1, 'Siapkan furing dari warehouse', 'warehouse', [], output.lining))
  if (has('zipper')) customSteps.push(step(customSteps.length + 1, 'Siapkan resleting / tali dari warehouse', 'warehouse', [], output.zipper))
  if (has('sewing')) {
    const sewingInputs = [has('cutting') ? output.cutting : has('printing') ? output.printing : '', has('lining') ? output.lining : '', has('zipper') ? output.zipper : ''].filter(Boolean)
    customSteps.push(step(customSteps.length + 1, 'Jahit / rakit produk', 'sewing', sewingInputs, output.sewing))
  }
  if (has('finishing')) customSteps.push(step(customSteps.length + 1, 'Finishing / rapikan', 'finishing', has('sewing') ? [output.sewing] : [], output.finishing))

  const beforeQc = customSteps.at(-1)?.output || 'Produk siap QC'
  customSteps.push(step(customSteps.length + 1, 'QC akhir', 'qc', [beforeQc], 'Produk lolos QC'))
  customSteps.push(finalStep(customSteps.length + 1))
  return customSteps
}

function replaceWorkOrder(list: WorkOrder[], updated: WorkOrder) {
  return list.map((order) => order.id === updated.id ? updated : order)
}

function updateStep(workOrder: WorkOrder, stepId: string, patch: Partial<ProcessStep>) {
  return {
    ...workOrder,
    steps: workOrder.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step),
  }
}

function reindexSteps(steps: ProcessStep[]) {
  return steps.map((step, index) => ({ ...step, sequence: index + 1 }))
}

function insertAfterStep(steps: ProcessStep[], sourceStepId: string, additions: ProcessStep[]) {
  const sourceIndex = steps.findIndex((step) => step.id === sourceStepId)
  if (sourceIndex < 0) return reindexSteps([...steps, ...additions])
  return reindexSteps([...steps.slice(0, sourceIndex + 1), ...additions, ...steps.slice(sourceIndex + 1)])
}

function makeShortfall(source: ProcessStep, qty: number, origin: WorkOrderShortfall['origin'], note: string): WorkOrderShortfall {
  return {
    id: createId('shortfall'),
    origin,
    sourceStepId: source.id,
    sourceStepName: source.name,
    sourceStation: source.station,
    qty,
    status: 'action_required',
    createdAt: new Date().toISOString(),
    note,
  }
}

function makeReworkStep(source: ProcessStep, qty: number, output: string): ProcessStep {
  return {
    id: createId('rework'),
    sequence: source.sequence + 1,
    name: `Perbaikan · ${source.name}`,
    station: source.station,
    assignedUserId: source.assignedUserId,
    reportToUserId: source.reportToUserId,
    plannedQty: qty,
    inputs: [],
    output,
    status: 'not_ready',
    qtyGood: 0,
    qtyRework: 0,
    qtyReject: 0,
    activeSeconds: 0,
    location: source.location,
  }
}

function buildReplacementSteps(workOrder: WorkOrder, shortfall: WorkOrderShortfall, restartFromStepId: string) {
  const sourceIndex = workOrder.steps.findIndex((step) => step.id === shortfall.sourceStepId)
  const restartIndex = workOrder.steps.findIndex((step) => step.id === restartFromStepId)
  if (sourceIndex < 0 || restartIndex < 0 || restartIndex > sourceIndex) return []

  const originals = workOrder.steps
    .slice(restartIndex, sourceIndex + 1)
    .filter((step) => !step.isReplacement)
    .filter((step) => shortfall.origin === 'qc_final_reject' ? step.station !== 'packing' : true)

  return originals.map((source) => ({
    ...source,
    id: createId('replacement'),
    sequence: 0,
    name: `Pengganti · ${source.name}`,
    plannedQty: shortfall.qty,
    status: 'not_ready' as const,
    qtyGood: 0,
    qtyRework: 0,
    qtyReject: 0,
    activeSeconds: 0,
    startedAt: undefined,
    holdReason: undefined,
    artworkConfirmedBy: undefined,
    artworkConfirmedAt: undefined,
    artworkConfirmedImageId: undefined,
    isReplacement: true,
    replacementForShortfallId: shortfall.id,
  }))
}

type AppProps = {
  currentUser: TeamMember
  onSignOut: () => void
}

export default function App({ currentUser, onSignOut }: AppProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [staffDirectory, setStaffDirectory] = useState<StaffDirectoryMember[]>([])
  const [staffDirectoryError, setStaffDirectoryError] = useState('')
  const [view, setView] = useState<View>('dashboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | WorkOrder['status']>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all')
  const [clock, setClock] = useState(() => Date.now())
  const [toast, setToast] = useState('')
  const [isLoadingWorkOrders, setIsLoadingWorkOrders] = useState(true)
  const [workOrderError, setWorkOrderError] = useState('')

  // The active user comes from Supabase Auth. Work Order headers and route steps
  // now load from Supabase instead of demo data.
  const teamForViews = useMemo<TeamMember[]>(
    () => [currentUser, ...teamMembers.filter((member) => member.id !== currentUser.id)],
    [currentUser],
  )
  const selectedWorkOrder = workOrders.find((order) => order.id === selectedId) || null

  const reloadStaffDirectory = async () => {
    setStaffDirectoryError('')
    try {
      const liveDirectory = await fetchLiveStaffDirectory()
      setStaffDirectory(liveDirectory)
      return liveDirectory
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Daftar PIC tidak dapat dimuat.'
      setStaffDirectory([])
      setStaffDirectoryError(message)
      return []
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadWorkOrders() {
      setIsLoadingWorkOrders(true)
      setWorkOrderError('')
      try {
        const liveOrders = await fetchLiveWorkOrders()
        if (!cancelled) setWorkOrders(liveOrders)
      } catch (error) {
        if (!cancelled) {
          setWorkOrderError(error instanceof Error ? error.message : 'Data WO tidak dapat dimuat.')
          setWorkOrders([])
        }
      } finally {
        if (!cancelled) setIsLoadingWorkOrders(false)
      }
    }

    void loadWorkOrders()

    return () => {
      cancelled = true
    }
  }, [currentUser.id])

  useEffect(() => {
    void reloadStaffDirectory()
  }, [currentUser.id])

  useEffect(() => {
    if (modal?.type === 'schedule' || modal?.type === 'assign') {
      void reloadStaffDirectory()
    }
  }, [modal?.type, currentUser.id])

  const reloadWorkOrders = async () => {
    const liveOrders = await fetchLiveWorkOrders()
    setWorkOrders(liveOrders)
    return liveOrders
  }

  const sortedOrders = useMemo(() => [...workOrders].sort(sortWorkOrders), [workOrders])
  const scopedOrders = useMemo(
    () => hasFullWorkOrderAccess(currentUser)
      ? sortedOrders
      : sortedOrders.filter((order) => canViewWorkOrder(currentUser, order)),
    [currentUser, sortedOrders],
  )

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('id-ID')
    return scopedOrders.filter((order) => {
      const status = deriveOrderStatus(order)
      if (order.isArchived || status === 'closed') return false
      const matchesSearch = !needle || `${order.code} ${order.product} ${order.source}`.toLocaleLowerCase('id-ID').includes(needle)
      const matchesStatus = statusFilter === 'all' || status === statusFilter
      const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter
      return matchesSearch && matchesStatus && matchesPriority
    })
  }, [priorityFilter, search, scopedOrders, statusFilter])

  const readyTasks = useMemo(() => scopedOrders.flatMap((order) => order.steps
    .filter((step) => deriveStepStatus(order, step) === 'ready')
    .filter((step) => hasFullWorkOrderAccess(currentUser) || step.assignedUserId === currentUser.id)
    .map((step) => ({ order, step }))), [currentUser, scopedOrders])

  const waitingTasks = useMemo(() => scopedOrders.flatMap((order) => order.steps
    .filter((step) => deriveStepStatus(order, step) === 'waiting_wip')
    .filter((step) => hasFullWorkOrderAccess(currentUser) || step.assignedUserId === currentUser.id)
    .map((step) => ({ order, step }))), [currentUser, scopedOrders])

  const holdTasks = useMemo(() => scopedOrders.flatMap((order) => order.steps
    .filter((step) => deriveStepStatus(order, step) === 'hold')
    .filter((step) => hasFullWorkOrderAccess(currentUser) || step.assignedUserId === currentUser.id)
    .map((step) => ({ order, step }))), [currentUser, scopedOrders])

  const qcTasks = useMemo(() => readyTasks.filter(({ step }) => step.station === 'qc'), [readyTasks])
  const stationTasks = useMemo(() => scopedOrders.flatMap((order) => order.steps
    .filter((step) => canUseProcess(currentUser, step) && ['ready', 'in_progress', 'hold', 'waiting_wip'].includes(deriveStepStatus(order, step)))
    .map((step) => ({ order, step }))), [currentUser, scopedOrders])

  const activeOrders = scopedOrders.filter((order) => !['done', 'closed', 'cancelled'].includes(deriveOrderStatus(order)))
  const overdueOrders = activeOrders.filter(isOverdue)
  const shortfallOrders = scopedOrders.filter((order) => {
    const summary = getShortfallSummary(order)
    return summary.actionRequiredQty > 0 || summary.replacementRemainingQty > 0
  })
  const shortfallActionQty = scopedOrders.reduce((total, order) => total + getShortfallSummary(order).actionRequiredQty, 0)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3_200)
  }

  const applyOrderUpdate = (order: WorkOrder, note?: string) => {
    setWorkOrders((current) => replaceWorkOrder(current, order))
    if (note) showToast(note)
  }

  const openOrder = (order: WorkOrder) => {
    if (!canViewWorkOrder(currentUser, order)) {
      showToast('WO ini tidak ditugaskan kepada akun Anda.')
      return
    }
    setSelectedId(order.id)
  }

  const openModalFromWorkOrderDetail = (nextModal: Exclude<ModalState, null>) => {
    setSelectedId(null)
    setModal(nextModal)
  }

  const isFinishedForNotice = (order: WorkOrder | null | undefined): order is WorkOrder => {
    if (!order) return false
    const status = deriveOrderStatus(order)
    if (['done', 'closed'].includes(status)) return true
    const finalStep = getFinalProcessStep(order)
    const summary = getShortfallSummary(order)
    return Boolean(
      finalStep
      && deriveStepStatus(order, finalStep) === 'completed'
      && summary.remainingQty === 0
      && summary.actionRequiredQty === 0
      && summary.awaitingApprovalQty === 0,
    )
  }

  const beginStep = async (order: WorkOrder, step: ProcessStep, artworkImageId?: string) => {
    const pendingReworkQty = getShortfallSummary(order).pendingReworkQty
    if (pendingReworkQty > 0) return showToast(`${formatNumber(pendingReworkQty)} unit masih pending rework. Selesaikan rework dulu, jangan mulai proses lama.`)

    const status = deriveStepStatus(order, step)
    if (!['ready', 'partial_paused'].includes(status)) return showToast('Proses belum siap. Periksa input proses atau HOLD terlebih dahulu.')

    try {
      await startLiveWorkOrderStep({ stepId: step.id })
      const liveOrders = await reloadWorkOrders()
      setSelectedId(liveOrders.find((liveOrder) => liveOrder.id === order.id)?.id || order.id)
      showToast(artworkImageId ? 'Artwork dikonfirmasi. Timer proses dimulai di Supabase.' : 'Timer proses dimulai di Supabase.')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Proses tidak dapat dimulai.')
    }
  }

  const startStep = (order: WorkOrder, step: ProcessStep) => {
    if (step.station !== 'printing') {
      void beginStep(order, step)
      return
    }

    const readiness = getArtworkReadiness(order)
    if (!readiness.ready) return showToast(`Printing diblokir. ${readiness.reason}`)

    // Only WOs explicitly marked as artwork-controlled require a final-file review.
    if (!order.artworkApprovalRequired) {
      void beginStep(order, step)
      return
    }

    setModal({ type: 'confirm-artwork', workOrder: order, step })
  }

  const pauseStep = (order: WorkOrder, step: ProcessStep) => {
    if (!step.startedAt) return
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(step.startedAt).getTime()) / 1_000))
    const updated = updateStep(order, step.id, { status: 'ready', activeSeconds: step.activeSeconds + elapsed, startedAt: undefined })
    updated.history = [makeHistory(currentUser, `Jeda proses · ${step.name}`, `Waktu aktif tersimpan: ${formatDuration(step.activeSeconds + elapsed)}.`), ...order.history]
    applyOrderUpdate(updated, 'Timer dijeda. Waktu aktif tersimpan.')
  }

  const resumeStep = (order: WorkOrder, step: ProcessStep) => {
    const updated = updateStep(order, step.id, { holdReason: undefined, status: 'ready' })
    updated.history = [makeHistory(currentUser, `HOLD dibuka · ${step.name}`, 'Proses kembali ke antrean siap dikerjakan.'), ...order.history]
    applyOrderUpdate(updated, 'HOLD dibuka.')
  }

  const closeOrder = async (order: WorkOrder) => {
    if (currentUser.role !== 'ppic') {
      showToast('Hanya PPIC yang boleh close WO.')
      setModal(null)
      return
    }

    const readiness = getCloseReadiness(order)
    if (!readiness.ready) {
      showToast(`WO belum dapat ditutup. ${readiness.reason}`)
      setModal(null)
      return
    }

    try {
      await closeLiveWorkOrder(order.id)
      const liveOrders = await reloadWorkOrders()
      setSelectedId(liveOrders.find((item) => item.id === order.id)?.id || order.id)
      showToast(`${order.code} berhasil di-close oleh PPIC.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'WO tidak dapat di-close.')
    } finally {
      setModal(null)
    }
  }

  const archiveOrder = async (order: WorkOrder) => {
    if (currentUser.role !== 'ppic') {
      showToast('Hanya PPIC yang boleh archive WO.')
      setModal(null)
      return
    }

    if (deriveOrderStatus(order) !== 'closed') {
      showToast('Archive hanya boleh dilakukan setelah WO di-close.')
      setModal(null)
      return
    }

    try {
      await archiveLiveWorkOrder(order.id)
      await reloadWorkOrders()
      setSelectedId(null)
      setView('reports')
      showToast(`${order.code} di-archive. Data tetap tersedia di Laporan.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'WO tidak dapat di-archive.')
    } finally {
      setModal(null)
    }
  }

  const cancelOrder = async (order: WorkOrder) => {
    if (deriveOrderStatus(order) !== 'draft') {
      showToast('Hanya WO berstatus Draft yang bisa dihapus dari daftar.')
      setModal(null)
      return
    }

    try {
      await deleteLiveDraftWorkOrder(order.id)
      setSelectedId(null)
      await reloadWorkOrders()
      showToast(`${order.code} dihapus dari Draft.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Draft WO tidak dapat dibatalkan.')
    } finally {
      setModal(null)
    }
  }

  const renderTaskRow = (order: WorkOrder, step: ProcessStep, index?: number) => {
    const stepStatus = deriveStepStatus(order, step)
    return (
      <button className={`queue-row queue-row--station-${step.station}`} key={step.id} onClick={() => openOrder(order)}>
        <span className="queue-row__index">{index ?? step.sequence}</span>
        <span className="queue-row__copy">
          <b>{step.name} <small>· {order.code}</small></b>
          <span>{order.product}</span>
          <em>{getDirectoryName(step.assignedUserId, staffDirectory, 'PIC belum ditentukan')} · {step.reportToUserId ? `Lapor ke ${getDirectoryName(step.reportToUserId, staffDirectory)}` : 'Lapor ke belum ditentukan'} · Target {formatNumber(step.plannedQty)}</em>
        </span>
        <span className="queue-row__right"><Badge kind="station" value={step.station} /><Badge kind="priority" value={order.priority} /><Badge kind="process" value={stepStatus} /></span>
      </button>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__eyebrow">Pusat Grosir Eceran</span>
          <strong className="brand__name">WO <em>Control</em></strong>
          <p>Perintah kerja, proses nyata, barang proses, QC, packing, dan blocker dalam satu tampilan.</p>
        </div>

        <nav className="side-nav" aria-label="Navigasi Work Order">
          {NAV.filter((item) => item.id !== 'people' || currentUser.role === 'admin').filter((item) => item.id !== 'reports' || ['admin', 'ppic', 'manager'].includes(currentUser.role)).map((item) => (
            <button key={item.id} className={`side-nav__item${view === item.id ? ' side-nav__item--active' : ''}`} onClick={() => setView(item.id)}>
              <Icon name={item.icon} /> <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__note">
          <b>Fase frontend</b>
          <span>Login, employee master, draft WO, deploy, dan progress utama sudah tersambung Supabase.</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Kontrol produksi PGE</p>
            <h1>{view === 'dashboard' ? 'Setiap proses harus terlihat.' : view === 'orders' ? 'Daftar Work Order' : view === 'station' ? 'Stasiun Saya' : view === 'wip' ? 'Barang Proses Antarstasiun' : view === 'people' ? 'People & Station Access' : 'Ringkasan Operasional'}</h1>
            <p className="topbar__subtitle">{view === 'dashboard'
              ? 'Prioritaskan pesanan customer, lihat langkah yang benar-benar siap, dan tindak blocker sebelum pekerjaan hilang di tengah proses.'
              : view === 'station'
                ? 'Tampilan mobile-first untuk pekerjaan yang memang ditugaskan kepada pengguna aktif.'
                : 'Login memakai akun Supabase. Draft, jadwal, dan progress utama sudah tersambung ke data produksi.'}</p>
          </div>
          <div className="topbar__actions">
            <div className="user-switcher user-switcher--authenticated">
              <Icon name="user" />
              <span><b>{currentUser.name}</b><small>{currentUser.role === 'admin' || currentUser.role === 'ppic' ? `${roleLabels[currentUser.role]} · Supabase verified` : roleLabels[currentUser.role]}</small></span>
              <button className="button button--secondary button--compact" type="button" onClick={onSignOut}>Keluar</button>
            </div>
            {['admin', 'ppic'].includes(currentUser.role) ? <button className="button button--primary" onClick={() => setModal({ type: 'create' })}><Icon name="plus" /> Buat WO</button> : null}
          </div>
        </header>

        {workOrderError ? <div className="live-data-alert live-data-alert--error"><Icon name="warning" /><span><b>WO live belum bisa dimuat.</b> {workOrderError}</span></div> : null}
        {staffDirectoryError ? <div className="live-data-alert live-data-alert--warning"><Icon name="warning" /><span><b>Daftar PIC live belum bisa dimuat.</b> {staffDirectoryError}</span></div> : null}
        {isLoadingWorkOrders ? <div className="live-data-alert"><Icon name="clock" /><span>Memuat Work Order dari Supabase…</span></div> : null}

        {view === 'dashboard' ? (
          <section className="view-content">
            <div className="metric-grid">
              <article className="metric-card metric-card--ink"><span>WO aktif</span><b>{formatNumber(activeOrders.length)}</b><small>Belum ditutup</small></article>
              <article className="metric-card metric-card--blue"><span>Proses siap</span><b>{formatNumber(readyTasks.length)}</b><small>Input proses tersedia</small></article>
              <article className="metric-card metric-card--purple"><span>QC menunggu</span><b>{formatNumber(qcTasks.length)}</b><small>Perlu keputusan QC</small></article>
              <article className="metric-card metric-card--amber"><span>Menunggu input proses</span><b>{formatNumber(waitingTasks.length)}</b><small>Input belum cukup</small></article>
              <article className="metric-card metric-card--red"><span>HOLD aktif</span><b>{formatNumber(holdTasks.length)}</b><small>Butuh pemilik keputusan</small></article>
              <article className="metric-card metric-card--shortfall"><span>Kekurangan qty</span><b>{formatNumber(shortfallActionQty)}</b><small>{shortfallOrders.length} WO butuh tindakan</small></article>
              <article className="metric-card metric-card--danger"><span>Lewat target</span><b>{formatNumber(overdueOrders.length)}</b><small>Prioritas pemulihan</small></article>
            </div>

            <div className="dashboard-grid">
              <article className="surface-card surface-card--large">
                <header className="surface-card__header"><div><p className="eyebrow">Prioritas saat ini</p><h2>Proses yang sudah bisa dikerjakan</h2><span>Urutan diprioritaskan: HOLD, terlambat, MTO, lalu P1–P4.</span></div><Badge kind="plain" value={`${readyTasks.length} proses siap`} /></header>
                <div className="queue-list">{readyTasks.length ? readyTasks.slice(0, 6).map(({ order, step }, index) => renderTaskRow(order, step, index + 1)) : <div className="empty-state">Tidak ada proses siap. Selesaikan langkah sebelumnya atau jadwalkan WO draft.</div>}</div>
              </article>
              <article className="surface-card">
                <header className="surface-card__header"><div><p className="eyebrow">Aturan kerja</p><h2>Yang tidak boleh dilanggar</h2></div></header>
                <ol className="rule-list">
                  <li><b>WO harus dibuat sebelum proses dimulai.</b> Perintah lisan tetap harus masuk sistem.</li>
                  <li><b>Barang proses wajib memiliki jumlah dan lokasi.</b> “Sudah jadi” bukan informasi yang cukup.</li>
                  <li><b>QC lulus belum berarti selesai.</b> Produk baru selesai setelah packing tercatat.</li>
                  <li><b>HOLD harus punya alasan dan pemilik keputusan.</b> Bukan status untuk menyembunyikan keterlambatan.</li>
                </ol>
              </article>
            </div>

            <div className="dashboard-grid dashboard-grid--bottom">
              <article className="surface-card">
                <header className="surface-card__header"><div><p className="eyebrow">Blocker</p><h2>Menunggu input proses</h2><span>Jangan menyalahkan stasiun berikutnya sebelum input benar-benar tersedia.</span></div></header>
                <div className="queue-list queue-list--compact">{waitingTasks.length ? waitingTasks.slice(0, 4).map(({ order, step }, index) => renderTaskRow(order, step, index + 1)) : <div className="empty-state">Tidak ada proses yang tertahan karena input proses.</div>}</div>
              </article>
              <article className="surface-card">
                <header className="surface-card__header"><div><p className="eyebrow">HOLD</p><h2>Butuh keputusan</h2><span>Semua HOLD perlu tindakan nyata, bukan hanya catatan.</span></div></header>
                <div className="queue-list queue-list--compact">{holdTasks.length ? holdTasks.map(({ order, step }, index) => renderTaskRow(order, step, index + 1)) : <div className="empty-state">Tidak ada HOLD aktif. Pertahankan disiplin pencatatan.</div>}</div>
              </article>
            </div>
          </section>
        ) : null}

        {view === 'orders' ? (
          <section className="view-content">
            <article className="surface-card">
              <header className="surface-card__header"><div><p className="eyebrow">Daftar utama</p><h2>{hasFullWorkOrderAccess(currentUser) ? 'Kontrol Work Order' : 'Work Order Saya'}</h2><span>{hasFullWorkOrderAccess(currentUser) ? 'Klik satu WO untuk melihat rute, input proses, PIC, timer, dan histori.' : 'Hanya WO yang mempunyai proses ditugaskan kepada akun ini yang ditampilkan.'}</span></div><Badge kind="plain" value={`${filteredOrders.length} WO`} /></header>
              <div className="filter-row">
                <label className="search-field"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode WO, produk, atau sumber order" /></label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Semua status</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}><option value="all">Semua prioritas</option>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
              </div>
              <div className="table-wrap"><table className="wo-table"><thead><tr><th>WO</th><th>Tipe / sumber</th><th>Produk</th><th>Target</th><th>Progress</th><th>Status / blocker</th><th>Proses saat ini / PIC</th><th /></tr></thead><tbody>
                {filteredOrders.map((order) => {
                  const current = getCurrentProcess(order)
                  const activeStep = order.steps.find((step) => deriveStepStatus(order, step) === 'in_progress')
                  const status = deriveOrderStatus(order)
                  const shortfall = getShortfallSummary(order)
                  const finalProgressLabel = order.type === 'mts' ? 'masuk gudang / reject tercatat' : 'siap kirim'
                  const showLiveIndicator = ['admin', 'ppic'].includes(currentUser.role) && Boolean(activeStep)
                  const indicatorStep = activeStep || current
                  return <tr className={`wo-table__row wo-table__row--station-${indicatorStep?.station || 'warehouse'}${showLiveIndicator ? ' wo-table__row--live-current' : ''}`} key={order.id} onClick={() => openOrder(order)}>
                    <td><b>{order.code}</b><small>Dibuat {formatDate(order.createdAt.slice(0, 10))}</small></td>
                    <td><Badge kind="type" value={order.type} /><small>{order.source}</small></td>
                    <td><b>{order.product}</b><small>{order.referenceNote || 'Tidak ada catatan referensi'}</small></td>
                    <td><b className={isOverdue(order) ? 'text-danger' : ''}>{formatDate(order.dueDate)}</b><Badge kind="priority" value={order.priority} /></td>
                    <td><div className="wo-progress-cell"><div className="wo-progress-cell__top"><b>{getProgress(order)}%</b><span>{formatNumber(shortfall.packedGood + shortfall.approvedQty)}/{formatNumber(order.qty)}</span></div><div className="wo-progress-bar" aria-hidden="true"><i style={{ width: `${getProgress(order)}%` }} /></div><small>{finalProgressLabel}</small></div></td>
                    <td><div className="wo-status-cell"><Badge kind="status" value={status} />{shortfall.actionRequiredQty > 0 ? <Badge kind="shortfall" value="action_required" /> : shortfall.replacementRemainingQty > 0 ? <Badge kind="shortfall" value="replacement_planned" /> : null}{getBlockerSummary(order) ? <small className={shortfall.actionRequiredQty > 0 ? 'text-danger' : 'text-warning'}>{getBlockerSummary(order)}</small> : <small>Tidak ada blocker</small>}</div></td>
                    <td><b>{indicatorStep?.assignedUserId ? getDirectoryName(indicatorStep.assignedUserId, staffDirectory) : 'Belum ditetapkan'}</b><small>{indicatorStep ? <><Badge kind="station" value={indicatorStep.station} /> {indicatorStep.name}{showLiveIndicator ? <span className="current-process-indicator" title="Proses ini sedang berjalan">● Aktif sekarang</span> : null}</> : 'Belum ada proses aktif'}</small></td>
                    <td><div className="row-actions">{['admin', 'ppic'].includes(currentUser.role) && status === 'draft' ? <button className="row-schedule" onClick={(event) => { event.stopPropagation(); setModal({ type: 'schedule', workOrder: order }) }}>Rencanakan</button> : null}<button className="row-open" onClick={(event) => { event.stopPropagation(); openOrder(order) }}>Buka <Icon name="arrow" /></button></div></td>
                  </tr>
                })}
              </tbody></table></div>
            </article>
          </section>
        ) : null}

        {view === 'station' ? (
          <section className="view-content station-view">
            <div className="station-hero">
              <div><p className="eyebrow">Tampilan operator</p><h2>{currentUser.name}</h2><span>{roleLabels[currentUser.role]} · {currentUser.stations.length ? currentUser.stations.map((station) => stationLabels[station]).join(', ') : 'Akses sesuai proses yang ditugaskan'}</span></div>
              <div className="station-hero__note"><Icon name="package" /><span>Hanya langkah yang ditugaskan ke akun ini yang muncul di sini.</span></div>
            </div>
            <div className="station-task-list">
              {stationTasks.length ? stationTasks.map(({ order, step }) => {
                const status = deriveStepStatus(order, step)
                const operationAllowed = canUseProcess(currentUser, step)
                const isPrinting = step.station === 'printing'
                const finalArtwork = getApprovedPrimaryArtwork(order)
                const artworkReadiness = getArtworkReadiness(order)
                return <article key={step.id} className={`station-task-card station-task-card--station-${step.station}`}>
                  <header><div><Badge kind="station" value={step.station} /><Badge kind="priority" value={order.priority} /><span>{order.code}</span></div><Badge kind="process" value={status} /></header>
                  <h3>{step.name}</h3><p>{order.product}</p>
                  {isPrinting && finalArtwork ? <section className="station-artwork-briefing">
                    <button type="button" className="station-artwork-briefing__preview" onClick={() => openOrder(order)}><img src={finalArtwork.dataUrl} alt={`${order.artworkApprovalRequired ? 'FINAL PRINT FILE' : 'Artwork reference'} ${finalArtwork.name}`} /></button>
                    <div><span><Icon name="check" /> {order.artworkApprovalRequired ? `FINAL PRINT FILE · ${finalArtwork.version}` : `Artwork reference · ${finalArtwork.version} · opsional`}</span><h4>{finalArtwork.name}</h4><p>{finalArtwork.printNote || 'Buka detail WO untuk membaca instruksi cetak.'}</p><small>{order.artworkApprovalRequired ? (finalArtwork.approvedBy ? `Disetujui oleh ${finalArtwork.approvedBy}` : 'Disetujui untuk cetak') : 'File ini hanya referensi; Printing tidak dikunci oleh approval.'}</small></div>
                  </section> : null}
                  {isPrinting && order.artworkApprovalRequired && !finalArtwork ? <div className="station-artwork-blocked"><Icon name="warning" /><div><b>Printing diblokir</b><span>{artworkReadiness.reason}</span></div></div> : null}
                  <div className="station-task-card__details"><span>Target <b>{formatNumber(step.plannedQty)}</b></span><span>Hasil baik <b>{formatNumber(step.qtyGood)}</b></span><span>Input proses <b>{Number.isFinite(getAvailableInputCap(order, step)) ? formatNumber(getAvailableInputCap(order, step)) : '—'}</b></span><span>Timer <b>{formatDuration(getOrderActiveSeconds({ ...order, steps: [step] }, clock))}</b></span></div>
                  {step.holdReason ? <div className="hold-box"><Icon name="warning" /> {step.holdReason}</div> : null}
                  <footer><button className="button button--secondary" onClick={() => openOrder(order)}>Lihat WO</button>{operationAllowed && status === 'ready' ? <button className="button button--primary" disabled={isPrinting && !artworkReadiness.ready} title={isPrinting && !artworkReadiness.ready ? artworkReadiness.reason : undefined} onClick={() => setModal({ type: 'confirm-start', workOrder: order, step })}><Icon name="play" /> {isPrinting ? (order.artworkApprovalRequired ? 'Review & mulai cetak' : 'Mulai cetak') : 'Mulai'}</button> : null}{operationAllowed && status === 'in_progress' ? <><button className="button button--secondary" onClick={() => pauseStep(order, step)}><Icon name="pause" /> Jeda</button>{step.station === 'qc' ? <button className="button button--primary" onClick={() => setModal({ type: 'qc', workOrder: order, step })}>Keputusan QC</button> : <button className="button button--primary" onClick={() => setModal({ type: 'log-result', workOrder: order, step })}>Catat hasil</button>}</> : null}{operationAllowed && ['ready', 'in_progress'].includes(status) ? <button className="button button--danger-soft" onClick={() => setModal({ type: 'hold', workOrder: order, step })}>HOLD</button> : null}{operationAllowed && status === 'hold' ? <button className="button button--success-soft" onClick={() => resumeStep(order, step)}>Lanjutkan</button> : null}</footer>
                </article>
              }) : <div className="empty-state empty-state--large">Tidak ada proses yang ditugaskan kepada akun ini. Admin atau PPIC perlu menetapkan Anda sebagai PIC pada proses WO.</div>}
            </div>
          </section>
        ) : null}

        {view === 'wip' ? (
          <section className="view-content">
            <article className="surface-card">
              <header className="surface-card__header"><div><p className="eyebrow">Ketersediaan proses</p><h2>Barang proses per Work Order</h2><span>Barang proses adalah hasil sementara di dalam WO yang menunggu dipakai langkah berikutnya. Ini berbeda dari stok gudang.</span></div></header>
              <div className="wip-summary-grid">
                <div><span>Total barang proses</span><b>{formatNumber(scopedOrders.flatMap((order) => order.steps.flatMap((step) => step.inputs.map((input) => getWipBalance(order, input)))).reduce((total, value) => total + value, 0))}</b><small>Unit di antarastasiun</small></div>
                <div><span>WO dengan barang proses</span><b>{formatNumber(scopedOrders.filter((order) => order.steps.some((step) => step.inputs.some((input) => getWipBalance(order, input) > 0))).length)}</b><small>WO belum selesai</small></div>
                <div><span>Siap QC</span><b>{formatNumber(scopedOrders.reduce((total, order) => total + getWipBalance(order, 'Produk siap QC'), 0))}</b><small>Produk menunggu QC</small></div>
              </div>
              <div className="table-wrap"><table className="wo-table"><thead><tr><th>Barang proses</th><th>WO / Produk</th><th>Tersedia</th><th>Langkah berikutnya</th><th>Lokasi</th><th /></tr></thead><tbody>
                {scopedOrders.flatMap((order) => Array.from(new Set(order.steps.flatMap((step) => step.inputs))).map((input) => ({ order, input, available: getWipBalance(order, input) })).filter((row) => row.available > 0)).map(({ order, input, available }) => {
                  const nextStep = order.steps.find((step) => step.inputs.includes(input) && deriveStepStatus(order, step) !== 'completed')
                  const sourceStep = order.steps.find((step) => step.output === input)
                  return <tr key={`${order.id}-${input}`} onClick={() => openOrder(order)}><td><b>{input}</b><small>Dari: {sourceStep?.name || '—'}</small></td><td><b>{order.code}</b><small>{order.product}</small></td><td><b>{formatNumber(available)} unit</b></td><td><b>{nextStep?.name || 'Tidak ada'}</b><small>{nextStep ? stationLabels[nextStep.station] : '—'}</small></td><td>{sourceStep?.location || 'Belum dicatat'}</td><td><button className="row-open" onClick={(event) => { event.stopPropagation(); openOrder(order) }}>Buka <Icon name="arrow" /></button></td></tr>
                })}
              </tbody></table></div>
            </article>
          </section>
        ) : null}

        {view === 'reports' ? <ReportsView workOrders={scopedOrders} directory={staffDirectory} team={teamForViews} clock={clock} onOpenOrder={openOrder} /> : null}

        {view === 'people' && currentUser.role === 'admin' ? <LivePeopleStation /> : null}
      </main>

      {selectedWorkOrder ? <WorkOrderDrawer
        workOrder={selectedWorkOrder}
        currentUser={currentUser}
        team={teamForViews}
        staffDirectory={staffDirectory}
        clock={clock}
        onClose={() => { setModal(null); setSelectedId(null) }}
        onSchedule={() => openModalFromWorkOrderDetail({ type: 'schedule', workOrder: selectedWorkOrder })}
        onAssign={(step) => openModalFromWorkOrderDetail({ type: 'assign', workOrder: selectedWorkOrder, step })}
        onStart={(step) => openModalFromWorkOrderDetail({ type: 'confirm-start', workOrder: selectedWorkOrder, step })}
        onPause={(step) => pauseStep(selectedWorkOrder, step)}
        onLogResult={(step) => openModalFromWorkOrderDetail({ type: 'log-result', workOrder: selectedWorkOrder, step })}
        onHold={(step) => openModalFromWorkOrderDetail({ type: 'hold', workOrder: selectedWorkOrder, step })}
        onResume={(step) => resumeStep(selectedWorkOrder, step)}
        onQcDecision={(step) => openModalFromWorkOrderDetail({ type: 'qc', workOrder: selectedWorkOrder, step })}
        onCloseOrder={() => openModalFromWorkOrderDetail({ type: 'confirm-close', workOrder: selectedWorkOrder })}
        onArchiveOrder={() => openModalFromWorkOrderDetail({ type: 'confirm-archive', workOrder: selectedWorkOrder })}
        onCancel={() => openModalFromWorkOrderDetail({ type: 'confirm-cancel', workOrder: selectedWorkOrder })}
        onManageArtwork={() => openModalFromWorkOrderDetail({ type: 'manage-artwork', workOrder: selectedWorkOrder })}
        onResolveShortfall={(shortfall) => openModalFromWorkOrderDetail({ type: 'shortfall-action', workOrder: selectedWorkOrder, shortfall })}
        onReviewShortfall={(shortfall) => openModalFromWorkOrderDetail({ type: 'review-shortfall', workOrder: selectedWorkOrder, shortfall })}
        onResolveRework={() => openModalFromWorkOrderDetail({ type: 'resolve-rework', workOrder: selectedWorkOrder })}
      /> : null}

      {modal?.type === 'create' ? <CreateWorkOrderModal
        onClose={() => setModal(null)}
        onCreate={async (data) => {
          const steps = buildSteps(data.template, data.qty, data.customRoute, data.type)
          const created = await createLiveDraftWorkOrder({
            type: data.type,
            source: data.source,
            product: data.product,
            referenceNote: data.referenceNote,
            artworkApprovalRequired: data.artworkApprovalRequired,
            qty: data.qty,
            dueDate: data.dueDate,
            priority: data.priority,
            routeTemplateId: data.template,
            customRoute: data.customRoute,
            steps,
          })
          const liveOrders = await reloadWorkOrders()
          setModal(null)
          setSelectedId(liveOrders.find((order) => order.id === created.id)?.id || created.id)
          showToast(`${created.code} dibuat sebagai draft live Supabase.`)
        }}
      /> : null}

      {modal?.type === 'schedule' ? <ScheduleModal
        workOrder={modal.workOrder}
        staffDirectory={staffDirectory}
        team={teamForViews}
        onClose={() => setModal(null)}
        onSave={async (data) => {
          await scheduleLiveWorkOrder({
            workOrderId: modal.workOrder.id,
            scheduledDate: data.scheduledDate,
            machine: data.machine,
            steps: data.steps.map((step) => ({
              stepId: step.id,
              station: step.station,
              assignedEmployeeId: step.assignedUserId || '',
              reportToEmployeeId: step.reportToUserId || '',
              workArea: step.location || '',
              scheduledDate: step.scheduledDate || data.scheduledDate,
            })),
          })
          const liveOrders = await reloadWorkOrders()
          setSelectedId(liveOrders.find((order) => order.id === modal.workOrder.id)?.id || modal.workOrder.id)
          setModal(null)
          showToast('WO berhasil dideploy ke jadwal produksi live Supabase.')
        }}
      /> : null}

      {modal?.type === 'assign' ? <AssignProcessModal
        workOrder={modal.workOrder}
        step={modal.step}
        staffDirectory={staffDirectory}
        team={teamForViews}
        onClose={() => setModal(null)}
        onSave={(data) => {
          const updated = updateStep(modal.workOrder, modal.step.id, { assignedUserId: data.assignedUserId, reportToUserId: data.reportToUserId, location: data.location, status: 'ready' })
          updated.history = [makeHistory(currentUser, `PIC & jalur laporan ditetapkan · ${modal.step.name}`, `PIC ${getDirectoryName(data.assignedUserId, staffDirectory)} · Lapor ke ${getDirectoryName(data.reportToUserId, staffDirectory)} · Area ${data.location || 'belum diisi'}.`), ...modal.workOrder.history]
          applyOrderUpdate(updated, 'PIC, lapor ke, dan lokasi proses diperbarui.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'confirm-start' ? <StartProcessModal
        workOrder={modal.workOrder}
        step={modal.step}
        currentUser={currentUser}
        staffDirectory={staffDirectory}
        onClose={() => setModal(null)}
        onConfirm={() => {
          setModal(null)
          startStep(modal.workOrder, modal.step)
        }}
      /> : null}

      {modal?.type === 'log-result' ? <LogResultModal
        workOrder={modal.workOrder}
        step={modal.step}
        performerName={getDirectoryName(modal.step.assignedUserId, staffDirectory)}
        recordedByName={currentUser.name}
        onClose={() => setModal(null)}
        onSave={async (data) => {
          const total = data.good + data.rework + data.reject + data.gradeB + data.holdSortir + data.scrap
          const inputCap = getAvailableInputCap(modal.workOrder, modal.step)
          if (total <= 0) return showToast('Isi minimal satu hasil proses.')
          if (Number.isFinite(inputCap) && total > inputCap) return showToast(`Total hasil tidak boleh melebihi input proses tersedia: ${formatNumber(inputCap)} unit.`)

          try {
            await recordLiveWorkOrderStepOutput({
              stepId: modal.step.id,
              good: data.good,
              rework: data.rework,
              reject: data.reject,
              extra: data.extra,
              gradeB: data.gradeB,
              holdSortir: data.holdSortir,
              scrap: data.scrap,
              action: data.action,
              location: data.location || modal.step.location || '',
              note: data.note,
            })
            const liveOrders = await reloadWorkOrders()
            const refreshedOrder = liveOrders.find((liveOrder) => liveOrder.id === modal.workOrder.id)
            const elapsed = modal.step.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(modal.step.startedAt).getTime()) / 1_000)) : 0
            const optimisticResolvedQty = modal.step.qtyGood + data.good + modal.step.qtyReject + data.reject + (modal.step.qtyGradeB || 0) + data.gradeB + (modal.step.qtyHoldSortir || 0) + data.holdSortir + (modal.step.qtyScrap || 0) + data.scrap
            const optimisticPendingRework = (modal.step.qtyPendingRework ?? modal.step.qtyRework) + data.rework
            const keepRunning = data.action === 'continue' && optimisticResolvedQty < modal.step.plannedQty
            const isComplete = !keepRunning && optimisticResolvedQty >= modal.step.plannedQty && optimisticPendingRework === 0
            const optimisticOrder = updateStep(modal.workOrder, modal.step.id, {
              qtyGood: modal.step.qtyGood + data.good,
              qtyRework: modal.step.qtyRework + data.rework,
              qtyReject: modal.step.qtyReject + data.reject,
              qtyExtra: (modal.step.qtyExtra || 0) + data.extra,
              qtyGradeB: (modal.step.qtyGradeB || 0) + data.gradeB,
              qtyHoldSortir: (modal.step.qtyHoldSortir || 0) + data.holdSortir,
              qtyScrap: (modal.step.qtyScrap || 0) + data.scrap,
              qtyPendingRework: optimisticPendingRework,
              lastResultAction: data.action,
              resultNote: data.note,
              status: isComplete ? 'completed' : keepRunning ? 'in_progress' : 'ready',
              activeSeconds: keepRunning ? modal.step.activeSeconds : modal.step.activeSeconds + elapsed,
              startedAt: keepRunning ? (modal.step.startedAt || new Date().toISOString()) : undefined,
              completedAt: isComplete ? new Date().toISOString() : modal.step.completedAt,
            })
            const finishedOrder = isFinishedForNotice(refreshedOrder) ? refreshedOrder : isFinishedForNotice(optimisticOrder) ? optimisticOrder : null

            if (finishedOrder) {
              setSelectedId(null)
              setView('dashboard')
              setModal({ type: 'finished-notice', workOrder: finishedOrder })
              showToast(`${finishedOrder.code} selesai. Kembali ke dashboard.`)
              return
            }

            setSelectedId((refreshedOrder as WorkOrder | undefined)?.id || modal.workOrder.id)
            showToast(data.action === 'continue' ? 'Hasil tersimpan. Timer proses tetap berjalan.' : data.rework > 0 ? 'Hasil tersimpan. Qty rework tercatat sebagai pending rework.' : 'Hasil proses tersimpan di Supabase.')
            setModal(null)
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Hasil proses tidak dapat disimpan.')
          }
        }}
      /> : null}

      {modal?.type === 'hold' ? <HoldModal
        step={modal.step}
        onClose={() => setModal(null)}
        onSave={(reason) => {
          const elapsed = modal.step.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(modal.step.startedAt).getTime()) / 1_000)) : 0
          const updated = updateStep(modal.workOrder, modal.step.id, { holdReason: reason, status: 'hold', activeSeconds: modal.step.activeSeconds + elapsed, startedAt: undefined })
          updated.history = [makeHistory(currentUser, `HOLD · ${modal.step.name}`, reason), ...modal.workOrder.history]
          applyOrderUpdate(updated, 'Proses masuk HOLD.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'qc' ? <QcModal
        workOrder={modal.workOrder}
        step={modal.step}
        currentUser={currentUser}
        onClose={() => setModal(null)}
        onSave={async (data) => {
          const cap = Math.min(modal.step.plannedQty - getStepRecordedQty(modal.step), getAvailableInputCap(modal.workOrder, modal.step))
          const total = data.decision === 'pass' ? data.qty + data.reject : data.qty
          if (total <= 0) return showToast('Isi minimal satu jumlah QC.')
          if (total > cap) return showToast(`Jumlah QC tidak boleh melebihi ${formatNumber(cap)} unit.`)

          try {
            await recordLiveQcDecision({
              stepId: modal.step.id,
              decision: data.decision,
              qty: data.qty,
              reject: data.reject,
              location: modal.step.location || defaultLocationForStation(modal.step.station),
              note: data.note,
              defectCategory: data.defectCategory,
            })

            const liveOrders = await reloadWorkOrders()
            const refreshedOrder = liveOrders.find((liveOrder) => liveOrder.id === modal.workOrder.id)
            const optimisticRecordedQty = getStepRecordedQty(modal.step) + total
            const optimisticOrder = updateStep(modal.workOrder, modal.step.id, {
              qtyGood: modal.step.qtyGood + (data.decision === 'pass' ? data.qty : 0),
              qtyRework: modal.step.qtyRework + (data.decision === 'rework' ? data.qty : 0),
              qtyReject: modal.step.qtyReject + (data.decision === 'pass' ? data.reject : 0),
              status: optimisticRecordedQty >= modal.step.plannedQty ? 'completed' : 'ready',
              startedAt: optimisticRecordedQty >= modal.step.plannedQty ? undefined : modal.step.startedAt,
              completedAt: optimisticRecordedQty >= modal.step.plannedQty ? new Date().toISOString() : modal.step.completedAt,
            })
            const finishedOrder = isFinishedForNotice(refreshedOrder) ? refreshedOrder : isFinishedForNotice(optimisticOrder) ? optimisticOrder : null

            if (finishedOrder) {
              setSelectedId(null)
              setView('dashboard')
              setModal({ type: 'finished-notice', workOrder: finishedOrder })
              showToast(`${finishedOrder.code} selesai. Kembali ke dashboard.`)
              return
            }

            setSelectedId((refreshedOrder as WorkOrder | undefined)?.id || modal.workOrder.id)
            showToast(
              data.decision === 'rework'
                ? 'Keputusan QC tersimpan. Qty rework tercatat di Supabase.'
                : data.reject > 0
                  ? (modal.workOrder.type === 'mts'
                    ? 'Keputusan QC tersimpan. Reject produksi stok masuk catatan gudang, tanpa approval PPIC.'
                    : 'Keputusan QC tersimpan. Reject pesanan customer masuk kontrol kekurangan.')
                  : 'Keputusan QC tersimpan. Produk lolos QC siap ke proses berikutnya.',
            )
            setModal(null)
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Keputusan QC tidak dapat disimpan.')
          }
        }}
      /> : null}


      {modal?.type === 'resolve-rework' ? <ResolveReworkModal
        workOrder={modal.workOrder}
        onClose={() => setModal(null)}
        onSave={async (data) => {
          try {
            await resolveLivePendingRework({
              workOrderId: modal.workOrder.id,
              good: data.good,
              gradeB: data.gradeB,
              holdSortir: data.holdSortir,
              scrap: data.scrap,
              location: data.location,
              note: data.note,
            })
            const liveOrders = await reloadWorkOrders()
            const refreshedOrder = liveOrders.find((liveOrder) => liveOrder.id === modal.workOrder.id)
            if (isFinishedForNotice(refreshedOrder)) {
              setSelectedId(null)
              setView('dashboard')
              setModal({ type: 'finished-notice', workOrder: refreshedOrder })
              showToast(`${refreshedOrder.code} selesai. Pending rework sudah diselesaikan.`)
              return
            }
            setSelectedId((refreshedOrder as WorkOrder | undefined)?.id || modal.workOrder.id)
            setModal(null)
            showToast('Pending rework berhasil diklasifikasikan.')
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Pending rework tidak dapat diselesaikan.')
          }
        }}
      /> : null}

      {modal?.type === 'shortfall-action' ? <ShortfallActionModal
        workOrder={modal.workOrder}
        shortfall={modal.shortfall}
        onClose={() => setModal(null)}
        onSave={(data) => {
          const selectedShortfall = modal.workOrder.shortfalls?.find((item) => item.id === modal.shortfall.id)
          if (!selectedShortfall) return
          let updated: WorkOrder = { ...modal.workOrder }
          if (data.action === 'replacement') {
            const replacementSteps = buildReplacementSteps(updated, selectedShortfall, data.restartFromStepId)
            if (!replacementSteps.length) return showToast('Rute penggantian tidak dapat dibuat. Pilih proses awal yang valid.')
            const sourceIndex = updated.steps.findIndex((step) => step.id === selectedShortfall.sourceStepId)
            updated = {
              ...updated,
              steps: reindexSteps([...updated.steps.slice(0, sourceIndex + 1), ...replacementSteps, ...updated.steps.slice(sourceIndex + 1)]),
              shortfalls: (updated.shortfalls || []).map((item) => item.id === selectedShortfall.id ? {
                ...item,
                status: 'replacement_planned' as const,
                replacementStartStepId: data.restartFromStepId,
                replacementStepIds: replacementSteps.map((step) => step.id),
                resolvedBy: currentUser.name,
                resolvedAt: new Date().toISOString(),
                resolutionNote: data.note,
              } : item),
              history: [makeHistory(currentUser, 'Penggantian direncanakan', `${selectedShortfall.qty} unit akan diulang dari ${replacementSteps[0].name.replace('Pengganti · ', '')} sampai ${replacementSteps.at(-1)?.name.replace('Pengganti · ', '')}. ${data.note}`), ...updated.history],
            }
            applyOrderUpdate(updated, 'Rute penggantian dibuat dan diberi warna amber sampai target pulih.')
          } else {
            const requiresManagerApproval = updated.type === 'mto'
            const nextStatus = requiresManagerApproval
              ? 'awaiting_approval' as const
              : (data.action === 'short_shipment' ? 'approved_short_shipment' as const : 'cancelled_remaining' as const)
            updated = {
              ...updated,
              shortfalls: (updated.shortfalls || []).map((item) => item.id === selectedShortfall.id ? {
                ...item,
                status: nextStatus,
                ...(requiresManagerApproval ? {
                  requestedAction: data.action === 'short_shipment' ? 'short_shipment' as const : 'cancel_remaining' as const,
                  requestedBy: currentUser.name,
                  requestedAt: new Date().toISOString(),
                  resolutionNote: data.note,
                } : {
                  resolvedBy: currentUser.name,
                  resolvedAt: new Date().toISOString(),
                  resolutionNote: data.note,
                }),
              } : item),
              history: [makeHistory(currentUser, requiresManagerApproval ? 'Permohonan keputusan MTO diajukan' : (data.action === 'short_shipment' ? 'Pengiriman kurang disetujui' : 'Sisa WO dibatalkan'), `${selectedShortfall.qty} unit dari ${selectedShortfall.sourceStepName}. ${data.note}`), ...updated.history],
            }
            applyOrderUpdate(updated, requiresManagerApproval ? 'Permohonan MTO dikirim ke Manager / Owner untuk persetujuan.' : (data.action === 'short_shipment' ? 'Kekurangan disetujui sebagai pengiriman kurang.' : 'Sisa kuantitas dibatalkan.'))
          }
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'review-shortfall' ? <ReviewShortfallModal
        workOrder={modal.workOrder}
        shortfall={modal.shortfall}
        onClose={() => setModal(null)}
        onSave={(data) => {
          const requested = modal.workOrder.shortfalls?.find((item) => item.id === modal.shortfall.id)
          if (!requested) return
          const approvedStatus = requested.requestedAction === 'short_shipment' ? 'approved_short_shipment' as const : 'cancelled_remaining' as const
          const updated: WorkOrder = {
            ...modal.workOrder,
            shortfalls: (modal.workOrder.shortfalls || []).map((item) => item.id === requested.id ? (data.approved ? {
              ...item,
              status: approvedStatus,
              decisionBy: currentUser.name,
              decisionAt: new Date().toISOString(),
              resolvedBy: currentUser.name,
              resolvedAt: new Date().toISOString(),
              resolutionNote: data.note,
            } : {
              ...item,
              status: 'action_required' as const,
              requestedAction: undefined,
              requestedBy: undefined,
              requestedAt: undefined,
              decisionBy: currentUser.name,
              decisionAt: new Date().toISOString(),
              resolutionNote: `Permohonan ditolak: ${data.note}`,
            }) : item),
            history: [makeHistory(currentUser, data.approved ? 'Permohonan kekurangan disetujui' : 'Permohonan kekurangan ditolak', `${requested.qty} unit · ${data.note}`), ...modal.workOrder.history],
          }
          applyOrderUpdate(updated, data.approved ? 'Keputusan Manager / Owner tersimpan.' : 'Permohonan ditolak dan kembali ke Admin / PPIC untuk ditindaklanjuti.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'manage-artwork' ? <ArtworkManagerModal
        workOrder={modal.workOrder}
        currentUser={currentUser}
        onClose={() => setModal(null)}
        onSave={(referenceImages, artworkApprovalRequired, changeSummary) => {
          const updated: WorkOrder = {
            ...modal.workOrder,
            referenceImages,
            artworkApprovalRequired,
            history: [makeHistory(currentUser, 'Kontrol artwork diperbarui', changeSummary), ...modal.workOrder.history],
          }
          applyOrderUpdate(updated, 'Artwork, versi, dan persetujuan berhasil diperbarui.')
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'confirm-artwork' ? <ConfirmArtworkModal
        workOrder={modal.workOrder}
        step={modal.step}
        onClose={() => setModal(null)}
        onConfirm={(imageId) => {
          void beginStep(modal.workOrder, modal.step, imageId)
          setModal(null)
        }}
      /> : null}

      {modal?.type === 'finished-notice' ? <FinishedWorkOrderModal
        workOrder={modal.workOrder}
        onConfirm={() => {
          setModal(null)
          setSelectedId(null)
          setView('dashboard')
        }}
      /> : null}

      {modal?.type === 'confirm-close' ? <ConfirmModal title="Close Work Order" description="Hanya PPIC yang dapat close WO. Pastikan proses final sudah selesai dan hasil akhir siap dievaluasi di Laporan." confirmLabel="Close WO" onClose={() => setModal(null)} onConfirm={() => closeOrder(modal.workOrder)} /> : null}
      {modal?.type === 'confirm-archive' ? <ConfirmModal title="Archive Work Order" description="Archive hanya untuk WO yang sudah di-close. WO akan hilang dari daftar aktif, tetapi tetap tersedia di Laporan untuk evaluasi." confirmLabel="Archive WO" onClose={() => setModal(null)} onConfirm={() => archiveOrder(modal.workOrder)} /> : null}
      {modal?.type === 'confirm-cancel' ? <ConfirmModal title="Batalkan Draft" description="Draft tidak akan masuk antrean produksi. Hanya draft yang boleh dibatalkan." confirmLabel="Batalkan Draft" danger onClose={() => setModal(null)} onConfirm={() => cancelOrder(modal.workOrder)} /> : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}

type CreateData = {
  type: WorkOrderType
  source: string
  product: string
  referenceNote: string
  referenceImages: WorkOrderReferenceImage[]
  artworkApprovalRequired: boolean
  qty: number
  dueDate: string
  priority: Priority
  template: string
  customRoute: string[]
}

const MAX_ARTWORK_IMAGES = 6
const MAX_ARTWORK_FILE_BYTES = 8 * 1024 * 1024
const MAX_ARTWORK_DIMENSION = 1600

function routeHasPrinting(template: string, customRoute: string[]) {
  return template === 'print-sew' || template === 'multi-part' || (template === 'custom' && customRoute.includes('printing'))
}

function readArtworkFile(file: File): Promise<WorkOrderReferenceImage> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error(`${file.name}: gunakan JPG, PNG, atau WEBP.`))
      return
    }

    if (file.size > MAX_ARTWORK_FILE_BYTES) {
      reject(new Error(`${file.name}: ukuran maksimal 8 MB per gambar.`))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Gagal membaca ${file.name}.`))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error(`${file.name}: file gambar tidak dapat diproses.`))
      image.onload = () => {
        const scale = Math.min(1, MAX_ARTWORK_DIMENSION / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error(`Gagal menyiapkan preview ${file.name}.`))
          return
        }

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const name = `${file.name.replace(/\.[^/.]+$/, '') || 'artwork'}.jpg`
        resolve({
          id: createId('artwork'),
          name,
          dataUrl: canvas.toDataURL('image/jpeg', 0.84),
          createdAt: new Date().toISOString(),
          version: 'V1',
          approvalStatus: 'pending',
          isPrimary: false,
          printNote: '',
        })
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function CreateWorkOrderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: CreateData) => void | Promise<void> }) {
  const [type, setType] = useState<WorkOrderType>('mto')
  const [template, setTemplate] = useState('multi-part')
  const [customRoute, setCustomRoute] = useState<string[]>(['printing', 'cutting', 'lining', 'zipper', 'sewing', 'finishing'])
  const [form, setForm] = useState({ source: '', product: '', referenceNote: '', qty: 100, dueDate: new Date().toISOString().slice(0, 10), priority: 'p3' as Priority })
  const [referenceImages, setReferenceImages] = useState<WorkOrderReferenceImage[]>([])
  const [artworkApprovalRequired, setArtworkApprovalRequired] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const hasPrintingRoute = routeHasPrinting(template, customRoute)
  const toggleCustom = (id: string) => setCustomRoute((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])

  const addArtworkFiles = async (fileList: FileList | File[] | null) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return

    const availableSlots = MAX_ARTWORK_IMAGES - referenceImages.length
    if (availableSlots <= 0) {
      setUploadError(`Maksimal ${MAX_ARTWORK_IMAGES} gambar motif untuk satu WO.`)
      return
    }

    setUploadError('')
    setIsUploading(true)
    try {
      const candidates = incoming.slice(0, availableSlots)
      const results = await Promise.allSettled(candidates.map(readArtworkFile))
      const successful = results
        .filter((result): result is PromiseFulfilledResult<WorkOrderReferenceImage> => result.status === 'fulfilled')
        .map((result) => result.value)
      const failed = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason instanceof Error ? result.reason.message : 'Gagal menambahkan gambar.')

      if (successful.length) {
        setReferenceImages((current) => [...current, ...successful].map((image, index) => ({ ...image, isPrimary: current.length === 0 && index === 0 ? true : image.isPrimary })))
      }
      if (incoming.length > availableSlots) {
        failed.push(`Hanya ${availableSlots} gambar yang dapat ditambahkan. Maksimal ${MAX_ARTWORK_IMAGES} gambar per WO.`)
      }
      if (failed.length) setUploadError(failed.join(' '))
    } finally {
      setIsUploading(false)
    }
  }

  const removeArtwork = (id: string) => {
    setReferenceImages((current) => current.filter((image) => image.id !== id))
    setUploadError('')
  }

  return <Modal title="Buat Work Order" subtitle="Draft belum masuk ke lantai produksi. PPIC harus menjadwalkan sebelum proses pertama bisa dimulai." onClose={onClose} wide>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      setUploadError('')
      setIsSaving(true)
      void Promise.resolve(onCreate({ type, template, customRoute, referenceImages, artworkApprovalRequired: hasPrintingRoute && artworkApprovalRequired, ...form, qty: Number(form.qty) }))
        .catch((error) => setUploadError(error instanceof Error ? error.message : 'WO tidak dapat dibuat.'))
        .finally(() => setIsSaving(false))
    }}>
      <div className="form-section-label">1. Sumber dan produk</div>
      <div className="segmented-control"><button className={type === 'mto' ? 'is-active' : ''} type="button" onClick={() => setType('mto')}>Pesanan customer / MTO</button><button className={type === 'mts' ? 'is-active' : ''} type="button" onClick={() => setType('mts')}>Buat stok / MTS</button></div>
      <div className="form-grid">
        <label><span>{type === 'mto' ? 'Nomor order / customer' : 'Alasan buat stok'}</span><input required value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder={type === 'mto' ? 'Contoh: Shopee #PGE-260707-001' : 'Contoh: Stok campaign Agustus'} /></label>
        <label><span>Jumlah rencana</span><input required min="1" type="number" value={form.qty} onChange={(event) => setForm({ ...form, qty: Number(event.target.value) })} /></label>
        <label className="form-grid__wide"><span>Deskripsi produk</span><input required value={form.product} onChange={(event) => setForm({ ...form, product: event.target.value })} placeholder="Contoh: Cover passport Korea, maroon, motif landmark, resleting putih" /></label>
        <label className="form-grid__wide"><span>Referensi / lokasi artwork</span><input value={form.referenceNote} onChange={(event) => setForm({ ...form, referenceNote: event.target.value })} placeholder="Contoh: Canva / Produk Juli / Korea final V3" /></label>
        <div className="form-grid__wide artwork-field">
          <span>Artwork / motif untuk printing · opsional</span>
          <div className="artwork-upload">
            <input id="artworkUpload" className="artwork-upload__input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void addArtworkFiles(event.target.files); event.currentTarget.value = '' }} />
            <label className="artwork-upload__dropzone" htmlFor="artworkUpload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addArtworkFiles(event.dataTransfer.files) }}>
              <Icon name="upload" />
              <span><b>{isUploading ? 'Menyiapkan gambar...' : 'Upload gambar motif / artwork'}</b><small>JPG, PNG, atau WEBP · maksimal 6 gambar · maksimal 8 MB per gambar. Gambar diperkecil agar lebih aman dibuka di ponsel operator.</small></span>
            </label>
            {referenceImages.length ? <div className="artwork-upload__grid">
              {referenceImages.map((image, index) => <article className="artwork-upload__thumb" key={image.id}>
                <img src={image.dataUrl} alt={`Artwork ${index + 1}: ${image.name}`} />
                <div><b>{image.isPrimary ? 'Kandidat file utama' : `Motif ${index + 1}`}</b><small>{image.name} · {image.version} · menunggu persetujuan</small></div>
                <button type="button" onClick={() => removeArtwork(image.id)} aria-label={`Hapus ${image.name}`}>×</button>
              </article>)}
            </div> : <p className="artwork-upload__empty">Belum ada gambar motif. Upload hanya bila desain perlu menjadi acuan operator. Jika approval artwork diaktifkan di bawah, file final dapat ditambahkan dan disetujui setelah WO dibuat.</p>}
            {uploadError ? <p className="artwork-upload__error">{uploadError}</p> : null}
          </div>
        </div>
        <label><span>Target selesai</span><input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
        <label><span>Prioritas</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="form-section-label">2. Pilih rute produksi</div>
      <div className="route-template-grid">{routeTemplates.map((item) => <button type="button" key={item.id} className={`route-template${template === item.id ? ' route-template--active' : ''}`} onClick={() => setTemplate(item.id)}><b>{item.title}</b><span>{item.description}</span></button>)}</div>
      {template === 'custom' ? <div className="custom-route-builder"><div><b>Proses dipilih</b><span>QC akhir dan langkah final ditambahkan otomatis: Pesanan Customer menjadi Packing / Siap Kirim, Produksi Stok menjadi Masuk Gudang / Stok Tersedia. Rute yang sudah punya hasil tidak dapat diubah setelah produksi dimulai.</span></div><div className="custom-route-options">{CUSTOM_OPTIONS.map((item) => <button type="button" key={item.id} className={customRoute.includes(item.id) ? 'is-active' : ''} onClick={() => toggleCustom(item.id)}>{customRoute.includes(item.id) ? '✓ ' : '+ '}{item.label}</button>)}</div></div> : null}
      {hasPrintingRoute ? <label className="artwork-confirm__check artwork-control-option"><input type="checkbox" checked={artworkApprovalRequired} onChange={(event) => setArtworkApprovalRequired(event.target.checked)} /><span><b>Wajibkan approval artwork sebelum Printing</b><small>Opsional. Aktifkan hanya untuk motif custom, revisi desain, atau produk yang harus diverifikasi terhadap file final. Jika tidak dicentang, operator tetap bisa mulai cetak tanpa upload atau approval artwork.</small></span></label> : null}
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className="button button--primary" disabled={isUploading || isSaving}>{isSaving ? 'Menyimpan ke Supabase…' : 'Buat draft WO'}</button></footer>
    </form>
  </Modal>
}


function nextArtworkVersion(images: WorkOrderReferenceImage[]) {
  const versions = images
    .map((image) => Number(image.version.replace(/[^0-9]/g, '')) || 0)
    .filter(Boolean)
  return `V${Math.max(0, ...versions) + 1}`
}

function ArtworkManagerModal({
  workOrder,
  currentUser,
  onClose,
  onSave,
}: {
  workOrder: WorkOrder
  currentUser: TeamMember
  onClose: () => void
  onSave: (images: WorkOrderReferenceImage[], artworkApprovalRequired: boolean, changeSummary: string) => void
}) {
  const [images, setImages] = useState<WorkOrderReferenceImage[]>(() => (workOrder.referenceImages || []).map((image) => ({ ...image })))
  const [artworkApprovalRequired, setArtworkApprovalRequired] = useState(Boolean(workOrder.artworkApprovalRequired))
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  const updateImage = (id: string, patch: Partial<WorkOrderReferenceImage>) => {
    setImages((current) => current.map((image) => image.id === id ? { ...image, ...patch } : image))
  }

  const setPrimary = (id: string) => {
    setImages((current) => current.map((image) => ({ ...image, isPrimary: image.id === id })))
  }

  const setApproval = (id: string, approvalStatus: ArtworkApprovalStatus) => {
    setImages((current) => current.map((image) => image.id === id
      ? {
          ...image,
          approvalStatus,
          approvedBy: approvalStatus === 'approved' ? currentUser.name : undefined,
          approvedAt: approvalStatus === 'approved' ? new Date().toISOString() : undefined,
        }
      : image))
  }

  const addArtworkFiles = async (fileList: FileList | File[] | null) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return
    const availableSlots = MAX_ARTWORK_IMAGES - images.length
    if (availableSlots <= 0) return setUploadError(`Maksimal ${MAX_ARTWORK_IMAGES} file per WO.`)
    setUploadError('')
    setIsUploading(true)
    try {
      const results = await Promise.allSettled(incoming.slice(0, availableSlots).map(readArtworkFile))
      const successful = results
        .filter((result): result is PromiseFulfilledResult<WorkOrderReferenceImage> => result.status === 'fulfilled')
        .map((result) => result.value)
      const failed = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason instanceof Error ? result.reason.message : 'Gagal menambahkan file.')
      if (successful.length) {
        setImages((current) => {
          const start = nextArtworkVersion(current)
          const startNumber = Number(start.replace('V', ''))
          return [...current, ...successful.map((image, index) => ({
            ...image,
            version: `V${startNumber + index}`,
            isPrimary: current.length === 0 && index === 0,
          }))]
        })
      }
      if (failed.length) setUploadError(failed.join(' '))
    } finally {
      setIsUploading(false)
    }
  }

  const removeImage = (id: string) => {
    setImages((current) => {
      const next = current.filter((image) => image.id !== id)
      if (next.length && !next.some((image) => image.isPrimary)) next[0] = { ...next[0], isPrimary: true }
      return next
    })
  }

  const save = () => {
    const primary = images.find((image) => image.isPrimary)
    if (artworkApprovalRequired && primary?.approvalStatus === 'superseded') {
      setUploadError('File utama tidak boleh berstatus versi lama / diganti ketika approval artwork diwajibkan.')
      return
    }
    const final = images.find((image) => image.isPrimary && image.approvalStatus === 'approved')
    const summary = artworkApprovalRequired
      ? (final
        ? `Approval artwork diwajibkan. FINAL PRINT FILE: ${final.name} · ${final.version} · disetujui untuk cetak.`
        : 'Approval artwork diwajibkan, tetapi belum ada FINAL PRINT FILE yang disetujui untuk cetak.')
      : 'Artwork disimpan sebagai referensi opsional. Printing tidak akan dikunci oleh approval file.'
    onSave(images, artworkApprovalRequired, summary)
  }

  return <Modal title="Kelola Artwork & Versi" subtitle="Artwork dapat dipakai sebagai referensi saja atau dijadikan kontrol wajib sebelum Printing. Pilih sesuai risiko produk dan motif." onClose={onClose} wide>
    <div className="form-stack artwork-manager">
      <label className="artwork-confirm__check artwork-control-option"><input type="checkbox" checked={artworkApprovalRequired} onChange={(event) => setArtworkApprovalRequired(event.target.checked)} /><span><b>Wajibkan approval artwork sebelum Printing</b><small>Jika aktif, operator tidak bisa mulai cetak sampai satu FINAL PRINT FILE dipilih dan disetujui. Jika nonaktif, artwork tetap bisa disimpan sebagai referensi tanpa mengunci proses.</small></span></label>
      {artworkApprovalRequired ? <div className="callout"><Icon name="warning" /><span><b>Aturan aktif:</b> satu WO hanya boleh mempunyai satu file utama. Agar Printing dapat dimulai, file utama harus memiliki status <b>Disetujui untuk cetak</b>.</span></div> : <div className="callout"><Icon name="image" /><span><b>Mode opsional:</b> file dapat diunggah untuk memudahkan operator, tetapi Printing tetap dapat dimulai tanpa file final atau approval.</span></div>}
      <input id="artworkRevisionUpload" className="artwork-upload__input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void addArtworkFiles(event.target.files); event.currentTarget.value = '' }} />
      <label className="artwork-upload__dropzone" htmlFor="artworkRevisionUpload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addArtworkFiles(event.dataTransfer.files) }}>
        <Icon name="upload" /><span><b>{isUploading ? 'Menyiapkan file revisi...' : 'Tambah artwork / revisi baru'}</b><small>Drag & drop atau klik. File baru ditambahkan sebagai versi berikutnya dan tetap menunggu persetujuan.</small></span>
      </label>
      {uploadError ? <p className="artwork-upload__error">{uploadError}</p> : null}
      {images.length ? <div className="artwork-manager__list">
        {images.map((image) => <article className={`artwork-manager-card${image.isPrimary ? ' artwork-manager-card--primary' : ''}`} key={image.id}>
          <img src={image.dataUrl} alt={image.name} />
          <div className="artwork-manager-card__fields">
            <div className="artwork-manager-card__titleline"><b>{image.isPrimary ? 'FINAL PRINT FILE candidate' : 'Artwork reference'}</b><button type="button" className="text-button text-button--danger" onClick={() => removeImage(image.id)}>Hapus</button></div>
            <div className="form-grid">
              <label className="form-grid__wide"><span>Nama file / judul motif</span><input value={image.name} onChange={(event) => updateImage(image.id, { name: event.target.value })} /></label>
              <label><span>Versi</span><input value={image.version} onChange={(event) => updateImage(image.id, { version: event.target.value || 'V1' })} placeholder="V3" /></label>
              <label><span>Status</span><select value={image.approvalStatus} onChange={(event) => setApproval(image.id, event.target.value as ArtworkApprovalStatus)}>{Object.entries(artworkApprovalLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="form-grid__wide"><span>Instruksi cetak</span><textarea value={image.printNote || ''} onChange={(event) => updateImage(image.id, { printNote: event.target.value })} placeholder="Contoh: Gunakan warna maroon; cek posisi logo; cetak 1 panel depan per unit." /></label>
            </div>
            <div className="artwork-manager-card__actions"><button type="button" className={`button button--compact ${image.isPrimary ? 'button--primary' : 'button--secondary'}`} onClick={() => setPrimary(image.id)}>{image.isPrimary ? <><Icon name="check" /> File utama untuk cetak</> : 'Jadikan file utama'}</button>{image.approvalStatus === 'approved' ? <span className="approval-note"><Icon name="check" /> Disetujui oleh {image.approvedBy || currentUser.name}</span> : image.approvalStatus === 'superseded' ? <span className="approval-note approval-note--old">Versi lama — jangan dicetak</span> : <span className="approval-note approval-note--pending">Belum disetujui</span>}</div>
          </div>
        </article>)}
      </div> : <div className="empty-state">Belum ada artwork. Tambahkan file agar Printing bisa memiliki file final yang jelas.</div>}
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="button" className="button button--primary" onClick={save}>Simpan kontrol artwork</button></footer>
    </div>
  </Modal>
}

function ConfirmArtworkModal({ workOrder, step, onClose, onConfirm }: { workOrder: WorkOrder; step: ProcessStep; onClose: () => void; onConfirm: (imageId: string) => void }) {
  const finalArtwork = getApprovedPrimaryArtwork(workOrder)
  const [isConfirmed, setIsConfirmed] = useState(false)
  if (!finalArtwork) return <Modal title="Printing diblokir" subtitle="Tidak ada file final yang disetujui untuk cetak." onClose={onClose}><div className="form-stack"><div className="artwork-missing"><Icon name="warning" /><span><b>FINAL PRINT FILE belum tersedia.</b> Minta Admin atau PPIC menetapkan file utama dan status persetujuannya.</span></div><footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Tutup</button></footer></div></Modal>

  return <Modal title="Review FINAL PRINT FILE" subtitle="Sebelum timer Printing dimulai, operator wajib membuka dan mencocokkan motif, warna, versi, serta instruksi cetak." onClose={onClose} wide>
    <div className="form-stack artwork-confirm">
      <section className="artwork-confirm__file"><img src={finalArtwork.dataUrl} alt={`FINAL PRINT FILE ${finalArtwork.name}`} /><div><span><Icon name="check" /> FINAL PRINT FILE · {finalArtwork.version}</span><h3>{finalArtwork.name}</h3><p>{finalArtwork.printNote || 'Tidak ada instruksi cetak tambahan.'}</p><small>Disetujui oleh {finalArtwork.approvedBy || 'PPIC / R&D'}{finalArtwork.approvedAt ? ` · ${new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(finalArtwork.approvedAt))}` : ''}</small></div></section>
      <div className="callout"><Icon name="image" /><span><b>{workOrder.code}</b> · {step.name}. Pastikan contoh pada layar sama dengan file di mesin dan produk yang akan dicetak.</span></div>
      <label className="artwork-confirm__check"><input type="checkbox" checked={isConfirmed} onChange={(event) => setIsConfirmed(event.target.checked)} /><span>Saya sudah membuka FINAL PRINT FILE <b>{finalArtwork.version}</b> dan memastikan motif, warna, posisi, serta instruksi cetak sesuai sebelum memulai produksi.</span></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="button" className="button button--primary" disabled={!isConfirmed} onClick={() => onConfirm(finalArtwork.id)}><Icon name="play" /> Konfirmasi & mulai cetak</button></footer>
    </div>
  </Modal>
}

function getDefaultReportToUserId(directory: StaffDirectoryMember[], team: TeamMember[] = []) {
  const receivers = getEscalationReceivers(directory, team)
  return receivers.find((member) => member.name.toLowerCase().includes('ppic'))?.id || receivers[0]?.id || ''
}

function ScheduleModal({ workOrder, staffDirectory: directory, team, onClose, onSave }: {
  workOrder: WorkOrder
  staffDirectory: StaffDirectoryMember[]
  team: TeamMember[]
  onClose: () => void
  onSave: (data: { machine: string; scheduledDate: string; steps: ProcessStep[] }) => Promise<void> | void
}) {
  const machine = workOrder.machine || 'Manual / tidak memakai mesin'
  const [scheduledDate, setScheduledDate] = useState(workOrder.scheduledDate || new Date().toISOString().slice(0, 10))
  const [plannedSteps, setPlannedSteps] = useState<ProcessStep[]>(() => workOrder.steps.map((step) => ({
    ...step,
    scheduledDate: step.scheduledDate || workOrder.scheduledDate || new Date().toISOString().slice(0, 10),
    reportToUserId: step.reportToUserId || getDefaultReportToUserId(directory, team),
    location: step.location || defaultLocationForStation(step.station),
  })))
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const artworkReadiness = getArtworkReadiness(workOrder)

  const updatePlan = (stepId: string, patch: Partial<ProcessStep>) => {
    setPlannedSteps((current) => current.map((step) => step.id === stepId ? {
      ...step,
      ...patch,
      location: patch.station && !step.location ? defaultLocationForStation(patch.station) : patch.location ?? step.location,
    } : step))
  }

  const deploy = async () => {
    const missing = plannedSteps.filter((step) => !step.assignedUserId || !step.reportToUserId || !step.location || !step.scheduledDate)
    if (missing.length) {
      setError(`Lengkapi PIC, lapor ke, area kerja, dan tanggal rencana pada ${missing.length} proses sebelum WO dideploy.`)
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      await onSave({ machine, scheduledDate, steps: plannedSteps })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'WO tidak dapat dideploy.')
      setIsSubmitting(false)
    }
  }

  return <Modal title="Rencanakan & deploy Work Order" subtitle="Admin atau PPIC menetapkan pemilik proses, jalur pelaporan, dan lokasi kerja sebelum WO masuk ke lantai produksi." onClose={onClose} wide>
    <form className="form-stack deployment-plan" onSubmit={(event) => { event.preventDefault(); void deploy() }}>
      <div className="callout"><Icon name="calendar" /><span><b>{workOrder.code}</b> · Rute dan input proses sudah dibuat saat Draft. Di tahap ini, Admin / PPIC menetapkan siapa yang bekerja, melapor ke siapa, dan bekerja di area mana.</span></div>
      <div className="callout callout--warning"><Icon name="warning" /><span><b>Aturan aman:</b> urutan dan input proses dari template tidak diubah dari layar ini agar alur tidak putus. Ubah stasiun, PIC, pelaporan, dan lokasi hanya sebelum deploy; setelah proses mulai, struktur WO terkunci untuk audit.</span></div>
      {workOrder.artworkApprovalRequired && !artworkReadiness.ready ? <div className="callout callout--warning"><Icon name="image" /><span><b>Artwork belum siap untuk cetak.</b> {artworkReadiness.reason} WO tetap dapat dideploy, tetapi Printing akan terkunci sampai file final disetujui.</span></div> : null}
      <div className="form-grid form-grid--schedule-date">
        <label><span>Tanggal jadwal</span><input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></label>
      </div>
      <section className="deployment-plan__section">
        <div><p className="eyebrow">Penugasan sebelum deploy</p><h3>Rute, PIC, pelaporan, dan area</h3><span>Semua pilihan menggunakan dropdown agar WO tetap konsisten dan mudah dibaca operator.</span></div>
        <div className="deployment-plan__legend"><span><i className="legend-dot legend-dot--required" /> Wajib sebelum deploy</span><span><i className="legend-dot legend-dot--station" /> Warna mengikuti stasiun proses</span></div>
        <div className="deployment-plan__steps">
          {plannedSteps.map((step, index) => <article className={`deployment-step deployment-step--station-${step.station}`} key={step.id}>
            <div className="deployment-step__sequence">P{String(index + 1).padStart(2, '0')}</div>
            <div className="deployment-step__process"><b>{step.name}</b><span>{step.inputs.length ? `Butuh: ${step.inputs.join(' + ')}` : 'Mulai langsung'} · Hasil: {step.output}</span></div>
            <label><span>Tanggal rencana *</span><input type="date" value={step.scheduledDate || scheduledDate} onChange={(event) => updatePlan(step.id, { scheduledDate: event.target.value })} /></label>
            <label><span>Stasiun</span><select value={step.station} onChange={(event) => updatePlan(step.id, { station: event.target.value as Station, location: defaultLocationForStation(event.target.value as Station) })}>{Object.entries(stationLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span className="field-label-with-help">PIC pelaksana *<span className="field-help" tabIndex={0} aria-label="Bantuan PIC">?<span className="field-help__tooltip">Hanya PIC yang punya akses ke stasiun ini yang bisa dipilih. Atur akses personel di menu People & Station.</span></span></span><select value={step.assignedUserId || ''} onChange={(event) => updatePlan(step.id, { assignedUserId: event.target.value })}><option value="">Pilih PIC sesuai stasiun</option>{getEligibleAssignees(step.station, directory, team).map((member) => <option value={member.id} key={member.id}>{member.name}{member.employeeNumber ? ` · ${member.employeeNumber}` : ''}</option>)}</select></label>
            <label><span>Lapor ke *</span><select value={step.reportToUserId || ''} onChange={(event) => updatePlan(step.id, { reportToUserId: event.target.value })}><option value="">Pilih penerima laporan</option>{getEscalationReceivers(directory, team).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
            <label><span>Area kerja / laporan hasil *</span><select value={step.location || ''} onChange={(event) => updatePlan(step.id, { location: event.target.value })}><option value="">Pilih area</option>{workAreas.map((area) => <option value={area} key={area}>{area}</option>)}</select></label>
          </article>)}
        </div>
      </section>
      {error ? <div className="callout callout--danger"><Icon name="warning" /><span>{error}</span></div> : null}
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Simpan sebagai draft</button><button type="submit" className="button button--primary" disabled={isSubmitting}><Icon name="play" /> {isSubmitting ? 'Deploying...' : 'Deploy WO'}</button></footer>
    </form>
  </Modal>
}

function AssignProcessModal({ workOrder, step, staffDirectory: directory, team, onClose, onSave }: { workOrder: WorkOrder; step: ProcessStep; staffDirectory: StaffDirectoryMember[]; team: TeamMember[]; onClose: () => void; onSave: (data: { assignedUserId: string; reportToUserId: string; location: string }) => void }) {
  const [assignedUserId, setAssignedUserId] = useState(step.assignedUserId || '')
  const [reportToUserId, setReportToUserId] = useState(step.reportToUserId || getDefaultReportToUserId(directory, team))
  const [location, setLocation] = useState(step.location || defaultLocationForStation(step.station))
  return <Modal title="Atur PIC & jalur laporan" subtitle="Gunakan daftar Team PGE agar penugasan konsisten. Perubahan ini hanya boleh sebelum proses mempunyai hasil atau timer." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave({ assignedUserId, reportToUserId, location }) }}>
      <div className="callout"><Icon name="station" /><span><b>{workOrder.code}</b> · {step.name} · {stationLabels[step.station]}</span></div>
      <label><span className="field-label-with-help">PIC pelaksana<span className="field-help" tabIndex={0} aria-label="Bantuan PIC">?<span className="field-help__tooltip">Tiket proses hanya tampil pada akun PIC yang dipilih. Personel harus diaktifkan untuk stasiun ini di People & Station.</span></span></span><select required value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}><option value="">Pilih PIC sesuai stasiun</option>{getEligibleAssignees(step.station, directory, team).map((member) => <option key={member.id} value={member.id}>{member.name}{member.employeeNumber ? ` · ${member.employeeNumber}` : ''}</option>)}</select></label>
      <label><span>Lapor ke</span><select required value={reportToUserId} onChange={(event) => setReportToUserId(event.target.value)}><option value="">Pilih penerima laporan</option>{getEscalationReceivers(directory, team).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label><span>Area kerja / laporan hasil</span><select required value={location} onChange={(event) => setLocation(event.target.value)}><option value="">Pilih area</option>{workAreas.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className="button button--primary">Simpan penugasan</button></footer>
    </form>
  </Modal>
}


function StartProcessModal({ workOrder, step, currentUser, staffDirectory, onClose, onConfirm }: {
  workOrder: WorkOrder
  step: ProcessStep
  currentUser: TeamMember
  staffDirectory: StaffDirectoryMember[]
  onClose: () => void
  onConfirm: () => void
}) {
  const performer = staffDirectory.find((member) => member.id === step.assignedUserId)
  const performerName = performer?.name || 'PIC belum ditetapkan'
  const isAssisted = performer?.accessMode === 'admin_assisted'

  return <Modal title={isAssisted ? 'Mulai proses atas nama PIC' : 'Mulai proses'} subtitle="Timer proses akan mulai berjalan setelah dikonfirmasi." onClose={onClose}>
    <div className="form-stack start-process-modal">
      <div className="callout"><Icon name="station" /><span><b>{workOrder.code}</b> · {step.name} · {stationLabels[step.station]}</span></div>
      <div className="start-process-summary">
        <div><span>PIC aktual</span><b>{performerName}</b></div>
        <div><span>Dicatat oleh</span><b>{currentUser.name}</b></div>
        <div><span>Area kerja</span><b>{step.location || 'Belum ditetapkan'}</b></div>
      </div>
      {isAssisted ? <div className="callout callout--warning"><Icon name="user" /><span><b>Mode update dibantu Admin/PPIC.</b> Pelaksana kerja tetap {performerName}; akun yang login hanya mencatat progress dan timer.</span></div> : null}
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="button" className="button button--primary" onClick={onConfirm}><Icon name="play" /> Mulai proses</button></footer>
    </div>
  </Modal>
}


function FinishedWorkOrderModal({ workOrder, onConfirm }: { workOrder: WorkOrder; onConfirm: () => void }) {
  const finalLabel = workOrder.type === 'mts' ? 'Masuk Gudang / Stok tersedia' : 'Packing selesai / Siap kirim'
  return <Modal title="Work Order selesai" subtitle="Semua proses utama sudah tercatat selesai. Sistem mengembalikan Anda ke dashboard agar monitoring berikutnya lebih mudah." onClose={onConfirm}>
    <div className="wo-finished-modal">
      <div className="wo-finished-modal__icon"><Icon name="check" /></div>
      <div>
        <p className="eyebrow">{workOrder.code}</p>
        <h3>{workOrder.product}</h3>
        <p>{finalLabel}</p>
      </div>
    </div>
    <div className="wo-finished-summary">
      <div><span>Target WO</span><b>{formatNumber(workOrder.qty)} unit</b></div>
      <div><span>Due date</span><b>{formatDate(workOrder.dueDate)}</b></div>
      <div><span>Status</span><b>Selesai</b></div>
    </div>
    <footer className="modal-card__footer">
      <button type="button" className="button button--primary" onClick={onConfirm}>Kembali ke dashboard</button>
    </footer>
  </Modal>
}


function ResolveReworkModal({ workOrder, onClose, onSave }: { workOrder: WorkOrder; onClose: () => void; onSave: (data: { good: number; gradeB: number; holdSortir: number; scrap: number; location: string; note: string }) => void }) {
  const summary = getShortfallSummary(workOrder)
  const pending = summary.pendingReworkQty
  const isStock = workOrder.type === 'mts'
  const finalStep = getFinalProcessStep(workOrder)
  const [data, setData] = useState({ good: 0, gradeB: 0, holdSortir: 0, scrap: 0, location: finalStep?.location || defaultLocationForStation(finalStep?.station || 'warehouse'), note: '' })
  const total = data.good + data.gradeB + data.holdSortir + data.scrap
  const invalid = total <= 0 || total > pending
  const updateQty = (field: 'good' | 'gradeB' | 'holdSortir' | 'scrap', value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '')
    setData((current) => ({ ...current, [field]: cleaned ? Number(cleaned) : 0 }))
  }

  return <Modal title="Selesaikan pending rework" subtitle="Rework bukan hasil final. Qty ini harus dikembalikan menjadi stok baik/siap kirim atau diklasifikasikan sebelum WO dapat selesai." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (!invalid) onSave(data) }}>
      <div className="result-summary"><div><span>WO</span><b>{workOrder.code}</b></div><div><span>Pending rework</span><b className="text-danger">{formatNumber(pending)}</b></div><div><span>Draft resolusi</span><b className={total > pending ? 'text-danger' : ''}>{formatNumber(total)}</b></div></div>
      <div className="callout callout--warning"><Icon name="warning" /><span><b>Jangan mulai proses lama lagi.</b> Pilih hasil akhir dari unit rework. {isStock ? 'Untuk Produksi Stok, Grade B / Hold Sortir / Scrap dianggap klasifikasi gudang.' : 'Untuk Pesanan Customer, gunakan stok baik hanya jika rework sudah lolos QC dan siap kirim.'}</span></div>
      <div className="form-grid">
        <label><span>{isStock ? 'Stok baik masuk gudang' : 'Siap kirim setelah rework'}</span><input min="0" type="number" value={data.good} onChange={(event) => updateQty('good', event.target.value)} /></label>
        <label><span>Grade B</span><input min="0" type="number" value={data.gradeB} onChange={(event) => updateQty('gradeB', event.target.value)} /></label>
        <label><span>Hold Sortir</span><input min="0" type="number" value={data.holdSortir} onChange={(event) => updateQty('holdSortir', event.target.value)} /></label>
        <label><span>Scrap / reject gudang</span><input min="0" type="number" value={data.scrap} onChange={(event) => updateQty('scrap', event.target.value)} /></label>
        <label><span>Lokasi hasil</span><input value={data.location} onChange={(event) => setData({ ...data, location: event.target.value })} placeholder="Rak gudang / area hasil rework" /></label>
      </div>
      {total > pending ? <div className="callout callout--danger"><Icon name="warning" /><span>Resolusi melebihi pending rework: maksimal {formatNumber(pending)} unit.</span></div> : null}
      <label><span>Catatan resolusi</span><textarea value={data.note} onChange={(event) => setData({ ...data, note: event.target.value })} placeholder="Opsional: jelaskan apakah rework diperbaiki, turun Grade B, hold sortir, atau scrap." /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" disabled={invalid} className="button button--primary">Simpan resolusi rework</button></footer>
    </form>
  </Modal>
}

function LogResultModal({ workOrder, step, performerName, recordedByName, onClose, onSave }: { workOrder: WorkOrder; step: ProcessStep; performerName: string; recordedByName: string; onClose: () => void; onSave: (data: { good: number; rework: number; reject: number; extra: number; gradeB: number; holdSortir: number; scrap: number; action: 'continue' | 'pause' | 'finish'; location: string; note: string }) => void }) {
  const inputCap = getAvailableInputCap(workOrder, step)
  const normalRemaining = Math.max(0, step.plannedQty - getStepResolvedQty(step))
  const isPackingStep = isFinalPackingStep(workOrder, step)
  const isStockInStep = isFinalStockInStep(workOrder, step)
  const [data, setData] = useState({ good: 0, rework: 0, reject: 0, gradeB: 0, holdSortir: 0, scrap: 0, location: step.location || '', note: '' })
  const [selectedNotes, setSelectedNotes] = useState<string[]>([])
  const total = data.good + data.rework + data.reject + data.gradeB + data.holdSortir + data.scrap
  const resolvedTotal = data.good + data.reject + data.gradeB + data.holdSortir + data.scrap
  const projectedResolved = getStepResolvedQty(step) + resolvedTotal
  const projectedGood = step.qtyGood + data.good
  const extra = Math.max(0, projectedGood - step.plannedQty) - getStepExtraQty(step)
  const hasInputLimit = Number.isFinite(inputCap)
  const inputLimitExceeded = hasInputLimit && total > inputCap
  const isPartial = projectedResolved < step.plannedQty || data.rework > 0
  const resultTitle = isStockInStep ? 'Catat QC Akhir & Masuk Gudang' : isPackingStep ? 'Catat Packing / Siap Kirim' : 'Catat hasil proses'
  const resultSubtitle = isStockInStep
    ? 'Produksi Stok selesai ketika stok baik, Grade B, Hold Sortir, atau Scrap sudah diklasifikasikan. Rework tetap pending sampai diselesaikan.'
    : isPackingStep
      ? 'Catat unit yang benar-benar siap kirim. Extra di atas target harus dipisahkan sebagai stok tambahan.'
      : 'Target WO tidak membatasi realita produksi. Jika layout menghasilkan lebih banyak, extra produksi tetap dicatat.'
  const goodLabel = isStockInStep ? 'Stok baik masuk gudang' : isPackingStep ? 'Qty siap kirim / terpacking' : 'Hasil baik'
  const reworkLabel = isStockInStep ? 'Pending rework' : isPackingStep ? 'Perlu repacking' : 'Perlu rework'
  const rejectLabel = isStockInStep ? 'Reject proses' : isPackingStep ? 'Masalah packing / rusak' : 'Reject'
  const locationLabel = isStockInStep ? 'Lokasi gudang hasil' : isPackingStep ? 'Lokasi siap kirim' : 'Lokasi hasil proses'
  const noteLabel = isStockInStep ? 'Catatan QC & gudang' : isPackingStep ? 'Catatan packing' : 'Catatan hasil'
  const notePlaceholder = isStockInStep
    ? 'Opsional: tambah detail rak, kendala, atau instruksi follow-up.'
    : isPackingStep
      ? 'Opsional: tambah detail label, kemasan, pickup, atau kendala packing.'
      : 'Opsional: tambah detail rak proses, kendala, atau instruksi berikutnya.'
  const quickNoteOptions = isStockInStep
    ? ['QC lolos & masuk gudang', 'Masuk gudang sebagian', 'Grade B dicatat', 'Hold sortir', 'Scrap / reject gudang', 'Pending rework', 'Lainnya']
    : isPackingStep
      ? ['Packing selesai', 'Packing sebagian', 'Extra masuk gudang', 'Kurang kemasan', 'Label / resi belum siap', 'Perlu repacking', 'Lainnya']
      : ['Selesai sesuai target', 'Selesai sebagian', 'Extra karena layout', 'Ada kendala bahan', 'Ada kendala alat', 'Perlu rework', 'Lainnya']
  const toggleQuickNote = (option: string) => {
    setSelectedNotes((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option])
  }
  const buildSavedNote = () => [...selectedNotes, data.note.trim()].filter(Boolean).join(' · ')
  const completionStatus = total <= 0
    ? 'Belum ada hasil dicatat'
    : inputLimitExceeded
      ? 'Melebihi input tersedia'
      : projectedResolved >= step.plannedQty && data.rework === 0
        ? (isStockInStep ? 'Target stok terpenuhi' : isPackingStep ? 'Target siap kirim terpenuhi' : 'Target proses terpenuhi')
        : 'Progress sebagian / perlu tindak lanjut'
  const updateQty = (field: 'good' | 'rework' | 'reject' | 'gradeB' | 'holdSortir' | 'scrap', value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '')
    setData((current) => ({ ...current, [field]: cleaned ? Number(cleaned) : 0 }))
  }
  const submitWithAction = (action: 'continue' | 'pause' | 'finish') => {
    onSave({ ...data, extra, action, note: buildSavedNote() })
  }

  return <Modal title={resultTitle} subtitle={resultSubtitle} onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => event.preventDefault()}>
      <div className="result-summary"><div><span>Target normal tersisa</span><b>{formatNumber(normalRemaining)}</b></div><div><span>Draft sekarang</span><b className={inputLimitExceeded ? 'text-danger' : ''}>{formatNumber(total)}</b></div><div><span>Extra produksi</span><b className={extra > 0 ? 'text-warning' : ''}>{extra > 0 ? `+${formatNumber(extra)}` : '0'}</b></div><div><span>Status</span><b>{completionStatus}</b></div></div>
      <div className="assisted-progress-box"><Icon name="user" /><span><b>Pelaksana aktual:</b> {performerName}. <b>Dicatat oleh:</b> {recordedByName}.</span></div>
      {inputLimitExceeded ? <div className="callout callout--danger"><Icon name="warning" /><span>Total hasil melebihi input proses tersedia: {formatNumber(inputCap)} unit. Tambahkan input dari proses sebelumnya dulu.</span></div> : null}
      {extra > 0 ? <div className="callout callout--warning"><Icon name="warning" /><span><b>Extra produksi +{formatNumber(extra)} unit.</b> Target WO tetap {formatNumber(step.plannedQty)} unit; kelebihan dicatat sebagai extra produksi untuk evaluasi stok/laporan.</span></div> : null}
      {(isPackingStep || isStockInStep) ? <div className="callout callout--warning"><Icon name="warning" /><span><b>{isStockInStep ? 'Final Produksi Stok = QC Akhir & Masuk Gudang.' : 'Final Pesanan Customer = Packing / Siap Kirim.'}</b> {isStockInStep ? 'Grade B / Hold Sortir / Scrap adalah klasifikasi gudang dan bukan approval short shipment.' : 'Unit extra di atas target customer harus dipisahkan sebagai stok tambahan.'}</span></div> : null}
      <div className="form-grid">
        <label><span>{goodLabel}</span><input min="0" type="number" value={data.good} onChange={(event) => updateQty('good', event.target.value)} /></label>
        {isStockInStep ? <><label><span>Grade B</span><input min="0" type="number" value={data.gradeB} onChange={(event) => updateQty('gradeB', event.target.value)} /></label><label><span>Hold Sortir</span><input min="0" type="number" value={data.holdSortir} onChange={(event) => updateQty('holdSortir', event.target.value)} /></label><label><span>Scrap</span><input min="0" type="number" value={data.scrap} onChange={(event) => updateQty('scrap', event.target.value)} /></label></> : null}
        <label><span>{reworkLabel}</span><input min="0" type="number" value={data.rework} onChange={(event) => updateQty('rework', event.target.value)} /></label>
        <label><span>{rejectLabel}</span><input min="0" type="number" value={data.reject} onChange={(event) => updateQty('reject', event.target.value)} /></label>
        <label><span>{locationLabel}</span><input value={data.location} onChange={(event) => setData({ ...data, location: event.target.value })} placeholder={isStockInStep ? 'Rak stok / gudang finish good' : isPackingStep ? 'Area siap kirim / staging marketplace' : 'Rak barang proses / area berikutnya'} /></label>
      </div>
      <div className="result-note-picker"><div className="result-note-picker__head"><span>{noteLabel}</span><small>Pilih catatan cepat. Catatan tambahan boleh dikosongkan.</small></div><div className="result-note-options">{quickNoteOptions.map((option) => <button type="button" key={option} className={selectedNotes.includes(option) ? 'is-selected' : ''} onClick={() => toggleQuickNote(option)}>{option}</button>)}</div><textarea value={data.note} onChange={(event) => setData({ ...data, note: event.target.value })} placeholder={notePlaceholder} /></div>
      <footer className="modal-card__footer result-action-footer">
        <button type="button" className="button button--secondary" onClick={onClose}>Batal</button>
        {isPartial ? <button type="button" className="button button--secondary" disabled={total <= 0 || inputLimitExceeded} onClick={() => submitWithAction('continue')}>Simpan & lanjutkan timer</button> : null}
        {isPartial ? <button type="button" className="button button--warning" disabled={total <= 0 || inputLimitExceeded} onClick={() => submitWithAction('pause')}>Simpan & jeda</button> : null}
        <button type="button" className="button button--primary" disabled={total <= 0 || inputLimitExceeded} onClick={() => submitWithAction('finish')}>{isStockInStep ? 'Simpan stok masuk' : isPackingStep ? 'Simpan packing' : 'Simpan hasil'}</button>
      </footer>
    </form>
  </Modal>
}

function HoldModal({ step, onClose, onSave }: { step: ProcessStep; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return <Modal title="Tahan proses / HOLD" subtitle="HOLD wajib menjelaskan fakta masalah dan pemilik keputusan. Tidak boleh dipakai untuk menyembunyikan pekerjaan terlambat." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave(reason) }}>
      <div className="callout callout--warning"><Icon name="warning" /><span><b>{step.name}</b> akan berhenti sampai ada keputusan tercatat.</span></div>
      <label><span>Alasan HOLD</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: resleting ukuran 20 cm belum datang; keputusan pembelian oleh Kepala Produksi." /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className="button button--danger">Masukkan HOLD</button></footer>
    </form>
  </Modal>
}

function QcModal({ workOrder, step, currentUser, onClose, onSave }: { workOrder: WorkOrder; step: ProcessStep; currentUser: TeamMember; onClose: () => void; onSave: (data: { decision: 'pass' | 'rework'; qty: number; reject: number; note: string; defectCategory: DefectCategory; evidence?: QualityEvidence[] }) => void }) {
  const cap = Math.min(step.plannedQty - getStepRecordedQty(step), getAvailableInputCap(workOrder, step))
  const [decision, setDecision] = useState<'pass' | 'rework'>('pass')
  const [qty, setQty] = useState(cap)
  const [reject, setReject] = useState(0)
  const [note, setNote] = useState('')
  const [defectCategory, setDefectCategory] = useState<DefectCategory>('other')
  const [evidence, setEvidence] = useState<QualityEvidence[]>([])
  const [evidenceError, setEvidenceError] = useState('')
  const needsDefect = decision === 'rework' || reject > 0

  const addEvidence = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setEvidenceError('')
    try {
      const item = await readQualityEvidenceFile(file)
      setEvidence((current) => [...current, item].slice(0, 3))
    } catch (error) {
      setEvidenceError(error instanceof Error ? error.message : 'Bukti foto tidak dapat ditambahkan.')
    }
  }

  return <Modal title="Keputusan QC" subtitle="Produk yang lulus masuk antrean packing. Produk rework kembali ke proses sebelumnya. Foto bukti defect opsional, tetapi sangat disarankan untuk kasus berulang atau reject final." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave({ decision, qty, reject: decision === 'pass' ? reject : 0, note, defectCategory, evidence }) }}>
      <div className="segmented-control"><button type="button" className={decision === 'pass' ? 'is-active' : ''} onClick={() => setDecision('pass')}>Lulus QC</button><button type="button" className={decision === 'rework' ? 'is-active' : ''} onClick={() => setDecision('rework')}>Kembali ke rework</button></div>
      <div className="result-summary"><div><span>Input siap diperiksa</span><b>{formatNumber(cap)}</b></div><div><span>Qty keputusan</span><b>{formatNumber(qty)}</b></div><div><span>Reject final</span><b>{decision === 'pass' ? formatNumber(reject) : '—'}</b></div></div>
      <div className="form-grid"><label><span>{decision === 'pass' ? 'Qty lulus QC' : 'Qty dikembalikan'}</span><input min="1" max={cap} type="number" value={qty} onChange={(event) => setQty(Number(event.target.value))} /></label>{decision === 'pass' ? <label><span>Reject final</span><input min="0" max={cap - qty} type="number" value={reject} onChange={(event) => setReject(Number(event.target.value))} /></label> : <label><span>Tujuan rework</span><input disabled value="Kembali ke stasiun proses sebelumnya" /></label>}</div>
      {needsDefect ? <div className="quality-capture-panel">
        <div className="quality-capture-panel__head"><b>Detail defect</b><span>Wajib pilih kategori bila ada rework atau reject</span></div>
        <div className="form-grid"><label><span>Kategori defect</span><select value={defectCategory} onChange={(event) => setDefectCategory(event.target.value as DefectCategory)}>{Object.entries(defectCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>QC officer</span><input disabled value={currentUser.name} /></label></div>
        <label><span>Foto bukti · opsional</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void addEvidence(event.target.files); event.currentTarget.value = '' }} /><small>Tambahkan bila perlu untuk memperjelas defect. Tidak menghalangi proses QC bila tidak ada foto.</small></label>
        {evidence.length ? <div className="quality-evidence-preview">{evidence.map((item) => <figure key={item.id}><img src={item.dataUrl} alt={item.name} /><figcaption>{item.name}<button type="button" onClick={() => setEvidence((current) => current.filter((row) => row.id !== item.id))}>×</button></figcaption></figure>)}</div> : null}
        {evidenceError ? <p className="artwork-upload__error">{evidenceError}</p> : null}
      </div> : null}
      <label><span>Catatan QC</span><textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder={decision === 'pass' ? 'Contoh: jahitan, resleting, dan cetak sesuai sample.' : 'Contoh: 4 unit resleting tidak lurus, kembalikan ke jahit.'} /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" disabled={qty <= 0 || qty > cap || (decision === 'pass' && qty + reject > cap)} className={`button ${decision === 'pass' ? 'button--primary' : 'button--warning'}`}>{decision === 'pass' ? 'Simpan lulus QC' : 'Buat rework'}</button></footer>
    </form>
  </Modal>
}

function ShortfallActionModal({
  workOrder,
  shortfall,
  onClose,
  onSave,
}: {
  workOrder: WorkOrder
  shortfall: WorkOrderShortfall
  onClose: () => void
  onSave: (data: { action: 'replacement' | 'short_shipment' | 'cancel_remaining'; restartFromStepId: string; note: string }) => void
}) {
  const sourceIndex = workOrder.steps.findIndex((step) => step.id === shortfall.sourceStepId)
  const sourceStep = workOrder.steps[sourceIndex]
  const options = workOrder.steps
    .slice(0, sourceIndex + 1)
    .filter((step) => !step.isReplacement)
    .filter((step) => shortfall.origin === 'qc_final_reject' ? !['qc', 'packing'].includes(step.station) : true)
  const defaultStart = shortfall.origin === 'qc_final_reject'
    ? options.at(-1)?.id || sourceStep?.id || ''
    : sourceStep?.id || options.at(-1)?.id || ''
  const [action, setAction] = useState<'replacement' | 'short_shipment' | 'cancel_remaining'>('replacement')
  const [restartFromStepId, setRestartFromStepId] = useState(defaultStart)
  const [note, setNote] = useState('')

  const actionCopy = action === 'replacement'
    ? 'Sistem membuat tiket berwarna amber untuk menjalankan ulang proses dari titik yang Anda pilih sampai titik reject. Hasil pengganti masuk kembali ke alur WO yang sama.'
    : action === 'short_shipment'
      ? 'Gunakan hanya bila customer setuju menerima jumlah kurang. Keputusan ini akan tetap tercatat di audit WO.'
      : 'Gunakan hanya bila sisa tidak akan diproduksi lagi, misalnya order internal dibatalkan sebagian atau customer membatalkan sisa pesanan.'

  return <Modal title="Tindakan kekurangan & penggantian" subtitle="Reject tidak boleh menghilang dari WO. Admin atau PPIC harus memilih tindakan agar target dan audit tetap jelas." onClose={onClose} wide>
    <form className="form-stack shortfall-action-modal" onSubmit={(event) => { event.preventDefault(); onSave({ action, restartFromStepId, note }) }}>
      <div className="shortfall-action-modal__summary">
        <div><span>Kekurangan</span><b>{formatNumber(shortfall.qty)} unit</b></div>
        <div><span>Sumber</span><b>{shortfall.sourceStepName}</b></div>
        <div><span>Jenis</span><b>{shortfall.origin === 'qc_final_reject' ? 'Reject final QC' : 'Reject proses'}</b></div>
      </div>
      {shortfall.note ? <div className="callout callout--danger"><Icon name="warning" /><span><b>Catatan sumber:</b> {shortfall.note}</span></div> : null}
      <div className="segmented-control shortfall-action-modal__choices">
        <button type="button" className={action === 'replacement' ? 'is-active' : ''} onClick={() => setAction('replacement')}>Buat penggantian</button>
        <button type="button" className={action === 'short_shipment' ? 'is-active' : ''} onClick={() => setAction('short_shipment')}>Setujui kirim kurang</button>
        <button type="button" className={action === 'cancel_remaining' ? 'is-active' : ''} onClick={() => setAction('cancel_remaining')}>Batalkan sisa</button>
      </div>
      <div className={`shortfall-action-modal__notice shortfall-action-modal__notice--${action}`}><Icon name="warning" /><span>{actionCopy}</span></div>
      {action === 'replacement' ? <label><span>Mulai penggantian dari proses</span><select required value={restartFromStepId} onChange={(event) => setRestartFromStepId(event.target.value)}>{options.map((step) => <option key={step.id} value={step.id}>P{String(step.sequence).padStart(2, '0')} · {step.name} · {stationLabels[step.station]}</option>)}</select><small>Jika bahan/input proses sebelumnya sudah habis, pilih proses yang lebih awal. Sistem akan menggandakan langkah dari titik ini sampai titik reject.</small></label> : null}
      <label><span>Catatan keputusan</span><textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder={action === 'replacement' ? 'Contoh: ulang dari Printing karena tidak ada panel cadangan untuk Cutting.' : action === 'short_shipment' ? 'Contoh: customer menyetujui pengiriman 95 dari 100 unit melalui chat tanggal 07 Juli.' : 'Contoh: 5 unit sisa dibatalkan karena campaign berakhir.'} /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className={`button ${action === 'replacement' ? 'button--warning' : action === 'short_shipment' ? 'button--primary' : 'button--danger'}`}>{action === 'replacement' ? 'Buat rute penggantian' : action === 'short_shipment' ? 'Setujui kirim kurang' : 'Batalkan sisa'}</button></footer>
    </form>
  </Modal>
}

function ReviewShortfallModal({ workOrder, shortfall, onClose, onSave }: { workOrder: WorkOrder; shortfall: WorkOrderShortfall; onClose: () => void; onSave: (data: { approved: boolean; note: string }) => void }) {
  const [approved, setApproved] = useState(true)
  const [note, setNote] = useState(shortfall.resolutionNote || '')
  const actionLabel = shortfall.requestedAction === 'cancel_remaining' ? 'batalkan sisa' : 'kirim kurang'
  return <Modal title="Tinjau permohonan kekurangan MTO" subtitle="Untuk pesanan customer, kirim kurang atau pembatalan sisa memerlukan persetujuan Manager / Owner. Foto bukti QC tetap opsional; keputusan harus memakai catatan tertulis." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSave({ approved, note }) }}>
      <div className="shortfall-action-modal__summary"><div><span>WO</span><b>{workOrder.code}</b></div><div><span>Jumlah</span><b>{formatNumber(shortfall.qty)} unit</b></div><div><span>Permohonan</span><b>{actionLabel}</b></div></div>
      <div className="callout callout--warning"><Icon name="warning" /><span><b>Diminta oleh {shortfall.requestedBy || 'Admin / PPIC'}.</b> {shortfall.resolutionNote || shortfall.note || 'Tidak ada catatan tambahan.'}</span></div>
      <div className="segmented-control"><button type="button" className={approved ? 'is-active' : ''} onClick={() => setApproved(true)}>Setujui</button><button type="button" className={!approved ? 'is-active' : ''} onClick={() => setApproved(false)}>Tolak & kembalikan ke Admin/PPIC</button></div>
      <label><span>Catatan keputusan</span><textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder={approved ? 'Contoh: customer menyetujui pengiriman kurang melalui WA tanggal 07 Juli.' : 'Contoh: lanjutkan dengan produksi penggantian karena target customer tetap harus dipenuhi.'} /></label>
      <footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose}>Batal</button><button type="submit" className={`button ${approved ? 'button--primary' : 'button--danger'}`}>{approved ? 'Simpan persetujuan' : 'Tolak permohonan'}</button></footer>
    </form>
  </Modal>
}

type ReportTab = 'daily' | 'finished' | 'overdue' | 'defects' | 'wip-aging' | 'operator' | 'machine' | 'customer'

function ReportsView({ workOrders, directory, team, clock, onOpenOrder }: { workOrders: WorkOrder[]; directory: StaffDirectoryMember[]; team: TeamMember[]; clock: number; onOpenOrder: (order: WorkOrder) => void }) {
  const [tab, setTab] = useState<ReportTab>('daily')
  const [typeFilter, setTypeFilter] = useState<'all' | WorkOrderType>('all')
  const [stationFilter, setStationFilter] = useState<'all' | Station>('all')
  const [search, setSearch] = useState('')
  const directoryRows = getCombinedDirectory(directory, team)
  const nameOf = (id?: string) => getDirectoryName(id, directoryRows, 'Belum ditugaskan')
  const needle = search.trim().toLowerCase()
  const filtered = workOrders.filter((order) => (typeFilter === 'all' || order.type === typeFilter) && (!needle || `${order.code} ${order.product} ${order.source}`.toLowerCase().includes(needle)))
  const stepMatches = (step: ProcessStep) => stationFilter === 'all' || step.station === stationFilter
  const todayText = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())
  const dailyRows = filtered.flatMap((order) => order.steps.filter(stepMatches).filter((step) => step.qtyGood || step.qtyReject || step.qtyRework || deriveStepStatus(order, step) === 'in_progress').map((step) => ({ order, step })))
  const overdueRows = filtered.filter(isOverdue)
  const defectRows = filtered.flatMap((order) => order.steps.filter(stepMatches).filter((step) => step.qtyReject > 0 || step.qtyRework > 0 || step.defectCategory).map((step) => ({ order, step })))
  const wipRows = filtered.flatMap((order) => Array.from(new Set(order.steps.flatMap((step) => step.inputs))).map((input) => ({ order, input, available: getWipBalance(order, input) })).filter((row) => row.available > 0)).filter((row) => stationFilter === 'all' || row.order.steps.some((step) => step.station === stationFilter && step.inputs.includes(row.input)))
  type OperatorWorkload = { id: string; assigned: number; active: number; queued: number; overdue: number; seconds: number }
  const operatorMap = new Map<string, OperatorWorkload>()
  // Recompute workload without assuming a static employee master.
  filtered.forEach((order) => order.steps.filter(stepMatches).forEach((step) => {
    if (!step.assignedUserId) return
    const row = operatorMap.get(step.assignedUserId) || { id: step.assignedUserId, assigned: 0, active: 0, queued: 0, overdue: 0, seconds: 0 }
    row.assigned += 1
    if (deriveStepStatus(order, step) === 'in_progress') row.active += 1
    if (deriveStepStatus(order, step) === 'ready') row.queued += 1
    if (isOverdue(order) && !['completed'].includes(deriveStepStatus(order, step))) row.overdue += 1
    row.seconds += getOrderActiveSeconds({ ...order, steps: [step] }, clock)
    operatorMap.set(step.assignedUserId, row)
  }))
  const operatorRows = Array.from(operatorMap.values())
  const machineRows = Array.from(new Map(filtered.map((order) => [order.machine || 'Belum ditetapkan', { machine: order.machine || 'Belum ditetapkan', orders: 0, active: 0, overdue: 0, seconds: 0 }])).values())
  filtered.forEach((order) => {
    const row = machineRows.find((item) => item.machine === (order.machine || 'Belum ditetapkan'))
    if (!row) return
    row.orders += 1
    if (order.steps.some((step) => deriveStepStatus(order, step) === 'in_progress')) row.active += 1
    if (isOverdue(order)) row.overdue += 1
    row.seconds += getOrderActiveSeconds(order, clock)
  })

  const finishedRows = filtered
    .filter((order) => ['done', 'closed'].includes(deriveOrderStatus(order)) || Boolean(order.isArchived))
    .map((order) => {
      const finalStep = getFinalProcessStep(order)
      const finalGood = getPackingGood(order) || finalStep?.qtyGood || 0
      const rejectTotal = order.steps.reduce((sum, step) => sum + step.qtyReject, 0)
      const reworkTotal = order.steps.reduce((sum, step) => sum + step.qtyRework, 0)
      const startedTimes = order.steps.map((step) => step.startedAt).filter(Boolean).map((value) => new Date(value as string).getTime())
      const completedSteps = order.steps.filter((step) => deriveStepStatus(order, step) === 'completed')
      const latestCompleted = order.steps.map((step) => step.completedAt).filter(Boolean).map((value) => new Date(value as string).getTime()).sort((a, b) => b - a)[0]
      const createdMs = new Date(order.createdAt).getTime()
      const finishedMs = order.closedAt ? new Date(order.closedAt).getTime() : latestCompleted
      const leadTimeDays = finishedMs ? Math.max(0, Math.ceil((finishedMs - createdMs) / 86400000)) : 0
      const lateDays = finishedMs ? Math.max(0, Math.ceil((finishedMs - new Date(`${order.dueDate}T23:59:59`).getTime()) / 86400000)) : 0
      const productionSeconds = order.steps.reduce((sum, step) => sum + getStepTimerSeconds(step, clock), 0)
      return { order, finalStep, finalGood, rejectTotal, reworkTotal, completedSteps, leadTimeDays, lateDays, productionSeconds, startedAt: startedTimes.length ? new Date(Math.min(...startedTimes)).toISOString() : undefined }
    })

  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: 'daily', label: 'Produksi Harian' },
    { id: 'finished', label: 'WO Selesai' },
    { id: 'overdue', label: 'WO Terlambat' },
    { id: 'defects', label: 'Reject & Defect' },
    { id: 'wip-aging', label: 'Aging Barang Proses' },
    { id: 'operator', label: 'Beban Operator' },
    { id: 'machine', label: 'Beban Mesin' },
    { id: 'customer', label: 'Penyelesaian Customer' },
  ]

  return <section className="view-content reports-view">
    <div className="report-grid report-grid--metrics">
      <article className="surface-card"><p className="eyebrow">WO aktif</p><h2>{formatNumber(filtered.filter((order) => !['done', 'closed', 'cancelled'].includes(deriveOrderStatus(order))).length)}</h2><span>Scope laporan saat ini</span></article>
      <article className="surface-card"><p className="eyebrow">Reject tercatat</p><h2>{formatNumber(defectRows.reduce((sum, row) => sum + row.step.qtyReject, 0))}</h2><span>Termasuk reject proses dan QC</span></article>
      <article className="surface-card"><p className="eyebrow">Menunggu persetujuan</p><h2>{formatNumber(filtered.reduce((sum, order) => sum + getShortfallSummary(order).awaitingApprovalQty, 0))}</h2><span>Kekurangan MTO perlu Manager / Owner</span></article>
      <article className="surface-card"><p className="eyebrow">Periode</p><h2>{todayText}</h2><span>Snapshot data frontend saat ini</span></article>
    </div>

    <article className="surface-card report-workspace">
      <header className="surface-card__header"><div><p className="eyebrow">Laporan operasional</p><h2>{tabs.find((item) => item.id === tab)?.label}</h2><span>Filter dan buka WO untuk menelusuri detail. Data hasil produksi masih berbasis sesi frontend sampai Supabase tersambung.</span></div><button type="button" className="button button--secondary button--compact" onClick={() => window.print()}>Cetak laporan</button></header>
      <div className="report-tabs">{tabs.map((item) => <button type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)} key={item.id}>{item.label}</button>)}</div>
      <div className="filter-row"><label className="search-field"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari WO, produk, atau customer" /></label><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}><option value="all">Semua tipe WO</option><option value="mto">MTO · Pesanan customer</option><option value="mts">MTS · Buat stok</option></select><select value={stationFilter} onChange={(event) => setStationFilter(event.target.value as typeof stationFilter)}><option value="all">Semua stasiun</option>{Object.entries(stationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>

      {tab === 'daily' ? <ReportTable headers={['WO / Produk', 'Stasiun / PIC', 'Output', 'Status', 'Catatan']} rows={dailyRows.map(({ order, step }) => [<button className="text-button" onClick={() => onOpenOrder(order)}>{order.code}<small>{order.product}</small></button>, <span><Badge kind="station" value={step.station} /><small>{nameOf(step.assignedUserId)}</small></span>, <span><b>{formatNumber(step.qtyGood)}</b> baik · {formatNumber(step.qtyRework)} rework · {formatNumber(step.qtyReject)} reject</span>, <Badge kind="process" value={deriveStepStatus(order, step)} />, <span>{step.defectCategory ? defectCategoryLabels[step.defectCategory] : step.holdReason || 'Aktivitas / output saat ini'}</span>])} empty="Belum ada output atau proses aktif pada filter ini." /> : null}
      {tab === 'finished' ? <div className="finished-report-list">{finishedRows.length ? finishedRows.map(({ order, finalStep, finalGood, rejectTotal, reworkTotal, completedSteps, leadTimeDays, lateDays, productionSeconds }) => <article className="finished-report-card" key={order.id}>
        <header><div><p className="eyebrow">{order.code} · {order.type === 'mts' ? 'Produksi Stok' : 'Pesanan Customer'}</p><h3>{order.product}</h3><span>{order.source}</span></div><Badge kind="status" value={deriveOrderStatus(order)} /></header>
        <div className="finished-report-card__metrics">
          <div><span>Target</span><b>{formatNumber(order.qty)}</b></div>
          <div><span>{order.type === 'mts' ? 'Stok tersedia' : 'Siap kirim'}</span><b>{formatNumber(finalGood)}</b></div>
          <div><span>Reject</span><b className={rejectTotal ? 'text-danger' : ''}>{formatNumber(rejectTotal)}</b></div>
          <div><span>Rework</span><b>{formatNumber(reworkTotal)}</b></div>
          <div><span>Lead time</span><b>{leadTimeDays} hari</b></div>
          <div><span>Ketepatan</span><b className={lateDays ? 'text-danger' : ''}>{lateDays ? `Telat ${lateDays} hari` : 'On time'}</b></div>
        </div>
        <div className="finished-report-card__processes">{order.steps.map((step) => <span key={step.id}><b>{step.name}</b><small>{nameOf(step.assignedUserId)} · {formatNumber(step.qtyGood)} baik · {formatNumber(step.qtyReject)} reject</small></span>)}</div>
        <footer><span>Due {formatDate(order.dueDate)} · Closed {order.closedAt ? formatDate(order.closedAt) : 'belum close'} · Durasi aktif {formatDuration(productionSeconds)} · Proses selesai {completedSteps.length}/{order.steps.length}</span><button className="button button--secondary button--compact" onClick={() => onOpenOrder(order)}>Buka evaluasi</button></footer>
        <div className="improvement-strip"><b>Catatan evaluasi</b><span>Isi root cause, action improvement, PIC follow-up, dan target selesai di iterasi laporan berikutnya.</span></div>
      </article>) : <div className="empty-state">Belum ada WO selesai pada filter ini.</div>}</div> : null}
      {tab === 'overdue' ? <ReportTable headers={['WO', 'Target selesai', 'Proses saat ini', 'PIC', 'Blocker']} rows={overdueRows.map((order) => { const step = getCurrentProcess(order); return [<button className="text-button" onClick={() => onOpenOrder(order)}>{order.code}<small>{order.product}</small></button>, <span><b>{formatDate(order.dueDate)}</b><small>{Math.max(1, Math.ceil((Date.now() - new Date(`${order.dueDate}T23:59:59`).getTime()) / 86400000))} hari terlambat</small></span>, step ? <span><Badge kind="station" value={step.station} /><small>{step.name}</small></span> : '—', step ? nameOf(step.assignedUserId) : '—', getBlockerSummary(order) || 'Tidak ada blocker aktif'] })} empty="Tidak ada WO terlambat pada filter ini." /> : null}
      {tab === 'defects' ? <ReportTable headers={['WO', 'Stasiun / PIC', 'Kategori defect', 'Rework / reject', 'Bukti foto']} rows={defectRows.map(({ order, step }) => [<button className="text-button" onClick={() => onOpenOrder(order)}>{order.code}<small>{order.product}</small></button>, <span><Badge kind="station" value={step.station} /><small>{nameOf(step.assignedUserId)}</small></span>, step.defectCategory ? defectCategoryLabels[step.defectCategory] : 'Belum dikategorikan', <span>{formatNumber(step.qtyRework)} rework · <b>{formatNumber(step.qtyReject)} reject</b></span>, step.defectEvidence?.length ? <span className="evidence-thumb-row">{step.defectEvidence.map((item) => <img key={item.id} src={item.dataUrl} alt={item.name} title={item.name} />)}</span> : <span className="muted-copy">Tidak ada foto · opsional</span>])} empty="Belum ada defect atau reject pada filter ini." /> : null}
      {tab === 'wip-aging' ? <ReportTable headers={['Barang proses', 'WO / Produk', 'Qty tersedia', 'Langkah berikutnya', 'Usia WO']} rows={wipRows.map((row) => { const next = row.order.steps.find((step) => step.inputs.includes(row.input) && deriveStepStatus(row.order, step) !== 'completed'); const age = Math.max(0, Math.floor((Date.now() - new Date(row.order.createdAt).getTime()) / 86400000)); return [row.input, <button className="text-button" onClick={() => onOpenOrder(row.order)}>{row.order.code}<small>{row.order.product}</small></button>, formatNumber(row.available), next ? <span><Badge kind="station" value={next.station} /><small>{next.name}</small></span> : 'Tidak ada', <span className={age >= 2 ? 'text-danger' : ''}>{age} hari</span>] })} empty="Tidak ada barang proses aktif pada filter ini." /> : null}
      {tab === 'operator' ? <ReportTable headers={['PIC', 'Proses ditugaskan', 'Aktif', 'Siap antre', 'Terlambat', 'Waktu aktif']} rows={operatorRows.sort((a, b) => b.active - a.active || b.assigned - a.assigned).map((row) => [nameOf(row.id), row.assigned, row.active, row.queued, <span className={row.overdue ? 'text-danger' : ''}>{row.overdue}</span>, formatDuration(row.seconds)])} empty="Belum ada penugasan PIC pada filter ini." /> : null}
      {tab === 'machine' ? <ReportTable headers={['Mesin / resource', 'WO terjadwal', 'WO aktif', 'WO terlambat', 'Waktu aktif']} rows={machineRows.sort((a, b) => b.active - a.active || b.orders - a.orders).map((row) => [row.machine, row.orders, row.active, <span className={row.overdue ? 'text-danger' : ''}>{row.overdue}</span>, formatDuration(row.seconds)])} empty="Belum ada WO pada filter ini." /> : null}
      {tab === 'customer' ? <ReportTable headers={['Customer / sumber', 'WO', 'Target', 'Terpacking', 'Status penyelesaian']} rows={filtered.filter((order) => order.type === 'mto').map((order) => { const summary = getShortfallSummary(order); return [order.source, <button className="text-button" onClick={() => onOpenOrder(order)}>{order.code}<small>{order.product}</small></button>, formatNumber(order.qty), formatNumber(summary.packedGood), <span><b>{formatNumber(getProgress(order))}%</b><small>{getBlockerSummary(order) || statusLabels[deriveOrderStatus(order)]}</small></span>] })} empty="Tidak ada WO customer pada filter ini." /> : null}
    </article>
  </section>
}

function ReportTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  return <div className="table-wrap report-table-wrap"><table className="wo-table report-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}><div className="empty-state">{empty}</div></td></tr>}</tbody></table></div>
}

function PeopleStationView({ directory, team, onChange }: { directory: StaffDirectoryMember[]; team: TeamMember[]; onChange: (next: StaffDirectoryMember[]) => void }) {
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const planners = getEscalationReceivers(directory, team)
  const rows = directory.filter((member) => member.kind === 'staff').filter((member) => `${member.name} ${member.employeeNumber || ''}`.toLowerCase().includes(search.toLowerCase()))
  const update = (id: string, patch: Partial<StaffDirectoryMember>) => {
    onChange(directory.map((member) => member.id === id ? { ...member, ...patch } : member))
    setNotice('Perubahan akses tersimpan di sesi frontend ini.')
  }
  return <section className="view-content people-station-view">
    <article className="surface-card people-station-intro"><header className="surface-card__header"><div><p className="eyebrow">Konfigurasi Admin</p><h2>People & Station Access</h2><span>Atur stasiun yang boleh dikerjakan setiap anggota. PIC dropdown di perencanaan WO hanya menampilkan anggota yang aktif dan eligible untuk stasiun tersebut.</span></div><Badge kind="plain" value={`${rows.length} anggota`} /></header><div className="callout"><Icon name="warning" /><span><b>Kontrol akses frontend:</b> ini membatasi pilihan PIC dan tampilan tugas demo. Saat Supabase dipasang, aturan yang sama harus dipindahkan ke tabel user_stations dan Row Level Security.</span></div>{notice ? <p className="success-note">{notice}</p> : null}</article>
    <article className="surface-card"><div className="filter-row"><label className="search-field"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau nomor karyawan" /></label></div><div className="people-grid">{rows.map((member) => <article className={`person-access-card${member.isActive === false ? ' person-access-card--inactive' : ''}`} key={member.id}><header><div><b>{member.name}</b><small>{member.employeeNumber || 'Tanpa nomor karyawan'}</small></div><label className="switch-field"><input type="checkbox" checked={member.isActive !== false} onChange={(event) => update(member.id, { isActive: event.target.checked })} /><span>Aktif</span></label></header><section><span className="people-label">Stasiun yang diperbolehkan</span><div className="station-check-grid">{Object.entries(stationLabels).map(([station, label]) => { const code = station as Station; const checked = member.allowedStations?.includes(code) || false; return <label key={station}><input type="checkbox" checked={checked} onChange={(event) => update(member.id, { allowedStations: event.target.checked ? [...new Set([...(member.allowedStations || []), code])] : (member.allowedStations || []).filter((item) => item !== code) })} />{label}</label> })}</div></section><section className="form-grid"><label><span>Default lapor ke</span><select value={member.defaultReportToUserId || ''} onChange={(event) => update(member.id, { defaultReportToUserId: event.target.value })}>{planners.map((planner) => <option key={planner.id} value={planner.id}>{planner.name}</option>)}</select></label><label><span>Default area</span><select value={member.defaultWorkArea || ''} onChange={(event) => update(member.id, { defaultWorkArea: event.target.value })}><option value="">Pilih saat perencanaan</option>{workAreas.map((area) => <option key={area} value={area}>{area}</option>)}</select></label></section><label className="switch-field switch-field--line"><input type="checkbox" checked={member.canReceiveEscalation || false} onChange={(event) => update(member.id, { canReceiveEscalation: event.target.checked })} /><span>Boleh menjadi penerima laporan / eskalasi</span></label></article>)}</div></article>
  </section>
}

function ConfirmModal({ title, description, confirmLabel, danger = false, onClose, onConfirm }: { title: string; description: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: () => void | Promise<void> }) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const confirm = async () => {
    setIsSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setIsSubmitting(false)
    }
  }

  return <Modal title={title} onClose={onClose}><div className="form-stack"><p className="confirm-copy">{description}</p><footer className="modal-card__footer"><button type="button" className="button button--secondary" onClick={onClose} disabled={isSubmitting}>Batal</button><button type="button" className={`button ${danger ? 'button--danger' : 'button--primary'}`} onClick={() => void confirm()} disabled={isSubmitting}>{isSubmitting ? 'Memproses…' : confirmLabel}</button></footer></div></Modal>
}

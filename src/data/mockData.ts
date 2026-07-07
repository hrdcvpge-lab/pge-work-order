import type { ProcessStep, RouteTemplate, TeamMember, WorkOrder } from '../types/workOrder'

const daysFromToday = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const teamMembers: TeamMember[] = [
  { id: 'u-admin', name: 'Rena · Admin Operasional', role: 'admin', stations: ['general'] },
  { id: 'u-ppic', name: 'Dimas · PPIC', role: 'ppic', stations: ['general'] },
  { id: 'u-print', name: 'Bagus · Printing', role: 'operator', stations: ['printing'] },
  { id: 'u-cut', name: 'Dini · Cutting', role: 'operator', stations: ['cutting'] },
  { id: 'u-sew', name: 'Rani · Jahit', role: 'operator', stations: ['sewing'] },
  { id: 'u-finish', name: 'Eka · Finishing', role: 'operator', stations: ['finishing', 'component'] },
  { id: 'u-qc', name: 'Maya · QC', role: 'qc', stations: ['qc'] },
  { id: 'u-pack', name: 'Fitri · Packing', role: 'packing', stations: ['packing'] },
  { id: 'u-manager', name: 'Arif · Manager', role: 'manager', stations: ['general'] },
]

export const routeTemplates: RouteTemplate[] = [
  {
    id: 'direct',
    title: 'Produk langsung',
    description: 'Buat produk → QC akhir → Packing. Untuk produk sederhana atau proses satu meja.',
  },
  {
    id: 'print-sew',
    title: 'Cetak lalu jahit',
    description: 'Cetak → Potong → Jahit/Rakit → QC akhir → Packing.',
  },
  {
    id: 'multi-part',
    title: 'Banyak komponen',
    description: 'Cetak/Potong berjalan bersama furing dan resleting; jahit menunggu semua komponen.',
  },
  {
    id: 'custom',
    title: 'Atur alur sendiri',
    description: 'Pilih proses yang dibutuhkan. QC akhir dan packing tetap ditambahkan otomatis.',
  },
]

const step = (
  id: string,
  sequence: number,
  name: string,
  station: ProcessStep['station'],
  plannedQty: number,
  inputs: string[],
  output: string,
  assignedUserId?: string,
  values: Partial<Pick<ProcessStep, 'status' | 'qtyGood' | 'qtyRework' | 'qtyReject' | 'activeSeconds' | 'startedAt' | 'location' | 'holdReason'>> = {},
): ProcessStep => ({
  id,
  sequence,
  name,
  station,
  assignedUserId,
  plannedQty,
  inputs,
  output,
  status: 'not_ready',
  qtyGood: 0,
  qtyRework: 0,
  qtyReject: 0,
  activeSeconds: 0,
  ...values,
})

export const initialWorkOrders: WorkOrder[] = [
  {
    id: 'wo-001',
    code: 'WO-2026-071',
    type: 'mto',
    source: 'Shopee #PGE-260707-101',
    product: 'Cover Passport Korea · maroon · 250 pcs',
    referenceNote: 'Artwork Korea final — folder Canva / Produk Juli / Korea V3.',
    qty: 250,
    dueDate: daysFromToday(1),
    priority: 'p1',
    machine: 'Mimaki Eco Solvent 01',
    scheduledDate: daysFromToday(0),
    status: 'in_progress',
    reworkCount: 0,
    createdAt: ago(28 * 60),
    createdBy: 'Rena · Admin Operasional',
    steps: [
      step('s-101', 1, 'Cetak gambar / motif', 'printing', 250, [], 'Panel cetak', 'u-print', { status: 'completed', qtyGood: 250, activeSeconds: 7_560, location: 'Rak WIP Cetak' }),
      step('s-102', 2, 'Potong bahan', 'cutting', 250, ['Panel cetak'], 'Panel potong', 'u-cut', { status: 'in_progress', qtyGood: 140, activeSeconds: 2_310, startedAt: ago(17), location: 'Rak WIP Jahit' }),
      step('s-103', 3, 'Siapkan furing', 'component', 250, [], 'Set furing', 'u-finish', { status: 'completed', qtyGood: 250, activeSeconds: 2_040, location: 'Rak WIP Jahit' }),
      step('s-104', 4, 'Siapkan resleting / tali', 'component', 250, [], 'Set resleting', 'u-finish', { status: 'completed', qtyGood: 250, activeSeconds: 1_620, location: 'Rak WIP Jahit' }),
      step('s-105', 5, 'Jahit / rakit produk', 'sewing', 250, ['Panel potong', 'Set furing', 'Set resleting'], 'Produk siap QC', 'u-sew', { status: 'waiting_wip', location: 'Meja Jahit 2' }),
      step('s-106', 6, 'QC akhir', 'qc', 250, ['Produk siap QC'], 'Produk lolos QC', 'u-qc', { status: 'not_ready', location: 'Area QC' }),
      step('s-107', 7, 'Packing', 'packing', 250, ['Produk lolos QC'], 'Produk terpacking', 'u-pack', { status: 'not_ready', location: 'Area Packing' }),
    ],
    history: [
      { id: 'h-101', at: ago(28 * 60), actor: 'Rena · Admin Operasional', role: 'admin', title: 'WO dibuat', note: 'Pesanan customer dibuat dengan alur banyak komponen.' },
      { id: 'h-102', at: ago(24 * 60), actor: 'Dimas · PPIC', role: 'ppic', title: 'WO dijadwalkan', note: 'Printing dimulai hari ini di Mimaki Eco Solvent 01.' },
      { id: 'h-103', at: ago(120), actor: 'Bagus · Printing', role: 'operator', title: 'Cetak selesai', note: '250 panel cetak baik masuk ke Rak WIP Cetak.' },
      { id: 'h-104', at: ago(17), actor: 'Dini · Cutting', role: 'operator', title: 'Potong dimulai', note: 'Timer aktif. 140 panel potong sudah masuk Rak WIP Jahit.' },
    ],
  },
  {
    id: 'wo-002',
    code: 'WO-2026-070',
    type: 'mto',
    source: 'B2B · Travel Agent Nusantara',
    product: 'Dompet Pouch Landmark Mesir · 400 pcs',
    referenceNote: 'Kirim sampel final ke Sales sebelum produksi massal.',
    qty: 400,
    dueDate: daysFromToday(2),
    priority: 'p2',
    machine: 'Mimaki Sublim 01',
    scheduledDate: daysFromToday(0),
    status: 'scheduled',
    reworkCount: 0,
    createdAt: ago(5 * 60),
    createdBy: 'Rena · Admin Operasional',
    steps: [
      step('s-201', 1, 'Cetak gambar / motif', 'printing', 400, [], 'Bahan bergambar', 'u-print', { status: 'ready', location: 'Area Cetak' }),
      step('s-202', 2, 'Potong bahan', 'cutting', 400, ['Bahan bergambar'], 'Bahan siap jahit', 'u-cut', { location: 'Rak WIP Cetak' }),
      step('s-203', 3, 'Jahit / rakit produk', 'sewing', 400, ['Bahan siap jahit'], 'Produk siap QC', 'u-sew', { location: 'Meja Jahit 1' }),
      step('s-204', 4, 'QC akhir', 'qc', 400, ['Produk siap QC'], 'Produk lolos QC', 'u-qc', { location: 'Area QC' }),
      step('s-205', 5, 'Packing', 'packing', 400, ['Produk lolos QC'], 'Produk terpacking', 'u-pack', { location: 'Area Packing' }),
    ],
    history: [
      { id: 'h-201', at: ago(5 * 60), actor: 'Rena · Admin Operasional', role: 'admin', title: 'WO dibuat', note: 'Pesanan B2B diregistrasi.' },
      { id: 'h-202', at: ago(4 * 60), actor: 'Dimas · PPIC', role: 'ppic', title: 'WO dijadwalkan', note: 'Menunggu operator printing mulai proses.' },
    ],
  },
  {
    id: 'wo-003',
    code: 'WO-2026-069',
    type: 'mts',
    source: 'Stok campaign Agustus',
    product: 'Dompet Panjang Lakaran · coklat · 120 pcs',
    referenceNote: 'Prioritas setelah pesanan MTO di atas selesai.',
    qty: 120,
    dueDate: daysFromToday(7),
    priority: 'p3',
    status: 'draft',
    reworkCount: 0,
    createdAt: ago(42 * 60),
    createdBy: 'Rena · Admin Operasional',
    steps: [
      step('s-301', 1, 'Buat produk', 'general', 120, [], 'Produk siap QC'),
      step('s-302', 2, 'QC akhir', 'qc', 120, ['Produk siap QC'], 'Produk lolos QC', 'u-qc'),
      step('s-303', 3, 'Packing', 'packing', 120, ['Produk lolos QC'], 'Produk terpacking', 'u-pack'),
    ],
    history: [
      { id: 'h-301', at: ago(42 * 60), actor: 'Rena · Admin Operasional', role: 'admin', title: 'WO draft dibuat', note: 'Belum dirilis ke lantai produksi.' },
    ],
  },
  {
    id: 'wo-004',
    code: 'WO-2026-068',
    type: 'mto',
    source: 'Tokopedia #TKP-260706-88',
    product: 'Sajadah Anak Motif Pelangi · 80 pcs',
    referenceNote: 'Resleting putih harus dicek sebelum packing.',
    qty: 80,
    dueDate: daysFromToday(-1),
    priority: 'p1',
    scheduledDate: daysFromToday(-1),
    status: 'qc',
    reworkCount: 1,
    createdAt: ago(2_000),
    createdBy: 'Rena · Admin Operasional',
    steps: [
      step('s-401', 1, 'Buat produk', 'sewing', 80, [], 'Produk siap QC', 'u-sew', { status: 'completed', qtyGood: 80, activeSeconds: 8_400, location: 'Rak QC' }),
      step('s-402', 2, 'QC akhir', 'qc', 80, ['Produk siap QC'], 'Produk lolos QC', 'u-qc', { status: 'ready', location: 'Area QC' }),
      step('s-403', 3, 'Packing', 'packing', 80, ['Produk lolos QC'], 'Produk terpacking', 'u-pack', { location: 'Area Packing' }),
    ],
    history: [
      { id: 'h-401', at: ago(2_000), actor: 'Rena · Admin Operasional', role: 'admin', title: 'WO dibuat', note: 'Order marketplace prioritas P1.' },
      { id: 'h-402', at: ago(1_200), actor: 'Rani · Jahit', role: 'operator', title: 'Produk masuk QC', note: '80 unit produk siap QC diserahkan ke area QC.' },
      { id: 'h-403', at: ago(300), actor: 'Maya · QC', role: 'qc', title: 'Rework sebelumnya tercatat', note: '3 unit resleting miring; sudah diperbaiki dan masuk kembali ke QC.' },
    ],
  },
]

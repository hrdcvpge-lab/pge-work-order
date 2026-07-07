import type { ProcessStep, RouteTemplate, StaffDirectoryMember, TeamMember, WorkOrder, WorkOrderReferenceImage } from '../types/workOrder'

const daysFromToday = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const artworkPreview = (
  id: string,
  name: string,
  title: string,
  base: string,
  accent: string,
  options: Partial<Pick<WorkOrderReferenceImage, 'version' | 'approvalStatus' | 'isPrimary' | 'printNote' | 'approvedBy' | 'approvedAt'>> = {},
): WorkOrderReferenceImage => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560"><defs><pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M0 24 24 0 48 24 24 48Z" fill="${accent}" opacity=".22"/></pattern></defs><rect width="800" height="560" fill="${base}"/><rect x="30" y="30" width="740" height="500" rx="22" fill="url(#p)" stroke="${accent}" stroke-width="3"/><circle cx="400" cy="220" r="95" fill="${accent}" opacity=".95"/><path d="M330 265h140l-18-38-24 16-28-76-28 76-24-16-18 38Z" fill="${base}"/><text x="400" y="375" text-anchor="middle" font-family="Arial,sans-serif" font-size="40" font-weight="700" fill="${accent}">${title}</text><text x="400" y="415" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#ffffff">PGE ARTWORK PREVIEW</text></svg>`
  return {
    id,
    name,
    dataUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    createdAt: ago(180),
    version: 'V1',
    approvalStatus: 'pending',
    isPrimary: false,
    ...options,
  }
}

/** Demo accounts. The Team PGE roster is added to the chooser in App as individual worker accounts. */
export const teamMembers: TeamMember[] = [
  { id: 'u-admin', name: 'Rena · Admin Operasional', role: 'admin', stations: [] },
  { id: 'u-ppic', name: 'Dimas · PPIC', role: 'ppic', stations: [] },
  { id: 'u-print', name: 'Bagus · Printing', role: 'operator', stations: ['printing'] },
  { id: 'u-cut', name: 'Dini · Cutting', role: 'operator', stations: ['cutting'] },
  { id: 'u-sew', name: 'Rani · Sewing / Assembly', role: 'operator', stations: ['sewing'] },
  { id: 'u-finish', name: 'Eka · Finishing', role: 'operator', stations: ['finishing'] },
  { id: 'u-warehouse', name: 'Sukini · Warehouse', role: 'operator', stations: ['warehouse'] },
  { id: 'u-qc', name: 'Maya · QC', role: 'qc', stations: ['qc'] },
  { id: 'u-pack', name: 'Fitri · Packing', role: 'packing', stations: ['packing'] },
  { id: 'u-manager', name: 'Arif · Manager', role: 'manager', stations: [] },
]


export const staffDirectory: StaffDirectoryMember[] = [
  { id: 'u-admin', name: 'Rena · Admin Operasional', kind: 'planner' },
  { id: 'u-ppic', name: 'Dimas · PPIC', kind: 'planner' },
  { id: 'staff-210703', name: 'Anisyatul Hasanah', employeeNumber: '210703', kind: 'staff' },
  { id: 'staff-191101', name: 'Ary Indriyani', employeeNumber: '191101', kind: 'staff' },
  { id: 'staff-220501', name: 'Assadiyah Husniyah', employeeNumber: '220501', kind: 'staff' },
  { id: 'staff-210502', name: 'Chantya Serly Akhlidya', employeeNumber: '210502', kind: 'staff' },
  { id: 'staff-240804', name: 'Dewi Kusumaningrum', employeeNumber: '240804', kind: 'staff' },
  { id: 'staff-240502', name: 'Dhea Amalia Fadhillah', employeeNumber: '240502', kind: 'staff' },
  { id: 'staff-231104', name: 'Imelda Sarita Sri Suniati', employeeNumber: '231104', kind: 'staff' },
  { id: 'staff-220502', name: 'Katharina Andini Eliza Pranawati', employeeNumber: '220502', kind: 'staff' },
  { id: 'staff-230101', name: 'Linda Novianti', employeeNumber: '230101', kind: 'staff' },
  { id: 'staff-251105', name: 'Olivia Ayu Ramadhani', employeeNumber: '251105', kind: 'staff' },
  { id: 'staff-240501', name: 'Parni', employeeNumber: '240501', kind: 'staff' },
  { id: 'staff-231003', name: 'Riska Amelia', employeeNumber: '231003', kind: 'staff' },
  { id: 'staff-251104', name: 'Riska Iga Mawarni', employeeNumber: '251104', kind: 'staff' },
  { id: 'staff-200401', name: 'Rusmiyati', employeeNumber: '200401', kind: 'staff' },
  { id: 'staff-251107', name: 'Sholekah Nur Khoiroh', employeeNumber: '251107', kind: 'staff' },
  { id: 'staff-201202', name: 'Sukini', employeeNumber: '201202', kind: 'staff' },
  { id: 'staff-230602', name: 'Tety Dya Pangastuti', employeeNumber: '230602', kind: 'staff' },
  { id: 'staff-241205', name: 'Titania Susilowati Fauziyah', employeeNumber: '241205', kind: 'staff' },
  { id: 'staff-210201', name: 'Wahyu Albino', employeeNumber: '210201', kind: 'staff' },
  { id: 'staff-251206', name: 'Yohana Aprilia Putri', employeeNumber: '251206', kind: 'staff' },
  { id: 'staff-250201', name: 'Jumiati', employeeNumber: '250201', kind: 'staff' },
  { id: 'staff-260401', name: 'Ilham Rizky Nugroho', employeeNumber: '260401', kind: 'staff' },
  { id: 'staff-260502', name: 'Pandu Yogatama', employeeNumber: '260502', kind: 'staff' },
  { id: 'staff-260603', name: 'Aloysius Gonzaga Pri Sambodo Nugroho', employeeNumber: '260603', kind: 'staff' },
]

export const workAreas = [
  'Area Printing · Mimaki Eco Solvent 01',
  'Area Printing · Mimaki Sublim 01',
  'Area Cutting',
  'Rak WIP Cetak',
  'Rak WIP Jahit',
  'Area Warehouse / Material',
  'Area Warehouse / Receiving',
  'Meja Jahit 1',
  'Meja Jahit 2',
  'Area Finishing',
  'Area QC',
  'Area Packing',
  'Gudang / Pengiriman',
  'Area Produksi Umum',
]

export const routeTemplates: RouteTemplate[] = [
  { id: 'direct', title: 'Produk langsung', description: 'Buat produk → QC akhir → Packing. Untuk produk sederhana atau proses satu meja.' },
  { id: 'print-sew', title: 'Cetak lalu jahit', description: 'Cetak → Potong → Jahit/Rakit → QC akhir → Packing.' },
  { id: 'multi-part', title: 'Banyak komponen', description: 'Cetak/Potong berjalan bersama furing dan resleting; jahit menunggu semua komponen.' },
  { id: 'custom', title: 'Atur alur sendiri', description: 'Pilih proses yang dibutuhkan. QC akhir dan packing tetap ditambahkan otomatis.' },
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
  values: Partial<Pick<ProcessStep, 'status' | 'qtyGood' | 'qtyRework' | 'qtyReject' | 'activeSeconds' | 'startedAt' | 'location' | 'holdReason' | 'artworkConfirmedBy' | 'artworkConfirmedAt' | 'artworkConfirmedImageId'>> = {},
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
    referenceImages: [
      artworkPreview('art-korea-01', 'Korea-maroon-front-v3.jpg', 'KOREA · MAROON', '#781A24', '#E8B949', {
        version: 'V3',
        approvalStatus: 'approved',
        isPrimary: true,
        printNote: 'FINAL PRINT FILE. Gunakan warna maroon, cetak 1 panel depan per unit. Cek posisi logo sebelum produksi massal.',
        approvedBy: 'Dimas · PPIC',
        approvedAt: ago(24 * 60),
      }),
      artworkPreview('art-korea-02', 'Korea-maroon-repeat-v3.jpg', 'KOREA · REPEAT', '#4A1423', '#F3D67B', {
        version: 'V3',
        approvalStatus: 'approved',
        isPrimary: false,
        printNote: 'Referensi pola ulang / backside. Ikuti ukuran dari FINAL PRINT FILE.',
        approvedBy: 'Dimas · PPIC',
        approvedAt: ago(24 * 60),
      }),
      artworkPreview('art-korea-03', 'Korea-maroon-front-v2.jpg', 'KOREA · V2', '#65202A', '#D59D3D', {
        version: 'V2',
        approvalStatus: 'superseded',
        isPrimary: false,
        printNote: 'JANGAN DICETAK. Diganti oleh V3 karena posisi logo direvisi.',
      }),
    ],
    artworkApprovalRequired: true,
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
      step('s-101', 1, 'Cetak gambar / motif', 'printing', 250, [], 'Panel cetak', 'u-print', { status: 'completed', qtyGood: 250, activeSeconds: 7_560, location: 'Rak WIP Cetak', artworkConfirmedBy: 'Bagus · Printing', artworkConfirmedAt: ago(155), artworkConfirmedImageId: 'art-korea-01' }),
      step('s-102', 2, 'Potong bahan', 'cutting', 250, ['Panel cetak'], 'Panel potong', 'u-cut', { status: 'in_progress', qtyGood: 140, activeSeconds: 2_310, startedAt: ago(17), location: 'Rak WIP Jahit' }),
      step('s-103', 3, 'Siapkan furing', 'warehouse', 250, [], 'Set furing', 'u-warehouse', { status: 'completed', qtyGood: 250, activeSeconds: 2_040, location: 'Rak WIP Jahit' }),
      step('s-104', 4, 'Siapkan resleting / tali', 'warehouse', 250, [], 'Set resleting', 'u-warehouse', { status: 'completed', qtyGood: 250, activeSeconds: 1_620, location: 'Rak WIP Jahit' }),
      step('s-105', 5, 'Jahit / rakit produk', 'sewing', 250, ['Panel potong', 'Set furing', 'Set resleting'], 'Produk siap QC', 'u-sew', { status: 'waiting_wip', location: 'Meja Jahit 2' }),
      step('s-106', 6, 'QC akhir', 'qc', 250, ['Produk siap QC'], 'Produk lolos QC', 'u-qc', { status: 'not_ready', location: 'Area QC' }),
      step('s-107', 7, 'Packing', 'packing', 250, ['Produk lolos QC'], 'Produk terpacking', 'u-pack', { status: 'not_ready', location: 'Area Packing' }),
    ],
    history: [
      { id: 'h-101', at: ago(28 * 60), actor: 'Rena · Admin Operasional', role: 'admin', title: 'WO dibuat', note: 'Pesanan customer dibuat dengan alur banyak komponen.' },
      { id: 'h-102', at: ago(24 * 60), actor: 'Dimas · PPIC', role: 'ppic', title: 'FINAL PRINT FILE disetujui', note: 'Korea maroon V3 ditetapkan sebagai file utama untuk cetak.' },
      { id: 'h-103', at: ago(155), actor: 'Bagus · Printing', role: 'operator', title: 'Artwork diverifikasi sebelum cetak', note: 'Korea maroon V3 dibuka dan dikonfirmasi sesuai preview.' },
      { id: 'h-104', at: ago(120), actor: 'Bagus · Printing', role: 'operator', title: 'Cetak selesai', note: '250 panel cetak baik masuk ke Rak WIP Cetak.' },
      { id: 'h-105', at: ago(17), actor: 'Dini · Cutting', role: 'operator', title: 'Potong dimulai', note: 'Timer aktif. 140 panel potong sudah masuk Rak WIP Jahit.' },
    ],
  },
  {
    id: 'wo-002',
    code: 'WO-2026-070',
    type: 'mto',
    source: 'B2B · Travel Agent Nusantara',
    product: 'Dompet Pouch Landmark Mesir · 400 pcs',
    referenceNote: 'Kirim sampel final ke Sales sebelum produksi massal.',
    referenceImages: [
      artworkPreview('art-egypt-01', 'Mesir-landmark-draft-v1.jpg', 'MESIR · LANDMARK', '#6A3F1B', '#F3B655', {
        version: 'V1',
        approvalStatus: 'pending',
        isPrimary: true,
        printNote: 'MENUNGGU FINAL CHECK. Jangan cetak massal sebelum PPIC / R&D menyetujui file.',
      }),
    ],
    artworkApprovalRequired: true,
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
      { id: 'h-202', at: ago(4 * 60), actor: 'Dimas · PPIC', role: 'ppic', title: 'WO dijadwalkan', note: 'Printing menunggu persetujuan FINAL PRINT FILE.' },
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
      step('s-301', 1, 'Buat produk', 'sewing', 120, [], 'Produk siap QC', 'u-sew'),
      step('s-302', 2, 'QC akhir', 'qc', 120, ['Produk siap QC'], 'Produk lolos QC', 'u-qc'),
      step('s-303', 3, 'Packing', 'packing', 120, ['Produk lolos QC'], 'Produk terpacking', 'u-pack'),
    ],
    history: [{ id: 'h-301', at: ago(42 * 60), actor: 'Rena · Admin Operasional', role: 'admin', title: 'WO draft dibuat', note: 'Belum dirilis ke lantai produksi.' }],
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
      step('s-402', 2, 'QC akhir', 'qc', 80, ['Produk siap QC'], 'Produk lolos QC', 'u-qc', { status: 'completed', qtyGood: 70, qtyReject: 10, activeSeconds: 1_240, location: 'Area QC' }),
      step('s-403', 3, 'Packing', 'packing', 80, ['Produk lolos QC'], 'Produk terpacking', 'u-pack', { location: 'Area Packing' }),
    ],
    shortfalls: [
      {
        id: 'shortfall-demo-001',
        origin: 'qc_final_reject',
        sourceStepId: 's-402',
        sourceStepName: 'QC akhir',
        sourceStation: 'qc',
        qty: 10,
        status: 'action_required',
        createdAt: ago(300),
        note: '10 unit jahitan resleting tidak lurus dan dinyatakan reject final QC.',
      },
    ],
    history: [
      { id: 'h-401', at: ago(2_000), actor: 'Rena · Admin Operasional', role: 'admin', title: 'WO dibuat', note: 'Order marketplace prioritas P1.' },
      { id: 'h-402', at: ago(1_200), actor: 'Rani · Jahit', role: 'operator', title: 'Produk masuk QC', note: '80 unit produk siap QC diserahkan ke area QC.' },
      { id: 'h-403', at: ago(300), actor: 'Maya · QC', role: 'qc', title: 'QC final reject tercatat', note: '70 unit lulus, 10 unit reject final. Menunggu keputusan penggantian dari Admin / PPIC.' },
    ],
  },
]

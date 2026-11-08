import { User, SaldoRecord, Transaction, AppConfig } from '../src/types/index.ts';

export const initialAppConfig: AppConfig = {
  nama_instansi: 'UPTD Puskesmas Sehat Nusantara',
  penanggung_jawab: 'dr. H. Rahmat Hidayat, M.Kes',
  jabatan_penanggung_jawab: 'Kepala UPTD Puskesmas / Ketua Tim Kesehatan Haji',
  nip_penanggung_jawab: '19780514 200501 1 008',
  tahun_aktif: '2026',
  updated_at: new Date().toISOString(),
};

export const initialUsers: User[] = [
  {
    id: 'usr-1',
    username: 'admin',
    password_hash: 'admin123',
    role: 'admin',
    nama_lengkap: 'dr. H. Rahmat Hidayat, M.Kes',
    jabatan: 'Ketua Tim / Bendahara Operasional Haji Puskesmas',
    status: 'aktif',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'usr-2',
    username: 'petugas',
    password_hash: 'petugas123',
    role: 'anggota',
    nama_lengkap: 'Ns. Hj. Siti Nurjanah, S.Kep',
    jabatan: 'Petugas Paramedis Posko Kesehatan Kloter',
    status: 'aktif',
    created_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'usr-3',
    username: 'anggota',
    password_hash: 'anggota123',
    role: 'anggota',
    nama_lengkap: 'Ahmad Subandi, S.Tr.Kes',
    jabatan: 'Sanitarian & Logistik Obat Haji',
    status: 'aktif',
    created_at: '2026-01-03T00:00:00Z',
  },
];

export const initialSaldoList: SaldoRecord[] = [
  {
    id: 'sld-2025',
    tahun: '2025',
    saldo_awal_tahun_lalu: 10000000,
    saldo_realtime: 12500000,
    catatan: 'Kas operasional haji tahun 2025',
    is_locked: false,
    updated_at: '2025-12-31T23:59:59Z',
  },
  {
    id: 'sld-2026',
    tahun: '2026',
    saldo_awal_tahun_lalu: 12500000, // Diambil dari saldo akhir 2025
    saldo_realtime: 28200000,
    catatan: 'Sisa saldo operasional kas Posko Kesehatan Haji Puskesmas tahun sebelumnya',
    is_locked: true,
    saldo_akhir_sebelumnya: 12500000,
    updated_at: new Date().toISOString(),
  },
];

export const initialSaldo: SaldoRecord = initialSaldoList[1];

export const initialTransactions: Transaction[] = [
  // Transaksi 2025 (untuk demonstrasi saldo akhir -> saldo awal tahun 2026)
  {
    id: 'TRX-2025-001',
    tanggal: '2025-05-10',
    jenis: 'penerimaan',
    nominal: 10000000,
    sumber_dana: 'BOK Dinkes 2025',
    keterangan: 'Pencairan Kas Haji Musim 2025',
    dibuat_oleh: 'dr. H. Rahmat Hidayat, M.Kes',
    created_at: '2025-05-10T08:00:00Z',
    tahun: '2025',
  },
  {
    id: 'TRX-2025-002',
    tanggal: '2025-06-15',
    jenis: 'pengeluaran',
    nominal: 7500000,
    nama_penerima: 'Kimia Farma & Posko Haji',
    keterangan: 'Pembelian Alkes & Obat Haji Musim 2025',
    dibuat_oleh: 'dr. H. Rahmat Hidayat, M.Kes',
    created_at: '2025-06-15T10:00:00Z',
    tahun: '2025',
  },

  // Transaksi 2026
  {
    id: 'TRX-2026-001',
    tanggal: '2026-04-10',
    jenis: 'penerimaan',
    nominal: 15000000,
    sumber_dana: 'Dinas Kesehatan Kabupaten (BOK Haji)',
    keterangan: 'Pencairan Dana Alokasi BOK Pelayanan Kesehatan Jamaah Haji Tahap 1',
    dibuat_oleh: 'dr. H. Rahmat Hidayat, M.Kes',
    created_at: '2026-04-10T08:30:00Z',
    tahun: '2026',
  },
  {
    id: 'TRX-2026-002',
    tanggal: '2026-04-18',
    jenis: 'pengeluaran',
    nominal: 4200000,
    nama_penerima: 'PT Kimia Farma Apotek',
    keterangan: 'Pengadaan Obat Emergensi, Oralit, Paracetamol, & Vitamin Jamaah Resiko Tinggi',
    dibuat_oleh: 'dr. H. Rahmat Hidayat, M.Kes',
    created_at: '2026-04-18T10:15:00Z',
    tahun: '2026',
  },
  {
    id: 'TRX-2026-003',
    tanggal: '2026-04-25',
    jenis: 'penerimaan',
    nominal: 6000000,
    sumber_dana: 'Iuran Swadaya Petugas Haji Puskesmas',
    keterangan: 'Dana kebersamaan & logistik posko darurat tim kloter',
    dibuat_oleh: 'dr. H. Rahmat Hidayat, M.Kes',
    created_at: '2026-04-25T14:00:00Z',
    tahun: '2026',
  },
  {
    id: 'TRX-2026-004',
    tanggal: '2026-05-02',
    jenis: 'pengeluaran',
    nominal: 2850000,
    nama_penerima: 'CV Medika Sarana Prima',
    keterangan: 'Pembelian 4 Unit Tensimeter Digital, Oximeter, Termometer Infrared & Tas Medis',
    dibuat_oleh: 'dr. H. Rahmat Hidayat, M.Kes',
    created_at: '2026-05-02T09:45:00Z',
    tahun: '2026',
  },
  {
    id: 'TRX-2026-005',
    tanggal: '2026-05-12',
    jenis: 'penerimaan',
    nominal: 3500000,
    sumber_dana: 'Bantuan Hibah BAZNAS Peduli Haji Sehat',
    keterangan: 'Bantuan suplemen daya tahan tubuh & masker KN95 untuk lansia',
    dibuat_oleh: 'dr. H. Rahmat Hidayat, M.Kes',
    created_at: '2026-05-12T11:20:00Z',
    tahun: '2026',
  },
  {
    id: 'TRX-2026-006',
    tanggal: '2026-05-20',
    jenis: 'pengeluaran',
    nominal: 1750000,
    nama_penerima: 'Koperasi Puskesmas Sehat',
    keterangan: 'Pengadaan Seragam Rompi Medis Petugas, Name Tag, & Buku Catatan Rekam Medis Haji',
    dibuat_oleh: 'dr. H. Rahmat Hidayat, M.Kes',
    created_at: '2026-05-20T13:10:00Z',
    tahun: '2026',
  },
];

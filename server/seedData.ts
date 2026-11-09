import { User, SaldoRecord, Transaction, AppConfig } from '../src/types/index.ts';

export const initialAppConfig: AppConfig = {
  nama_instansi: 'UPTD Puskesmas',
  penanggung_jawab: 'Penanggung Jawab Tim Haji',
  jabatan_penanggung_jawab: 'Ketua Tim Petugas Kesehatan Haji',
  nip_penanggung_jawab: '',
  tahun_aktif: '2026',
  updated_at: new Date().toISOString(),
};

export const initialUsers: User[] = [
  {
    id: 'usr-1',
    username: 'admin',
    password_hash: 'admin123',
    role: 'admin',
    nama_lengkap: 'Administrator Tim Haji',
    jabatan: 'Ketua Tim / Administrator',
    status: 'aktif',
    created_at: new Date().toISOString(),
  },
  {
    id: 'usr-2',
    username: 'petugas',
    password_hash: 'petugas123',
    role: 'anggota',
    nama_lengkap: 'Petugas Kesehatan Haji',
    jabatan: 'Petugas Pelaksana',
    status: 'aktif',
    created_at: new Date().toISOString(),
  },
];

export const initialSaldoList: SaldoRecord[] = [
  {
    id: 'sld-2026',
    tahun: '2026',
    saldo_awal_tahun_lalu: 0,
    saldo_realtime: 0,
    catatan: 'Saldo kas awal tahun berjalan',
    is_locked: false,
    updated_at: new Date().toISOString(),
  },
];

export const initialSaldo: SaldoRecord = initialSaldoList[0];

export const initialTransactions: Transaction[] = [];

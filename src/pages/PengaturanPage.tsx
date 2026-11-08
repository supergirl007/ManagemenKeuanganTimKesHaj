import React, { useState, useEffect } from 'react';
import { AppConfig, User, SaldoRecord, YearInfo, AuthUser } from '../types/index.ts';
import { api } from '../utils/api.ts';
import { formatRupiah } from '../utils/finance.ts';
import {
  Settings,
  Building2,
  Users,
  Wallet,
  Calendar,
  Save,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Shield,
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  UserX,
  RefreshCw,
  Sparkles,
  KeyRound,
  Check,
  Info,
} from 'lucide-react';

interface PengaturanPageProps {
  currentUser: AuthUser;
  isAdmin: boolean;
  appConfig: AppConfig;
  activeYear: string;
  onUpdateAppConfig: (newConfig: AppConfig) => void;
  onYearChanged: (year: string) => void;
  onDataRefresh: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const PengaturanPage: React.FC<PengaturanPageProps> = ({
  currentUser,
  isAdmin,
  appConfig,
  activeYear,
  onUpdateAppConfig,
  onYearChanged,
  onDataRefresh,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'aplikasi' | 'pengguna' | 'dana' | 'tahun'>('aplikasi');

  // Tab 1: Aplikasi Form State
  const [namaInstansi, setNamaInstansi] = useState(appConfig.nama_instansi || '');
  const [penanggungJawab, setPenanggungJawab] = useState(appConfig.penanggung_jawab || '');
  const [jabatanPJ, setJabatanPJ] = useState(appConfig.jabatan_penanggung_jawab || '');
  const [nipPJ, setNipPJ] = useState(appConfig.nip_penanggung_jawab || '');
  const [savingApp, setSavingApp] = useState(false);

  // Tab 2: Pengguna State
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    username: '',
    password: '',
    role: 'anggota' as 'admin' | 'anggota',
    nama_lengkap: '',
    jabatan: '',
    status: 'aktif' as 'aktif' | 'nonaktif',
  });
  const [savingUser, setSavingUser] = useState(false);

  // Tab 3: Pengaturan Dana State
  const [selectedFundYear, setSelectedFundYear] = useState<string>(activeYear);
  const [yearSaldoRecord, setYearSaldoRecord] = useState<SaldoRecord | null>(null);
  const [saldoAwalInput, setSaldoAwalInput] = useState<string>('0');
  const [catatanSaldo, setCatatanSaldo] = useState<string>('');
  const [savingSaldo, setSavingSaldo] = useState(false);

  // Tab 4: Pengaturan Tahun State
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [yearSummaries, setYearSummaries] = useState<YearInfo[]>([]);
  const [isNewYearModalOpen, setIsNewYearModalOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');
  const [newYearManualSaldo, setNewYearManualSaldo] = useState('0');
  const [savingNewYear, setSavingNewYear] = useState(false);

  // Sync internal form when appConfig prop changes
  useEffect(() => {
    setNamaInstansi(appConfig.nama_instansi || '');
    setPenanggungJawab(appConfig.penanggung_jawab || '');
    setJabatanPJ(appConfig.jabatan_penanggung_jawab || '');
    setNipPJ(appConfig.nip_penanggung_jawab || '');
  }, [appConfig]);

  // Load Users List
  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const list = await api.getUsers();
      setUsersList(list);
    } catch (err: any) {
      console.warn('Load users warning:', err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Load Years & Summaries
  const loadYearsData = async () => {
    try {
      const res = await api.getYears();
      setAvailableYears(res.years);
      setYearSummaries(res.yearSummaries);
    } catch (err: any) {
      console.warn('Load years warning:', err.message);
    }
  };

  // Load Saldo for specific fund year
  const loadSaldoForYear = async (yr: string) => {
    try {
      const s = await api.getSaldo(yr);
      setYearSaldoRecord(s);
      setSaldoAwalInput(String(s.saldo_awal_tahun_lalu || 0));
      setCatatanSaldo(s.catatan || '');
    } catch (err: any) {
      console.warn('Load saldo year warning:', err.message);
    }
  };

  useEffect(() => {
    loadUsers();
    loadYearsData();
  }, []);

  useEffect(() => {
    loadSaldoForYear(selectedFundYear);
  }, [selectedFundYear]);

  // Handlers for Tab 1: Pengaturan Aplikasi
  const handleSaveAppConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingApp(true);
    try {
      const updated = await api.updateAppConfig({
        nama_instansi: namaInstansi.trim(),
        penanggung_jawab: penanggungJawab.trim(),
        jabatan_penanggung_jawab: jabatanPJ.trim(),
        nip_penanggung_jawab: nipPJ.trim(),
      });
      onUpdateAppConfig(updated);
      showToast('Pengaturan nama instansi & penanggungjawab berhasil disimpan!');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan pengaturan aplikasi', 'error');
    } finally {
      setSavingApp(false);
    }
  };

  // Handlers for Tab 2: Pengaturan Pengguna
  const handleOpenAddUser = () => {
    setEditingUser(null);
    setUserFormData({
      username: '',
      password: '',
      role: 'anggota',
      nama_lengkap: '',
      jabatan: '',
      status: 'aktif',
    });
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setUserFormData({
      username: u.username,
      password: '', // kosongkan agar tidak mengganti password jika tidak diisi
      role: u.role,
      nama_lengkap: u.nama_lengkap,
      jabatan: u.jabatan || '',
      status: u.status || 'aktif',
    });
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          username: userFormData.username,
          password: userFormData.password || undefined,
          role: userFormData.role,
          nama_lengkap: userFormData.nama_lengkap,
          jabatan: userFormData.jabatan,
          status: userFormData.status,
        });
        showToast(`Pengguna "${userFormData.nama_lengkap}" berhasil diperbarui!`);
      } else {
        if (!userFormData.password) {
          showToast('Kata sandi wajib diisi untuk pengguna baru', 'error');
          setSavingUser(false);
          return;
        }
        await api.createUser(userFormData);
        showToast(`Pengguna baru "${userFormData.nama_lengkap}" berhasil didaftarkan!`);
      }
      setIsUserModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan data pengguna', 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    const nextStatus = user.status === 'aktif' ? 'nonaktif' : 'aktif';
    try {
      await api.toggleUserStatus(user.id, nextStatus);
      showToast(`Status akun "${user.nama_lengkap}" diubah menjadi ${nextStatus.toUpperCase()}`);
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah status pengguna', 'error');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser.id) {
      showToast('Anda tidak dapat menghapus akun Anda sendiri.', 'error');
      return;
    }
    if (!confirm(`Hapus pengguna "${user.nama_lengkap}" (${user.username}) dari sistem?`)) {
      return;
    }
    try {
      await api.deleteUser(user.id);
      showToast(`Pengguna "${user.nama_lengkap}" berhasil dihapus.`);
      await loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus pengguna', 'error');
    }
  };

  // Handlers for Tab 3: Pengaturan Dana & Saldo
  const handleSaveSaldoDana = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSaldo(true);
    try {
      const parsedNominal = parseInt(saldoAwalInput.replace(/[^0-9]/g, ''), 10) || 0;
      const updated = await api.updateSaldo({
        tahun: selectedFundYear,
        saldo_awal_tahun_lalu: yearSaldoRecord?.is_locked ? undefined : parsedNominal,
        catatan: catatanSaldo,
      });
      setYearSaldoRecord(updated);
      showToast(`Saldo awal tahun ${selectedFundYear} berhasil disimpan!`);
      onDataRefresh();
      await loadYearsData();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan saldo', 'error');
    } finally {
      setSavingSaldo(false);
    }
  };

  // Handlers for Tab 4: Pengaturan Tahun
  const handleInitializeNewYear = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanY = newYearInput.trim();
    if (!cleanY) {
      showToast('Masukkan tahun yang valid (misal: 2027)', 'error');
      return;
    }
    setSavingNewYear(true);
    try {
      const manualNominal = parseInt(newYearManualSaldo.replace(/[^0-9]/g, ''), 10) || 0;
      await api.initYear(cleanY, manualNominal);
      showToast(`Tahun database ${cleanY} berhasil diinisialisasi!`);
      setIsNewYearModalOpen(false);
      setNewYearInput('');
      setNewYearManualSaldo('0');
      onYearChanged(cleanY);
      await loadYearsData();
      onDataRefresh();
    } catch (err: any) {
      showToast(err.message || 'Gagal membuat tahun database baru', 'error');
    } finally {
      setSavingNewYear(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="py-16 text-center text-rose-300">
        <ShieldAlert className="w-12 h-12 mx-auto text-rose-400 mb-3" />
        <h3 className="text-lg font-bold text-white">Akses Terbatas: Khusus Administrator</h3>
        <p className="text-xs text-purple-200/80 mt-1">
          Halaman Pengaturan Aplikasi hanya dapat diakses oleh peran Admin Petugas Haji.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-purple-900/40 via-pink-950/40 to-slate-900/60 border border-white/15 backdrop-blur-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white shadow-lg shadow-pink-500/30">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <span>Pengaturan & Konfigurasi Sistem</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                Admin Area
              </span>
            </h2>
            <p className="text-xs text-purple-200/80 mt-0.5">
              Kelola instansi, akun pengguna, saldo multi-tahun, dan sinkronisasi database
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-300">Tahun Aktif:</span>
          <span className="px-3 py-1 rounded-xl bg-pink-500/20 border border-pink-500/40 text-pink-300 font-bold text-xs font-mono">
            {activeYear}
          </span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-black/40 border border-white/10 text-xs font-semibold backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveTab('aplikasi')}
          className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'aplikasi'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>1. Aplikasi & Instansi</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pengguna')}
          className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'pengguna'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>2. Pengguna ({usersList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dana')}
          className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'dana'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>3. Saldo & Dana</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tahun')}
          className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'tahun'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>4. Pengaturan Tahun</span>
        </button>
      </div>

      {/* TAB 1: PENGATURAN APLIKASI */}
      {activeTab === 'aplikasi' && (
        <form onSubmit={handleSaveAppConfig} className="p-5 sm:p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl space-y-4">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-pink-400" />
              <span>Identitas Instansi & Penanggungjawab Laporan</span>
            </h3>
            <p className="text-xs text-purple-200/70 mt-1">
              Data ini akan otomatis tercetak pada Kop Surat Laporan PDF dan lembar tanda tangan pengesahan kas haji.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-purple-200 mb-1.5">
                Nama Instansi / Puskesmas
              </label>
              <input
                type="text"
                required
                value={namaInstansi}
                onChange={(e) => setNamaInstansi(e.target.value)}
                placeholder="Contoh: UPTD Puskesmas Sehat Nusantara"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-pink-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Muncul di judul kop surat resmi pada laporan keuangan.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-200 mb-1.5">
                Nama Penanggungjawab (Pimpinan / Kepala Puskesmas)
              </label>
              <input
                type="text"
                required
                value={penanggungJawab}
                onChange={(e) => setPenanggungJawab(e.target.value)}
                placeholder="Contoh: dr. H. Rahmat Hidayat, M.Kes"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-pink-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Nama pejabat penandatangan lembar pertanggungjawaban.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-200 mb-1.5">
                Jabatan Penanggungjawab
              </label>
              <input
                type="text"
                required
                value={jabatanPJ}
                onChange={(e) => setJabatanPJ(e.target.value)}
                placeholder="Contoh: Kepala UPTD Puskesmas / Ketua Tim Penyelenggara Haji"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-pink-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-200 mb-1.5">
                NIP Penanggungjawab (Opsional)
              </label>
              <input
                type="text"
                value={nipPJ}
                onChange={(e) => setNipPJ(e.target.value)}
                placeholder="Contoh: 19780514 200501 1 008"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm font-mono focus:border-pink-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex justify-end">
            <button
              type="submit"
              disabled={savingApp}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-pink-500/25 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingApp ? 'Menyimpan...' : 'Simpan Pengaturan Aplikasi'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: PENGATURAN PENGGUNA */}
      {activeTab === 'pengguna' && (
        <div className="p-5 sm:p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-pink-400" />
                <span>Manajemen Akun Petugas & Hak Akses</span>
              </h3>
              <p className="text-xs text-purple-200/70 mt-1">
                Kelola kredensial login, peran (Admin/Petugas), dan status aktifasi akun.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenAddUser}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Pengguna Baru</span>
            </button>
          </div>

          {loadingUsers ? (
            <div className="py-12 flex justify-center text-xs text-purple-300">
              <RefreshCw className="w-6 h-6 animate-spin text-pink-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {usersList.map((user) => {
                const isSelf = user.id === currentUser.id;
                const isAktif = user.status !== 'nonaktif';

                return (
                  <div
                    key={user.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isAktif
                        ? 'bg-black/40 border-white/10 hover:border-pink-500/40'
                        : 'bg-rose-950/20 border-rose-500/30 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white truncate">{user.nama_lengkap}</h4>
                          {isSelf && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                              Anda
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-purple-200 font-mono mt-0.5">@{user.username}</div>
                        <p className="text-[11px] text-slate-300 mt-1">{user.jabatan || 'Petugas Haji'}</p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            user.role === 'admin'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          }`}
                        >
                          {user.role === 'admin' ? 'Admin' : 'Petugas'}
                        </span>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            isAktif
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {isAktif ? '● Aktif' : '○ Nonaktif'}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(user)}
                        disabled={isSelf}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border flex items-center gap-1 font-medium transition-all ${
                          isSelf
                            ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-slate-400'
                            : isAktif
                            ? 'bg-white/5 hover:bg-rose-500/20 border-white/10 hover:border-rose-500/30 text-slate-300 hover:text-rose-200 cursor-pointer'
                            : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300 cursor-pointer'
                        }`}
                        title={isSelf ? 'Tidak dapat menonaktifkan akun sendiri' : 'Ubah status aktifasi'}
                      >
                        {isAktif ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        <span>{isAktif ? 'Nonaktifkan' : 'Aktifkan Akun'}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditUser(user)}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all cursor-pointer"
                          title="Edit Pengguna"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          disabled={isSelf}
                          className={`p-1.5 rounded-lg transition-all ${
                            isSelf
                              ? 'opacity-40 cursor-not-allowed text-slate-500 bg-white/5'
                              : 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 bg-white/5 cursor-pointer'
                          }`}
                          title={isSelf ? 'Tidak dapat menghapus akun sendiri' : 'Hapus Pengguna'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PENGATURAN DANA & SALDO AWAL (CARRYOVER LOCK) */}
      {activeTab === 'dana' && (
        <form onSubmit={handleSaveSaldoDana} className="p-5 sm:p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl space-y-4">
          <div className="border-b border-white/10 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-pink-400" />
                <span>Pengaturan Dana Kas & Saldo Awal Musim Haji</span>
              </h3>
              <p className="text-xs text-purple-200/70 mt-1">
                Saldo awal tahun baru terisi otomatis dari saldo akhir tahun sebelumnya dan terkunci untuk integritas pembukuan.
              </p>
            </div>

            {/* Year filter selector */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs text-slate-300">Pilih Tahun:</span>
              <select
                value={selectedFundYear}
                onChange={(e) => setSelectedFundYear(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-black/60 border border-white/20 text-pink-300 text-xs font-bold font-mono focus:outline-none"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y} className="bg-slate-900 text-white">
                    Tahun {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Banner Status Lock / Unlock */}
          {yearSaldoRecord?.is_locked ? (
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-amber-300">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Saldo Awal Terkunci Otomatis (Carryover Antar Tahun)</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Tahun <b>{selectedFundYear}</b> memiliki tahun pembukuan sebelumnya. Saldo awal otomatis terisi dari <b>Saldo Akhir</b> tahun sebelumnya (sebesar <b>{formatRupiah(yearSaldoRecord.saldo_awal_tahun_lalu)}</b>) dan dalam kondisi <b>terkunci</b>. Setiap transaksi penerimaan/pengeluaran di tahun sebelumnya akan otomatis memperbarui saldo awal tahun ini.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/40 text-purple-200 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-purple-300">
                <Unlock className="w-4 h-4 text-purple-400" />
                <span>Saldo Awal Bebas Diatur (Tahun Awal Database)</span>
              </div>
              <p className="text-[11px] text-purple-200/90 leading-relaxed">
                Tahun <b>{selectedFundYear}</b> tidak memiliki pembukuan tahun sebelumnya dalam database. Anda dapat menentukan nominal saldo awal kas haji tahun berjalan secara manual.
              </p>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-purple-200 mb-1.5">
                Nominal Saldo Awal Kas Tahun {selectedFundYear}
              </label>
              <div className="relative">
                <input
                  type="text"
                  disabled={yearSaldoRecord?.is_locked}
                  value={
                    yearSaldoRecord?.is_locked
                      ? formatRupiah(yearSaldoRecord.saldo_awal_tahun_lalu)
                      : saldoAwalInput
                  }
                  onChange={(e) => setSaldoAwalInput(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono font-bold ${
                    yearSaldoRecord?.is_locked
                      ? 'bg-black/60 border-amber-500/40 text-amber-300 cursor-not-allowed'
                      : 'bg-black/40 border-white/15 text-emerald-300 focus:border-pink-500 focus:outline-none'
                  }`}
                />
                {yearSaldoRecord?.is_locked && (
                  <div className="absolute inset-y-0 right-3 flex items-center text-amber-400 text-xs gap-1 pointer-events-none">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Terkunci</span>
                  </div>
                )}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {yearSaldoRecord?.is_locked
                  ? 'Nilai ini terkunci dari saldo akhir tahun sebelumnya.'
                  : 'Ketik nominal rupiah saldo awal berjalan.'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-200 mb-1.5">
                Saldo Realtime Akhir Tahun {selectedFundYear}
              </label>
              <div className="px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-pink-300 text-sm font-mono font-bold flex items-center justify-between">
                <span>{formatRupiah(yearSaldoRecord?.saldo_realtime || 0)}</span>
                <span className="text-[10px] text-slate-400 font-normal">Realtime Otomatis</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Dihitung dari: Saldo Awal + Total Penerimaan - Total Pengeluaran tahun {selectedFundYear}.
              </span>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-purple-200 mb-1.5">
                Catatan / Keterangan Saldo Awal
              </label>
              <input
                type="text"
                value={catatanSaldo}
                onChange={(e) => setCatatanSaldo(e.target.value)}
                placeholder="Contoh: Sisa kas operasional haji tahun sebelumnya"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:border-pink-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex justify-end">
            <button
              type="submit"
              disabled={savingSaldo}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-pink-500/25 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingSaldo ? 'Menyimpan...' : 'Simpan Saldo & Catatan'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: PENGATURAN TAHUN DATABASE */}
      {activeTab === 'tahun' && (
        <div className="p-5 sm:p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-pink-400" />
                <span>Pengaturan Tahun Anggaran Database</span>
              </h3>
              <p className="text-xs text-purple-200/70 mt-1">
                Tahun yang dipilih akan menyaring seluruh data transaksi, saldo, dan laporan di seluruh aplikasi.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsNewYearModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Inisialisasi Tahun Baru</span>
            </button>
          </div>

          {/* Cards of Available Years */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {yearSummaries.map((item) => {
              const isCurrentActive = item.tahun === activeYear;

              return (
                <div
                  key={item.tahun}
                  className={`p-4 rounded-2xl border transition-all ${
                    isCurrentActive
                      ? 'bg-purple-950/40 border-pink-500/60 shadow-lg shadow-pink-500/10'
                      : 'bg-black/40 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-white font-mono">Tahun {item.tahun}</span>
                      {isCurrentActive && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500 text-white font-bold">
                          Sedang Aktif
                        </span>
                      )}
                    </div>

                    {!isCurrentActive && (
                      <button
                        type="button"
                        onClick={() => {
                          onYearChanged(item.tahun);
                          showToast(`Tahun aktif beralih ke ${item.tahun}`);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Pilih Tahun Ini
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-[10px] text-slate-400 block">Saldo Awal:</span>
                      <span className="font-bold text-white font-mono">{formatRupiah(item.saldoAwal)}</span>
                      {item.isLocked && (
                        <span className="text-[9px] text-amber-300 block mt-0.5">🔒 Terkunci (Carryover)</span>
                      )}
                    </div>

                    <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-[10px] text-slate-400 block">Saldo Realtime:</span>
                      <span className="font-bold text-pink-300 font-mono">{formatRupiah(item.saldoAkhir)}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">{item.transactionCount} Transaksi</span>
                    </div>

                    <div className="p-2 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-emerald-300">
                      <span className="text-[10px] text-emerald-300/80 block">Total Penerimaan:</span>
                      <span className="font-bold font-mono">+{formatRupiah(item.totalPenerimaan)}</span>
                    </div>

                    <div className="p-2 rounded-xl bg-rose-950/30 border border-rose-500/20 text-rose-300">
                      <span className="text-[10px] text-rose-300/80 block">Total Pengeluaran:</span>
                      <span className="font-bold font-mono">-{formatRupiah(item.totalPengeluaran)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL 1: TAMBAH / EDIT PENGGUNA */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-gradient-to-b from-slate-900 via-purple-950 to-slate-950 border border-white/20 p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-pink-400" />
                <span>{editingUser ? 'Edit Data Pengguna' : 'Tambah Pengguna Baru'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3.5 pt-3">
              <div>
                <label className="block text-xs font-semibold text-purple-200 mb-1">
                  Nama Lengkap & Gelar
                </label>
                <input
                  type="text"
                  required
                  value={userFormData.nama_lengkap}
                  onChange={(e) => setUserFormData({ ...userFormData, nama_lengkap: e.target.value })}
                  placeholder="Contoh: dr. Ahmad Fauzi, Sp.PD"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-200 mb-1">
                  Jabatan / Peran Tim
                </label>
                <input
                  type="text"
                  value={userFormData.jabatan}
                  onChange={(e) => setUserFormData({ ...userFormData, jabatan: e.target.value })}
                  placeholder="Contoh: Dokter Kloter / Paramedis Posko"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-200 mb-1">
                  Username Login
                </label>
                <input
                  type="text"
                  required
                  value={userFormData.username}
                  onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                  placeholder="Contoh: dokterfauzi"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs font-mono focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-purple-200 mb-1">
                  Kata Sandi {editingUser && <span className="text-[10px] text-slate-400 font-normal">(Kosongkan jika tidak diubah)</span>}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={userFormData.password}
                  onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  placeholder={editingUser ? '••••••••' : 'Masukkan kata sandi akun'}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-purple-200 mb-1">
                    Hak Akses (Role)
                  </label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:border-pink-500 focus:outline-none"
                  >
                    <option value="anggota" className="bg-slate-900">Petugas (Read Only)</option>
                    <option value="admin" className="bg-slate-900">Admin (Full CRUD)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-purple-200 mb-1">
                    Status Akun
                  </label>
                  <select
                    value={userFormData.status}
                    onChange={(e) => setUserFormData({ ...userFormData, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:border-pink-500 focus:outline-none"
                  >
                    <option value="aktif" className="bg-slate-900">Aktif</option>
                    <option value="nonaktif" className="bg-slate-900">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {savingUser ? 'Menyimpan...' : 'Simpan Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: INISIALISASI TAHUN BARU */}
      {isNewYearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-gradient-to-b from-slate-900 via-purple-950 to-slate-950 border border-white/20 p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-pink-400" />
                <span>Inisialisasi Tahun Database Baru</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNewYearModalOpen(false)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInitializeNewYear} className="space-y-3.5 pt-3">
              <div>
                <label className="block text-xs font-semibold text-purple-200 mb-1">
                  Tahun Baru (Angka 4 Digit)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 2027"
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-sm font-mono focus:border-pink-500 focus:outline-none"
                />
              </div>

              {/* Carryover preview info */}
              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-200 leading-relaxed">
                <div className="font-semibold text-pink-300 flex items-center gap-1.5 mb-1">
                  <Info className="w-3.5 h-3.5" />
                  <span>Kaidah Saldo Awal Otomatis:</span>
                </div>
                Jika tahun sebelumnya sudah ada di database, maka saldo awal tahun baru akan <b>otomatis terisi dari saldo akhir tahun sebelumnya dan terkunci</b>.
              </div>

              <div className="pt-2 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewYearModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingNewYear}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  {savingNewYear ? 'Membuat...' : 'Inisialisasi Tahun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

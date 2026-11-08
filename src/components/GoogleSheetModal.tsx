import React, { useState, useEffect } from 'react';
import { GoogleSheetsConfig, SheetsTestResult, SheetsBootstrapResult } from '../types/index.ts';
import { api } from '../utils/api.ts';
import {
  X,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
  ExternalLink,
  Shield,
  FileSpreadsheet,
  RotateCcw,
  HelpCircle,
  Info,
  Wand2,
  Sparkles,
  Download,
  CloudUpload,
  Server,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface GoogleSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GoogleSheetsConfig | null;
  isAdmin: boolean;
  onConfigUpdated: () => void;
}

export const GoogleSheetModal: React.FC<GoogleSheetModalProps> = ({
  isOpen,
  onClose,
  config,
  isAdmin,
  onConfigUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'serviceAccount' | 'vercel' | 'schema' | 'guide'>('status');

  // Input states
  const [sheetInput, setSheetInput] = useState<string>('');
  const [clientEmail, setClientEmail] = useState<string>('');
  const [privateKey, setPrivateKey] = useState<string>('');
  const [serviceAccountJson, setServiceAccountJson] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');

  const [testResult, setTestResult] = useState<SheetsTestResult | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<SheetsBootstrapResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && config) {
      if (config.status === 'error' && config.message) {
        setTestResult({
          success: false,
          message: config.message,
          errorType: (config.errorType as any) || 'UNKNOWN',
          suggestions: config.suggestions,
        });
      }
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const extractCleanSheetId = (input: string): string => {
    const clean = input.trim();
    const match = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return clean;
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testSheetsConnection();
      setTestResult(res);
      onConfigUpdated();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Gagal menghubungi server untuk menguji koneksi Google Sheets',
        errorType: 'NETWORK_ERROR',
        suggestions: ['Periksa koneksi internet dan pastikan backend server aktif.'],
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveServiceAccountConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      const cleanId = extractCleanSheetId(sheetInput);
      let email = clientEmail.trim();
      let pKey = privateKey.trim();

      // Jika user paste JSON Service Account utuh
      if (serviceAccountJson.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(serviceAccountJson);
          if (parsed.client_email) email = parsed.client_email;
          if (parsed.private_key) pKey = parsed.private_key;
        } catch {
          throw new Error('Format JSON Service Account tidak valid. Pastikan JSON terformat dengan benar.');
        }
      }

      if (!cleanId) {
        throw new Error('Spreadsheet_ID wajib diisi.');
      }
      if (!email) {
        throw new Error('Google_Services_Account (email) wajib diisi.');
      }
      if (!pKey) {
        throw new Error('Google_Private_Key wajib diisi.');
      }

      await api.updateSheetsConfig({
        sheetId: cleanId,
        clientEmail: email,
        privateKey: pKey,
      });

      onConfigUpdated();
      setActiveTab('status');
      await handleTestConnection();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan konfigurasi');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDemoMode = async () => {
    setIsResetting(true);
    setConfirmReset(false);
    try {
      await api.resetSheetsConfig();
      setSheetInput('');
      setClientEmail('');
      setPrivateKey('');
      setServiceAccountJson('');
      setApiKeyInput('');
      setTestResult(null);
      setFormError(null);
      onConfigUpdated();
      setActiveTab('status');
    } catch (err: any) {
      setFormError(err.message || 'Gagal mereset konfigurasi');
    } finally {
      setIsResetting(false);
    }
  };

  const handleBootstrapSheets = async () => {
    setIsBootstrapping(true);
    setBootstrapResult(null);
    setFormError(null);
    try {
      const res = await api.bootstrapSheets();
      setBootstrapResult(res);
      if (res.success) {
        onConfigUpdated();
        await handleTestConnection();
      }
    } catch (err: any) {
      setBootstrapResult({
        success: false,
        message: err.message || 'Gagal menginisialisasi lembar kerja otomatis',
        createdSheets: [],
        alreadyExisted: [],
        initializedHeaders: [],
        method: config?.authMethod || 'service_account',
      });
    } finally {
      setIsBootstrapping(false);
    }
  };

  const handleDownloadCsv = (sheetName: 'Pengaturan' | 'Users' | 'Saldo' | 'Transaksi') => {
    let content = '';
    if (sheetName === 'Pengaturan') {
      content = 'key,value,keterangan,updated_at\r\nnama_instansi,"UPTD Puskesmas Sehat Nusantara","Nama instansi",2026-05-01T00:00:00.000Z\r\npenanggung_jawab,"dr. H. Rahmat Hidayat, M.Kes","Pimpinan/PJ",2026-05-01T00:00:00.000Z\r\njabatan_penanggung_jawab,"Kepala UPTD Puskesmas","Jabatan penandatangan",2026-05-01T00:00:00.000Z\r\nnip_penanggung_jawab,"19780514 200501 1 008","NIP resmi",2026-05-01T00:00:00.000Z\r\ntahun_aktif,"2026","Tahun anggaran aktif",2026-05-01T00:00:00.000Z';
    } else if (sheetName === 'Users') {
      content = 'id,username,password_hash,role,nama_lengkap,jabatan,status,created_at\r\nusr-1,admin,admin123,admin,"dr. H. Rahmat Hidayat, M.Kes","Ketua Tim Haji",aktif,2026-01-01T00:00:00.000Z\r\nusr-2,petugas,petugas123,anggota,"Ns. Hj. Siti Nurjanah, S.Kep","Paramedis Kloter",aktif,2026-01-01T00:00:00.000Z';
    } else if (sheetName === 'Saldo') {
      content = 'id,tahun,saldo_awal_tahun_lalu,saldo_realtime,catatan,is_locked,saldo_akhir_sebelumnya,updated_at\r\nsld-2025,2025,10000000,12500000,"Sisa kas operasional 2024",FALSE,0,2025-12-31T23:59:59.000Z\r\nsld-2026,2026,12500000,28200000,"Carryover saldo akhir 2025",TRUE,12500000,2026-05-01T00:00:00.000Z';
    } else if (sheetName === 'Transaksi') {
      content = 'id,tanggal,jenis,nominal,sumber_dana,nama_penerima,keterangan,dibuat_oleh,tahun,created_at\r\nTRX-2026-001,2026-04-10,penerimaan,15000000,"Dana Operasional Dinkes",,"Pencairan Tahap 1 BOK Haji","Admin Petugas Haji",2026,2026-04-10T08:00:00.000Z\r\nTRX-2026-002,2026-04-18,pengeluaran,4200000,,"PT Kimia Farma Apotek","Pengadaan Obat Emergensi & Vitamin","Admin Petugas Haji",2026,2026-04-18T10:30:00.000Z';
    }
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${sheetName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasError = config?.status === 'error' || (testResult && !testResult.success);
  const isConnected = config?.status === 'connected' && (!testResult || testResult.success);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[94vh] flex flex-col rounded-3xl bg-gradient-to-b from-slate-900/95 via-purple-950/95 to-slate-950/95 border border-white/20 shadow-2xl p-4 sm:p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white shadow-md">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Database Google Spreadsheet</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  Read & Write
                </span>
              </h3>
              <p className="text-[11px] text-purple-200/70">
                Otentikasi Aman: <code>Google_Private_Key</code> + <code>Spreadsheet_ID</code> + <code>Google_Services_Account</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-5 gap-1 p-1 mt-3 rounded-xl bg-black/50 border border-white/10 shrink-0 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`py-1.5 rounded-lg transition-all text-center truncate cursor-pointer ${
              activeTab === 'status' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Status
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('serviceAccount')}
              className={`py-1.5 rounded-lg transition-all text-center truncate cursor-pointer ${
                activeTab === 'serviceAccount'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Kredensial
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('vercel')}
            className={`py-1.5 rounded-lg transition-all text-center truncate cursor-pointer ${
              activeTab === 'vercel'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-pink-300 hover:text-pink-100 font-bold'
            }`}
          >
            Deploy Vercel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`py-1.5 rounded-lg transition-all text-center truncate cursor-pointer ${
              activeTab === 'schema' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            4 Sheet
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`py-1.5 rounded-lg transition-all text-center truncate cursor-pointer ${
              activeTab === 'guide' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Panduan
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="mt-3.5 flex-1 overflow-y-auto no-scrollbar space-y-3.5 pr-1 text-xs">
          {/* TAB 1: STATUS & DIAGNOSTIK */}
          {activeTab === 'status' && (
            <div className="space-y-3.5">
              {/* STATUS CARD */}
              {hasError ? (
                /* ERROR CARD */
                <div className="p-4 rounded-2xl border bg-rose-950/40 border-rose-500/40 text-rose-200 space-y-3">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <div className="font-bold text-white text-sm flex items-center justify-between">
                        <span>Koneksi Google Spreadsheet Terkendala</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono uppercase">
                          {testResult?.errorType || config?.errorType || 'ERROR'}
                        </span>
                      </div>
                      <p className="text-rose-100 text-[11px] leading-relaxed">
                        {testResult?.message || config?.message}
                      </p>
                    </div>
                  </div>

                  {/* SOLUSI PERMISSION DENIED */}
                  {(testResult?.errorType === 'PERMISSION_DENIED' || config?.errorType === 'PERMISSION_DENIED') && (
                    <div className="p-3 rounded-xl bg-black/40 border border-amber-500/30 text-amber-200 text-[11px] space-y-2">
                      <div className="font-bold text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>Solusi Cepat (Beri Akses Editor ke Service Account):</span>
                      </div>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-200 text-[10px] leading-relaxed">
                        <li>Buka Google Spreadsheet Anda di browser.</li>
                        <li>Klik tombol biru <b>"Bagikan" (Share)</b> di pojok kanan atas.</li>
                        <li>
                          Tambahkan email Service Account:{' '}
                          <code className="text-pink-300 font-mono select-all">
                            {config?.clientEmail || 'Google_Services_Account'}
                          </code>
                        </li>
                        <li>
                          Pilih peran sebagai <b>"Editor"</b> agar aplikasi dapat membaca dan menyimpan transaksi keuangan haji.
                        </li>
                        <li>Klik <b>"Kirim / Bagikan"</b>, lalu klik tombol <b>"Tes Koneksi Sekarang"</b> di bawah.</li>
                      </ol>
                    </div>
                  )}

                  {/* SOLUSI UMUM */}
                  {(testResult?.suggestions || config?.suggestions) &&
                    testResult?.errorType !== 'PERMISSION_DENIED' &&
                    config?.errorType !== 'PERMISSION_DENIED' && (
                      <div className="p-2.5 rounded-xl bg-black/30 border border-rose-500/20 space-y-1">
                        <div className="font-semibold text-rose-300 text-[11px] flex items-center gap-1">
                          <Info className="w-3.5 h-3.5" />
                          <span>Langkah Perbaikan:</span>
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-rose-200/90 leading-relaxed">
                          {(testResult?.suggestions || config?.suggestions || []).map((sug, idx) => (
                            <li key={idx}>{sug}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('serviceAccount')}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] transition-all cursor-pointer"
                    >
                      Buka Form Kredensial Service Account
                    </button>
                  )}
                </div>
              ) : isConnected ? (
                /* CONNECTED CARD */
                <div className="p-4 rounded-2xl border bg-emerald-950/40 border-emerald-500/40 text-emerald-200 space-y-2">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <div className="font-bold text-white text-sm flex items-center justify-between">
                        <span>Terhubung ke Google Spreadsheet!</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                          {config?.authMethod === 'service_account' ? 'Service Account' : 'API Key'}
                        </span>
                      </div>
                      <p className="text-emerald-100 text-[11px] leading-relaxed">
                        {testResult?.message || config?.message}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[10px] font-mono">
                        {config?.sheetId && (
                          <div className="text-purple-300 truncate">Spreadsheet_ID: {config.sheetId}</div>
                        )}
                        {config?.clientEmail && (
                          <div className="text-emerald-300 truncate">Service_Account: {config.clientEmail}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* DEMO / LOCAL MODE CARD */
                <div className="p-4 rounded-2xl border bg-purple-950/40 border-purple-500/30 text-purple-200 space-y-2">
                  <div className="flex items-start gap-3">
                    <Database className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold text-white text-sm">
                        Mode Data Lokal Aktif (Standar Server)
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        Aplikasi saat ini menggunakan database in-memory lokal di server. Seluruh transaksi kas haji,
                        saldo realtime, dan ekspor laporan PDF berfungsi normal.
                      </p>
                      <p className="text-pink-300 text-[10px]">
                        Hubungkan Google Spreadsheet Anda dengan 3 variabel: <code>Spreadsheet_ID</code>, <code>Google_Services_Account</code>, dan <code>Google_Private_Key</code>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Menguji Akses...' : 'Tes Koneksi Sekarang'}</span>
                  </button>

                  {isAdmin && config?.isConfigured && (
                    confirmReset ? (
                      <div className="flex items-center gap-1.5 animate-fade-in">
                        <button
                          type="button"
                          onClick={handleResetToDemoMode}
                          disabled={isResetting}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                          <span>Konfirmasi Reset</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmReset(false)}
                          className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs transition-all cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmReset(true)}
                        disabled={isResetting}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-white/10 hover:border-rose-500/30 transition-all text-xs cursor-pointer"
                        title="Hapus konfigurasi dan kembali ke database lokal"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset ke Data Lokal</span>
                      </button>
                    )
                  )}
                </div>

                <span className="text-[10px] text-slate-400">
                  {config?.lastSynced ? `Sinkron: ${new Date(config.lastSynced).toLocaleTimeString('id-ID')}` : ''}
                </span>
              </div>

              {/* FITUR INISIALISASI 3 SHEET OTOMATIS */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/60 via-pink-950/40 to-purple-950/60 border border-pink-500/30 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-pink-500/20 text-pink-300 border border-pink-500/30">
                      <Wand2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Inisialisasi 3 Sheet & Header Otomatis</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-semibold">
                          Zero-Setup
                        </span>
                      </h4>
                      <p className="text-[11px] text-purple-200/70 mt-0.5">
                        Membuat lembar <b>Users</b>, <b>Saldo</b>, & <b>Transaksi</b> langsung tanpa menghapus data yang ada.
                      </p>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={handleBootstrapSheets}
                      disabled={isBootstrapping}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isBootstrapping ? 'animate-spin' : ''}`} />
                      <span>{isBootstrapping ? 'Menerapkan...' : 'Inisialisasi Spreadsheet'}</span>
                    </button>
                  )}
                </div>

                {bootstrapResult && (
                  <div
                    className={`p-2.5 rounded-xl text-[11px] flex items-start gap-2 ${
                      bootstrapResult.success
                        ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/20 border border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {bootstrapResult.success ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                    )}
                    <div className="leading-relaxed flex-1 font-semibold">
                      {bootstrapResult.message}
                    </div>
                  </div>
                )}
              </div>

              {/* CHECKLIST 4 SHEET DOKUMEN */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-pink-400" />
                    <span>Status 4 Lembar Kerja Standar:</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Tersinkronisasi Otomatis</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                    <span className="font-semibold text-slate-200 text-[11px]">1. Pengaturan</span>
                    <span className="text-[10px] text-sky-400 mt-1 font-medium">
                      {(testResult?.foundExpectedSheets?.pengaturan ?? config?.foundExpectedSheets?.pengaturan)
                        ? '✓ Terdeteksi'
                        : 'Siap dibuat'}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                    <span className="font-semibold text-slate-200 text-[11px]">2. Users</span>
                    <span className="text-[10px] text-emerald-400 mt-1 font-medium">
                      {(testResult?.foundExpectedSheets?.users ?? config?.foundExpectedSheets?.users)
                        ? '✓ Terdeteksi'
                        : 'Siap dibuat'}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                    <span className="font-semibold text-slate-200 text-[11px]">3. Saldo</span>
                    <span className="text-[10px] text-purple-400 mt-1 font-medium">
                      {(testResult?.foundExpectedSheets?.saldo ?? config?.foundExpectedSheets?.saldo)
                        ? '✓ Terdeteksi'
                        : 'Siap dibuat'}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                    <span className="font-semibold text-slate-200 text-[11px]">4. Transaksi</span>
                    <span className="text-[10px] text-pink-400 mt-1 font-medium">
                      {(testResult?.foundExpectedSheets?.transaksi ?? config?.foundExpectedSheets?.transaksi)
                        ? '✓ Terdeteksi'
                        : 'Siap dibuat'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PENGATURAN KREDENSIAL (3 VARIABEL UTAMA) */}
          {activeTab === 'serviceAccount' && isAdmin && (
            <form onSubmit={handleSaveServiceAccountConfig} className="space-y-3.5">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-[11px] flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="p-3 rounded-2xl bg-pink-950/30 border border-pink-500/30 text-pink-200 text-[11px] leading-relaxed space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-pink-400" />
                  <span>3 Variabel Utama Database Google Spreadsheet:</span>
                </div>
                <p className="text-slate-200/90 text-[10px]">
                  Cukup konfigurasikan 3 nilai berikut untuk membuka kemampuan <b>Membaca</b> dan <b>Menulis</b> transaksi langsung ke Google Spreadsheet tanpa OAuth prompt.
                </p>
              </div>

              {/* Variabel 1: Spreadsheet_ID */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-200 font-semibold text-[11px] flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 font-mono text-[10px]">1</span>
                    <span>Spreadsheet_ID (atau URL Dokumen)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopy('Spreadsheet_ID', 'v_sheet')}
                    className="text-[10px] text-pink-300 hover:text-white flex items-center gap-1"
                  >
                    {copiedText === 'v_sheet' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Salin Nama Variabel</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms atau paste URL spreadsheet lengkap"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-[11px] focus:border-pink-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Bisa ditempelkan berupa URL lengkap atau ID mentah di antara <code>/d/</code> dan <code>/edit</code>.
                </span>
              </div>

              {/* Variabel 2: Google_Services_Account */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-200 font-semibold text-[11px] flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 font-mono text-[10px]">2</span>
                    <span>Google_Services_Account (Email Service Account)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopy('Google_Services_Account', 'v_sa')}
                    className="text-[10px] text-pink-300 hover:text-white flex items-center gap-1"
                  >
                    {copiedText === 'v_sa' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Salin Nama Variabel</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Contoh: nama-sa@project-id.iam.gserviceaccount.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-[11px] focus:border-pink-500 focus:outline-none"
                />
                <span className="text-[10px] text-amber-300/90 mt-0.5 block">
                  <b>Penting:</b> Buka spreadsheet Anda, klik <b>Bagikan (Share)</b>, lalu tambahkan email ini sebagai <b>Editor</b>.
                </span>
              </div>

              {/* Variabel 3: Google_Private_Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-200 font-semibold text-[11px] flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 font-mono text-[10px]">3</span>
                    <span>Google_Private_Key (Private Key RSA)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopy('Google_Private_Key', 'v_pk')}
                    className="text-[10px] text-pink-300 hover:text-white flex items-center gap-1"
                  >
                    {copiedText === 'v_pk' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Salin Nama Variabel</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  required
                  placeholder="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQ...\n-----END PRIVATE KEY-----\n"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-[10px] focus:border-pink-500 focus:outline-none resize-none"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Kunci privat PEM aman. Format <code>\n</code> atau multiline akan dinormalisasi secara otomatis oleh server.
                </span>
              </div>

              {/* Opsional: Auto-Extract dari JSON */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-300 font-medium">
                    Atau: Tempel Langsung Seluruh Isi File JSON Kredensial
                  </span>
                  <span className="text-[10px] text-pink-300">Ekstrak Otomatis</span>
                </div>
                <textarea
                  rows={2}
                  placeholder={`Tempel file credentials.json di sini jika ingin auto-fill variabel di atas...`}
                  value={serviceAccountJson}
                  onChange={(e) => {
                    const val = e.target.value;
                    setServiceAccountJson(val);
                    if (val.trim().startsWith('{')) {
                      try {
                        const parsed = JSON.parse(val);
                        if (parsed.client_email) setClientEmail(parsed.client_email);
                        if (parsed.private_key) setPrivateKey(parsed.private_key);
                      } catch {
                        // ignore while typing
                      }
                    }
                  }}
                  className="w-full px-2.5 py-1 rounded-lg bg-black/30 border border-white/10 text-white font-mono text-[10px] focus:outline-none resize-none"
                />
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-600 via-fuchsia-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold transition-all shadow-lg shadow-pink-500/25 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Menyimpan & Menguji...' : 'Simpan & Uji Koneksi Database Spreadsheet'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PENGATURAN DEPLOY KE VERCEL (VERCEL.COM) */}
          {activeTab === 'vercel' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-black/80 via-purple-950/40 to-black/80 border border-white/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-white text-black flex items-center justify-center font-black text-xs">
                      ▲
                    </div>
                    <span className="font-bold text-white text-sm">Pengaturan Deploy di Vercel (vercel.com)</span>
                  </div>
                  <a
                    href="https://vercel.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-pink-300 hover:text-white inline-flex items-center gap-1 underline"
                  >
                    Buka Vercel Dashboard <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Proyek ini telah dikonfigurasi penuh dengan <code>vercel.json</code> dan Vercel Serverless Function (<code>/api/index.ts</code>). Frontend Vite dan backend API berjalan otomatis tanpa konfigurasi server tambahan!
                </p>
              </div>

              {/* 3 VARIABEL UNTUK VERCEL ENVIRONMENT VARIABLES */}
              <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/30 space-y-3">
                <div className="font-bold text-white text-xs flex items-center justify-between">
                  <span>Langkah 1: Masukkan 3 Variabel di Vercel Project Settings</span>
                  <span className="text-[10px] text-pink-300 font-mono">Environment Variables</span>
                </div>
                <p className="text-[10px] text-slate-300">
                  Buka proyek Anda di <b>vercel.com &gt; Settings &gt; Environment Variables</b>, lalu tambahkan:
                </p>

                {/* Card Var 1 */}
                <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-pink-300 font-bold text-xs">Spreadsheet_ID</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('Spreadsheet_ID', 'v_name1')}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'v_name1' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Salin Key</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Value: ID spreadsheet Anda dari URL dokumen Google Spreadsheet.
                  </div>
                </div>

                {/* Card Var 2 */}
                <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-purple-300 font-bold text-xs">Google_Services_Account</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('Google_Services_Account', 'v_name2')}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'v_name2' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Salin Key</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Value: Alamat email Service Account (contoh: <code>xxx@project-id.iam.gserviceaccount.com</code>).
                  </div>
                </div>

                {/* Card Var 3 */}
                <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-emerald-300 font-bold text-xs">Google_Private_Key</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('Google_Private_Key', 'v_name3')}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'v_name3' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Salin Key</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Value: Seluruh private key RSA (termasuk <code>-----BEGIN PRIVATE KEY-----</code> dan <code>-----END PRIVATE KEY-----</code>).
                  </div>
                </div>
              </div>

              {/* LANGKAH DEPLOY STEP-BY-STEP */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
                <span className="font-bold text-white text-xs block">
                  Langkah 2: Proses Deploy ke Vercel (Hanya 2 Menit):
                </span>
                <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
                  <li>
                    Pastikan perubahan telah di-commit dan push ke GitHub (misal repositori <code>DanaHajiNusantara</code>).
                  </li>
                  <li>
                    Buka <b>vercel.com &gt; Add New &gt; Project</b> lalu pilih repositori GitHub Anda.
                  </li>
                  <li>
                    Framework Preset akan terdeteksi otomatis sebagai <b>Vite</b>.
                  </li>
                  <li>
                    Buka bagian <b>Environment Variables</b>, lalu masukkan 3 variabel di atas.
                  </li>
                  <li>
                    Klik <b>Deploy</b>. Tunggu proses build selesai (~45 detik).
                  </li>
                  <li>
                    Aplikasi Anda kini tayang di domain Vercel (misal <code>https://dana-haji-nusantara.vercel.app</code>) dengan database spreadsheet aktif 24/7!
                  </li>
                </ol>
              </div>

              {/* TIPS KEAMANAN & RUNTIME */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 text-[11px] text-slate-300 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Keamanan Kredensial Terjamin:</span>
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Semua request dari browser menuju endpoint <code>/api/*</code> diproses di sisi Serverless Backend Vercel. <code>Google_Private_Key</code> dan <code>Google_Services_Account</code> tidak pernah terkirim ke browser pengguna.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: SKEMA 4 SHEET */}
          {activeTab === 'schema' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-900/60 via-pink-900/40 to-purple-900/60 border border-pink-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    <span>Inisialisasi 4 Sheet & Header Otomatis</span>
                  </h4>
                  <p className="text-[10px] text-purple-200/80 mt-0.5">
                    Membuat lembar kerja dan struktur tabel di Google Spreadsheet tanpa konfigurasi manual.
                  </p>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleBootstrapSheets}
                    disabled={isBootstrapping}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50 cursor-pointer"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${isBootstrapping ? 'animate-spin' : ''}`} />
                    <span>{isBootstrapping ? 'Menerapkan...' : 'Inisialisasi Sekarang'}</span>
                  </button>
                )}
              </div>

              {/* Sheet 1: Pengaturan */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-300">1. Sheet "Pengaturan"</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadCsv('Pengaturan')}
                      className="flex items-center gap-1 text-[10px] text-pink-300 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                      title="Unduh file CSV siap import ke Google Sheets"
                    >
                      <Download className="w-3 h-3" />
                      <span>Unduh CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('key,value,keterangan,updated_at', 'pengaturan')}
                      className="flex items-center gap-1 text-[11px] text-purple-300 hover:text-white cursor-pointer"
                    >
                      {copiedText === 'pengaturan' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin Header</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300">
                  Kolom: <code>key, value, keterangan, updated_at</code>
                </p>
                <div className="text-[10px] text-slate-400 bg-black/40 p-2 rounded-xl font-mono overflow-x-auto whitespace-pre">
                  nama_instansi | UPTD Puskesmas Sehat Nusantara | Nama resmi instansi{'\n'}
                  penanggung_jawab | dr. H. Rahmat Hidayat, M.Kes | Nama pimpinan / PJ
                </div>
              </div>

              {/* Sheet 2: Users */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300">2. Sheet "Users"</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadCsv('Users')}
                      className="flex items-center gap-1 text-[10px] text-pink-300 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                      title="Unduh file CSV siap import ke Google Sheets"
                    >
                      <Download className="w-3 h-3" />
                      <span>Unduh CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('id,username,password_hash,role,nama_lengkap,jabatan,status,created_at', 'users')}
                      className="flex items-center gap-1 text-[11px] text-purple-300 hover:text-white cursor-pointer"
                    >
                      {copiedText === 'users' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin Header</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300">
                  Kolom: <code>id, username, password_hash, role, nama_lengkap, jabatan, status, created_at</code>
                </p>
                <div className="text-[10px] text-slate-400 bg-black/40 p-2 rounded-xl font-mono overflow-x-auto whitespace-pre">
                  usr-1 | admin | admin123 | admin | dr. H. Rahmat Hidayat | Ketua Tim Haji | aktif{'\n'}
                  usr-2 | petugas | petugas123 | anggota | Ns. Hj. Siti Nurjanah | Paramedis Kloter | aktif
                </div>
              </div>

              {/* Sheet 3: Saldo */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-300">3. Sheet "Saldo"</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadCsv('Saldo')}
                      className="flex items-center gap-1 text-[10px] text-pink-300 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                      title="Unduh file CSV siap import ke Google Sheets"
                    >
                      <Download className="w-3 h-3" />
                      <span>Unduh CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('id,tahun,saldo_awal_tahun_lalu,saldo_realtime,catatan,is_locked,saldo_akhir_sebelumnya,updated_at', 'saldo')}
                      className="flex items-center gap-1 text-[11px] text-purple-300 hover:text-white cursor-pointer"
                    >
                      {copiedText === 'saldo' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin Header</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300">
                  Kolom: <code>id, tahun, saldo_awal_tahun_lalu, saldo_realtime, catatan, is_locked, saldo_akhir_sebelumnya, updated_at</code>
                </p>
                <div className="text-[10px] text-slate-400 bg-black/40 p-2 rounded-xl font-mono overflow-x-auto whitespace-pre">
                  sld-2025 | 2025 | 10000000 | 12500000 | Sisa kas operasional 2024 | FALSE | 0{'\n'}
                  sld-2026 | 2026 | 12500000 | 28200000 | Carryover saldo akhir 2025 | TRUE | 12500000
                </div>
              </div>

              {/* Sheet 4: Transaksi */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-pink-300">4. Sheet "Transaksi"</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadCsv('Transaksi')}
                      className="flex items-center gap-1 text-[10px] text-pink-300 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                      title="Unduh file CSV siap import ke Google Sheets"
                    >
                      <Download className="w-3 h-3" />
                      <span>Unduh CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          'id,tanggal,jenis,nominal,sumber_dana,nama_penerima,keterangan,dibuat_oleh,tahun,created_at',
                          'trx'
                        )
                      }
                      className="flex items-center gap-1 text-[11px] text-purple-300 hover:text-white cursor-pointer"
                    >
                      {copiedText === 'trx' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Salin Header</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300">
                  Kolom: <code>id, tanggal, jenis, nominal, sumber_dana, nama_penerima, keterangan, dibuat_oleh, tahun, created_at</code>
                </p>
                <div className="text-[10px] text-slate-400 bg-black/40 p-2 rounded-xl font-mono overflow-x-auto whitespace-pre">
                  TRX-2026-001 | 2026-04-10 | penerimaan | 15000000 | Dana BOK | | Pencairan Tahap 1 | Admin | 2026
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PANDUAN LENGKAP & SOLUSI MUDAH */}
          {activeTab === 'guide' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-pink-400" />
                  <span>Cara Mendapatkan Kredensial Service Account Google Cloud:</span>
                </div>

                <ol className="list-decimal pl-4 space-y-2 text-[11px] text-slate-300/90 leading-relaxed">
                  <li>
                    Buka{' '}
                    <a
                      href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                      target="_blank"
                      rel="noreferrer"
                      className="text-pink-300 underline font-semibold inline-flex items-center gap-1"
                    >
                      Google Cloud Service Accounts <ExternalLink className="w-3 h-3" />
                    </a>.
                  </li>
                  <li>
                    Pilih atau buat project Anda di Google Cloud.
                  </li>
                  <li>
                    Klik tombol <b>+ CREATE SERVICE ACCOUNT</b>. Beri nama (misal: <code>keuangan-haji-db</code>) lalu klik <b>Done</b>.
                  </li>
                  <li>
                    Salin alamat email yang baru terbentuk (misal: <code>keuangan-haji-db@project-id.iam.gserviceaccount.com</code>). Ini adalah <b>Google_Services_Account</b>.
                  </li>
                  <li>
                    Klik pada email Service Account tersebut &gt; tab <b>KEYS</b> &gt; klik <b>ADD KEY &gt; Create new key &gt; JSON</b>.
                  </li>
                  <li>
                    File JSON akan terunduh. Buka file tersebut dengan notepad:
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 text-purple-200">
                      <li><code>client_email</code> adalah nilai <b>Google_Services_Account</b>.</li>
                      <li><code>private_key</code> adalah nilai <b>Google_Private_Key</b>.</li>
                    </ul>
                  </li>
                  <li>
                    Buka dokumen Google Spreadsheet Anda, klik <b>Bagikan (Share)</b> di kanan atas, lalu tambahkan email Service Account sebagai <b>Editor</b>.
                  </li>
                </ol>
              </div>

              {/* SOLUSI ALTERNATIF LEBIH MUDAH */}
              <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/30 space-y-2 text-[11px]">
                <div className="font-bold text-amber-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Pertanyaan: "Apakah Ada Solusi yang Lebih Mudah?"</span>
                </div>

                <div className="space-y-1.5 text-slate-300 leading-relaxed text-[11px]">
                  <p>
                    <b>Metode Service Account dengan 3 Variabel ini adalah solusi terbaik & standar industri</b> karena:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-200">
                    <li>
                      <b>Zero-maintenance</b>: Tidak memerlukan popup login Google dari pengguna setiap kali membuka aplikasi.
                    </li>
                    <li>
                      <b>Mendukung Baca & Tulis Penuh</b>: Setiap transaksi baru langsung tercatat ke baris Google Spreadsheet secara real-time.
                    </li>
                    <li>
                      <b>Kompatibel 100% dengan Vercel Serverless</b>: Cukup isi 3 variabel di dashboard Vercel, semua berfungsi tanpa server tambahan.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

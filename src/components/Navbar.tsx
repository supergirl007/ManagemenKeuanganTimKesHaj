import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { GoogleSheetsConfig, AppConfig } from '../types/index.ts';
import { LogOut, Database, ShieldCheck, UserCheck, Settings, Calendar, ChevronDown, Check } from 'lucide-react';

interface NavbarProps {
  sheetConfig?: GoogleSheetsConfig | null;
  appConfig?: AppConfig | null;
  activeYear: string;
  availableYears: string[];
  currentTab: string;
  onYearChanged: (year: string) => void;
  onNavigateTab: (tab: any) => void;
  onOpenSheetModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  sheetConfig,
  appConfig,
  activeYear,
  availableYears,
  currentTab,
  onYearChanged,
  onNavigateTab,
  onOpenSheetModal,
}) => {
  const { user, isAdmin, logout } = useAuth();
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-gradient-to-r from-purple-950/85 via-slate-900/85 to-pink-950/85 backdrop-blur-xl border-b border-white/10 px-3 py-2 sm:px-6">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2.5">
        {/* Left: Brand & Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => onNavigateTab('dashboard')}
            className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-pink-500 p-0.5 shadow-lg shadow-purple-500/25 flex items-center justify-center shrink-0 cursor-pointer"
            title="Kembali ke Beranda"
          >
            <div className="w-full h-full bg-slate-950/60 rounded-[10px] flex items-center justify-center text-base">
              🕋
            </div>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm md:text-base font-bold text-white tracking-tight truncate">
                {appConfig?.nama_instansi || 'Keuangan Haji Puskesmas'}
              </h1>
            </div>

            {/* Subtitle / PJ info */}
            <p className="text-[10px] sm:text-[11px] text-purple-200/70 truncate">
              {appConfig?.penanggung_jawab ? `PJ: ${appConfig.penanggung_jawab}` : 'Tim Penyelenggara Kesehatan Haji'}
            </p>
          </div>
        </div>

        {/* Right Controls: Year Switcher, Pengaturan, Sheets, Role, Logout */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Year Switcher Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/40 text-pink-300 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
              title="Ganti Tahun Anggaran Database"
            >
              <Calendar className="w-3.5 h-3.5 text-pink-400" />
              <span>{activeYear}</span>
              <ChevronDown className="w-3 h-3 text-purple-300" />
            </button>

            {isYearDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsYearDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-1.5 w-44 rounded-2xl bg-slate-900 border border-white/20 shadow-2xl p-1.5 z-50 text-xs animate-fade-in">
                  <div className="px-2.5 py-1 text-[10px] text-purple-200/70 font-semibold uppercase tracking-wider border-b border-white/10 mb-1">
                    Tahun Database:
                  </div>
                  <div className="space-y-0.5">
                    {availableYears.map((yr) => {
                      const isSel = yr === activeYear;
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => {
                            onYearChanged(yr);
                            setIsYearDropdownOpen(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-xl font-mono text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            isSel
                              ? 'bg-pink-600 text-white font-bold'
                              : 'text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span>Tahun {yr}</span>
                          {isSel && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsYearDropdownOpen(false);
                        onNavigateTab('pengaturan');
                      }}
                      className="w-full mt-1.5 pt-1.5 border-t border-white/10 px-2 py-1 text-[10px] text-pink-300 hover:text-white flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>+ Kelola / Tambah Tahun</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Pengaturan Button (Admin Only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigateTab('pengaturan')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                currentTab === 'pengaturan'
                  ? 'bg-pink-600 border-pink-400 text-white shadow-md shadow-pink-600/30'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200 hover:text-white'
              }`}
              title="Menu Pengaturan Aplikasi (Khusus Admin)"
            >
              <Settings className={`w-3.5 h-3.5 ${currentTab === 'pengaturan' ? 'animate-spin-slow' : ''}`} />
              <span className="hidden md:inline">Pengaturan</span>
            </button>
          )}

          {/* Google Sheets Status Pill */}
          <button
            type="button"
            onClick={onOpenSheetModal}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
              sheetConfig?.status === 'connected'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : sheetConfig?.status === 'error'
                ? 'bg-rose-500/20 border-rose-400/40 text-rose-300 hover:bg-rose-500/30'
                : 'bg-purple-500/20 border-purple-400/30 text-purple-200 hover:bg-purple-500/30'
            }`}
            title="Klik untuk melihat konfigurasi Google Spreadsheet"
            aria-label="Status Google Spreadsheet"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">
              {sheetConfig?.status === 'connected'
                ? 'Sheets Terhubung'
                : sheetConfig?.status === 'error'
                ? 'Periksa Sheets'
                : 'Data Lokal'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                sheetConfig?.status === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : sheetConfig?.status === 'error'
                  ? 'bg-rose-400'
                  : 'bg-purple-400'
              }`}
            />
          </button>

          {/* User Role Pill */}
          <div
            className={`hidden xl:flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              isAdmin
                ? 'bg-amber-500/15 border-amber-400/30 text-amber-200'
                : 'bg-sky-500/15 border-sky-400/30 text-sky-200'
            }`}
          >
            {isAdmin ? <ShieldCheck className="w-3.5 h-3.5 text-amber-300" /> : <UserCheck className="w-3.5 h-3.5 text-sky-300" />}
            <span>{isAdmin ? 'ADMIN' : 'PETUGAS'}</span>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={logout}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 hover:text-white transition-all text-xs font-medium flex items-center gap-1"
            title="Keluar dari akun"
            aria-label="Logout"
          >
            <LogOut className="w-3.5 h-3.5 text-pink-300" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
};

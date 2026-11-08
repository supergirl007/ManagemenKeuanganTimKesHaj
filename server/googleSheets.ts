import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import {
  User,
  SaldoRecord,
  Transaction,
  AppConfig,
  GoogleSheetsConfig,
  SheetsTestResult,
  SheetsBootstrapResult,
  YearInfo,
} from '../src/types/index.ts';
import { initialUsers, initialSaldoList, initialTransactions, initialAppConfig } from './seedData.ts';
import { calculateFinancialSummary, parseRupiah, getTransactionCategory } from '../src/utils/finance.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE_PATH = path.resolve(__dirname, 'sheets-config.json');

/**
 * Ekstrak Spreadsheet ID dari format URL lengkap atau string ID mentah
 */
export function extractSheetId(input: string): string {
  if (!input) return '';
  const clean = input.trim();
  const match = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return clean;
}

/**
 * Normalisasi tahun ke format numerik 4 digit (misal: "1447 H / 2026 M" -> 2026, "2026" -> 2026)
 */
export function extractNumericYear(yearStr: string): number {
  if (!yearStr) return new Date().getFullYear();
  const clean = String(yearStr).trim();
  const match = clean.match(/\b(20\d{2}|19\d{2})\b/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  const digits = clean.replace(/[^0-9]/g, '');
  if (digits.length >= 4) {
    return parseInt(digits.slice(-4), 10);
  }
  return new Date().getFullYear();
}

/**
 * Pembersihan dan normalisasi Google Private Key
 */
export function cleanPrivateKey(rawKey: string): string {
  if (!rawKey) return '';
  let key = rawKey.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, '\n');
  return key;
}

/**
 * Deteksi dan parsing jika user menempel seluruh file JSON Service Account
 */
export function parsePossibleServiceAccountJson(val: string): { clientEmail?: string; privateKey?: string } | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed.startsWith('{') && (trimmed.includes('client_email') || trimmed.includes('private_key'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: parsed.private_key || parsed.privateKey,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Membaca variabel lingkungan dengan dukungan fleksibel
 */
function resolveEnvironmentConfig() {
  const env = process.env;

  const rawSheetId =
    env.Spreadsheet_ID ||
    env.SPREADSHEET_ID ||
    env.spreadsheet_id ||
    env.GOOGLE_SHEET_ID ||
    env.google_sheet_id ||
    env.SHEET_ID ||
    '';

  const rawServiceAccount =
    env.Google_Services_Account ||
    env.GOOGLE_SERVICES_ACCOUNT ||
    env.google_services_account ||
    env.Google_Service_Account ||
    env.GOOGLE_SERVICE_ACCOUNT ||
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    env.client_email ||
    env.CLIENT_EMAIL ||
    '';

  const rawPrivateKey =
    env.Google_Private_Key ||
    env.GOOGLE_PRIVATE_KEY ||
    env.google_private_key ||
    env.private_key ||
    env.PRIVATE_KEY ||
    '';

  const rawApiKey =
    env.Google_API_Key ||
    env.GOOGLE_API_KEY ||
    env.GOOGLE_SHEETS_API_KEY ||
    env.google_sheets_api_key ||
    env.API_KEY ||
    '';

  let clientEmail = rawServiceAccount.trim();
  let privateKey = cleanPrivateKey(rawPrivateKey);

  const jsonFromSa = parsePossibleServiceAccountJson(rawServiceAccount);
  const jsonFromPk = parsePossibleServiceAccountJson(rawPrivateKey);
  const activeJson = jsonFromSa || jsonFromPk;

  if (activeJson) {
    if (activeJson.clientEmail) clientEmail = activeJson.clientEmail.trim();
    if (activeJson.privateKey) privateKey = cleanPrivateKey(activeJson.privateKey);
  }

  return {
    sheetId: extractSheetId(rawSheetId),
    clientEmail,
    privateKey,
    apiKey: rawApiKey.trim(),
  };
}

function loadPersistedConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        sheetId: extractSheetId(parsed.sheetId || ''),
        apiKey: parsed.apiKey || '',
        clientEmail: (parsed.clientEmail || '').trim(),
        privateKey: cleanPrivateKey(parsed.privateKey || ''),
      };
    }
  } catch (err) {
    // Read-only serverless environment fallback
  }
  return null;
}

function savePersistedConfig(cfg: { sheetId: string; apiKey: string; clientEmail: string; privateKey: string }) {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    // Vercel serverless / read-only filesystem handling
  }
}

// ==============================================================================
// IN-MEMORY DATABASE STORES
// ==============================================================================
let memoryAppConfig: AppConfig = { ...initialAppConfig };
let memoryUsers: User[] = [...initialUsers];
let memorySaldoList: SaldoRecord[] = [...initialSaldoList];
let memoryTransactions: Transaction[] = [...initialTransactions];

const envConfig = resolveEnvironmentConfig();
const persisted = loadPersistedConfig();

let config = {
  sheetId: envConfig.sheetId || persisted?.sheetId || '',
  clientEmail: envConfig.clientEmail || persisted?.clientEmail || '',
  privateKey: envConfig.privateKey || persisted?.privateKey || '',
  apiKey: envConfig.apiKey || persisted?.apiKey || '',
};

let lastSpreadsheetTitle = '';
let verifiedConnected = false;
let lastErrorMessage = '';
let lastErrorType = '';
let lastSuggestions: string[] = [];
let lastSyncedAt = '';
let isBootstrapped = false;

let lastFoundExpectedSheets = {
  users: true,
  saldo: true,
  transaksi: true,
  pengaturan: true,
};

// ==============================================================================
// MULTI-YEAR RECALCULATION & CARRYOVER ENGINE
// ==============================================================================
/**
 * Menghitung ulang saldo seluruh tahun dengan logika carryover otomatis:
 * - Mengurutkan tahun secara kronologis (misal: 2024 -> 2025 -> 2026 -> 2027)
 * - Untuk tahun Y: jika tahun Y-1 ada di database, maka saldo_awal(Y) = saldo_akhir(Y-1),
 *   dan kondisi terkunci (is_locked = true).
 * - Jika tahun Y-1 belum ada: saldo_awal dapat diisi manual (is_locked = false).
 */
export function recalculateAllSaldoes(): void {
  // Dapatkan seluruh tahun unik dari memorySaldoList dan memoryTransactions
  const yearSet = new Set<string>();
  memorySaldoList.forEach((s) => yearSet.add(s.tahun));
  memoryTransactions.forEach((t) => {
    const y = t.tahun || t.tanggal.slice(0, 4);
    if (y) yearSet.add(y);
  });
  if (memoryAppConfig.tahun_aktif) {
    yearSet.add(memoryAppConfig.tahun_aktif);
  }

  // Urutkan tahun berdasarkan angka tahun (ascending: 2024, 2025, 2026...)
  const sortedYears = Array.from(yearSet).sort((a, b) => extractNumericYear(a) - extractNumericYear(b));

  // Pastikan setiap tahun memiliki record di memorySaldoList
  for (const yr of sortedYears) {
    if (!memorySaldoList.some((s) => s.tahun === yr)) {
      memorySaldoList.push({
        id: `sld-${yr}`,
        tahun: yr,
        saldo_awal_tahun_lalu: 0,
        saldo_realtime: 0,
        catatan: `Kas Operasional Musim Haji Tahun ${yr}`,
        is_locked: false,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Proses perhitungan kronologis berantai
  let prevEndingBalance: number | null = null;
  let prevYearName: string | null = null;

  for (let i = 0; i < sortedYears.length; i++) {
    const yr = sortedYears[i];
    const saldoIndex = memorySaldoList.findIndex((s) => s.tahun === yr);
    if (saldoIndex === -1) continue;

    const saldoRecord = memorySaldoList[saldoIndex];
    const numYr = extractNumericYear(yr);

    // Cek apakah ada tahun sebelumnya (i > 0)
    if (i > 0 && prevEndingBalance !== null) {
      // Tahun ini memiliki tahun sebelumnya -> Saldo awal TERKUNCI OTOMATIS
      saldoRecord.saldo_awal_tahun_lalu = prevEndingBalance;
      saldoRecord.saldo_akhir_sebelumnya = prevEndingBalance;
      saldoRecord.is_locked = true;
      if (!saldoRecord.catatan || saldoRecord.catatan.includes('Sisa saldo operasional')) {
        saldoRecord.catatan = `Sisa saldo akhir tahun ${prevYearName || 'sebelumnya'}`;
      }
    } else {
      // Tahun paling awal dalam database -> Bebas diatur
      saldoRecord.is_locked = false;
      saldoRecord.saldo_akhir_sebelumnya = undefined;
    }

    // Hitung total penerimaan dan pengeluaran pada tahun ini
    const yrTrx = memoryTransactions.filter((t) => {
      const tYr = t.tahun || t.tanggal.slice(0, 4);
      return tYr === yr || extractNumericYear(t.tanggal) === numYr;
    });

    let totalPenerimaan = 0;
    let totalPengeluaran = 0;
    for (const t of yrTrx) {
      const nom = Math.abs(Number(t.nominal) || 0);
      if (t.jenis === 'penerimaan') totalPenerimaan += nom;
      else if (t.jenis === 'pengeluaran') totalPengeluaran += nom;
    }

    const endingBalance = saldoRecord.saldo_awal_tahun_lalu + totalPenerimaan - totalPengeluaran;
    saldoRecord.saldo_realtime = endingBalance;
    saldoRecord.updated_at = new Date().toISOString();

    // Simpan ending balance untuk tahun berikutnya
    prevEndingBalance = endingBalance;
    prevYearName = yr;
  }
}

// Inisialisasi awal kalkulasi
recalculateAllSaldoes();

// ==============================================================================
// SERVICE ACCOUNT & AUTH DETECTION
// ==============================================================================
export function getActiveAuthMethod(): GoogleSheetsConfig['authMethod'] {
  const hasSheetId = Boolean(config.sheetId && config.sheetId.trim().length >= 10);
  const hasServiceAccount = Boolean(
    config.clientEmail &&
    config.clientEmail.includes('@') &&
    config.privateKey &&
    config.privateKey.includes('-----BEGIN')
  );

  if (hasSheetId && hasServiceAccount) {
    return 'service_account';
  }

  const hasApiKey = Boolean(config.apiKey && config.apiKey.startsWith('AIza') && config.apiKey.length >= 25);
  if (hasSheetId && hasApiKey) {
    return 'api_key';
  }

  return 'demo_mode';
}

export function getServiceAccountClient() {
  const method = getActiveAuthMethod();
  if (method !== 'service_account') {
    return null;
  }

  try {
    const auth = new google.auth.JWT({
      email: config.clientEmail.trim(),
      key: cleanPrivateKey(config.privateKey),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });
    return google.sheets({ version: 'v4', auth });
  } catch (err: any) {
    console.error('[Google Sheets] JWT Init Error:', err?.message);
    return null;
  }
}

export function getSheetsConfigStatus(): GoogleSheetsConfig {
  const method = getActiveAuthMethod();
  const isConfigured = method !== 'demo_mode';

  let status: 'connected' | 'demo_mode' | 'error' = 'demo_mode';
  let message = 'Mode Data Lokal Aktif (Data tersimpan di server, siap dihubungkan ke Google Sheets)';

  if (isConfigured) {
    if (lastErrorMessage) {
      status = 'error';
      message = lastErrorMessage;
    } else if (verifiedConnected) {
      status = 'connected';
      message =
        method === 'service_account'
          ? `Terhubung ke Google Spreadsheet "${lastSpreadsheetTitle || 'Aktif'}" via Service Account (Read & Write)`
          : `Terhubung via API Key (Read-Only)`;
    } else {
      status = 'connected';
      message =
        method === 'service_account'
          ? `Kredensial Service Account terdeteksi (${config.clientEmail}). Siap untuk membaca dan menulis data.`
          : 'Kredensial API Key terdeteksi.';
    }
  }

  const maskedSheetId = config.sheetId ? `${config.sheetId.slice(0, 6)}...${config.sheetId.slice(-4)}` : '';
  const maskedEmail = config.clientEmail
    ? `${config.clientEmail.split('@')[0].slice(0, 5)}...@${config.clientEmail.split('@')[1] || ''}`
    : '';

  return {
    sheetId: maskedSheetId,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 5)}...` : '',
    clientEmail: maskedEmail,
    authMethod: method,
    isConfigured,
    status,
    message,
    errorType: lastErrorType || undefined,
    suggestions: lastSuggestions.length > 0 ? lastSuggestions : undefined,
    spreadsheetTitle: lastSpreadsheetTitle || 'Google Spreadsheet Keuangan Haji',
    foundExpectedSheets: lastFoundExpectedSheets,
    lastSynced: lastSyncedAt || new Date().toISOString(),
  };
}

export function updateSheetsConfig(newConfig: {
  sheetId?: string;
  apiKey?: string;
  clientEmail?: string;
  privateKey?: string;
}) {
  if (newConfig.sheetId !== undefined) {
    config.sheetId = extractSheetId(newConfig.sheetId);
  }

  const possibleJson = newConfig.apiKey || newConfig.privateKey || newConfig.clientEmail || '';
  const jsonParsed = parsePossibleServiceAccountJson(possibleJson);
  if (jsonParsed) {
    if (jsonParsed.clientEmail) config.clientEmail = jsonParsed.clientEmail;
    if (jsonParsed.privateKey) config.privateKey = cleanPrivateKey(jsonParsed.privateKey);
  } else {
    if (newConfig.clientEmail !== undefined) config.clientEmail = newConfig.clientEmail.trim();
    if (newConfig.privateKey !== undefined) config.privateKey = cleanPrivateKey(newConfig.privateKey);
    if (newConfig.apiKey !== undefined) config.apiKey = newConfig.apiKey.trim();
  }

  savePersistedConfig(config);
  verifiedConnected = false;
  lastErrorMessage = '';
  lastErrorType = '';
  lastSuggestions = [];
  isBootstrapped = false;
}

export function resetSheetsConfig() {
  config = { sheetId: '', apiKey: '', clientEmail: '', privateKey: '' };
  verifiedConnected = false;
  lastErrorMessage = '';
  lastErrorType = '';
  lastSuggestions = [];
  lastSpreadsheetTitle = '';
  savePersistedConfig(config);
}

function handleGoogleApiError(err: any): { errorType: string; message: string; suggestions: string[] } {
  const rawMsg = err?.message || String(err);
  const status = err?.status || err?.code;

  if (rawMsg.includes('permission') || rawMsg.includes('403') || status === 403) {
    return {
      errorType: 'PERMISSION_DENIED',
      message: `Akses ditolak: Google Spreadsheet belum dibagikan ke Service Account (${config.clientEmail || 'email Anda'}).`,
      suggestions: [
        'Buka dokumen Google Spreadsheet Anda di browser.',
        'Klik tombol biru "Bagikan" (Share) di pojok kanan atas.',
        `Tambahkan email Service Account: "${config.clientEmail}" dengan peran sebagai "Editor".`,
        'Pastikan centang "Beritahu orang" dilepas, lalu klik "Bagikan".',
      ],
    };
  }

  if (rawMsg.includes('not found') || rawMsg.includes('404') || status === 404) {
    return {
      errorType: 'SHEET_NOT_FOUND',
      message: `Google Spreadsheet dengan ID "${config.sheetId}" tidak ditemukan (404 Not Found).`,
      suggestions: [
        'Periksa kembali Spreadsheet_ID yang Anda masukkan.',
        'ID Spreadsheet dapat ditemukan pada URL dokumen di antara "/d/" dan "/edit".',
      ],
    };
  }

  return {
    errorType: 'UNKNOWN',
    message: `Kendala koneksi Google Sheets API: ${rawMsg}`,
    suggestions: [
      'Periksa koneksi internet server dan pastikan izin Service Account sudah lengkap.',
    ],
  };
}

// ==============================================================================
// BOOTSTRAP 4 LEMBAR KERJA (USERS, SALDO, TRANSAKSI, PENGATURAN)
// ==============================================================================
export async function ensureSheetsAndHeadersExist(): Promise<SheetsBootstrapResult> {
  const method = getActiveAuthMethod();

  if (method !== 'service_account') {
    return {
      success: false,
      message: 'Inisialisasi otomatis memerlukan otentikasi Service Account.',
      createdSheets: [],
      alreadyExisted: [],
      initializedHeaders: [],
      method,
    };
  }

  const client = getServiceAccountClient();
  if (!client) {
    return {
      success: false,
      message: 'Kredensial Service Account belum lengkap.',
      createdSheets: [],
      alreadyExisted: [],
      initializedHeaders: [],
      method: 'service_account',
    };
  }

  try {
    const meta = await client.spreadsheets.get({ spreadsheetId: config.sheetId });
    lastSpreadsheetTitle = meta.data.properties?.title || 'Google Spreadsheet Keuangan Haji';
    const existingTitles = (meta.data.sheets || []).map((s) => s.properties?.title || '');

    const targetSheets = [
      {
        title: 'Pengaturan',
        header: ['key', 'value', 'updated_at'],
        seedRows: [
          ['nama_instansi', memoryAppConfig.nama_instansi, new Date().toISOString()],
          ['penanggung_jawab', memoryAppConfig.penanggung_jawab, new Date().toISOString()],
          ['jabatan_penanggung_jawab', memoryAppConfig.jabatan_penanggung_jawab, new Date().toISOString()],
          ['nip_penanggung_jawab', memoryAppConfig.nip_penanggung_jawab || '', new Date().toISOString()],
          ['tahun_aktif', memoryAppConfig.tahun_aktif || '2026', new Date().toISOString()],
        ],
      },
      {
        title: 'Users',
        header: ['id', 'username', 'password_hash', 'role', 'nama_lengkap', 'jabatan', 'status', 'created_at'],
        seedRows: memoryUsers.map((u) => [
          u.id,
          u.username,
          u.password_hash,
          u.role,
          u.nama_lengkap,
          u.jabatan || '',
          u.status || 'aktif',
          u.created_at || new Date().toISOString(),
        ]),
      },
      {
        title: 'Saldo',
        header: ['id', 'tahun', 'saldo_awal_tahun_lalu', 'saldo_realtime', 'catatan', 'is_locked', 'updated_at'],
        seedRows: memorySaldoList.map((s) => [
          s.id,
          s.tahun,
          s.saldo_awal_tahun_lalu,
          s.saldo_realtime,
          s.catatan || '',
          s.is_locked ? 'true' : 'false',
          s.updated_at || new Date().toISOString(),
        ]),
      },
      {
        title: 'Transaksi',
        header: ['id', 'tanggal', 'jenis', 'nominal', 'sumber_dana', 'nama_penerima', 'keterangan', 'dibuat_oleh', 'created_at', 'tahun'],
        seedRows: memoryTransactions.map((t) => [
          t.id,
          t.tanggal,
          t.jenis,
          t.nominal,
          t.sumber_dana || '',
          t.nama_penerima || '',
          t.keterangan,
          t.dibuat_oleh || '',
          t.created_at || '',
          t.tahun || t.tanggal.slice(0, 4),
        ]),
      },
    ];

    const createdSheets: string[] = [];
    const alreadyExisted: string[] = [];
    const initializedHeaders: string[] = [];

    const missingSheets = targetSheets.filter(
      (ts) => !existingTitles.some((et) => et.trim().toLowerCase() === ts.title.toLowerCase())
    );

    if (missingSheets.length > 0) {
      const requests = missingSheets.map((ms) => ({
        addSheet: {
          properties: {
            title: ms.title,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      }));

      await client.spreadsheets.batchUpdate({
        spreadsheetId: config.sheetId,
        requestBody: { requests },
      });

      missingSheets.forEach((ms) => createdSheets.push(ms.title));
    }

    targetSheets.forEach((ts) => {
      if (!createdSheets.includes(ts.title)) {
        alreadyExisted.push(ts.title);
      }
    });

    for (const ts of targetSheets) {
      if (createdSheets.includes(ts.title)) {
        await client.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: `${ts.title}!A1:${String.fromCharCode(64 + ts.header.length)}${ts.seedRows.length + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [ts.header, ...ts.seedRows],
          },
        });
        initializedHeaders.push(ts.title);
      } else {
        try {
          const checkRes = await client.spreadsheets.values.get({
            spreadsheetId: config.sheetId,
            range: `${ts.title}!A1:A1`,
          });
          const hasContent = checkRes.data.values && checkRes.data.values.length > 0;
          if (!hasContent) {
            await client.spreadsheets.values.update({
              spreadsheetId: config.sheetId,
              range: `${ts.title}!A1:${String.fromCharCode(64 + ts.header.length)}1`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [ts.header] },
            });
            initializedHeaders.push(ts.title);
          }
        } catch {}
      }
    }

    isBootstrapped = true;
    verifiedConnected = true;
    lastErrorMessage = '';
    lastErrorType = '';
    lastSuggestions = [];

    lastFoundExpectedSheets = {
      users: true,
      saldo: true,
      transaksi: true,
      pengaturan: true,
    };

    return {
      success: true,
      message: `Inisialisasi 4 lembar kerja (Pengaturan, Users, Saldo, Transaksi) berhasil!`,
      createdSheets,
      alreadyExisted,
      initializedHeaders,
      method: 'service_account',
    };
  } catch (err: any) {
    const errorDetails = handleGoogleApiError(err);
    lastErrorMessage = errorDetails.message;
    lastErrorType = errorDetails.errorType;
    lastSuggestions = errorDetails.suggestions;
    verifiedConnected = false;

    return {
      success: false,
      message: errorDetails.message,
      createdSheets: [],
      alreadyExisted: [],
      initializedHeaders: [],
      method: 'service_account',
    };
  }
}

export const bootstrapSheets = ensureSheetsAndHeadersExist;

export async function testSheetsConnection(): Promise<SheetsTestResult> {
  const method = getActiveAuthMethod();

  if (method === 'demo_mode') {
    return {
      success: false,
      message: 'Belum ada kredensial Google Spreadsheet yang dikonfigurasi.',
      errorType: 'UNKNOWN',
      suggestions: ['Konfigurasikan Spreadsheet_ID, Google_Services_Account, dan Google_Private_Key.'],
    };
  }

  if (method === 'service_account') {
    const client = getServiceAccountClient();
    if (!client) {
      return {
        success: false,
        message: 'Kredensial Service Account belum lengkap.',
        errorType: 'INVALID_CREDENTIALS',
      };
    }

    try {
      const res = await client.spreadsheets.get({ spreadsheetId: config.sheetId });
      const titles = (res.data.sheets || []).map((s) => s.properties?.title || '');
      const docTitle = res.data.properties?.title || 'Google Spreadsheet';
      lastSpreadsheetTitle = docTitle;

      const hasUsers = titles.some((t) => t.trim().toLowerCase() === 'users');
      const hasSaldo = titles.some((t) => t.trim().toLowerCase() === 'saldo');
      const hasTransaksi = titles.some((t) => t.trim().toLowerCase() === 'transaksi');
      const hasPengaturan = titles.some((t) => t.trim().toLowerCase() === 'pengaturan');

      lastFoundExpectedSheets = {
        users: hasUsers,
        saldo: hasSaldo,
        transaksi: hasTransaksi,
        pengaturan: hasPengaturan,
      };

      if (!hasUsers || !hasSaldo || !hasTransaksi || !hasPengaturan) {
        await ensureSheetsAndHeadersExist();
      }

      verifiedConnected = true;
      lastErrorMessage = '';
      lastErrorType = '';
      lastSuggestions = [];
      lastSyncedAt = new Date().toISOString();

      return {
        success: true,
        message: `Koneksi Berhasil! Terhubung ke Google Spreadsheet "${docTitle}" via Service Account (Read & Write aktif).`,
        sheetNames: titles,
        spreadsheetTitle: docTitle,
        foundExpectedSheets: {
          users: true,
          saldo: true,
          transaksi: true,
          pengaturan: true,
        },
      };
    } catch (err: any) {
      const errInfo = handleGoogleApiError(err);
      verifiedConnected = false;
      lastErrorMessage = errInfo.message;
      lastErrorType = errInfo.errorType;
      lastSuggestions = errInfo.suggestions;

      return {
        success: false,
        message: errInfo.message,
        errorType: errInfo.errorType,
        suggestions: errInfo.suggestions,
      };
    }
  }

  return { success: false, message: 'Metode otentikasi tidak valid.' };
}

// ==============================================================================
// SINKRONISASI LENGKAP SEMUA DATABASE KE GOOGLE SPREADSHEET
// ==============================================================================
export async function syncAllDatabasesWithSpreadsheet(): Promise<{
  success: boolean;
  message: string;
  spreadsheetTitle?: string;
  foundExpectedSheets: { users: boolean; saldo: boolean; transaksi: boolean; pengaturan?: boolean };
  syncedCounts: { users: number; saldo: number; transaksi: number };
}> {
  const method = getActiveAuthMethod();

  if (method === 'demo_mode') {
    recalculateAllSaldoes();
    return {
      success: true,
      message: 'Mode Data Lokal Aktif.',
      foundExpectedSheets: { users: true, saldo: true, transaksi: true, pengaturan: true },
      syncedCounts: {
        users: memoryUsers.length,
        saldo: memorySaldoList.length,
        transaksi: memoryTransactions.length,
      },
    };
  }

  if (method === 'service_account') {
    const client = getServiceAccountClient();
    if (!client) {
      return {
        success: false,
        message: 'Kredensial Service Account belum lengkap.',
        foundExpectedSheets: lastFoundExpectedSheets,
        syncedCounts: { users: memoryUsers.length, saldo: memorySaldoList.length, transaksi: memoryTransactions.length },
      };
    }

    try {
      if (!isBootstrapped) {
        await ensureSheetsAndHeadersExist().catch(() => null);
      }

      // 1. Baca Sheet Pengaturan
      try {
        const cfgRes = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Pengaturan!A2:C',
        });
        const rows = cfgRes.data.values;
        if (rows && rows.length > 0) {
          for (const row of rows) {
            const key = String(row[0] || '').trim();
            const val = String(row[1] || '').trim();
            if (key === 'nama_instansi' && val) memoryAppConfig.nama_instansi = val;
            if (key === 'penanggung_jawab' && val) memoryAppConfig.penanggung_jawab = val;
            if (key === 'jabatan_penanggung_jawab' && val) memoryAppConfig.jabatan_penanggung_jawab = val;
            if (key === 'nip_penanggung_jawab' && val) memoryAppConfig.nip_penanggung_jawab = val;
            if (key === 'tahun_aktif' && val) memoryAppConfig.tahun_aktif = val;
          }
          memoryAppConfig.updated_at = new Date().toISOString();
        }
      } catch (e) {
        console.warn('Sync Pengaturan error:', e);
      }

      // 2. Baca Sheet Users
      try {
        const userRes = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Users!A2:H',
        });
        const rows = userRes.data.values;
        if (rows && rows.length > 0) {
          const parsed: User[] = rows
            .filter((r) => r && r[1] && String(r[1]).trim() !== '')
            .map((row, idx) => ({
              id: String(row[0] || '').trim() || `usr-${idx + 1}`,
              username: String(row[1] || '').trim(),
              password_hash: String(row[2] || '').trim() || 'petugas123',
              role: (String(row[3] || '').trim().toLowerCase() === 'admin' ? 'admin' : 'anggota') as 'admin' | 'anggota',
              nama_lengkap: String(row[4] || row[1] || 'Petugas').trim(),
              jabatan: String(row[5] || 'Petugas Tim Haji').trim(),
              status: (String(row[6] || '').trim().toLowerCase() === 'nonaktif' ? 'nonaktif' : 'aktif') as 'aktif' | 'nonaktif',
              created_at: String(row[7] || '').trim() || new Date().toISOString(),
            }));
          if (parsed.length > 0) memoryUsers = parsed;
        }
      } catch (e) {
        console.warn('Sync Users error:', e);
      }

      // 3. Baca Sheet Transaksi
      try {
        const trxRes = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Transaksi!A2:J',
        });
        const rows = trxRes.data.values;
        if (rows && rows.length > 0) {
          const parsed = rows
            .filter((r) => r && (r[1] || r[3]))
            .map((row, idx) => {
              const rawJenis = String(row[2] || '').trim().toLowerCase();
              const jenis = rawJenis === 'pengeluaran' ? 'pengeluaran' : 'penerimaan';
              const nominal = parseRupiah(row[3]);
              const tDate = String(row[1] || '').trim() || new Date().toISOString().split('T')[0];
              const tYear = String(row[9] || '').trim() || tDate.slice(0, 4);

              const trxItem: Transaction = {
                id: String(row[0] || '').trim() || `TRX-${Date.now()}-${idx + 1}`,
                tanggal: tDate,
                jenis,
                nominal,
                sumber_dana: jenis === 'penerimaan' ? String(row[4] || '').trim() : undefined,
                nama_penerima: jenis === 'pengeluaran' ? String(row[5] || '').trim() : undefined,
                keterangan: String(row[6] || '').trim() || 'Transaksi Keuangan Haji',
                dibuat_oleh: String(row[7] || '').trim() || 'Petugas Haji Puskesmas',
                created_at: String(row[8] || '').trim() || new Date().toISOString(),
                tahun: tYear,
              };
              trxItem.kategori = getTransactionCategory(trxItem);
              return trxItem;
            });
          if (parsed.length > 0) memoryTransactions = parsed;
        }
      } catch (e) {
        console.warn('Sync Transaksi error:', e);
      }

      // 4. Baca Sheet Saldo
      try {
        const saldoRes = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Saldo!A2:G',
        });
        const rows = saldoRes.data.values;
        if (rows && rows.length > 0) {
          const parsed: SaldoRecord[] = rows
            .filter((r) => r && r[1])
            .map((row, idx) => ({
              id: String(row[0] || '').trim() || `sld-${row[1] || idx}`,
              tahun: String(row[1] || '').trim(),
              saldo_awal_tahun_lalu: parseRupiah(row[2]),
              saldo_realtime: parseRupiah(row[3]),
              catatan: String(row[4] || '').trim(),
              is_locked: String(row[5] || '').trim().toLowerCase() === 'true',
              updated_at: String(row[6] || '').trim() || new Date().toISOString(),
            }));
          if (parsed.length > 0) memorySaldoList = parsed;
        }
      } catch (e) {
        console.warn('Sync Saldo error:', e);
      }

      // 5. Jalankan engine carryover & kalkulasi ulang berantai
      recalculateAllSaldoes();

      verifiedConnected = true;
      lastErrorMessage = '';
      lastErrorType = '';
      lastSyncedAt = new Date().toISOString();

      return {
        success: true,
        message: `Sinkronisasi sukses! Data spreadsheet termuat.`,
        spreadsheetTitle: lastSpreadsheetTitle,
        foundExpectedSheets: { users: true, saldo: true, transaksi: true, pengaturan: true },
        syncedCounts: {
          users: memoryUsers.length,
          saldo: memorySaldoList.length,
          transaksi: memoryTransactions.length,
        },
      };
    } catch (err: any) {
      const errInfo = handleGoogleApiError(err);
      return {
        success: false,
        message: errInfo.message,
        foundExpectedSheets: lastFoundExpectedSheets,
        syncedCounts: { users: memoryUsers.length, saldo: memorySaldoList.length, transaksi: memoryTransactions.length },
      };
    }
  }

  return {
    success: true,
    message: 'Data lokal aktif.',
    foundExpectedSheets: { users: true, saldo: true, transaksi: true, pengaturan: true },
    syncedCounts: { users: memoryUsers.length, saldo: memorySaldoList.length, transaksi: memoryTransactions.length },
  };
}

// ==============================================================================
// 1. PENGATURAN APLIKASI (NAMA INSTANSI & PENANGGUNGJAWAB)
// ==============================================================================
export async function getAppConfigFromStore(): Promise<AppConfig> {
  return memoryAppConfig;
}

export async function updateAppConfigInStore(updates: Partial<AppConfig>): Promise<AppConfig> {
  memoryAppConfig = {
    ...memoryAppConfig,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const client = getServiceAccountClient();
  if (client) {
    try {
      const values = [
        ['nama_instansi', memoryAppConfig.nama_instansi, memoryAppConfig.updated_at],
        ['penanggung_jawab', memoryAppConfig.penanggung_jawab, memoryAppConfig.updated_at],
        ['jabatan_penanggung_jawab', memoryAppConfig.jabatan_penanggung_jawab, memoryAppConfig.updated_at],
        ['nip_penanggung_jawab', memoryAppConfig.nip_penanggung_jawab || '', memoryAppConfig.updated_at],
        ['tahun_aktif', memoryAppConfig.tahun_aktif || '2026', memoryAppConfig.updated_at],
      ];
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: 'Pengaturan!A2:C6',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    } catch (e) {
      console.warn('[Google Sheets] Gagal update Pengaturan ke spreadsheet:', e);
    }
  }

  return memoryAppConfig;
}

// ==============================================================================
// 2. PENGATURAN PENGGUNA (USERS CRUD & AKTIF/NONAKTIF)
// ==============================================================================
export async function getUsersFromStore(): Promise<User[]> {
  return memoryUsers;
}

export async function addUserToStore(data: {
  username: string;
  password: string;
  role: 'admin' | 'anggota';
  nama_lengkap: string;
  jabatan?: string;
  status?: 'aktif' | 'nonaktif';
}): Promise<User> {
  const cleanUsername = data.username.trim().toLowerCase();
  const existing = memoryUsers.find((u) => u.username.toLowerCase() === cleanUsername);
  if (existing) {
    throw new Error(`Username "${cleanUsername}" sudah digunakan oleh petugas lain.`);
  }

  const newUser: User = {
    id: `usr-${Date.now().toString().slice(-6)}`,
    username: cleanUsername,
    password_hash: data.password,
    role: data.role,
    nama_lengkap: data.nama_lengkap.trim(),
    jabatan: data.jabatan?.trim() || (data.role === 'admin' ? 'Administrator Keuangan Haji' : 'Petugas Tim Kesehatan'),
    status: data.status || 'aktif',
    created_at: new Date().toISOString(),
  };

  memoryUsers.push(newUser);

  // Sync to spreadsheet
  const client = getServiceAccountClient();
  if (client) {
    try {
      await client.spreadsheets.values.append({
        spreadsheetId: config.sheetId,
        range: 'Users!A:H',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              newUser.id,
              newUser.username,
              newUser.password_hash,
              newUser.role,
              newUser.nama_lengkap,
              newUser.jabatan || '',
              newUser.status || 'aktif',
              newUser.created_at,
            ],
          ],
        },
      });
    } catch (e) {
      console.warn('[Google Sheets] Gagal append user ke spreadsheet:', e);
    }
  }

  return newUser;
}

export async function updateUserInStore(
  id: string,
  data: Partial<Omit<User, 'id'>> & { password?: string }
): Promise<User | null> {
  const index = memoryUsers.findIndex((u) => u.id === id);
  if (index === -1) return null;

  const current = memoryUsers[index];
  const updated: User = {
    ...current,
    username: data.username ? data.username.trim().toLowerCase() : current.username,
    role: data.role || current.role,
    nama_lengkap: data.nama_lengkap ? data.nama_lengkap.trim() : current.nama_lengkap,
    jabatan: data.jabatan !== undefined ? data.jabatan.trim() : current.jabatan,
    status: data.status || current.status || 'aktif',
    password_hash: data.password && data.password.trim() ? data.password.trim() : current.password_hash,
  };

  memoryUsers[index] = updated;

  // Rewrite Users sheet
  const client = getServiceAccountClient();
  if (client) {
    try {
      const values = memoryUsers.map((u) => [
        u.id,
        u.username,
        u.password_hash,
        u.role,
        u.nama_lengkap,
        u.jabatan || '',
        u.status || 'aktif',
        u.created_at || new Date().toISOString(),
      ]);
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: `Users!A2:H${values.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    } catch (e) {
      console.warn('[Google Sheets] Gagal update Users sheet:', e);
    }
  }

  return updated;
}

export async function toggleUserStatusInStore(id: string, status?: 'aktif' | 'nonaktif'): Promise<User | null> {
  const user = memoryUsers.find((u) => u.id === id);
  if (!user) return null;

  const targetStatus = status || (user.status === 'aktif' ? 'nonaktif' : 'aktif');
  return updateUserInStore(id, { status: targetStatus });
}

export async function deleteUserFromStore(id: string): Promise<boolean> {
  const initialLen = memoryUsers.length;
  memoryUsers = memoryUsers.filter((u) => u.id !== id);

  if (memoryUsers.length === initialLen) return false;

  const client = getServiceAccountClient();
  if (client) {
    try {
      await client.spreadsheets.values.clear({
        spreadsheetId: config.sheetId,
        range: 'Users!A2:H1000',
      });
      if (memoryUsers.length > 0) {
        const values = memoryUsers.map((u) => [
          u.id,
          u.username,
          u.password_hash,
          u.role,
          u.nama_lengkap,
          u.jabatan || '',
          u.status || 'aktif',
          u.created_at || new Date().toISOString(),
        ]);
        await client.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: `Users!A2:H${values.length + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      }
    } catch (e) {
      console.warn('[Google Sheets] Gagal delete user dari sheet:', e);
    }
  }

  return true;
}

// ==============================================================================
// 3. PENGATURAN DANA & TAHUN (SALDO PER TAHUN & CARRYOVER LOCK)
// ==============================================================================
export async function getSaldoFromStore(targetYear?: string): Promise<SaldoRecord> {
  recalculateAllSaldoes();

  const activeYear = targetYear || memoryAppConfig.tahun_aktif || '2026';
  let record = memorySaldoList.find((s) => s.tahun === activeYear);

  if (!record) {
    const num = extractNumericYear(activeYear);
    record = memorySaldoList.find((s) => extractNumericYear(s.tahun) === num);
  }

  if (!record) {
    record = {
      id: `sld-${activeYear}`,
      tahun: activeYear,
      saldo_awal_tahun_lalu: 0,
      saldo_realtime: 0,
      is_locked: false,
      updated_at: new Date().toISOString(),
    };
    memorySaldoList.push(record);
    recalculateAllSaldoes();
  }

  return record;
}

export async function updateSaldoInStore(payload: {
  saldo_awal_tahun_lalu?: number;
  tahun?: string;
  catatan?: string;
}): Promise<SaldoRecord> {
  recalculateAllSaldoes();

  const targetYear = payload.tahun || memoryAppConfig.tahun_aktif || '2026';
  let record = memorySaldoList.find((s) => s.tahun === targetYear);

  if (!record) {
    record = {
      id: `sld-${targetYear}`,
      tahun: targetYear,
      saldo_awal_tahun_lalu: 0,
      saldo_realtime: 0,
      is_locked: false,
      updated_at: new Date().toISOString(),
    };
    memorySaldoList.push(record);
  }

  // Jika tahun ini terkunci (karena ada tahun sebelumnya), jangan izinkan override saldo awal
  if (record.is_locked && payload.saldo_awal_tahun_lalu !== undefined) {
    // Hanya update catatan jika is_locked
    if (payload.catatan !== undefined) record.catatan = payload.catatan;
  } else {
    // Belum ada tahun sebelumnya, boleh diisi manual
    if (payload.saldo_awal_tahun_lalu !== undefined) {
      record.saldo_awal_tahun_lalu = Number(payload.saldo_awal_tahun_lalu) || 0;
    }
    if (payload.catatan !== undefined) {
      record.catatan = payload.catatan;
    }
  }

  record.updated_at = new Date().toISOString();
  recalculateAllSaldoes();

  // Sinkronkan ke sheet Saldo
  const client = getServiceAccountClient();
  if (client) {
    try {
      const values = memorySaldoList.map((s) => [
        s.id,
        s.tahun,
        s.saldo_awal_tahun_lalu,
        s.saldo_realtime,
        s.catatan || '',
        s.is_locked ? 'true' : 'false',
        s.updated_at || new Date().toISOString(),
      ]);
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: `Saldo!A2:G${values.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    } catch (e) {
      console.warn('[Google Sheets] Gagal update Saldo sheet:', e);
    }
  }

  return record;
}

export async function getAvailableYearsSummary(): Promise<{
  years: string[];
  activeYear: string;
  yearSummaries: YearInfo[];
}> {
  recalculateAllSaldoes();

  const sortedYears = Array.from(new Set(memorySaldoList.map((s) => s.tahun))).sort(
    (a, b) => extractNumericYear(b) - extractNumericYear(a)
  );

  const activeYear = memoryAppConfig.tahun_aktif || sortedYears[0] || '2026';

  const yearSummaries: YearInfo[] = sortedYears.map((yr) => {
    const sRecord = memorySaldoList.find((s) => s.tahun === yr)!;
    const numYr = extractNumericYear(yr);
    const yrTrx = memoryTransactions.filter((t) => {
      const tYr = t.tahun || t.tanggal.slice(0, 4);
      return tYr === yr || extractNumericYear(t.tanggal) === numYr;
    });

    let totalPenerimaan = 0;
    let totalPengeluaran = 0;
    for (const t of yrTrx) {
      const nom = Math.abs(Number(t.nominal) || 0);
      if (t.jenis === 'penerimaan') totalPenerimaan += nom;
      else if (t.jenis === 'pengeluaran') totalPengeluaran += nom;
    }

    return {
      tahun: yr,
      saldoAwal: sRecord.saldo_awal_tahun_lalu,
      totalPenerimaan,
      totalPengeluaran,
      saldoAkhir: sRecord.saldo_realtime,
      isLocked: Boolean(sRecord.is_locked),
      transactionCount: yrTrx.length,
      catatan: sRecord.catatan,
    };
  });

  return {
    years: sortedYears,
    activeYear,
    yearSummaries,
  };
}

export async function initializeNewYear(newYear: string, customSaldoAwal?: number): Promise<SaldoRecord> {
  const cleanYear = newYear.trim();
  if (!cleanYear) throw new Error('Tahun anggaran wajib diisi.');

  const existing = memorySaldoList.find((s) => s.tahun === cleanYear);
  if (existing) {
    memoryAppConfig.tahun_aktif = cleanYear;
    await updateAppConfigInStore({ tahun_aktif: cleanYear });
    return existing;
  }

  const newRecord: SaldoRecord = {
    id: `sld-${cleanYear}`,
    tahun: cleanYear,
    saldo_awal_tahun_lalu: customSaldoAwal || 0,
    saldo_realtime: customSaldoAwal || 0,
    catatan: `Kas Operasional Haji Tahun ${cleanYear}`,
    is_locked: false,
    updated_at: new Date().toISOString(),
  };

  memorySaldoList.push(newRecord);
  memoryAppConfig.tahun_aktif = cleanYear;

  // Jalankan recalculate carryover
  recalculateAllSaldoes();

  await updateAppConfigInStore({ tahun_aktif: cleanYear });
  await updateSaldoInStore({ tahun: cleanYear });

  return memorySaldoList.find((s) => s.tahun === cleanYear)!;
}

// ==============================================================================
// 4. OPERASI TRANSAKSI DENGAN DUKUNGAN TAHUN
// ==============================================================================
export async function getTransactionsFromStore(filterYear?: string): Promise<Transaction[]> {
  if (!filterYear || filterYear === 'all') {
    return memoryTransactions;
  }

  const numYear = extractNumericYear(filterYear);
  return memoryTransactions.filter((t) => {
    const tYear = t.tahun || t.tanggal.slice(0, 4);
    return tYear === filterYear || extractNumericYear(t.tanggal) === numYear;
  });
}

export async function addTransactionToStore(
  trx: Omit<Transaction, 'id' | 'created_at'> & { tahun?: string }
): Promise<Transaction> {
  const trxYear = trx.tahun || trx.tanggal.slice(0, 4) || memoryAppConfig.tahun_aktif || '2026';
  const newId = `TRX-${trxYear}-${String(memoryTransactions.length + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;

  const newTrx: Transaction = {
    ...trx,
    id: newId,
    tahun: trxYear,
    created_at: new Date().toISOString(),
  };

  memoryTransactions.unshift(newTrx);
  recalculateAllSaldoes();

  // Sinkronkan ke sheet Transaksi
  const client = getServiceAccountClient();
  if (client) {
    try {
      await client.spreadsheets.values.append({
        spreadsheetId: config.sheetId,
        range: 'Transaksi!A:J',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              newTrx.id,
              newTrx.tanggal,
              newTrx.jenis,
              newTrx.nominal,
              newTrx.sumber_dana || '',
              newTrx.nama_penerima || '',
              newTrx.keterangan,
              newTrx.dibuat_oleh || 'Petugas Haji',
              newTrx.created_at,
              newTrx.tahun,
            ],
          ],
        },
      });

      // Update Saldo sheet untuk mencerminkan saldo realtime terbaru
      const values = memorySaldoList.map((s) => [
        s.id,
        s.tahun,
        s.saldo_awal_tahun_lalu,
        s.saldo_realtime,
        s.catatan || '',
        s.is_locked ? 'true' : 'false',
        s.updated_at || new Date().toISOString(),
      ]);
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: `Saldo!A2:G${values.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    } catch (e) {
      console.warn('[Google Sheets] Gagal append transaksi ke spreadsheet:', e);
    }
  }

  return newTrx;
}

export async function updateTransactionInStore(
  id: string,
  updatedFields: Partial<Transaction>
): Promise<Transaction | null> {
  const index = memoryTransactions.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const existing = memoryTransactions[index];
  const newDate = updatedFields.tanggal || existing.tanggal;
  const newYear = updatedFields.tahun || newDate.slice(0, 4) || existing.tahun;

  const updated: Transaction = {
    ...existing,
    ...updatedFields,
    id: existing.id,
    tahun: newYear,
  };
  memoryTransactions[index] = updated;

  recalculateAllSaldoes();

  const client = getServiceAccountClient();
  if (client) {
    try {
      const values = memoryTransactions.map((t) => [
        t.id,
        t.tanggal,
        t.jenis,
        t.nominal,
        t.sumber_dana || '',
        t.nama_penerima || '',
        t.keterangan,
        t.dibuat_oleh || '',
        t.created_at || '',
        t.tahun || t.tanggal.slice(0, 4),
      ]);
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: `Transaksi!A2:J${values.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      const saldoValues = memorySaldoList.map((s) => [
        s.id,
        s.tahun,
        s.saldo_awal_tahun_lalu,
        s.saldo_realtime,
        s.catatan || '',
        s.is_locked ? 'true' : 'false',
        s.updated_at || new Date().toISOString(),
      ]);
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: `Saldo!A2:G${saldoValues.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: saldoValues },
      });
    } catch (e) {
      console.warn('[Google Sheets] Gagal update transaksi di spreadsheet:', e);
    }
  }

  return updated;
}

export async function deleteTransactionFromStore(id: string): Promise<boolean> {
  const initialLen = memoryTransactions.length;
  memoryTransactions = memoryTransactions.filter((t) => t.id !== id);

  if (memoryTransactions.length === initialLen) return false;

  recalculateAllSaldoes();

  const client = getServiceAccountClient();
  if (client) {
    try {
      await client.spreadsheets.values.clear({
        spreadsheetId: config.sheetId,
        range: 'Transaksi!A2:J1000',
      });

      if (memoryTransactions.length > 0) {
        const values = memoryTransactions.map((t) => [
          t.id,
          t.tanggal,
          t.jenis,
          t.nominal,
          t.sumber_dana || '',
          t.nama_penerima || '',
          t.keterangan,
          t.dibuat_oleh || '',
          t.created_at || '',
          t.tahun || t.tanggal.slice(0, 4),
        ]);
        await client.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: `Transaksi!A2:J${values.length + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      }

      const saldoValues = memorySaldoList.map((s) => [
        s.id,
        s.tahun,
        s.saldo_awal_tahun_lalu,
        s.saldo_realtime,
        s.catatan || '',
        s.is_locked ? 'true' : 'false',
        s.updated_at || new Date().toISOString(),
      ]);
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: `Saldo!A2:G${saldoValues.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: saldoValues },
      });
    } catch (e) {
      console.warn('[Google Sheets] Gagal delete transaksi di spreadsheet:', e);
    }
  }

  return true;
}

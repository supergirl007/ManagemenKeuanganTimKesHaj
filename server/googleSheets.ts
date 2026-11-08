import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { User, SaldoRecord, Transaction, GoogleSheetsConfig, SheetsTestResult, SheetsBootstrapResult } from '../src/types/index.ts';
import { initialUsers, initialSaldo, initialTransactions } from './seedData.ts';
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
 * Pembersihan dan normalisasi Google Private Key
 * Menangani karakter newline ter-escape (\n), spasi liar, dan wrapping quotes
 */
export function cleanPrivateKey(rawKey: string): string {
  if (!rawKey) return '';
  let key = rawKey.trim();

  // Hapus kutip ganda atau tunggal pembungkus jika ada
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  // Ubah literal \n menjadi newline sesungguhnya
  key = key.replace(/\\n/g, '\n');

  return key;
}

/**
 * Deteksi dan parsing jika user menempel seluruh file JSON Service Account
 */
export function parsePossibleServiceAccountJson(val: string): { clientEmail?: string; privateKey?: string; projectId?: string } | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed.startsWith('{') && (trimmed.includes('client_email') || trimmed.includes('private_key'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: parsed.private_key || parsed.privateKey,
        projectId: parsed.project_id || parsed.projectId,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Membaca variabel lingkungan dengan dukungan fleksibel terhadap format penamaan
 * Khususnya: Google_Private_Key, Spreadsheet_ID, Google_Services_Account
 */
function resolveEnvironmentConfig() {
  const env = process.env;

  // 1. Spreadsheet_ID (dukungan berbagai format penamaan)
  const rawSheetId =
    env.Spreadsheet_ID ||
    env.SPREADSHEET_ID ||
    env.spreadsheet_id ||
    env.GOOGLE_SHEET_ID ||
    env.google_sheet_id ||
    env.SHEET_ID ||
    '';

  // 2. Google_Services_Account (Email Service Account atau JSON)
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

  // 3. Google_Private_Key (Private Key PEM atau JSON)
  const rawPrivateKey =
    env.Google_Private_Key ||
    env.GOOGLE_PRIVATE_KEY ||
    env.google_private_key ||
    env.private_key ||
    env.PRIVATE_KEY ||
    '';

  // 4. API Key (opsional, fallback)
  const rawApiKey =
    env.Google_API_Key ||
    env.GOOGLE_API_KEY ||
    env.GOOGLE_SHEETS_API_KEY ||
    env.google_sheets_api_key ||
    env.API_KEY ||
    '';

  let clientEmail = rawServiceAccount.trim();
  let privateKey = cleanPrivateKey(rawPrivateKey);

  // Jika salah satu variabel berisi JSON lengkap
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
    // Pada runtime serverless Vercel, membaca filesystem mungkin dibatasi
  }
  return null;
}

function savePersistedConfig(cfg: { sheetId: string; apiKey: string; clientEmail: string; privateKey: string }) {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    // Di Vercel Serverless / Lambda, filesystem read-only di luar /tmp
    // Aplikasi tetap berjalan sempurna menggunakan in-memory dan environment variables
  }
}

// In-Memory store sebagai buffer lokal berkecepatan tinggi dan fallback aman
let memoryUsers: User[] = [...initialUsers];
let memorySaldo: SaldoRecord = { ...initialSaldo };
let memoryTransactions: Transaction[] = [...initialTransactions];

const envConfig = resolveEnvironmentConfig();
const persisted = loadPersistedConfig();

// Konfigurasi aktif: prioritaskan environment variables, lalu persisted file
let config = {
  sheetId: envConfig.sheetId || persisted?.sheetId || '',
  clientEmail: envConfig.clientEmail || persisted?.clientEmail || '',
  privateKey: envConfig.privateKey || persisted?.privateKey || '',
  apiKey: envConfig.apiKey || persisted?.apiKey || '',
};

// Status diagnostik
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
};

/**
 * Deteksi apakah sebuah string adalah Hex Key ID Service Account
 */
export function isHexKeyId(str: string): boolean {
  if (!str) return false;
  return /^[0-9a-f]{32,45}$/i.test(str.trim());
}

/**
 * Mendeteksi metode otentikasi yang sedang aktif
 * Prioritas TERTINGGI: Service Account (Google_Services_Account + Google_Private_Key)
 * Karena Service Account mendukung pembacaan dan penulisan penuh (Full Read & Write).
 */
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

/**
 * Membuat instance Google Sheets JWT Client terotentikasi Service Account
 */
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
    console.error('[Google Sheets] Gagal menginisialisasi Service Account JWT:', err?.message);
    return null;
  }
}

/**
 * Status konfigurasi saat ini untuk dashboard dan diagnostik UI
 */
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
          : `Terhubung ke Google Spreadsheet "${lastSpreadsheetTitle || 'Aktif'}" via API Key (Read-Only)`;
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

/**
 * Update runtime config dari UI
 */
export function updateSheetsConfig(newConfig: {
  sheetId?: string;
  apiKey?: string;
  clientEmail?: string;
  privateKey?: string;
}) {
  if (newConfig.sheetId !== undefined) {
    config.sheetId = extractSheetId(newConfig.sheetId);
  }

  // Cek apakah ada JSON Service Account yang ditempelkan di kolom manapun
  const possibleJson = newConfig.apiKey || newConfig.privateKey || newConfig.clientEmail || '';
  const jsonParsed = parsePossibleServiceAccountJson(possibleJson);
  if (jsonParsed) {
    if (jsonParsed.clientEmail) config.clientEmail = jsonParsed.clientEmail;
    if (jsonParsed.privateKey) config.privateKey = cleanPrivateKey(jsonParsed.privateKey);
  } else {
    if (newConfig.clientEmail !== undefined) {
      config.clientEmail = newConfig.clientEmail.trim();
    }
    if (newConfig.privateKey !== undefined) {
      config.privateKey = cleanPrivateKey(newConfig.privateKey);
    }
    if (newConfig.apiKey !== undefined) {
      config.apiKey = newConfig.apiKey.trim();
    }
  }

  savePersistedConfig(config);

  // Reset status untuk verifikasi ulang
  verifiedConnected = false;
  lastErrorMessage = '';
  lastErrorType = '';
  lastSuggestions = [];
  isBootstrapped = false;
}

/**
 * Reset konfigurasi ke mode data lokal
 */
export function resetSheetsConfig() {
  config = {
    sheetId: '',
    apiKey: '',
    clientEmail: '',
    privateKey: '',
  };
  verifiedConnected = false;
  lastErrorMessage = '';
  lastErrorType = '';
  lastSuggestions = [];
  lastSpreadsheetTitle = '';
  savePersistedConfig(config);
}

/**
 * Penanganan error Google API yang ramah pengguna
 */
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

  if (rawMsg.includes('private key') || rawMsg.includes('PEM') || rawMsg.includes('DEK-Info') || rawMsg.includes('asn1')) {
    return {
      errorType: 'INVALID_CREDENTIALS',
      message: 'Format Google_Private_Key tidak valid atau rusak.',
      suggestions: [
        'Pastikan kunci menyertakan baris "-----BEGIN PRIVATE KEY-----" di awal dan "-----END PRIVATE KEY-----" di akhir.',
        'Jika menyimpan di file .env atau Vercel, pastikan karakter newline (\\n) tidak rusak.',
      ],
    };
  }

  if (rawMsg.includes('Sheets API has not been used') || rawMsg.includes('is disabled')) {
    return {
      errorType: 'API_NOT_ENABLED',
      message: 'Google Sheets API belum diaktifkan pada Google Cloud Console proyek Anda.',
      suggestions: [
        'Buka Google Cloud Console > APIs & Services > Library.',
        'Cari "Google Sheets API" lalu klik "Enable" (Aktifkan).',
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

/**
 * OTOMATIS: Memeriksa dan membuat lembar kerja (Users, Saldo, Transaksi) beserta header
 * Menjamin zero-config di Google Spreadsheet. Tidak menghapus data yang sudah ada!
 */
export async function ensureSheetsAndHeadersExist(): Promise<SheetsBootstrapResult> {
  const method = getActiveAuthMethod();

  if (method !== 'service_account') {
    return {
      success: false,
      message: 'Inisialisasi otomatis memerlukan otentikasi Service Account (Google_Services_Account & Google_Private_Key).',
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
    // 1. Ambil metadata lembar kerja saat ini
    const meta = await client.spreadsheets.get({ spreadsheetId: config.sheetId });
    lastSpreadsheetTitle = meta.data.properties?.title || 'Google Spreadsheet Keuangan Haji';
    const existingTitles = (meta.data.sheets || []).map((s) => s.properties?.title || '');

    const targetSheets = [
      {
        title: 'Users',
        header: ['id', 'username', 'password_hash', 'role', 'nama_lengkap', 'jabatan'],
        seedRows: memoryUsers.map((u) => [u.id, u.username, u.password_hash, u.role, u.nama_lengkap, u.jabatan || '']),
      },
      {
        title: 'Saldo',
        header: ['id', 'tahun', 'saldo_awal_tahun_lalu', 'saldo_realtime', 'catatan', 'updated_at'],
        seedRows: [
          [
            memorySaldo.id,
            memorySaldo.tahun,
            memorySaldo.saldo_awal_tahun_lalu,
            memorySaldo.saldo_realtime,
            memorySaldo.catatan || '',
            memorySaldo.updated_at || new Date().toISOString(),
          ],
        ],
      },
      {
        title: 'Transaksi',
        header: ['id', 'tanggal', 'jenis', 'nominal', 'sumber_dana', 'nama_penerima', 'keterangan', 'dibuat_oleh', 'created_at'],
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
        ]),
      },
    ];

    const createdSheets: string[] = [];
    const alreadyExisted: string[] = [];
    const initializedHeaders: string[] = [];

    // 2. Deteksi lembar kerja yang belum ada
    const missingSheets = targetSheets.filter(
      (ts) => !existingTitles.some((et) => et.trim().toLowerCase() === ts.title.toLowerCase())
    );

    // 3. Buat lembar kerja baru secara batch jika ada yang belum ada
    if (missingSheets.length > 0) {
      const requests = missingSheets.map((ms) => ({
        addSheet: {
          properties: {
            title: ms.title,
            gridProperties: {
              frozenRowCount: 1,
            },
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

    // 4. Tulis header & data awal ke lembar yang baru dibuat atau yang baris 1-nya kosong
    for (const ts of targetSheets) {
      if (createdSheets.includes(ts.title)) {
        // Lembar baru: tulis header dan seed rows
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
        // Lembar sudah ada: pastikan header ada di baris 1
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
              requestBody: {
                values: [ts.header],
              },
            });
            initializedHeaders.push(ts.title);
          }
        } catch {
          // Lewati jika lembar tidak dapat dibaca
        }
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
    };

    const createdMsg = createdSheets.length > 0 ? `Lembar baru dibuat: ${createdSheets.join(', ')}. ` : '';
    const existMsg = alreadyExisted.length > 0 ? `Lembar yang sudah ada dipertahankan: ${alreadyExisted.join(', ')}. ` : '';

    return {
      success: true,
      message: `Inisialisasi 3 Sheet berhasil! ${createdMsg}${existMsg}Database spreadsheet siap digunakan.`,
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

/**
 * Uji koneksi menyeluruh ke Google Spreadsheet
 */
export async function testSheetsConnection(): Promise<SheetsTestResult> {
  const method = getActiveAuthMethod();

  if (method === 'demo_mode') {
    return {
      success: false,
      message: 'Belum ada kredensial Google Spreadsheet yang dikonfigurasi. Masukkan Spreadsheet_ID, Google_Services_Account, dan Google_Private_Key.',
      errorType: 'UNKNOWN',
      suggestions: [
        'Konfigurasikan 3 variabel lingkungan: Spreadsheet_ID, Google_Services_Account, Google_Private_Key.',
        'Atau masukkan langsung melalui tab "Service Acc" pada modal pengaturan.',
      ],
    };
  }

  if (method === 'service_account') {
    const client = getServiceAccountClient();
    if (!client) {
      return {
        success: false,
        message: 'Kredensial Service Account belum lengkap atau format Private Key tidak valid.',
        errorType: 'INVALID_CREDENTIALS',
        suggestions: [
          'Periksa apakah Google_Services_Account (email) dan Google_Private_Key telah terisi dengan benar.',
          'Pastikan Private Key diawali -----BEGIN PRIVATE KEY----- dan diakhiri -----END PRIVATE KEY-----.',
        ],
      };
    }

    try {
      // 1. Dapatkan metadata spreadsheet
      const res = await client.spreadsheets.get({ spreadsheetId: config.sheetId });
      const titles = (res.data.sheets || []).map((s) => s.properties?.title || '');
      const docTitle = res.data.properties?.title || 'Google Spreadsheet';
      lastSpreadsheetTitle = docTitle;

      const hasUsers = titles.some((t) => t.trim().toLowerCase() === 'users');
      const hasSaldo = titles.some((t) => t.trim().toLowerCase() === 'saldo');
      const hasTransaksi = titles.some((t) => t.trim().toLowerCase() === 'transaksi');

      lastFoundExpectedSheets = {
        users: hasUsers,
        saldo: hasSaldo,
        transaksi: hasTransaksi,
      };

      // Jika ada lembar kerja yang belum lengkap, lakukan auto-bootstrap
      if (!hasUsers || !hasSaldo || !hasTransaksi) {
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
        errorType: errInfo.errorType as any,
        suggestions: errInfo.suggestions,
      };
    }
  }

  // Fallback: API Key test
  if (method === 'api_key') {
    try {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.sheetId)}?key=${encodeURIComponent(config.apiKey)}`;
      const res = await fetch(metaUrl);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errInfo = handleGoogleApiError({ message: data.error?.message, status: res.status });
        verifiedConnected = false;
        lastErrorMessage = errInfo.message;
        lastErrorType = errInfo.errorType;
        lastSuggestions = errInfo.suggestions;
        return {
          success: false,
          message: errInfo.message,
          errorType: errInfo.errorType as any,
          suggestions: errInfo.suggestions,
        };
      }
      const data = await res.json();
      lastSpreadsheetTitle = data.properties?.title || 'Google Spreadsheet';
      verifiedConnected = true;
      return {
        success: true,
        message: `Terhubung via API Key (Read-Only) ke "${lastSpreadsheetTitle}".`,
        spreadsheetTitle: lastSpreadsheetTitle,
        sheetNames: (data.sheets || []).map((s: any) => s.properties?.title || ''),
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Gagal menghubungi Google Sheets API',
        errorType: 'NETWORK_ERROR',
      };
    }
  }

  return {
    success: false,
    message: 'Metode otentikasi tidak valid.',
  };
}

/**
 * Sinkronisasi penuh semua database dari Google Spreadsheet ke memori lokal
 */
export async function syncAllDatabasesWithSpreadsheet(): Promise<{
  success: boolean;
  message: string;
  spreadsheetTitle?: string;
  foundExpectedSheets: { users: boolean; saldo: boolean; transaksi: boolean };
  syncedCounts: { users: number; saldo: number; transaksi: number };
}> {
  const method = getActiveAuthMethod();

  if (method === 'demo_mode') {
    const summary = calculateFinancialSummary(memorySaldo.saldo_awal_tahun_lalu, memoryTransactions, memorySaldo.tahun);
    memorySaldo.saldo_realtime = summary.saldoRealtime;
    return {
      success: true,
      message: 'Mode Data Lokal Aktif. Database berjalan menggunakan data internal server.',
      foundExpectedSheets: { users: true, saldo: true, transaksi: true },
      syncedCounts: {
        users: memoryUsers.length,
        saldo: 1,
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
        syncedCounts: { users: memoryUsers.length, saldo: 1, transaksi: memoryTransactions.length },
      };
    }

    try {
      // Pastikan struktur sheet ada
      if (!isBootstrapped) {
        await ensureSheetsAndHeadersExist().catch(() => null);
      }

      // 1. Baca Sheet Users
      try {
        const userRes = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Users!A2:F',
        });
        const rows = userRes.data.values;
        if (rows && rows.length > 0) {
          const parsed = rows
            .filter((r) => r && r[1] && String(r[1]).trim() !== '')
            .map((row, idx) => ({
              id: String(row[0] || '').trim() || `usr-${idx + 1}`,
              username: String(row[1] || '').trim(),
              password_hash: String(row[2] || '').trim() || 'petugas123',
              role: (String(row[3] || '').trim().toLowerCase() === 'admin' ? 'admin' : 'anggota') as 'admin' | 'anggota',
              nama_lengkap: String(row[4] || row[1] || 'Petugas').trim(),
              jabatan: String(row[5] || 'Petugas Tim Haji').trim(),
            }));
          if (parsed.length > 0) {
            memoryUsers = parsed;
          }
        }
      } catch (err) {
        console.warn('[Google Sheets] Lewati pembacaan Users:', err);
      }

      // 2. Baca Sheet Saldo
      try {
        const saldoRes = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Saldo!A2:F2',
        });
        const rows = saldoRes.data.values;
        if (rows && rows.length > 0 && rows[0]) {
          const row = rows[0];
          const parsedNominal = parseRupiah(row[2]);
          const saldoAwal = parsedNominal > 0 ? parsedNominal : memorySaldo.saldo_awal_tahun_lalu;
          memorySaldo = {
            id: String(row[0] || '').trim() || memorySaldo.id,
            tahun: String(row[1] || '').trim() || memorySaldo.tahun,
            saldo_awal_tahun_lalu: saldoAwal,
            saldo_realtime: saldoAwal,
            catatan: String(row[4] || '').trim() || memorySaldo.catatan,
            updated_at: String(row[5] || '').trim() || new Date().toISOString(),
          };
        }
      } catch (err) {
        console.warn('[Google Sheets] Lewati pembacaan Saldo:', err);
      }

      // 3. Baca Sheet Transaksi
      try {
        const trxRes = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Transaksi!A2:I',
        });
        const rows = trxRes.data.values;
        if (rows && rows.length > 0) {
          const parsed = rows
            .filter((r) => r && (r[1] || r[3]))
            .map((row, idx) => {
              const rawJenis = String(row[2] || '').trim().toLowerCase();
              const jenis = rawJenis === 'pengeluaran' ? 'pengeluaran' : 'penerimaan';
              const nominal = parseRupiah(row[3]);
              const trxItem: Transaction = {
                id: String(row[0] || '').trim() || `TRX-${Date.now()}-${idx + 1}`,
                tanggal: String(row[1] || '').trim() || new Date().toISOString().split('T')[0],
                jenis,
                nominal,
                sumber_dana: jenis === 'penerimaan' ? String(row[4] || '').trim() : undefined,
                nama_penerima: jenis === 'pengeluaran' ? String(row[5] || '').trim() : undefined,
                keterangan: String(row[6] || '').trim() || 'Transaksi Keuangan Haji',
                dibuat_oleh: String(row[7] || '').trim() || 'Petugas Haji Puskesmas',
                created_at: String(row[8] || '').trim() || new Date().toISOString(),
              };
              trxItem.kategori = getTransactionCategory(trxItem);
              return trxItem;
            });
          if (parsed.length > 0) {
            memoryTransactions = parsed;
          }
        }
      } catch (err) {
        console.warn('[Google Sheets] Lewati pembacaan Transaksi:', err);
      }

      // 4. Hitung ulang total ringkasan keuangan realtime
      const summary = calculateFinancialSummary(memorySaldo.saldo_awal_tahun_lalu, memoryTransactions, memorySaldo.tahun);
      memorySaldo.saldo_realtime = summary.saldoRealtime;

      verifiedConnected = true;
      lastErrorMessage = '';
      lastErrorType = '';
      lastSyncedAt = new Date().toISOString();

      return {
        success: true,
        message: `Sinkronisasi sukses! Data dari Google Spreadsheet "${lastSpreadsheetTitle || 'Aktif'}" berhasil dimuat. (Users: ${memoryUsers.length}, Transaksi: ${memoryTransactions.length})`,
        spreadsheetTitle: lastSpreadsheetTitle,
        foundExpectedSheets: { users: true, saldo: true, transaksi: true },
        syncedCounts: {
          users: memoryUsers.length,
          saldo: 1,
          transaksi: memoryTransactions.length,
        },
      };
    } catch (err: any) {
      const errInfo = handleGoogleApiError(err);
      lastErrorMessage = errInfo.message;
      lastErrorType = errInfo.errorType;
      lastSuggestions = errInfo.suggestions;

      return {
        success: false,
        message: errInfo.message,
        foundExpectedSheets: lastFoundExpectedSheets,
        syncedCounts: { users: memoryUsers.length, saldo: 1, transaksi: memoryTransactions.length },
      };
    }
  }

  // Fallback mode jika API Key
  return {
    success: true,
    message: 'Data lokal aktif.',
    foundExpectedSheets: { users: true, saldo: true, transaksi: true },
    syncedCounts: { users: memoryUsers.length, saldo: 1, transaksi: memoryTransactions.length },
  };
}

// ==========================================
// OPERASI DATABASE: USERS
// ==========================================
export async function getUsersFromStore(): Promise<User[]> {
  const method = getActiveAuthMethod();

  if (method === 'service_account') {
    const client = getServiceAccountClient();
    if (client) {
      try {
        const response = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Users!A2:F',
        });
        const rows = response.data.values;
        if (rows && rows.length > 0) {
          const parsed = rows
            .filter((r) => r && r[1] && String(r[1]).trim() !== '')
            .map((row, idx) => ({
              id: String(row[0] || '').trim() || `usr-${idx + 1}`,
              username: String(row[1] || '').trim(),
              password_hash: String(row[2] || '').trim() || 'petugas123',
              role: (String(row[3] || '').trim().toLowerCase() === 'admin' ? 'admin' : 'anggota') as 'admin' | 'anggota',
              nama_lengkap: String(row[4] || row[1] || 'Petugas').trim(),
              jabatan: String(row[5] || 'Anggota Tim Haji').trim(),
            }));
          if (parsed.length > 0) {
            memoryUsers = parsed;
            return memoryUsers;
          }
        }
      } catch (err) {
        console.warn('[Google Sheets] Menggunakan memori lokal untuk users:', err);
      }
    }
  }

  return memoryUsers;
}

// ==========================================
// OPERASI DATABASE: SALDO
// ==========================================
export async function getSaldoFromStore(): Promise<SaldoRecord> {
  const summary = calculateFinancialSummary(memorySaldo.saldo_awal_tahun_lalu, memoryTransactions, memorySaldo.tahun);
  memorySaldo.saldo_realtime = summary.saldoRealtime;

  const method = getActiveAuthMethod();

  if (method === 'service_account') {
    const client = getServiceAccountClient();
    if (client) {
      try {
        const response = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Saldo!A2:F2',
        });
        const rows = response.data.values;
        if (rows && rows.length > 0 && rows[0]) {
          const row = rows[0];
          const parsedNominal = parseRupiah(row[2]);
          const saldoAwal = parsedNominal > 0 ? parsedNominal : memorySaldo.saldo_awal_tahun_lalu;
          const calculatedRealtime = saldoAwal + summary.totalPenerimaan - summary.totalPengeluaran;

          memorySaldo = {
            id: String(row[0] || '').trim() || memorySaldo.id,
            tahun: String(row[1] || '').trim() || memorySaldo.tahun,
            saldo_awal_tahun_lalu: saldoAwal,
            saldo_realtime: calculatedRealtime,
            catatan: String(row[4] || '').trim() || memorySaldo.catatan,
            updated_at: String(row[5] || '').trim() || new Date().toISOString(),
          };
          return memorySaldo;
        }
      } catch (err) {
        console.warn('[Google Sheets] Menggunakan memori lokal untuk saldo:', err);
      }
    }
  }

  return memorySaldo;
}

export async function updateSaldoInStore(payload: {
  saldo_awal_tahun_lalu: number;
  tahun?: string;
  catatan?: string;
}): Promise<SaldoRecord> {
  memorySaldo.saldo_awal_tahun_lalu = Number(payload.saldo_awal_tahun_lalu) || 0;
  if (payload.tahun) memorySaldo.tahun = payload.tahun;
  if (payload.catatan !== undefined) memorySaldo.catatan = payload.catatan;
  memorySaldo.updated_at = new Date().toISOString();

  const summary = calculateFinancialSummary(memorySaldo.saldo_awal_tahun_lalu, memoryTransactions, memorySaldo.tahun);
  memorySaldo.saldo_realtime = summary.saldoRealtime;

  // Sinkronkan update langsung ke Google Spreadsheet jika Service Account aktif
  const client = getServiceAccountClient();
  if (client) {
    try {
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: 'Saldo!A2:F2',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              memorySaldo.id,
              memorySaldo.tahun,
              memorySaldo.saldo_awal_tahun_lalu,
              memorySaldo.saldo_realtime,
              memorySaldo.catatan || '',
              memorySaldo.updated_at,
            ],
          ],
        },
      });
    } catch (err) {
      console.error('[Google Sheets] Gagal update saldo ke spreadsheet:', err);
    }
  }

  return memorySaldo;
}

// ==========================================
// OPERASI DATABASE: TRANSAKSI (READ & WRITE)
// ==========================================
export async function getTransactionsFromStore(): Promise<Transaction[]> {
  const method = getActiveAuthMethod();

  if (method === 'service_account') {
    const client = getServiceAccountClient();
    if (client) {
      try {
        const response = await client.spreadsheets.values.get({
          spreadsheetId: config.sheetId,
          range: 'Transaksi!A2:I',
        });
        const rows = response.data.values;
        if (rows && rows.length > 0) {
          const parsed = rows
            .filter((r) => r && (r[1] || r[3]))
            .map((row, idx) => {
              const rawJenis = String(row[2] || '').trim().toLowerCase();
              const jenis = rawJenis === 'pengeluaran' ? 'pengeluaran' : 'penerimaan';
              const nominal = parseRupiah(row[3]);
              const trxItem: Transaction = {
                id: String(row[0] || '').trim() || `TRX-${Date.now()}-${idx + 1}`,
                tanggal: String(row[1] || '').trim() || new Date().toISOString().split('T')[0],
                jenis,
                nominal,
                sumber_dana: jenis === 'penerimaan' ? String(row[4] || '').trim() : undefined,
                nama_penerima: jenis === 'pengeluaran' ? String(row[5] || '').trim() : undefined,
                keterangan: String(row[6] || '').trim() || 'Transaksi Keuangan Haji',
                dibuat_oleh: String(row[7] || '').trim() || 'Petugas Haji Puskesmas',
                created_at: String(row[8] || '').trim() || new Date().toISOString(),
              };
              trxItem.kategori = getTransactionCategory(trxItem);
              return trxItem;
            });
          if (parsed.length > 0) {
            memoryTransactions = parsed;
            return memoryTransactions;
          }
        }
      } catch (err) {
        console.warn('[Google Sheets] Menggunakan memori lokal untuk transaksi:', err);
      }
    }
  }

  return memoryTransactions;
}

/**
 * Menambahkan transaksi baru dan menulis langsung ke Google Spreadsheet
 */
export async function addTransactionToStore(trx: Omit<Transaction, 'id' | 'created_at'>): Promise<Transaction> {
  const newId = `TRX-${new Date().getFullYear()}-${String(memoryTransactions.length + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
  const newTrx: Transaction = {
    ...trx,
    id: newId,
    created_at: new Date().toISOString(),
  };

  // Simpan di memori lokal
  memoryTransactions.unshift(newTrx);

  const summary = calculateFinancialSummary(memorySaldo.saldo_awal_tahun_lalu, memoryTransactions, memorySaldo.tahun);
  memorySaldo.saldo_realtime = summary.saldoRealtime;

  // Tulis baris baru langsung ke Google Spreadsheet
  const client = getServiceAccountClient();
  if (client) {
    try {
      await client.spreadsheets.values.append({
        spreadsheetId: config.sheetId,
        range: 'Transaksi!A:I',
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
            ],
          ],
        },
      });

      // Update saldo realtime di sheet Saldo
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: 'Saldo!A2:F2',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              memorySaldo.id,
              memorySaldo.tahun,
              memorySaldo.saldo_awal_tahun_lalu,
              memorySaldo.saldo_realtime,
              memorySaldo.catatan || '',
              new Date().toISOString(),
            ],
          ],
        },
      });
    } catch (err) {
      console.error('[Google Sheets] Gagal menulis transaksi baru ke Google Sheets:', err);
    }
  }

  return newTrx;
}

/**
 * Memperbarui transaksi yang ada dan menulis perubahan ke Google Spreadsheet
 */
export async function updateTransactionInStore(
  id: string,
  updatedFields: Partial<Transaction>
): Promise<Transaction | null> {
  const index = memoryTransactions.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const existing = memoryTransactions[index];
  const updated: Transaction = {
    ...existing,
    ...updatedFields,
    id: existing.id,
  };
  memoryTransactions[index] = updated;

  const summary = calculateFinancialSummary(memorySaldo.saldo_awal_tahun_lalu, memoryTransactions, memorySaldo.tahun);
  memorySaldo.saldo_realtime = summary.saldoRealtime;

  // Tulis ulang daftar transaksi ke Google Spreadsheet
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
      ]);

      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: `Transaksi!A2:I${values.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      // Update saldo realtime di sheet Saldo
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: 'Saldo!A2:F2',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              memorySaldo.id,
              memorySaldo.tahun,
              memorySaldo.saldo_awal_tahun_lalu,
              memorySaldo.saldo_realtime,
              memorySaldo.catatan || '',
              new Date().toISOString(),
            ],
          ],
        },
      });
    } catch (err) {
      console.error('[Google Sheets] Gagal update transaksi di Google Sheets:', err);
    }
  }

  return updated;
}

/**
 * Menghapus transaksi dan memperbarui Google Spreadsheet
 */
export async function deleteTransactionFromStore(id: string): Promise<boolean> {
  const initialLen = memoryTransactions.length;
  memoryTransactions = memoryTransactions.filter((t) => t.id !== id);

  if (memoryTransactions.length === initialLen) {
    return false;
  }

  const summary = calculateFinancialSummary(memorySaldo.saldo_awal_tahun_lalu, memoryTransactions, memorySaldo.tahun);
  memorySaldo.saldo_realtime = summary.saldoRealtime;

  const client = getServiceAccountClient();
  if (client) {
    try {
      // Bersihkan range Transaksi
      await client.spreadsheets.values.clear({
        spreadsheetId: config.sheetId,
        range: 'Transaksi!A2:I1000',
      });

      // Tulis ulang baris yang tersisa
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
        ]);
        await client.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: `Transaksi!A2:I${values.length + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      }

      // Update saldo realtime
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range: 'Saldo!A2:F2',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              memorySaldo.id,
              memorySaldo.tahun,
              memorySaldo.saldo_awal_tahun_lalu,
              memorySaldo.saldo_realtime,
              memorySaldo.catatan || '',
              new Date().toISOString(),
            ],
          ],
        },
      });
    } catch (err) {
      console.error('[Google Sheets] Gagal menghapus transaksi dari spreadsheet:', err);
    }
  }

  return true;
}

import {
  ApiResponse,
  AuthUser,
  LoginResponse,
  SaldoRecord,
  Transaction,
  AppConfig,
  User,
  YearInfo,
  GoogleSheetsConfig,
  SheetsTestResult,
  SheetsBootstrapResult,
} from '../types/index.ts';

const TOKEN_KEY = 'haji_finance_auth_token';
const USER_KEY = 'haji_finance_user_data';
const ACTIVE_YEAR_KEY = 'haji_finance_active_year';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): AuthUser | null {
  const json = localStorage.getItem(USER_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredActiveYear(): string | null {
  return localStorage.getItem(ACTIVE_YEAR_KEY);
}

export function setStoredActiveYear(year: string): void {
  localStorage.setItem(ACTIVE_YEAR_KEY, year);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Respons server tidak berformat JSON yang valid',
  }));

  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}: Permintaan gagal`);
  }

  return data;
}

export const api = {
  // Auth
  async login(username: string, password: string, tahun?: string): Promise<LoginResponse> {
    const res = await request<ApiResponse<LoginResponse>>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, tahun }),
    });
    if (!res.data) throw new Error(res.error || 'Login gagal');
    setStoredAuth(res.data.token, res.data.user);
    if (res.data.tahun_aktif) {
      setStoredActiveYear(res.data.tahun_aktif);
    }
    return res.data;
  },

  async getMe(): Promise<AuthUser> {
    const res = await request<ApiResponse<AuthUser>>('/api/auth/me');
    if (!res.data) throw new Error('Sesi tidak valid');
    return res.data;
  },

  // App Configuration (Nama Instansi & Penanggungjawab)
  async getAppConfig(): Promise<AppConfig> {
    const res = await request<ApiResponse<AppConfig>>('/api/app/config');
    return res.data!;
  },

  async updateAppConfig(data: Partial<AppConfig>): Promise<AppConfig> {
    const res = await request<ApiResponse<AppConfig>>('/api/app/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data!;
  },

  // Database Years
  async getYears(): Promise<{ years: string[]; activeYear: string; yearSummaries: YearInfo[] }> {
    const res = await request<ApiResponse<{ years: string[]; activeYear: string; yearSummaries: YearInfo[] }>>('/api/app/years');
    return res.data!;
  },

  async initYear(tahun: string, saldoAwalManual?: number): Promise<{ saldo: SaldoRecord; summary: any }> {
    const res = await request<ApiResponse<any>>('/api/app/years', {
      method: 'POST',
      body: JSON.stringify({ tahun, saldo_awal_manual: saldoAwalManual }),
    });
    return res.data!;
  },

  // User Management
  async getUsers(): Promise<User[]> {
    const res = await request<ApiResponse<User[]>>('/api/users');
    return res.data || [];
  },

  async createUser(data: {
    username: string;
    password: string;
    role: 'admin' | 'anggota';
    nama_lengkap: string;
    jabatan?: string;
    status?: 'aktif' | 'nonaktif';
  }): Promise<User> {
    const res = await request<ApiResponse<User>>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data!;
  },

  async updateUser(id: string, data: Partial<User> & { password?: string }): Promise<User> {
    const res = await request<ApiResponse<User>>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data!;
  },

  async toggleUserStatus(id: string, status?: 'aktif' | 'nonaktif'): Promise<{ id: string; status: 'aktif' | 'nonaktif' }> {
    const res = await request<ApiResponse<any>>(`/api/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return res.data!;
  },

  async deleteUser(id: string): Promise<void> {
    await request<ApiResponse>(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  // Saldo (Multi-Year)
  async getSaldo(tahun?: string): Promise<SaldoRecord> {
    const endpoint = tahun ? `/api/saldo?tahun=${encodeURIComponent(tahun)}` : '/api/saldo';
    const res = await request<ApiResponse<SaldoRecord>>(endpoint);
    return res.data!;
  },

  async updateSaldo(data: {
    saldo_awal_tahun_lalu?: number;
    tahun?: string;
    catatan?: string;
  }): Promise<SaldoRecord> {
    const res = await request<ApiResponse<SaldoRecord>>('/api/saldo', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data!;
  },

  // Transaksi (Multi-Year)
  async getTransactions(tahun?: string): Promise<Transaction[]> {
    const endpoint = tahun ? `/api/transactions?tahun=${encodeURIComponent(tahun)}` : '/api/transactions';
    const res = await request<ApiResponse<Transaction[]>>(endpoint);
    return res.data || [];
  },

  async createTransaction(payload: Omit<Transaction, 'id' | 'created_at'> & { tahun?: string }): Promise<Transaction> {
    const res = await request<ApiResponse<Transaction>>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data!;
  },

  async updateTransaction(id: string, payload: Partial<Transaction>): Promise<Transaction> {
    const res = await request<ApiResponse<Transaction>>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data!;
  },

  async deleteTransaction(id: string): Promise<void> {
    await request<ApiResponse>(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  },

  // Sheets Config & Status
  async getSheetsStatus(): Promise<GoogleSheetsConfig> {
    const res = await request<ApiResponse<GoogleSheetsConfig>>('/api/sheets/status');
    return res.data!;
  },

  async testSheetsConnection(): Promise<SheetsTestResult> {
    const res = await request<ApiResponse<SheetsTestResult>>('/api/sheets/test', {
      method: 'POST',
    });
    return res.data!;
  },

  async updateSheetsConfig(data: {
    sheetId?: string;
    apiKey?: string;
    clientEmail?: string;
    privateKey?: string;
  }): Promise<GoogleSheetsConfig> {
    const res = await request<ApiResponse<GoogleSheetsConfig>>('/api/sheets/config', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data!;
  },

  async resetSheetsConfig(): Promise<GoogleSheetsConfig> {
    const res = await request<ApiResponse<GoogleSheetsConfig>>('/api/sheets/reset', {
      method: 'POST',
    });
    return res.data!;
  },

  async syncSheets(): Promise<{ success: boolean; message: string; data?: any }> {
    const res = await request<ApiResponse<any>>('/api/sheets/sync', {
      method: 'POST',
    });
    return res.data || { success: res.success, message: res.message || 'Sinkronisasi berhasil' };
  },

  async bootstrapSheets(): Promise<SheetsBootstrapResult> {
    const res = await request<ApiResponse<SheetsBootstrapResult>>('/api/sheets/bootstrap', {
      method: 'POST',
    });
    return res.data!;
  },

  getStoredActiveYear(): string | null {
    return getStoredActiveYear();
  },

  setStoredActiveYear(year: string): void {
    setStoredActiveYear(year);
  },
};

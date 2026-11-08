import { Router, Request, Response } from 'express';
import {
  getAppConfigFromStore,
  updateAppConfigInStore,
  getAvailableYearsSummary,
  initializeNewYear,
} from '../googleSheets.ts';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../auth.ts';

const router = Router();

// GET app config
router.get('/config', async (req: Request, res: Response) => {
  try {
    const config = await getAppConfigFromStore();
    res.json({
      success: true,
      data: config,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Gagal memuat pengaturan aplikasi.',
    });
  }
});

// PUT update app config - ADMIN ONLY
router.put('/config', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nama_instansi, penanggung_jawab, jabatan_penanggung_jawab, nip_penanggung_jawab, tahun_aktif } = req.body;

    const updated = await updateAppConfigInStore({
      nama_instansi,
      penanggung_jawab,
      jabatan_penanggung_jawab,
      nip_penanggung_jawab,
      tahun_aktif,
    });

    res.json({
      success: true,
      message: 'Pengaturan instansi dan penanggungjawab berhasil disimpan!',
      data: updated,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Gagal menyimpan pengaturan aplikasi.',
    });
  }
});

// GET database years summary - Public (digunakan juga di login)
router.get('/years', async (req: Request, res: Response) => {
  try {
    const result = await getAvailableYearsSummary();
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Gagal memuat daftar tahun database.',
    });
  }
});

// POST initialize new database year - ADMIN ONLY
router.post('/years', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tahun, saldo_awal_manual } = req.body;
    if (!tahun || String(tahun).trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Tahun anggaran database wajib diisi.',
      });
      return;
    }

    const created = await initializeNewYear(String(tahun).trim(), Number(saldo_awal_manual) || 0);
    const summary = await getAvailableYearsSummary();

    res.status(201).json({
      success: true,
      message: `Tahun database ${tahun} berhasil diinisialisasi!`,
      data: {
        saldo: created,
        summary,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Gagal membuat tahun database baru.',
    });
  }
});

export default router;

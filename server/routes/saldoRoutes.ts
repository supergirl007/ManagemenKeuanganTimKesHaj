import { Router, Response } from 'express';
import { getSaldoFromStore, updateSaldoInStore } from '../googleSheets.ts';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../auth.ts';

const router = Router();

// GET current balance (supports ?tahun=2026)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetYear = req.query.tahun ? String(req.query.tahun).trim() : undefined;
    const saldo = await getSaldoFromStore(targetYear);
    res.json({
      success: true,
      data: saldo,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Gagal memuat informasi saldo.',
    });
  }
});

// PUT update balance - ADMIN ONLY
router.put('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { saldo_awal_tahun_lalu, tahun, catatan } = req.body;

    const current = await getSaldoFromStore(tahun);

    if (current.is_locked && saldo_awal_tahun_lalu !== undefined && Number(saldo_awal_tahun_lalu) !== current.saldo_awal_tahun_lalu) {
      res.status(400).json({
        success: false,
        error: `Saldo awal tahun ${current.tahun} terkunci otomatis karena terisi dari saldo akhir tahun sebelumnya (Rp ${current.saldo_awal_tahun_lalu.toLocaleString('id-ID')}).`,
      });
      return;
    }

    const updated = await updateSaldoInStore({
      saldo_awal_tahun_lalu: saldo_awal_tahun_lalu !== undefined ? Number(saldo_awal_tahun_lalu) : undefined,
      tahun,
      catatan,
    });

    res.json({
      success: true,
      message: `Saldo tahun ${updated.tahun} berhasil disimpan!`,
      data: updated,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Gagal memperbarui saldo.',
    });
  }
});

export default router;

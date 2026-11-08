import { Router, Request, Response } from 'express';
import { getUsersFromStore, getAppConfigFromStore } from '../googleSheets.ts';
import { createToken, requireAuth, AuthenticatedRequest } from '../auth.ts';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password, tahun } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username dan kata sandi wajib diisi.',
      });
      return;
    }

    const users = await getUsersFromStore();
    const cleanUsername = String(username).trim().toLowerCase();

    const user = users.find(
      (u) => u.username.toLowerCase() === cleanUsername && u.password_hash === String(password)
    );

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Username atau kata sandi tidak sesuai.',
      });
      return;
    }

    // Periksa status aktif/nonaktif akun
    if (user.status === 'nonaktif') {
      res.status(403).json({
        success: false,
        error: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi admin untuk mengaktifkan kembali.',
      });
      return;
    }

    const appConfig = await getAppConfigFromStore();
    const chosenYear = tahun || appConfig.tahun_aktif || '2026';

    const authUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      nama_lengkap: user.nama_lengkap,
      jabatan: user.jabatan,
      status: user.status || 'aktif',
    };

    const token = createToken(authUser);

    res.json({
      success: true,
      message: `Selamat datang, ${user.nama_lengkap}!`,
      data: {
        token,
        user: authUser,
        tahun_aktif: chosenYear,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Terjadi kesalahan internal server saat proses login.',
    });
  }
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: req.user,
  });
});

export default router;

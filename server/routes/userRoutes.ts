import { Router, Response } from 'express';
import {
  getUsersFromStore,
  addUserToStore,
  updateUserInStore,
  toggleUserStatusInStore,
  deleteUserFromStore,
} from '../googleSheets.ts';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../auth.ts';

const router = Router();

// GET all users - ADMIN ONLY
router.get('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawUsers = await getUsersFromStore();
    // Kembalikan users dengan password_hash di-mask
    const sanitized = rawUsers.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      nama_lengkap: u.nama_lengkap,
      jabatan: u.jabatan,
      status: u.status || 'aktif',
      created_at: u.created_at,
    }));

    res.json({
      success: true,
      data: sanitized,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Gagal memuat daftar pengguna.',
    });
  }
});

// POST create new user - ADMIN ONLY
router.post('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, password, role, nama_lengkap, jabatan, status } = req.body;

    if (!username || !password || !nama_lengkap) {
      res.status(400).json({
        success: false,
        error: 'Username, password, dan nama lengkap wajib diisi.',
      });
      return;
    }

    const assignedRole = role === 'admin' ? 'admin' : 'anggota';

    const created = await addUserToStore({
      username,
      password,
      role: assignedRole,
      nama_lengkap,
      jabatan,
      status: status === 'nonaktif' ? 'nonaktif' : 'aktif',
    });

    res.status(201).json({
      success: true,
      message: `Pengguna "${created.nama_lengkap}" (${created.role.toUpperCase()}) berhasil ditambahkan!`,
      data: {
        id: created.id,
        username: created.username,
        role: created.role,
        nama_lengkap: created.nama_lengkap,
        jabatan: created.jabatan,
        status: created.status,
      },
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err?.message || 'Gagal menambahkan pengguna baru.',
    });
  }
});

// PUT update user - ADMIN ONLY
router.put('/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { username, password, role, nama_lengkap, jabatan, status } = req.body;

    const updated = await updateUserInStore(id, {
      username,
      password,
      role,
      nama_lengkap,
      jabatan,
      status,
    });

    if (!updated) {
      res.status(404).json({
        success: false,
        error: `Pengguna dengan ID "${id}" tidak ditemukan.`,
      });
      return;
    }

    res.json({
      success: true,
      message: `Data pengguna "${updated.nama_lengkap}" berhasil diperbarui.`,
      data: {
        id: updated.id,
        username: updated.username,
        role: updated.role,
        nama_lengkap: updated.nama_lengkap,
        jabatan: updated.jabatan,
        status: updated.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Gagal memperbarui data pengguna.',
    });
  }
});

// PUT toggle status (aktif/nonaktif) - ADMIN ONLY
router.put('/:id/status', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Tidak boleh menonaktifkan akun sendiri
    if (req.user?.id === id && status === 'nonaktif') {
      res.status(400).json({
        success: false,
        error: 'Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.',
      });
      return;
    }

    const updated = await toggleUserStatusInStore(id, status);

    if (!updated) {
      res.status(404).json({
        success: false,
        error: `Pengguna tidak ditemukan.`,
      });
      return;
    }

    res.json({
      success: true,
      message: `Status pengguna "${updated.nama_lengkap}" berhasil diubah menjadi ${updated.status?.toUpperCase()}.`,
      data: {
        id: updated.id,
        status: updated.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Gagal mengubah status pengguna.',
    });
  }
});

// DELETE user - ADMIN ONLY
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Tidak boleh menghapus akun sendiri
    if (req.user?.id === id) {
      res.status(400).json({
        success: false,
        error: 'Anda tidak dapat menghapus akun Anda sendiri.',
      });
      return;
    }

    const success = await deleteUserFromStore(id);

    if (!success) {
      res.status(404).json({
        success: false,
        error: `Pengguna tidak ditemukan.`,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Pengguna berhasil dihapus dari sistem.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || 'Gagal menghapus pengguna.',
    });
  }
});

export default router;

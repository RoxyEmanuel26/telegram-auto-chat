'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { toast } from 'sonner';
import { 
  User, KeyRound, QrCode, ClipboardCheck, Loader2, Laptop, 
  MapPin, Settings, ShieldAlert, ShieldCheck, Database, 
  Plus, Trash2, Activity, Play, CheckCircle, X, Check, XCircle
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { UserRole } from 'shared';

interface Session {
  id: string;
  loginAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrentDevice: boolean;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  botId: string;
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt: string | null;
  bot: {
    name: string;
    username: string;
  };
}

interface UserData {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    name: string;
    email: string;
  } | null;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user, accessToken } = useAuthStore();
  const isAdmin = user?.role === UserRole.ADMIN;
  const isEditorOrAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.EDITOR;

  // Active settings tab: 'profile', 'webhooks', 'users', 'audit'
  const [activeTab, setActiveTab] = useState<'profile' | 'webhooks' | 'users' | 'audit'>('profile');

  // 2FA Setup state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret2FA, setSecret2FA] = useState('');
  const [otpVerify, setOtpVerify] = useState('');
  const [isProcessing2FA, setIsProcessing2FA] = useState(false);

  // Profile Form state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Webhooks Modal state
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookBotId, setWebhookBotId] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['post.sent', 'post.failed']);
  const [isSubmittingWebhook, setIsSubmittingWebhook] = useState(false);

  // Queries
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{ sessions: Session[] }>({
    queryKey: ['sessions'],
    queryFn: () => api.get('/auth/sessions'),
    enabled: activeTab === 'profile' && !!accessToken,
  });

  const { data: webhooksData, isLoading: webhooksLoading } = useQuery<{ webhooks: Webhook[] }>({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/webhooks'),
    enabled: activeTab === 'webhooks' && isEditorOrAdmin,
  });

  const { data: botsData } = useQuery<{ bots: any[] }>({
    queryKey: ['bots'],
    queryFn: () => api.get('/bots'),
    enabled: activeTab === 'webhooks' && isWebhookModalOpen,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: UserData[] }>({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
    enabled: activeTab === 'users' && isAdmin,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery<{ logs: AuditLog[] }>({
    queryKey: ['audit-logs'],
    queryFn: () => api.get('/users/audit-logs'),
    enabled: activeTab === 'audit' && isAdmin,
  });

  // 2FA Mutations
  const setup2FAMutation = useMutation<{ secret: string; qrCodeUrl: string }>({
    mutationFn: () => api.post('/auth/2fa/setup', {}),
    onSuccess: (data) => {
      setQrCodeUrl(data.qrCodeUrl);
      setSecret2FA(data.secret);
      setShow2FASetup(true);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menyiapkan 2FA');
    }
  });

  // Webhooks Mutations
  const createWebhookMutation = useMutation<any, any, any>({
    mutationFn: (body) => api.post('/webhooks', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook baru berhasil didaftarkan!');
      setIsWebhookModalOpen(false);
      resetWebhookForm();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal membuat webhook');
    }
  });

  const toggleWebhookMutation = useMutation<any, any, { id: string; isActive: boolean }>({
    mutationFn: ({ id, isActive }) => api.put(`/webhooks/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Status webhook diperbarui');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal merubah status webhook');
    }
  });

  const deleteWebhookMutation = useMutation<any, any, string>({
    mutationFn: (id) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook berhasil dihapus');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menghapus webhook');
    }
  });

  const testWebhookMutation = useMutation<any, any, string>({
    mutationFn: (id) => api.post(`/webhooks/${id}/test`, {}),
    onSuccess: () => {
      toast.success('Simulasi webhook ping dikirim ke antrian!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal mengetes webhook');
    }
  });

  // Users Mutations
  const updateUserRoleMutation = useMutation<any, any, { id: string; role: UserRole }>({
    mutationFn: ({ id, role }) => api.put(`/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Role pengguna diperbarui');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memperbarui role');
    }
  });

  const updateUserStatusMutation = useMutation<any, any, { id: string; isActive: boolean }>({
    mutationFn: ({ id, isActive }) => api.put(`/users/${id}/status`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Status aktif pengguna diperbarui');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memperbarui status');
    }
  });

  const resetWebhookForm = () => {
    setWebhookName('');
    setWebhookUrl('');
    setWebhookBotId('');
    setWebhookEvents(['post.sent', 'post.failed']);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName || !profileEmail) {
      toast.error('Nama dan Email wajib diisi');
      return;
    }
    setIsUpdatingProfile(true);
    try {
      const res = await api.put<{ user: any }>('/auth/profile', { name: profileName, email: profileEmail });
      toast.success('Profil berhasil diperbarui!');
      
      // Update store
      localStorage.setItem('user', JSON.stringify(res.user));
      useAuthStore.setState({ user: res.user });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memperbarui profil');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleEnable2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpVerify.length !== 6) {
      toast.error('Kode OTP harus 6 digit');
      return;
    }
    setIsProcessing2FA(true);
    try {
      await api.post('/auth/2fa/enable', { code: otpVerify });
      toast.success('2FA berhasil diaktifkan!');
      if (user) {
        const updated = { ...user, twoFactorEnabled: true };
        localStorage.setItem('user', JSON.stringify(updated));
        useAuthStore.setState({ user: updated });
      }
      setShow2FASetup(false);
      setOtpVerify('');
    } catch (err: any) {
      toast.error(err.message || 'Gagal memverifikasi OTP');
    } finally {
      setIsProcessing2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    const code = prompt('Masukkan kode OTP 2FA Anda untuk menonaktifkan 2FA:');
    if (!code) return;
    try {
      await api.post('/auth/2fa/disable', { code });
      toast.success('2FA dinonaktifkan.');
      if (user) {
        const updated = { ...user, twoFactorEnabled: false };
        localStorage.setItem('user', JSON.stringify(updated));
        useAuthStore.setState({ user: updated });
      }
    } catch (err: any) {
      toast.error(err.message || 'Kode OTP salah');
    }
  };

  const handleCreateWebhookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookName || !webhookUrl || !webhookBotId || webhookEvents.length === 0) {
      toast.error('Harap lengkapi semua kolom webhook');
      return;
    }
    setIsSubmittingWebhook(true);
    createWebhookMutation.mutate({
      name: webhookName,
      url: webhookUrl,
      botId: webhookBotId,
      events: webhookEvents
    }, {
      onSettled: () => setIsSubmittingWebhook(false)
    });
  };

  const handleToggleEvent = (event: string) => {
    if (webhookEvents.includes(event)) {
      setWebhookEvents(webhookEvents.filter(e => e !== event));
    } else {
      setWebhookEvents([...webhookEvents, event]);
    }
  };

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
            <Settings className="w-8 h-8 text-primary animate-spin-slow" />
            <span>Pengaturan Sistem</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Konfigurasi profil, keamanan, webhook eksternal, dan audit aktivitas.</p>
        </header>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-850 mb-6 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-5 py-3.5 font-bold text-sm cursor-pointer transition-all border-b-2 flex items-center space-x-2 ${
              activeTab === 'profile'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profil & Keamanan</span>
          </button>
          
          {isEditorOrAdmin && (
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-5 py-3.5 font-bold text-sm cursor-pointer transition-all border-b-2 flex items-center space-x-2 ${
                activeTab === 'webhooks'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Webhook Integrasi</span>
            </button>
          )}

          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('users')}
                className={`px-5 py-3.5 font-bold text-sm cursor-pointer transition-all border-b-2 flex items-center space-x-2 ${
                  activeTab === 'users'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Manajemen Admin</span>
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-5 py-3.5 font-bold text-sm cursor-pointer transition-all border-b-2 flex items-center space-x-2 ${
                  activeTab === 'audit'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Audit Logs Trail</span>
              </button>
            </>
          )}
        </div>

        {/* TAB 1: PROFILE & SECURITY */}
        {activeTab === 'profile' && user && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Profile details form */}
              <form onSubmit={handleUpdateProfile} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-5 shadow-xl">
                <h3 className="text-base font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
                  <User className="w-4.5 h-4.5 text-primary" />
                  <span>Detail Profil Akun</span>
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 block uppercase">Nama Pengguna</label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 block uppercase">Alamat Email</label>
                    <input
                      type="email"
                      required
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Perbarui Profil'}
                  </button>
                </div>
              </form>

              {/* 2FA Configuration card */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-xl">
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <KeyRound className="w-4.5 h-4.5 text-primary" />
                    <span>Autentikasi Dua Faktor (2FA)</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Tingkatkan proteksi akun dengan mewajibkan verifikasi kode Google Authenticator saat proses login berlangsung.
                  </p>
                  <div className="flex items-center space-x-2 pt-2 text-xs">
                    <span className="text-slate-400">Status 2FA:</span>
                    {user.twoFactorEnabled ? (
                      <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-bold border border-green-500/20 text-[10px] flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>AKTIF</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-bold border border-yellow-500/20 text-[10px] flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>NON-AKTIF</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-6">
                  {user.twoFactorEnabled ? (
                    <button
                      onClick={handleDisable2FA}
                      className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl py-3 font-semibold text-xs cursor-pointer transition-all"
                    >
                      Matikan 2FA
                    </button>
                  ) : (
                    <button
                      onClick={() => setup2FAMutation.mutate()}
                      disabled={setup2FAMutation.isPending}
                      className="w-full bg-primary hover:bg-primary/95 text-white rounded-xl py-3 font-bold text-xs cursor-pointer transition-all flex items-center justify-center space-x-1"
                    >
                      {setup2FAMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <QrCode className="w-4 h-4" />
                          <span>Aktifkan 2FA Sekarang</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Session Logs list */}
            <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h3 className="text-base font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3 mb-4">
                <Laptop className="w-4.5 h-4.5 text-primary" />
                <span>Riwayat Sesi Login Masuk</span>
              </h3>

              {sessionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : !sessionsData?.sessions || sessionsData.sessions.length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-6">Belum ada riwayat masuk.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 uppercase font-bold">
                        <th className="pb-3 w-1/4">Tanggal & Jam</th>
                        <th className="pb-3 w-1/4">Alamat IP</th>
                        <th className="pb-3">Perangkat / User Agent</th>
                        <th className="pb-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {sessionsData.sessions.map((session) => (
                        <tr key={session.id} className="hover:bg-slate-950/20">
                          <td className="py-3 text-slate-400">{new Date(session.loginAt).toLocaleString('id-ID')}</td>
                          <td className="py-3 font-mono text-[10px]">
                            <span className="flex items-center space-x-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-500" />
                              <span>{session.ipAddress || 'Internal/Unknown'}</span>
                            </span>
                          </td>
                          <td className="py-3 max-w-[300px] truncate" title={session.userAgent || ''}>{session.userAgent || 'Unknown Agent'}</td>
                          <td className="py-3 text-right">
                            {session.isCurrentDevice ? (
                              <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-bold border border-green-500/20 text-[9px]">
                                Sesi Aktif
                              </span>
                            ) : (
                              <span className="text-slate-500">Tersimpan</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 2FA setup Modal dialog overlay */}
            {show2FASetup && (
              <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-bold text-white">Setup Kunci Google 2FA</h3>
                    <p className="text-slate-400 text-[11px] mt-1">Pindai QR Code di bawah menggunakan aplikasi Google Authenticator</p>
                  </div>

                  {qrCodeUrl && (
                    <div className="bg-white p-3.5 rounded-2xl w-40 h-40 mx-auto flex items-center justify-center shadow-lg">
                      <img src={qrCodeUrl} alt="2FA QR Code" className="w-full h-full" />
                    </div>
                  )}

                  <div className="bg-slate-955 p-3 rounded-xl border border-white/5 flex items-center justify-between text-xs font-mono">
                    <code className="text-slate-350 select-all truncate max-w-[200px]">{secret2FA}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(secret2FA);
                        toast.success('Kode salin berhasil!');
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 cursor-pointer"
                    >
                      <ClipboardCheck className="w-4 h-4 text-primary" />
                    </button>
                  </div>

                  <form onSubmit={handleEnable2FASubmit} className="space-y-4">
                    <div className="space-y-1 text-center">
                      <label className="text-[10px] font-bold text-slate-300 uppercase block">Masukkan OTP 6-Digit</label>
                      <input
                        type="text"
                        maxLength={6}
                        required
                        placeholder="000000"
                        value={otpVerify}
                        onChange={(e) => setOtpVerify(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 text-center text-white placeholder-slate-600 text-lg tracking-[0.2em] font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="flex space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShow2FASetup(false)}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl py-2.5 font-bold text-xs"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isProcessing2FA || otpVerify.length !== 6}
                        className="flex-1 bg-primary hover:bg-primary/95 text-white rounded-xl py-2.5 font-bold text-xs"
                      >
                        {isProcessing2FA ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Verifikasi'}
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            )}

          </div>
        )}

        {/* TAB 2: WEBHOOKS INTEGRATION */}
        {activeTab === 'webhooks' && isEditorOrAdmin && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-primary" />
                  <span>Daftar Outgoing Webhook</span>
                </h3>
                <p className="text-slate-400 text-xs mt-1">Kirimkan event siaran langsung ke URL server Anda secara otomatis.</p>
              </div>

              <button
                onClick={() => {
                  resetWebhookForm();
                  setIsWebhookModalOpen(true);
                }}
                className="bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-lg shadow-primary/20 w-fit"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Webhook</span>
              </button>
            </div>

            {webhooksLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
            ) : !webhooksData?.webhooks || webhooksData.webhooks.length === 0 ? (
              <div className="text-center py-16 space-y-4 border-2 border-dashed border-slate-850 rounded-2xl">
                <Activity className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-350">Belum Ada Webhook Terdaftar</h4>
                <p className="text-slate-500 text-xs max-w-xs mx-auto leading-normal">
                  Daftarkan URL server endpoint Anda agar TeleHub dapat mem-push callback ketika siaran sukses atau gagal.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {webhooksData.webhooks.map((wh) => (
                  <div key={wh.id} className="bg-slate-950/40 border border-slate-850 rounded-2xl p-5 space-y-4 relative hover:border-slate-750 transition-all">
                    
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-900 pb-3">
                      <div>
                        <h4 className="font-bold text-white text-sm">{wh.name}</h4>
                        <span className="text-[10px] text-slate-500 block mt-0.5">Sub: @{wh.bot.username}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Status Toggle */}
                        <button
                          onClick={() => toggleWebhookMutation.mutate({ id: wh.id, isActive: !wh.isActive })}
                          className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase cursor-pointer ${
                            wh.isActive 
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {wh.isActive ? 'Active' : 'Disabled'}
                        </button>
                      </div>
                    </div>

                    {/* URL and Secret details */}
                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="text-slate-500 text-[10px] block">TARGET URL</span>
                        <p className="text-slate-300 font-mono break-all leading-normal text-[11px]">{wh.url}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">WEBHOOK SECRET KEY</span>
                        <code className="text-primary font-mono select-all break-all text-[10px] bg-slate-950 px-2 py-1.5 rounded border border-white/5 block mt-0.5">{wh.secret}</code>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">EVENTS</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {wh.events.map(ev => (
                            <span key={ev} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[8px] font-bold font-mono">{ev}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Webhook statistics */}
                    <div className="border-t border-slate-900 pt-3 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Gagal: <strong className={wh.failureCount > 0 ? 'text-red-400 font-bold' : ''}>{wh.failureCount} / 10</strong></span>
                      <span>Terakhir: <strong className="text-slate-300">{wh.lastTriggeredAt ? new Date(wh.lastTriggeredAt).toLocaleTimeString('id-ID') : '-'}</strong></span>
                    </div>

                    {/* Footer buttons */}
                    <div className="border-t border-slate-900 pt-3 flex items-center justify-between">
                      <button
                        onClick={() => testWebhookMutation.mutate(wh.id)}
                        disabled={testWebhookMutation.isPending}
                        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 text-[10px] font-bold cursor-pointer border border-slate-800 transition-all disabled:opacity-50"
                      >
                        <Play className="w-3 h-3 text-green-400" />
                        <span>Kirim Test Ping</span>
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Apakah Anda yakin ingin menghapus webhook "${wh.name}"?`)) {
                            deleteWebhookMutation.mutate(wh.id);
                          }
                        }}
                        disabled={deleteWebhookMutation.isPending}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}

            {/* CREATE WEBHOOK SLIDE-IN MODAL DIALOG */}
            {isWebhookModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <form onSubmit={handleCreateWebhookSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5">
                  
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
                    <h4 className="text-base font-bold text-white flex items-center space-x-2">
                      <Activity className="w-4.5 h-4.5 text-primary" />
                      <span>Daftarkan Webhook Baru</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsWebhookModalOpen(false)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Webhook Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">Nama Identitas Webhook</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Server Production Callback"
                      value={webhookName}
                      onChange={(e) => setWebhookName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white"
                    />
                  </div>

                  {/* Webhook URL Target */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">Target Payload URL (HTTP POST)</label>
                    <input
                      type="url"
                      required
                      placeholder="https://domain.com/webhooks/telehub"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white text-left font-mono"
                    />
                  </div>

                  {/* Bot selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">Dengarkan Bot Pengirim</label>
                    <select
                      value={webhookBotId}
                      required
                      onChange={(e) => setWebhookBotId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-350 rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                    >
                      <option value="">-- Pilih Bot --</option>
                      {botsData?.bots.map(b => (
                        <option key={b.id} value={b.id}>{b.name} (@{b.username})</option>
                      ))}
                    </select>
                  </div>

                  {/* Checkboxes for events */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 block">Berlangganan Event</label>
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                      
                      <label className="flex items-center space-x-2.5 p-2 bg-slate-950/40 border border-slate-850 rounded-xl cursor-pointer hover:text-white select-none">
                        <input
                          type="checkbox"
                          checked={webhookEvents.includes('post.sent')}
                          onChange={() => handleToggleEvent('post.sent')}
                          className="rounded border-slate-800 bg-slate-900 text-primary w-4 h-4 focus:ring-0"
                        />
                        <span>post.sent</span>
                      </label>

                      <label className="flex items-center space-x-2.5 p-2 bg-slate-950/40 border border-slate-850 rounded-xl cursor-pointer hover:text-white select-none">
                        <input
                          type="checkbox"
                          checked={webhookEvents.includes('post.failed')}
                          onChange={() => handleToggleEvent('post.failed')}
                          className="rounded border-slate-800 bg-slate-900 text-primary w-4 h-4 focus:ring-0"
                        />
                        <span>post.failed</span>
                      </label>

                      <label className="flex items-center space-x-2.5 p-2 bg-slate-950/40 border border-slate-850 rounded-xl cursor-pointer hover:text-white select-none">
                        <input
                          type="checkbox"
                          checked={webhookEvents.includes('import.completed')}
                          onChange={() => handleToggleEvent('import.completed')}
                          className="rounded border-slate-800 bg-slate-900 text-primary w-4 h-4 focus:ring-0"
                        />
                        <span>import.completed</span>
                      </label>

                      <label className="flex items-center space-x-2.5 p-2 bg-slate-950/40 border border-slate-850 rounded-xl cursor-pointer hover:text-white select-none">
                        <input
                          type="checkbox"
                          checked={webhookEvents.includes('webhook.test')}
                          onChange={() => handleToggleEvent('webhook.test')}
                          className="rounded border-slate-800 bg-slate-900 text-primary w-4 h-4 focus:ring-0"
                        />
                        <span>webhook.test</span>
                      </label>

                    </div>
                  </div>

                  {/* Submit buttons */}
                  <div className="flex justify-end space-x-2 pt-4 border-t border-slate-850">
                    <button
                      type="button"
                      onClick={() => setIsWebhookModalOpen(false)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl px-4 py-2 text-xs font-bold"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingWebhook}
                      className="bg-primary hover:bg-primary/95 text-white rounded-xl px-5 py-2.5 font-bold text-xs flex items-center justify-center space-x-1"
                    >
                      {isSubmittingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Daftarkan Webhook'}
                    </button>
                  </div>

                </form>
              </div>
            )}

          </div>
        )}

        {/* TAB 3: USER MANAGEMENT */}
        {activeTab === 'users' && isAdmin && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
                <Database className="w-5 h-5 text-primary" />
                <span>Manajemen Akses Admin & Editor</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1">Daftar hak akses tim administrator TeleHub. Hanya Admin yang dapat memodifikasi hak akses.</p>
            </div>

            {usersLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
            ) : !usersData?.users || usersData.users.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-6">Tidak ada pengguna ditemukan.</p>
            ) : (
              <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase">
                        <th className="p-4">Identitas User</th>
                        <th className="p-4">Tanggal Gabung</th>
                        <th className="p-4">Terakhir Aktif</th>
                        <th className="p-4">Level Akses (Role)</th>
                        <th className="p-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {usersData.users.map((usr) => {
                        const isSelf = usr.id === user.id;
                        
                        return (
                          <tr key={usr.id} className="hover:bg-slate-950/10">
                            <td className="p-4">
                              <div>
                                <h4 className="font-bold text-white text-sm">{usr.name} {isSelf && <span className="text-[10px] font-normal text-slate-500">(Anda)</span>}</h4>
                                <span className="text-[10px] text-slate-500 block mt-0.5">{usr.email}</span>
                              </div>
                            </td>
                            <td className="p-4 text-slate-400">
                              {new Date(usr.createdAt).toLocaleDateString('id-ID')}
                            </td>
                            <td className="p-4 text-slate-400">
                              {usr.lastLoginAt ? new Date(usr.lastLoginAt).toLocaleString('id-ID') : <span className="text-slate-600 italic">Belum masuk</span>}
                            </td>
                            <td className="p-4">
                              <select
                                value={usr.role}
                                disabled={isSelf}
                                onChange={(e) => updateUserRoleMutation.mutate({ id: usr.id, role: e.target.value as UserRole })}
                                className="bg-slate-950 border border-slate-800 text-slate-350 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none disabled:opacity-50"
                              >
                                <option value={UserRole.ADMIN}>ADMIN</option>
                                <option value={UserRole.EDITOR}>EDITOR</option>
                                <option value={UserRole.VIEWER}>VIEWER</option>
                              </select>
                            </td>
                            <td className="p-4 text-center">
                              <button
                                disabled={isSelf}
                                onClick={() => updateUserStatusMutation.mutate({ id: usr.id, isActive: !usr.isActive })}
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold cursor-pointer disabled:opacity-50 transition-all ${
                                  usr.isActive
                                    ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20'
                                }`}
                              >
                                {usr.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 4: AUDIT TRAILS */}
        {activeTab === 'audit' && isAdmin && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
                <Activity className="w-5 h-5 text-primary" />
                <span>Audit Trail Aktivitas Sistem</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1">Catatan audit riwayat operasi modifikasi data bot, template, webhook, dan akses login.</p>
            </div>

            {auditLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
            ) : !auditData?.logs || auditData.logs.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-8">Belum ada catatan audit log terekam.</p>
            ) : (
              <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase sticky top-0 z-10">
                        <th className="p-4">Tanggal & Jam</th>
                        <th className="p-4">User</th>
                        <th className="p-4">Aksi / Event</th>
                        <th className="p-4">Target Resource</th>
                        <th className="p-4">Alamat IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono text-[11px]">
                      {auditData.logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-950/10">
                          <td className="p-4 text-slate-450 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('id-ID')}
                          </td>
                          <td className="p-4">
                            {log.user ? (
                              <div>
                                <span className="font-bold text-slate-200 block text-xs">{log.user.name}</span>
                                <span className="text-[10px] text-slate-500 block">{log.user.email}</span>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">Anonymous/System</span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[9px] font-bold">
                              {log.action}
                            </span>
                          </td>
                          <td className="p-4 text-slate-350">
                            <strong>{log.resource}</strong> {log.resourceId && `[ID: ${log.resourceId.slice(0, 8)}...]`}
                          </td>
                          <td className="p-4 text-slate-500">
                            {log.ipAddress || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </SidebarLayout>
  );
}

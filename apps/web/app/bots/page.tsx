'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { toast } from 'sonner';
import { 
  Bot, ShieldCheck, ShieldAlert, Trash2, Plus, X, 
  Activity, Calendar, Loader2, Sparkles, RefreshCw 
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface BotData {
  id: string;
  name: string;
  username: string;
  description: string | null;
  isActive: boolean;
  avatarUrl: string | null;
  createdAt: string;
  _count: {
    channels: number;
  };
}

export default function BotsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form states
  const [newToken, setNewToken] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isTestingNewToken, setIsTestingNewToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Query: Fetch bots
  const { data, isLoading } = useQuery<{ bots: BotData[] }>({
    queryKey: ['bots'],
    queryFn: () => api.get('/bots'),
  });

  // Mutation: Add Bot
  const addBotMutation = useMutation<any, any, { token: string; name: string; description: string }>({
    mutationFn: (body) => api.post('/bots', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
      toast.success('Bot berhasil ditambahkan!');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menambahkan bot');
    }
  });

  // Mutation: Delete Bot
  const deleteBotMutation = useMutation<any, any, string>({
    mutationFn: (id) => api.delete(`/bots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
      toast.success('Bot berhasil dihapus');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menghapus bot');
    }
  });

  const resetForm = () => {
    setNewToken('');
    setNewName('');
    setNewDesc('');
  };

  // Diagnostic: Test bot token connection
  const testNewTokenConnection = async () => {
    if (!newToken) {
      toast.error('Masukkan token bot terlebih dahulu');
      return;
    }

    setIsTestingNewToken(true);
    try {
      const res = await fetch(`https://api.telegram.org/bot${newToken}/getMe`);
      const data = await res.json();
      
      if (data.ok) {
        toast.success(`Koneksi Sukses! Bot terdeteksi: @${data.result.username} (${data.result.first_name})`);
        if (!newName) {
          setNewName(data.result.first_name);
        }
      } else {
        toast.error(`Gagal menghubungkan: ${data.description || 'Token salah'}`);
      }
    } catch (err) {
      toast.error('Terjadi kesalahan jaringan saat mengetes token');
    } finally {
      setIsTestingNewToken(false);
    }
  };

  const handleTestExistingConnection = async (botId: string) => {
    setTestingId(botId);
    try {
      const res = await api.post<{ success: boolean; botInfo?: any; error?: string }>(`/bots/${botId}/test`, {});
      if (res.success) {
        toast.success(`Koneksi aktif! Status bot @${res.botInfo.username} aman.`);
      } else {
        toast.error(`Koneksi bot terputus: ${res.error || 'Token kedaluwarsa'}`);
        queryClient.invalidateQueries({ queryKey: ['bots'] });
      }
    } catch (error: any) {
      toast.error(error.message || 'Gagal mengetes koneksi');
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteBot = (bot: BotData) => {
    if (confirm(`Apakah Anda yakin ingin menghapus bot @${bot.username}? Semua channel yang terhubung akan terputus.`)) {
      deleteBotMutation.mutate(bot.id);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToken || !newName) {
      toast.error('Token dan Nama Display wajib diisi');
      return;
    }
    setIsSubmitting(true);
    addBotMutation.mutate({
      token: newToken,
      name: newName,
      description: newDesc
    }, {
      onSettled: () => setIsSubmitting(false)
    });
  };

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header section */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
              <Bot className="w-8 h-8 text-primary" />
              <span>Telegram Bots</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Kelola bot Telegram pengirim konten dan uji konektivitas API.</p>
          </div>
          
          {user?.role !== 'VIEWER' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-primary/20 transition-all active:scale-[0.98] w-fit"
            >
              <Plus className="w-5 h-5" />
              <span>Tambah Bot Baru</span>
            </button>
          )}
        </header>

        {/* Loading / Cards Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : !data?.bots || data.bots.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <Bot className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Belum Ada Bot Terdaftar</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Daftarkan Telegram Bot API Token Anda terlebih dahulu agar TeleHub dapat mengirim pesan ke channel target.
            </p>
            {user?.role !== 'VIEWER' && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-primary hover:bg-primary/95 text-white px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all mt-2"
              >
                Tambah Bot Sekarang
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.bots.map((bot) => (
              <div key={bot.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all">
                <div className="space-y-4">
                  {/* Top user / avatar info */}
                  <div className="flex items-center space-x-3">
                    {bot.avatarUrl ? (
                      <img
                        src={bot.avatarUrl.startsWith('http') ? bot.avatarUrl : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}${bot.avatarUrl}`}
                        alt={bot.name}
                        className="w-12 h-12 rounded-2xl object-cover border border-slate-800"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                          const sibling = (e.currentTarget as HTMLImageElement).nextElementSibling;
                          if (sibling) {
                            (sibling as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-extrabold text-lg"
                      style={{ display: bot.avatarUrl ? 'none' : 'flex' }}
                    >
                      {bot.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="font-bold text-white truncate">{bot.name}</h3>
                      <p className="text-xs text-primary truncate">@{bot.username}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 h-8 leading-relaxed">
                    {bot.description || 'Tidak ada deskripsi bot.'}
                  </p>

                  <div className="border-t border-slate-800/80 pt-4 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block font-medium">CHANNEL TERHUBUNG</span>
                      <p className="text-white font-bold text-sm mt-0.5">{bot._count.channels} Channel</p>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">STATUS</span>
                      <div className="flex items-center space-x-1 mt-0.5">
                        {bot.isActive ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-green-400 font-bold">ACTIVE</span>
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-red-400 font-bold">ERROR</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card footer triggers */}
                <div className="border-t border-slate-800/80 pt-4 mt-6 flex items-center justify-between">
                  <button
                    onClick={() => handleTestExistingConnection(bot.id)}
                    disabled={testingId === bot.id}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {testingId === bot.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span>Tes Koneksi</span>
                  </button>

                  {user?.role === 'ADMIN' && (
                    <button
                      onClick={() => handleDeleteBot(bot)}
                      disabled={deleteBotMutation.isPending}
                      className="p-2 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ADD BOT SLIDE-IN MODAL DIALOG */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <form onSubmit={handleAddSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span>Tambah Bot Baru</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Bot API Token */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Telegram Bot Token</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    required
                    placeholder="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={testNewTokenConnection}
                    disabled={isTestingNewToken || !newToken}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl px-4 text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50"
                  >
                    {isTestingNewToken ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Cek</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Dapatkan token bot dengan membuat bot baru di Telegram via Bapa Bot resmi: <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@BotFather</a>.
                </p>
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Nama Display (Alias Internal)</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Bot Promo Utama"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Deskripsi / Catatan (Opsional)</label>
                <textarea
                  placeholder="Keterangan singkat fungsi bot ini..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 border-t border-slate-800 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl px-5 py-3 font-semibold text-sm cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary hover:bg-primary/95 text-white rounded-xl px-5 py-3 font-bold text-sm cursor-pointer transition-all flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Simpan Bot</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}

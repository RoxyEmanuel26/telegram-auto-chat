'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { toast } from 'sonner';
import { 
  Radio, Plus, Trash2, Send, X, Search, Filter, 
  Loader2, Globe, Users, MessageCircle, AlertCircle 
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface ChannelData {
  id: string;
  chatId: string;
  name: string;
  type: 'CHANNEL' | 'GROUP' | 'SUPERGROUP';
  username: string | null;
  memberCount: number;
  description: string | null;
  isActive: boolean;
  tags: string[];
  createdAt: string;
  bot: {
    id: string;
    name: string;
    username: string;
  };
}

interface BotData {
  id: string;
  name: string;
  username: string;
}

export default function ChannelsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [botFilter, setBotFilter] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form states
  const [newChatId, setNewChatId] = useState('');
  const [newBotId, setNewBotId] = useState('');
  const [newTagsStr, setNewTagsStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Query: Fetch channels
  const { data: channelsData, isLoading: channelsLoading } = useQuery<{ channels: ChannelData[] }>({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels'),
  });

  // Query: Fetch bots (for add-channel dropdown)
  const { data: botsData } = useQuery<{ bots: BotData[] }>({
    queryKey: ['bots'],
    queryFn: () => api.get('/bots'),
  });

  // Mutation: Add Channel
  const addChannelMutation = useMutation<any, any, { chatId: string; botId: string; tags: string[] }>({
    mutationFn: (body) => api.post('/channels', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel/Group berhasil ditambahkan dan terverifikasi!');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memverifikasi channel. Pastikan bot adalah admin di chat tersebut.');
    }
  });

  // Mutation: Delete Channel
  const deleteChannelMutation = useMutation<any, any, string>({
    mutationFn: (id) => api.delete(`/channels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel/Group berhasil dihapus');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menghapus channel');
    }
  });

  const resetForm = () => {
    setNewChatId('');
    setNewBotId('');
    setNewTagsStr('');
  };

  const handleTestPost = async (channelId: string) => {
    setTestingId(channelId);
    try {
      const res = await api.post<{ success: boolean; message: string }>(`/channels/${channelId}/test`, {});
      if (res.success) {
        toast.success(res.message || 'Pesan test terkirim berhasil!');
      } else {
        toast.error('Gagal mengirim pesan test');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error mengirim pesan test');
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteChannel = (channel: ChannelData) => {
    if (confirm(`Apakah Anda yakin ingin menghapus channel "${channel.name}"?`)) {
      deleteChannelMutation.mutate(channel.id);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatId || !newBotId) {
      toast.error('Chat ID dan Bot wajib diisi');
      return;
    }
    setIsSubmitting(true);
    
    // Parse tags (comma separated)
    const tags = newTagsStr
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    addChannelMutation.mutate({
      chatId: newChatId,
      botId: newBotId,
      tags
    }, {
      onSettled: () => setIsSubmitting(false)
    });
  };

  // Filter channels
  const filteredChannels = channelsData?.channels.filter(ch => {
    const matchesSearch = ch.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (ch.username && ch.username.toLowerCase().includes(searchQuery.toLowerCase())) || 
      ch.chatId.includes(searchQuery);

    const matchesBot = botFilter === '' || ch.bot.id === botFilter;

    return matchesSearch && matchesBot;
  }) || [];

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header section */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
              <Radio className="w-8 h-8 text-primary" />
              <span>Channels & Groups</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Daftar channel dan grup target yang dihubungkan ke bot.</p>
          </div>

          {user?.role !== 'VIEWER' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-primary/20 transition-all active:scale-[0.98] w-fit"
            >
              <Plus className="w-5 h-5" />
              <span>Hubungkan Channel</span>
            </button>
          )}
        </header>

        {/* Filters and search toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center gap-4">
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, username, atau ID chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-slate-500"
            />
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={botFilter}
              onChange={(e) => setBotFilter(e.target.value)}
              className="w-full md:w-48 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            >
              <option value="">Semua Bot</option>
              {botsData?.bots.map(bot => (
                <option key={bot.id} value={bot.id}>@{bot.username}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Channel Table / Empty State */}
        {channelsLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <Radio className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Channel Tidak Ditemukan</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              {searchQuery || botFilter 
                ? 'Pencarian Anda tidak membuahkan hasil. Coba ganti kata kunci atau filter bot.' 
                : 'Hubungkan channel atau grup Telegram agar bot terdaftar dapat menyebarkan konten postingan Anda.'}
            </p>
            {!searchQuery && !botFilter && user?.role !== 'VIEWER' && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-primary hover:bg-primary/95 text-white px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all mt-2"
              >
                Hubungkan Sekarang
              </button>
            )}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold bg-slate-950/40">
                    <th className="p-4">Nama Channel</th>
                    <th className="p-4">Tipe</th>
                    <th className="p-4">Bot Pengirim</th>
                    <th className="p-4">Anggota</th>
                    <th className="p-4">Tags</th>
                    <th className="p-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {filteredChannels.map((channel) => (
                    <tr key={channel.id} className="hover:bg-slate-950/10">
                      <td className="p-4">
                        <div>
                          <h4 className="font-bold text-white text-sm">{channel.name}</h4>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            {channel.username ? `@${channel.username}` : `ID: ${channel.chatId}`}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[10px] uppercase">
                          {channel.type}
                        </span>
                      </td>
                      <td className="p-4">
                        <div>
                          <span className="text-white font-semibold">{channel.bot.name}</span>
                          <span className="text-[10px] text-primary block">@{channel.bot.username}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-1.5 text-slate-300">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-bold text-sm">{channel.memberCount.toLocaleString('id-ID')}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {channel.tags.length > 0 ? (
                            channel.tags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium text-[9px] uppercase border border-primary/10">
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleTestPost(channel.id)}
                            disabled={testingId === channel.id}
                            title="Kirim pesan test"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                          >
                            {testingId === channel.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4 text-primary" />
                            )}
                          </button>

                          {user?.role === 'ADMIN' && (
                            <button
                              onClick={() => handleDeleteChannel(channel)}
                              disabled={deleteChannelMutation.isPending}
                              title="Hapus dari sistem"
                              className="p-2 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* HUBUNGKAN CHANNEL MODAL DIALOG */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <form onSubmit={handleAddSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                  <Globe className="w-5 h-5 text-primary" />
                  <span>Hubungkan Channel Baru</span>
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

              {/* Warning box */}
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start space-x-2.5 text-xs text-blue-200">
                <AlertCircle className="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Penting:</strong> Bot pengirim yang dipilih harus terlebih dahulu diundang ke dalam channel/grup sebagai <strong>Administrator</strong> dengan hak akses mengirim pesan.
                </p>
              </div>

              {/* Bot Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Pilih Bot Pengirim</label>
                <select
                  required
                  value={newBotId}
                  onChange={(e) => setNewBotId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- Pilih Bot --</option>
                  {botsData?.bots.map(bot => (
                    <option key={bot.id} value={bot.id}>{bot.name} (@{bot.username})</option>
                  ))}
                </select>
              </div>

              {/* Chat Username or ID */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Username / Chat ID</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: @mychannelname atau -10012345678"
                  value={newChatId}
                  onChange={(e) => setNewChatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-[10px] text-slate-400">
                  Untuk channel publik gunakan username `@channelname`. Untuk channel/grup privat masukkan ID (umumnya diawali `-100`).
                </p>
              </div>

              {/* Tags (comma separated) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Tags / Label (Dipisahkan koma)</label>
                <input
                  type="text"
                  placeholder="Contoh: News, Promo, VIP"
                  value={newTagsStr}
                  onChange={(e) => setNewTagsStr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Actions */}
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
                  disabled={isSubmitting || !newBotId || !newChatId}
                  className="bg-primary hover:bg-primary/95 text-white rounded-xl px-5 py-3 font-bold text-sm cursor-pointer transition-all flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Verifikasi & Simpan</span>
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

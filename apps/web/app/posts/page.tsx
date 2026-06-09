'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { toast } from 'sonner';
import { 
  History, Eye, RefreshCw, Loader2, ArrowRight, Clock, 
  CheckCircle, AlertCircle, AlertTriangle, FileText, Bot, X 
} from 'lucide-react';
import { PostStatus, TargetStatus } from 'shared';
import DOMPurify from 'dompurify';

interface PostData {
  id: string;
  title: string;
  status: PostStatus;
  createdAt: string;
  sentAt: string | null;
  bot: {
    name: string;
    username: string;
  };
  _count: {
    targets: number;
  };
}

interface TargetDetail {
  id: string;
  status: TargetStatus;
  telegramMessageId: number | null;
  sentAt: string | null;
  errorMessage: string | null;
  channel: {
    name: string;
    chatId: string;
  };
}

interface PostDetail extends PostData {
  content: string;
  targets: TargetDetail[];
}

export default function PostsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Query: Fetch all posts
  const { data: postsData, isLoading: postsLoading } = useQuery<{ posts: PostData[] }>({
    queryKey: ['posts'],
    queryFn: () => api.get('/posts'),
    refetchInterval: (query) => {
      const posts = query.state.data?.posts;
      const hasActive = posts?.some(
        (post: any) => post.status === PostStatus.QUEUED || post.status === PostStatus.SENDING
      );
      return hasActive ? 4000 : false;
    }
  });

  // Query: Fetch selected post detail
  const { data: detailData, isLoading: detailLoading } = useQuery<{ post: PostDetail }>({
    queryKey: ['post-detail', selectedPostId],
    queryFn: () => api.get(`/posts/${selectedPostId}`),
    enabled: !!selectedPostId,
    refetchInterval: (query) => {
      const post = query.state.data?.post;
      const isActive = post && (post.status === PostStatus.QUEUED || post.status === PostStatus.SENDING);
      return isActive ? 4000 : false;
    }
  });

  // Mutation: Retry failed targets
  const retryMutation = useMutation<any, any, string>({
    mutationFn: (id) => api.post(`/posts/${id}/retry`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post-detail', selectedPostId] });
      toast.success('Gagal kirim berhasil di-antrikan ulang!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal merestart pengiriman');
    }
  });

  const getStatusBadge = (status: PostStatus) => {
    switch (status) {
      case PostStatus.DRAFT:
        return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-bold uppercase text-[9px]">Draft</span>;
      case PostStatus.QUEUED:
        return <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold uppercase text-[9px] flex items-center w-fit gap-1"><Clock className="w-3 h-3" /> Antri</span>;
      case PostStatus.SENDING:
        return <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold uppercase text-[9px] flex items-center w-fit gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Mengirim</span>;
      case PostStatus.SENT:
        return <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-bold uppercase text-[9px] flex items-center w-fit gap-1"><CheckCircle className="w-3 h-3" /> Sukses</span>;
      case PostStatus.PARTIAL_SENT:
        return <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-bold uppercase text-[9px] flex items-center w-fit gap-1"><AlertTriangle className="w-3 h-3" /> Sebagian</span>;
      case PostStatus.FAILED:
        return <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase text-[9px] flex items-center w-fit gap-1"><AlertCircle className="w-3 h-3" /> Gagal</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-bold uppercase text-[9px]">{status}</span>;
    }
  };

  const getTargetStatusBadge = (status: TargetStatus) => {
    switch (status) {
      case TargetStatus.PENDING:
        return <span className="text-purple-400 font-semibold uppercase">Pending</span>;
      case TargetStatus.SENT:
        return <span className="text-green-400 font-semibold uppercase">Terkirim</span>;
      case TargetStatus.FAILED:
        return <span className="text-red-400 font-semibold uppercase">Gagal</span>;
    }
  };

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 items-start">
        {/* Left column: Posts table list */}
        <div className="w-full lg:flex-1 space-y-6">
          <header>
            <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
              <History className="w-8 h-8 text-primary" />
              <span>Riwayat Siaran</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Status realtime pesan-pesan yang telah dikirim atau dijadwalkan.</p>
          </header>

          {postsLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : !postsData?.posts || postsData.posts.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Belum Ada Riwayat Siaran</h3>
              <p className="text-slate-400 text-sm max-w-sm mx-auto">
                Silakan buat postingan pertama Anda di menu "Buat Post".
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold bg-slate-950/40">
                      <th className="p-4">Postingan</th>
                      <th className="p-4">Bot</th>
                      <th className="p-4">Target</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {postsData.posts.map((post) => (
                      <tr key={post.id} className={`hover:bg-slate-950/10 ${selectedPostId === post.id ? 'bg-primary/5' : ''}`}>
                        <td className="p-4">
                          <div>
                            <h4 className="font-bold text-white text-sm">{post.title}</h4>
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              Dibuat: {new Date(post.createdAt).toLocaleString('id-ID')}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-1.5 text-xs text-slate-300">
                            <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>@{post.bot.username}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-slate-200">
                          {post._count.targets} Channel
                        </td>
                        <td className="p-4">
                          {getStatusBadge(post.status)}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => setSelectedPostId(post.id)}
                            className="p-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Selected post target details Drawer */}
        {selectedPostId && (
          <div className="w-full lg:w-96 shrink-0 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 lg:sticky lg:top-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="font-bold text-white text-sm">Detail Pengiriman</h2>
              <button 
                onClick={() => setSelectedPostId(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : !detailData?.post ? (
              <p className="text-slate-500 text-xs text-center">Detail postingan gagal dimuat.</p>
            ) : (
              <div className="space-y-6 text-xs">
                {/* Info summary */}
                <div className="space-y-2">
                  <h3 className="text-white text-sm font-extrabold">{detailData.post.title}</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status Utama:</span>
                    {getStatusBadge(detailData.post.status)}
                  </div>
                  {detailData.post.sentAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Selesai Dikirim:</span>
                      <span className="text-slate-300">{new Date(detailData.post.sentAt).toLocaleString('id-ID')}</span>
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div className="flex gap-2">
                  {/* Edit/Clone Button */}
                  <button
                    onClick={() => router.push(`/composer?clonePostId=${detailData.post.id}`)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2.5 px-3 rounded-xl font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all border border-slate-700 hover:scale-[1.02]"
                  >
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <span>Edit Postingan</span>
                  </button>

                  {/* Main Retry Button (only if there are failed targets) */}
                  {detailData.post.targets.some(t => t.status === TargetStatus.FAILED) && (
                    <button
                      onClick={() => retryMutation.mutate(detailData.post.id)}
                      disabled={retryMutation.isPending}
                      className="flex-1 bg-primary hover:bg-primary/95 text-white py-2.5 px-3 rounded-xl font-bold flex items-center justify-center space-x-1.5 cursor-pointer transition-all disabled:opacity-50 hover:scale-[1.02]"
                    >
                      {retryMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>Kirim Ulang Gagal</span>
                    </button>
                  )}
                </div>

                {/* Message preview block */}
                <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl space-y-1.5 max-h-32 overflow-y-auto">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Isi Pesan</span>
                  <div 
                    className="text-slate-300 leading-relaxed text-[11px]"
                    dangerouslySetInnerHTML={{ __html: typeof window !== 'undefined' ? DOMPurify.sanitize(detailData.post.content) : detailData.post.content }}
                  />
                </div>

                {/* Error Analysis & logs explanation */}
                {detailData.post.targets.some(t => t.status === TargetStatus.FAILED) && (
                  <div className="p-3 bg-red-950/15 border border-red-900/30 rounded-xl space-y-2.5">
                    <div className="flex items-center space-x-1.5 text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-bold text-[9px] uppercase tracking-wider">Analisis Kegagalan</span>
                    </div>
                    <div className="space-y-2 text-[10px] leading-relaxed">
                      {detailData.post.targets.filter(t => t.status === TargetStatus.FAILED).map((target) => {
                        const errorMsg = target.errorMessage || '';
                        let explanation = 'Kesalahan tidak diketahui.';

                        if (errorMsg.includes('decryption failed') || errorMsg.includes('Kesalahan Dekripsi')) {
                          explanation = 'Kunci enkripsi server berubah. Silakan HAPUS bot ini lalu daftarkan ulang dengan token yang sama agar token terenkripsi dengan kunci baru.';
                        } else if (errorMsg.includes('chat not found') || errorMsg.includes('400: Bad Request: chat not found')) {
                          explanation = 'Channel/Grup tidak ditemukan. Pastikan username channel/group benar dan Bot sudah dimasukkan ke dalam channel tersebut sebagai Admin.';
                        } else if (errorMsg.includes('bot is not a member') || errorMsg.includes('403: Forbidden: bot is not a member')) {
                          explanation = 'Bot bukan anggota grup/channel. Bot harus ditambahkan ke grup/channel tersebut sebagai Admin terlebih dahulu.';
                        } else if (errorMsg.includes('bot was blocked') || errorMsg.includes('403: Forbidden: bot was blocked by the user')) {
                          explanation = 'Bot diblokir oleh penerima atau grup telah membatasi bot.';
                        } else if (errorMsg.includes('can\'t parse entities') || errorMsg.includes('400: Bad Request: can\'t parse entities')) {
                          explanation = 'Format teks ditolak oleh parser Telegram (biasanya karena ada tag HTML seperti <span> atau tag Markdown yang salah/tidak ditutup). Coba edit postingan untuk membersihkan format teks.';
                        } else if (errorMsg.includes('token') || errorMsg.includes('Unauthorized')) {
                          explanation = 'Token bot tidak valid atau telah dicabut di @BotFather. Silakan cek kembali token bot Anda.';
                        } else if (errorMsg) {
                          explanation = errorMsg;
                        }

                        return (
                          <div key={target.id} className="border-t border-red-900/10 pt-2 first:border-0 first:pt-0">
                            <span className="font-bold text-red-400">📍 {target.channel.name}:</span>
                            <div className="bg-slate-950/40 p-2 rounded-lg font-mono text-[9px] text-slate-300 mt-1 break-all border border-slate-900">
                              {errorMsg || 'Tidak ada pesan log'}
                            </div>
                            <p className="text-slate-400 mt-1">💡 <span className="font-semibold text-slate-300">Solusi:</span> {explanation}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Targets breakdown list */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Tujuan Channel ({detailData.post.targets.length})</span>
                    
                    {/* Retry button for failed targets */}
                    {detailData.post.targets.some(t => t.status === TargetStatus.FAILED) && (
                      <button
                        onClick={() => retryMutation.mutate(detailData.post.id)}
                        disabled={retryMutation.isPending}
                        className="bg-primary hover:bg-primary/95 text-white px-2 py-1 rounded font-bold text-[10px] flex items-center space-x-1 cursor-pointer transition-all disabled:opacity-50"
                      >
                        {retryMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        <span>Retry Gagal</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {detailData.post.targets.map(target => (
                      <div key={target.id} className="p-3 bg-slate-950/20 border border-slate-850/60 rounded-xl flex items-center justify-between gap-3">
                        <div className="overflow-hidden">
                          <p className="font-bold text-white truncate">{target.channel.name}</p>
                          <span className="text-[9px] text-slate-500 font-mono block mt-0.5">ID: {target.channel.chatId}</span>
                          
                          {target.errorMessage && (
                            <p className="text-[10px] text-red-400 font-medium mt-1 leading-normal">
                              ❌ {target.errorMessage}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right text-[10px]">
                          {getTargetStatusBadge(target.status)}
                          {target.sentAt && (
                            <span className="text-[9px] text-slate-500 block mt-0.5">
                              {new Date(target.sentAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}

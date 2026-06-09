'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { 
  FileText, Plus, Edit3, Trash2, Send, X, Search, Filter, 
  Loader2, Sparkles, Clipboard, Layers, Globe, Lock 
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { ParseMode, MediaType } from 'shared';

interface TemplateData {
  id: string;
  name: string;
  content: string;
  parseMode: ParseMode;
  mediaType: MediaType;
  mediaUrl: string | null;
  inlineKeyboard: any;
  tags: string[];
  category: string;
  usageCount: number;
  isPublic: boolean;
  authorId: string;
  createdAt: string;
  author: {
    name: string;
  };
}

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [parseMode, setParseMode] = useState<ParseMode>(ParseMode.MARKDOWN);
  const [mediaType, setMediaType] = useState<MediaType>(MediaType.NONE);
  const [mediaUrl, setMediaUrl] = useState('');
  const [category, setCategory] = useState('Promosi');
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Query: Fetch templates
  const { data: templatesData, isLoading } = useQuery<{ templates: TemplateData[] }>({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates'),
  });

  // Mutation: Create/Update Template
  const saveTemplateMutation = useMutation<any, any, any>({
    mutationFn: (body) => {
      if (editingTemplate) {
        return api.put(`/templates/${editingTemplate.id}`, body);
      }
      return api.post('/templates', body);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(editingTemplate ? 'Template diperbarui!' : 'Template baru berhasil disimpan!');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menyimpan template');
    }
  });

  // Mutation: Delete Template
  const deleteTemplateMutation = useMutation<any, any, string>({
    mutationFn: (id) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template berhasil dihapus');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menghapus template');
    }
  });

  const resetForm = () => {
    setName('');
    setContent('');
    setParseMode(ParseMode.MARKDOWN);
    setMediaType(MediaType.NONE);
    setMediaUrl('');
    setCategory('Promosi');
    setIsPublic(false);
    setEditingTemplate(null);
  };

  const handleEditClick = (template: TemplateData) => {
    setEditingTemplate(template);
    setName(template.name);
    setContent(template.content);
    setParseMode(template.parseMode);
    setMediaType(template.mediaType);
    setMediaUrl(template.mediaUrl || '');
    setCategory(template.category);
    setIsPublic(template.isPublic);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (template: TemplateData) => {
    if (confirm(`Apakah Anda yakin ingin menghapus template "${template.name}"?`)) {
      deleteTemplateMutation.mutate(template.id);
    }
  };

  const handleUseTemplate = (template: TemplateData) => {
    // Redirect to composer with template prefill query
    router.push(`/composer?templateId=${template.id}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !content) {
      toast.error('Nama dan isi konten wajib diisi');
      return;
    }
    setIsSubmitting(true);
    saveTemplateMutation.mutate({
      name,
      content,
      parseMode,
      mediaType,
      mediaUrl: mediaType !== MediaType.NONE ? mediaUrl : null,
      category,
      isPublic
    }, {
      onSettled: () => setIsSubmitting(false)
    });
  };

  // Filter templates list
  const filteredTemplates = templatesData?.templates.filter(tpl => {
    const matchesSearch = tpl.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      tpl.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === '' || tpl.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }) || [];

  const categories = ['Promosi', 'Pengumuman', 'Event', 'News', 'Update', 'Custom'];

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto">
        
        {/* Header section */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
              <FileText className="w-8 h-8 text-primary" />
              <span>Template Library</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Simpan dan kelola format pesan siaran yang sering Anda gunakan.</p>
          </div>

          {user?.role !== 'VIEWER' && (
            <button
              onClick={() => {
                resetForm();
                setIsModalOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-primary/20 transition-all active:scale-[0.98] w-fit"
            >
              <Plus className="w-5 h-5" />
              <span>Buat Template</span>
            </button>
          )}
        </header>

        {/* Search & Category filter */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center gap-4">
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama atau konten template..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-slate-500"
            />
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full md:w-48 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            >
              <option value="">Semua Kategori</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading / Grid layout */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <Clipboard className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Template Tidak Ditemukan</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Belum ada template terdaftar. Mulai simpan format pesan promosi atau pengumuman Anda sekarang.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((tpl) => (
              <div key={tpl.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all">
                <div className="space-y-4">
                  {/* Title & category badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-white text-base truncate max-w-[180px]">{tpl.name}</h3>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mt-0.5">Oleh: {tpl.author.name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold text-[9px] uppercase">
                      {tpl.category}
                    </span>
                  </div>

                  {/* Truncated message content preview */}
                  <div className="bg-slate-950/40 p-3 rounded-xl border border-white/5 h-24 overflow-hidden text-xs text-slate-300 leading-relaxed break-all">
                    {tpl.content.replace(/<[^>]*>/g, '')}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center space-x-1">
                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                      <span>Dipakai: <strong>{tpl.usageCount}x</strong></span>
                    </span>

                    <span className="flex items-center space-x-1">
                      {tpl.isPublic ? (
                        <>
                          <Globe className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-green-400 font-semibold">Publik</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5 text-yellow-500" />
                          <span className="text-yellow-500 font-semibold">Privat</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Grid card actions */}
                <div className="border-t border-slate-800/80 pt-4 mt-6 flex items-center justify-between">
                  <button
                    onClick={() => handleUseTemplate(tpl)}
                    className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white transition-all text-xs font-bold cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gunakan</span>
                  </button>

                  {user?.id === tpl.authorId && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEditClick(tpl)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(tpl)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREATE/EDIT TEMPLATE MODAL DIALOG */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span>{editingTemplate ? 'Edit Template' : 'Buat Template Baru'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Template Name */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Nama Template</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sapaan Member Baru"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Content text */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Isi Konten Pesan</label>
                <textarea
                  required
                  placeholder="Ketik isi pesan di sini. Gunakan tag HTML seperti <b>Tebal</b>..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <p className="text-[10px] text-slate-400">
                  Dukung tag formatting HTML standard Telegram: <code>&lt;b&gt;tebal&lt;/b&gt;</code>, <code>&lt;i&gt;miring&lt;/i&gt;</code>.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Category Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">Kategori</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Media Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">Tipe Media Default</label>
                  <select
                    value={mediaType}
                    onChange={(e) => setMediaType(e.target.value as MediaType)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none"
                  >
                    <option value={MediaType.NONE}>Tanpa Media</option>
                    <option value={MediaType.PHOTO}>Foto</option>
                    <option value={MediaType.VIDEO}>Video</option>
                    <option value={MediaType.DOCUMENT}>Dokumen</option>
                  </select>
                </div>

                {/* Parse Mode Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">Mode Parsing</label>
                  <select
                    value={parseMode}
                    onChange={(e) => setParseMode(e.target.value as ParseMode)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none"
                  >
                    <option value={ParseMode.MARKDOWN}>Markdown</option>
                    <option value={ParseMode.HTML}>HTML</option>
                    <option value={ParseMode.PLAIN}>Plain Text</option>
                  </select>
                </div>
              </div>

              {mediaType !== MediaType.NONE && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">URL Media Default</label>
                  <input
                    type="text"
                    placeholder="Contoh: https://domain.com/gambar.jpg"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                  />
                </div>
              )}

              {/* Public toggle */}
              <label className="flex items-center space-x-2.5 text-xs text-slate-350 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-900 text-primary w-4 h-4"
                />
                <span>Bagikan template ini ke semua admin (Publik)</span>
              </label>

              {/* Action buttons */}
              <div className="flex justify-end space-x-3 border-t border-slate-800 pt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl px-5 py-3 font-semibold text-sm cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary hover:bg-primary/95 text-white rounded-xl px-5 py-3 font-bold text-sm cursor-pointer flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{editingTemplate ? 'Perbarui Template' : 'Simpan Template'}</span>
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

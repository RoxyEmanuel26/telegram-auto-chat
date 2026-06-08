'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { 
  UploadCloud, FileText, Database, CheckCircle, AlertTriangle, 
  XCircle, ArrowRight, ArrowLeft, Loader2, Bot, Calendar, 
  Settings, Radio, RefreshCw, FileUp, AlertCircle, Trash2, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { ImportStatus } from 'shared';

interface BotData {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}

interface ImportHistoryItem {
  id: string;
  filename: string;
  originalName: string;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  errorLog: any;
  botId: string;
  bot: {
    name: string;
    username: string;
  };
  uploadedBy: {
    name: string;
  };
  createdAt: string;
  completedAt: string | null;
}

interface PreviewData {
  filename: string;
  originalName: string;
  headers: string[];
  previewRows: string[][];
  totalRows: number;
}

export default function ImportsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  // Tab states: 'new' (wizard) or 'history'
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  
  // Wizard steps: 1 (Upload/Config), 2 (Mapping), 3 (Review/Validation), 4 (Process/Result)
  const [step, setStep] = useState(1);
  
  // Form states - Step 1
  const [selectedBotId, setSelectedBotId] = useState('');
  const [importMode, setImportMode] = useState<'PARTIAL' | 'ATOMIC'>('PARTIAL');
  const [defaultBehavior, setDefaultBehavior] = useState<'DRAFT' | 'SCHEDULED' | 'SEND_IMMEDIATE'>('DRAFT');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  
  // Mapping states - Step 2
  const [mapping, setMapping] = useState({
    title: '',
    content: '',
    channels: '',
    scheduledAt: ''
  });

  // History states
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Queries
  const { data: botsData } = useQuery<{ bots: BotData[] }>({
    queryKey: ['bots'],
    queryFn: () => api.get('/bots'),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ history: ImportHistoryItem[] }>({
    queryKey: ['import-history'],
    queryFn: () => api.get('/imports/history'),
    enabled: activeTab === 'history',
  });

  // Mutation: Process Import
  const processImportMutation = useMutation<any, any, any>({
    mutationFn: (body) => api.post('/imports/process', body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['import-history'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      setStep(4);
      setImportResult(data);
      toast.success('File CSV berhasil diproses!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memproses file CSV');
    }
  });

  const [importResult, setImportResult] = useState<any | null>(null);

  // Auto mapping helper when preview data changes
  useEffect(() => {
    if (!previewData) return;
    
    const headers = previewData.headers.map(h => h.toLowerCase().trim());
    
    const newMapping = {
      title: '',
      content: '',
      channels: '',
      scheduledAt: ''
    };

    // Simple heuristic to auto-map based on common column names
    headers.forEach((h, idx) => {
      const idxStr = idx.toString();
      if (h.includes('title') || h.includes('judul') || h.includes('subject')) {
        newMapping.title = idxStr;
      } else if (h.includes('content') || h.includes('pesan') || h.includes('isi') || h.includes('text') || h.includes('body')) {
        newMapping.content = idxStr;
      } else if (h.includes('channel') || h.includes('tujuan') || h.includes('chat') || h.includes('username') || h.includes('target')) {
        newMapping.channels = idxStr;
      } else if (h.includes('sched') || h.includes('jadwal') || h.includes('waktu') || h.includes('date') || h.includes('time')) {
        newMapping.scheduledAt = idxStr;
      }
    });

    // Fallbacks if heuristics fail
    if (!newMapping.title && headers.length > 0) newMapping.title = '0';
    if (!newMapping.content && headers.length > 1) newMapping.content = '1';
    if (!newMapping.channels && headers.length > 2) newMapping.channels = '2';
    
    setMapping(newMapping);
  }, [previewData]);

  // File selection & upload handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const processSelectedFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Format file harus berupa CSV (.csv)');
      return;
    }
    setSelectedFile(file);
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/imports/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Gagal mengupload file');
      }

      setPreviewData(resData);
      toast.success('Preview CSV berhasil dimuat');
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan saat membaca file CSV');
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleStartImport = () => {
    if (!previewData || !selectedBotId) return;

    // Build mapping payload (only send scheduledAt if chosen)
    const mapPayload: any = {
      title: mapping.title,
      content: mapping.content,
      channels: mapping.channels,
    };
    
    if (mapping.scheduledAt !== '') {
      mapPayload.scheduledAt = mapping.scheduledAt;
    }

    processImportMutation.mutate({
      filename: previewData.filename,
      mapping: mapPayload,
      botId: selectedBotId,
      importMode,
      defaultBehavior
    });
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
    setMapping({
      title: '',
      content: '',
      channels: '',
      scheduledAt: ''
    });
  };

  // Validators for review step
  const getRowValidation = (row: string[]) => {
    const title = row[Number(mapping.title)]?.trim();
    const content = row[Number(mapping.content)]?.trim();
    const channels = row[Number(mapping.channels)]?.trim();
    const schedTime = mapping.scheduledAt !== '' ? row[Number(mapping.scheduledAt)]?.trim() : '';

    const errors: string[] = [];

    if (!title) errors.push('Judul kosong');
    if (!content) errors.push('Pesan kosong');
    if (!channels) errors.push('Channel kosong');
    
    if (schedTime) {
      const parsedDate = new Date(schedTime);
      if (isNaN(parsedDate.getTime())) {
        errors.push('Format tanggal salah');
      }
    } else if (defaultBehavior === 'SCHEDULED') {
      errors.push('Tanggal wajib diisi jika mode default terjadwal');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const getStatusBadge = (status: ImportStatus) => {
    switch (status) {
      case ImportStatus.PENDING:
        return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-bold uppercase text-[9px]">Pending</span>;
      case ImportStatus.PROCESSING:
        return <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold uppercase text-[9px] flex items-center gap-1 w-fit"><Loader2 className="w-3 h-3 animate-spin" /> Proses</span>;
      case ImportStatus.DONE:
        return <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-bold uppercase text-[9px] flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" /> Selesai</span>;
      case ImportStatus.FAILED:
        return <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase text-[9px] flex items-center gap-1 w-fit"><AlertCircle className="w-3 h-3" /> Gagal</span>;
    }
  };

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto">
        
        {/* Page Title */}
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
            <Database className="w-8 h-8 text-primary" />
            <span>CSV Bulk Import Wizard</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Impor puluhan hingga ratusan postingan siaran sekaligus menggunakan file template CSV.</p>
        </header>

        {/* Tab buttons */}
        <div className="flex border-b border-slate-850 mb-6">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-5 py-3.5 font-bold text-sm cursor-pointer transition-all border-b-2 flex items-center space-x-2 ${
              activeTab === 'new'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import CSV Baru</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-5 py-3.5 font-bold text-sm cursor-pointer transition-all border-b-2 flex items-center space-x-2 ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Riwayat Import</span>
          </button>
        </div>

        {/* TAB 1: NEW IMPORT WIZARD */}
        {activeTab === 'new' && (
          <div className="space-y-6">
            
            {/* Step Indicators */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center text-xs font-semibold text-slate-400">
              <div className={`flex items-center space-x-2 ${step >= 1 ? 'text-primary font-bold' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${step >= 1 ? 'bg-primary/20 border border-primary text-primary' : 'bg-slate-850 border border-slate-800 text-slate-500'}`}>1</span>
                <span>Upload & Pengaturan</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-700 shrink-0" />
              <div className={`flex items-center space-x-2 ${step >= 2 ? 'text-primary font-bold' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${step >= 2 ? 'bg-primary/20 border border-primary text-primary' : 'bg-slate-850 border border-slate-800 text-slate-500'}`}>2</span>
                <span>Pemetaan Kolom</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-700 shrink-0" />
              <div className={`flex items-center space-x-2 ${step >= 3 ? 'text-primary font-bold' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${step >= 3 ? 'bg-primary/20 border border-primary text-primary' : 'bg-slate-850 border border-slate-800 text-slate-500'}`}>3</span>
                <span>Tinjauan & Validasi</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-700 shrink-0" />
              <div className={`flex items-center space-x-2 ${step >= 4 ? 'text-primary font-bold' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${step >= 4 ? 'bg-primary/20 border border-primary text-primary' : 'bg-slate-850 border border-slate-800 text-slate-500'}`}>4</span>
                <span>Hasil Impor</span>
              </div>
            </div>

            {/* STEP 1: UPLOAD & CONFIGURE */}
            {step === 1 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Select Bot */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-350 block">Bot Pengirim Telegram</label>
                    <div className="relative">
                      <Bot className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        value={selectedBotId}
                        onChange={(e) => setSelectedBotId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">-- Pilih Bot --</option>
                        {botsData?.bots.map(b => (
                          <option key={b.id} value={b.id}>{b.name} (@{b.username})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Default Post Behavior */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-350 block">Status Default Postingan</label>
                    <select
                      value={defaultBehavior}
                      onChange={(e) => setDefaultBehavior(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="DRAFT">Simpan sebagai Draft</option>
                      <option value="SEND_IMMEDIATE">Kirim Langsung ke Antrian</option>
                      <option value="SCHEDULED">Jadwalkan Siaran (Butuh kolom tanggal)</option>
                    </select>
                  </div>

                  {/* Import Mode */}
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-slate-355 block">Metode Penanganan Error (Import Mode)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className={`border rounded-2xl p-4 flex items-start space-x-3 cursor-pointer transition-all select-none ${importMode === 'PARTIAL' ? 'border-primary/50 bg-primary/5 text-white' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'}`}>
                        <input
                          type="radio"
                          name="importMode"
                          value="PARTIAL"
                          checked={importMode === 'PARTIAL'}
                          onChange={() => setImportMode('PARTIAL')}
                          className="mt-1 bg-slate-900 border-slate-800 text-primary w-4 h-4 focus:ring-0 focus:ring-offset-0"
                        />
                        <div className="text-xs">
                          <p className="font-bold">Partial Import (Rekomendasi)</p>
                          <p className="text-slate-400 mt-1">Tetap impor baris data yang valid meskipun terdapat baris lain yang error. Error log baris akan ditampilkan setelah proses selesai.</p>
                        </div>
                      </label>

                      <label className={`border rounded-2xl p-4 flex items-start space-x-3 cursor-pointer transition-all select-none ${importMode === 'ATOMIC' ? 'border-primary/50 bg-primary/5 text-white' : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'}`}>
                        <input
                          type="radio"
                          name="importMode"
                          value="ATOMIC"
                          checked={importMode === 'ATOMIC'}
                          onChange={() => setImportMode('ATOMIC')}
                          className="mt-1 bg-slate-900 border-slate-800 text-primary w-4 h-4 focus:ring-0 focus:ring-offset-0"
                        />
                        <div className="text-xs">
                          <p className="font-bold">Atomic / Rollback Import</p>
                          <p className="text-slate-400 mt-1">Batalkan dan rollback seluruh operasi impor jika terdapat minimal satu baris data yang tidak valid.</p>
                        </div>
                      </label>
                    </div>
                  </div>

                </div>

                {/* File Upload Area */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-slate-350 block">File Data CSV (.csv)</label>
                  
                  {isUploading ? (
                    <div className="h-44 border-2 border-dashed border-slate-850 bg-slate-950/50 rounded-2xl flex flex-col items-center justify-center space-y-3">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <span className="text-sm font-semibold text-slate-400">Sedang mem-parse file CSV...</span>
                    </div>
                  ) : previewData ? (
                    <div className="h-44 border border-green-500/20 bg-green-500/5 rounded-2xl flex flex-col items-center justify-center space-y-3 relative p-6 text-center">
                      <CheckCircle className="w-10 h-10 text-green-400" />
                      <div>
                        <span className="text-sm font-bold text-white block truncate max-w-md">{selectedFile?.name}</span>
                        <span className="text-xs text-slate-400 block mt-1">Total: <strong>{previewData.totalRows} baris</strong> data terdeteksi.</span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewData(null);
                        }}
                        className="absolute top-3 right-3 p-1.5 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className="h-44 border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60 rounded-2xl flex flex-col items-center justify-center space-y-3 cursor-pointer transition-all relative group"
                    >
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <FileUp className="w-10 h-10 text-slate-500 group-hover:text-primary transition-all" />
                      <div className="text-center">
                        <span className="text-sm font-bold text-slate-300 block">Klik atau Seret file CSV ke sini</span>
                        <span className="text-[11px] text-slate-500 block mt-1">Ukuran file maksimal 10MB. Gunakan pemisah koma (,).</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => setStep(2)}
                    disabled={!selectedBotId || !previewData}
                    className="bg-primary hover:bg-primary/95 text-white px-6 py-3 rounded-xl font-bold text-sm cursor-pointer shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Lanjutkan ke Pemetaan</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

              </div>
            )}

            {/* STEP 2: COLUMN MAPPING */}
            {step === 2 && previewData && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
                
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Settings className="w-5 h-5 text-primary" />
                    <span>Konfigurasi Pemetaan Kolom CSV</span>
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">Petakan kolom file CSV Anda ke field data postingan TeleHub. Kami mendeteksi {previewData.headers.length} kolom.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-slate-950/40 border border-slate-850 rounded-2xl">
                  
                  {/* Field: Title */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">Judul Postingan (Internal) <span className="text-red-400 font-bold">*</span></label>
                    <select
                      value={mapping.title}
                      onChange={(e) => setMapping({ ...mapping, title: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                    >
                      <option value="">-- Pilih Kolom CSV --</option>
                      {previewData.headers.map((h, idx) => (
                        <option key={idx} value={idx}>{h} (Kolom {idx + 1})</option>
                      ))}
                    </select>
                  </div>

                  {/* Field: Content */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">Isi Pesan Siaran (HTML) <span className="text-red-400 font-bold">*</span></label>
                    <select
                      value={mapping.content}
                      onChange={(e) => setMapping({ ...mapping, content: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                    >
                      <option value="">-- Pilih Kolom CSV --</option>
                      {previewData.headers.map((h, idx) => (
                        <option key={idx} value={idx}>{h} (Kolom {idx + 1})</option>
                      ))}
                    </select>
                  </div>

                  {/* Field: Target Channels */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">Target Channels / Groups (ChatID/Username) <span className="text-red-400 font-bold">*</span></label>
                    <select
                      value={mapping.channels}
                      onChange={(e) => setMapping({ ...mapping, channels: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                    >
                      <option value="">-- Pilih Kolom CSV --</option>
                      {previewData.headers.map((h, idx) => (
                        <option key={idx} value={idx}>{h} (Kolom {idx + 1})</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 block">Kolom ini berisi daftar tujuan terpisah koma (misal: <code>-100293424,@promochannel</code>)</span>
                  </div>

                  {/* Field: Scheduled At */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">Waktu Penjadwalan (Opsional)</label>
                    <select
                      value={mapping.scheduledAt}
                      onChange={(e) => setMapping({ ...mapping, scheduledAt: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                    >
                      <option value="">-- Abaikan (Kirim sesuai status default) --</option>
                      {previewData.headers.map((h, idx) => (
                        <option key={idx} value={idx}>{h} (Kolom {idx + 1})</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 block">Kolom format tanggal standar (misal: <code>2026-06-25 14:00</code>)</span>
                  </div>

                </div>

                {/* CSV Preview Data Table */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 block">Preview Isi CSV Asli (5 Baris Pertama)</span>
                  <div className="border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[10px] text-slate-400">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 font-bold text-slate-300 uppercase">
                          {previewData.headers.map((h, idx) => (
                            <th key={idx} className="p-3 border-r border-slate-800/80">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {previewData.previewRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-950/20">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-3 border-r border-slate-800/40 truncate max-w-[150px]">{cell || <span className="text-slate-600 italic">kosong</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex justify-between pt-4 border-t border-slate-850">
                  <button
                    onClick={() => setStep(1)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all flex items-center space-x-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Kembali</span>
                  </button>

                  <button
                    onClick={() => setStep(3)}
                    disabled={!mapping.title || !mapping.content || !mapping.channels}
                    className="bg-primary hover:bg-primary/95 text-white px-6 py-3 rounded-xl font-bold text-sm cursor-pointer shadow-lg shadow-primary/20 transition-all flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Tinjau & Validasi Data</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

              </div>
            )}

            {/* STEP 3: REVIEW & VALIDATION */}
            {step === 3 && previewData && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
                
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Radio className="w-5 h-5 text-primary animate-pulse" />
                    <span>Validasi Baris & Tinjauan Impor</span>
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">Kami menganalisis format baris preview Anda sebelum mengirim data ke server.</p>
                </div>

                {/* Configuration summary card */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-950/50 border border-slate-850 rounded-2xl text-xs">
                  <div>
                    <span className="text-slate-500 block">PENGIRIM BOT:</span>
                    <span className="text-white font-bold block mt-0.5">
                      {botsData?.bots.find(b => b.id === selectedBotId)?.name || 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">STATUS SIARAN DEFAULT:</span>
                    <span className="text-white font-bold block mt-0.5">{defaultBehavior}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">METODE IMPORT:</span>
                    <span className="text-white font-bold block mt-0.5">{importMode}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">TOTAL DATA:</span>
                    <span className="text-white font-bold block mt-0.5">{previewData.totalRows} Postingan</span>
                  </div>
                </div>

                {/* Validation Preview Table */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-350 block">Daftar Preview Terpetakan</span>
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 font-bold text-slate-300">
                          <th className="p-3.5 w-12 text-center">Row</th>
                          <th className="p-3.5">Judul Post</th>
                          <th className="p-3.5 max-w-[200px] truncate">Pesan Preview</th>
                          <th className="p-3.5">Channels</th>
                          {mapping.scheduledAt !== '' && <th className="p-3.5">Jadwal Kirim</th>}
                          <th className="p-3.5 w-28 text-right">Validasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {previewData.previewRows.map((row, idx) => {
                          const val = getRowValidation(row);
                          const title = row[Number(mapping.title)] || '';
                          const content = row[Number(mapping.content)] || '';
                          const channels = row[Number(mapping.channels)] || '';
                          const dateStr = mapping.scheduledAt !== '' ? row[Number(mapping.scheduledAt)] : '';
                          
                          return (
                            <tr key={idx} className="hover:bg-slate-950/10">
                              <td className="p-3 text-center text-slate-500 font-bold">{idx + 2}</td>
                              <td className="p-3 font-bold text-white truncate max-w-[120px]">{title || <span className="text-red-500 italic">Kosong</span>}</td>
                              <td className="p-3 text-slate-400 truncate max-w-[200px]">{content.replace(/<[^>]*>/g, '') || <span className="text-red-500 italic">Kosong</span>}</td>
                              <td className="p-3 truncate max-w-[150px]">{channels || <span className="text-red-500 italic">Kosong</span>}</td>
                              {mapping.scheduledAt !== '' && (
                                <td className="p-3 text-slate-450 font-mono text-[10px]">
                                  {dateStr ? (
                                    val.errors.includes('Format tanggal salah') ? (
                                      <span className="text-red-400 font-bold">{dateStr}</span>
                                    ) : (
                                      new Date(dateStr).toLocaleString('id-ID')
                                    )
                                  ) : (
                                    <span className="text-slate-500 italic">Sesuai default</span>
                                  )}
                                </td>
                              )}
                              <td className="p-3 text-right">
                                {val.isValid ? (
                                  <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-bold uppercase text-[9px]">Valid</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-bold uppercase text-[9px] flex items-center justify-end gap-1" title={val.errors.join(', ')}>
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Error</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex justify-between pt-4 border-t border-slate-850">
                  <button
                    onClick={() => setStep(2)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all flex items-center space-x-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Kembali</span>
                  </button>

                  <button
                    onClick={handleStartImport}
                    disabled={processImportMutation.isPending}
                    className="bg-primary hover:bg-primary/95 text-white px-6 py-3 rounded-xl font-bold text-sm cursor-pointer shadow-lg shadow-primary/20 transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {processImportMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memproses Impor...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Mulai Proses Impor</span>
                      </>
                    )}
                  </button>
                </div>

              </div>
            )}

            {/* STEP 4: IMPORT PROCESS & RESULT */}
            {step === 4 && importResult && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 text-center">
                
                {/* Visual outcomes card */}
                <div className="max-w-md mx-auto space-y-4">
                  {importResult.failed === 0 ? (
                    <>
                      <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 mx-auto">
                        <CheckCircle className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-extrabold text-white">Import Selesai dengan Sukses!</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Seluruh <strong>{importResult.success}</strong> baris postingan dalam file CSV telah berhasil disimpan dan diproses di database.
                      </p>
                    </>
                  ) : importResult.success > 0 ? (
                    <>
                      <div className="w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 mx-auto">
                        <AlertTriangle className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-extrabold text-white">Import Selesai dengan Peringatan</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Berhasil mengimpor <strong>{importResult.success}</strong> postingan, namun <strong>{importResult.failed}</strong> baris mengalami kegagalan proses.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto">
                        <XCircle className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-extrabold text-white">Import Gagal Total</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Seluruh <strong>{importResult.failed}</strong> postingan dalam file CSV gagal diimpor ke sistem.
                      </p>
                    </>
                  )}

                  {/* Summary grid */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-950/45 p-4 rounded-xl text-xs font-semibold mt-4">
                    <div className="border-r border-slate-800/80">
                      <span className="text-slate-500 block uppercase text-[9px]">Total Data</span>
                      <span className="text-white font-bold block mt-0.5 text-base">{importResult.total}</span>
                    </div>
                    <div className="border-r border-slate-800/80">
                      <span className="text-green-500 block uppercase text-[9px]">Sukses</span>
                      <span className="text-green-400 font-bold block mt-0.5 text-base">{importResult.success}</span>
                    </div>
                    <div>
                      <span className="text-red-500 block uppercase text-[9px]">Gagal</span>
                      <span className="text-red-400 font-bold block mt-0.5 text-base">{importResult.failed}</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Error Logs Accordion */}
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="max-w-2xl mx-auto text-left border border-slate-800 rounded-2xl bg-slate-950/40 p-5 mt-6 space-y-3">
                    <span className="text-xs font-bold text-red-400 flex items-center space-x-1.5">
                      <AlertCircle className="w-4 h-4" />
                      <span>Rincian Baris Gagal ({importResult.errors.length})</span>
                    </span>
                    
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 font-mono text-[10px]">
                      {importResult.errors.map((err: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded bg-red-500/5 border border-red-500/10 text-red-300 leading-normal flex items-start gap-2">
                          <span className="font-bold text-red-400 shrink-0">Baris {err.row}:</span>
                          <span>{err.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer Controls */}
                <div className="flex justify-center space-x-3 pt-6 max-w-sm mx-auto">
                  <button
                    onClick={resetWizard}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-355 py-3 rounded-xl font-bold text-sm cursor-pointer"
                  >
                    Import Baru
                  </button>

                  <button
                    onClick={() => router.push('/posts')}
                    className="flex-1 bg-primary hover:bg-primary/95 text-white py-3 rounded-xl font-bold text-sm cursor-pointer shadow-lg shadow-primary/20"
                  >
                    Buka Riwayat
                  </button>
                </div>

              </div>
            )}

          </div>
        )}

        {/* TAB 2: IMPORT HISTORY */}
        {activeTab === 'history' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
            
            {historyLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
            ) : !historyData?.history || historyData.history.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-850 flex items-center justify-center mx-auto text-slate-600">
                  <Database className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-300">Belum Ada Riwayat Import</h3>
                <p className="text-slate-500 text-xs max-w-xs mx-auto leading-normal">
                  Rincian data file yang telah diunggah dan status pemrosesan akan ditampilkan di sini.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                          <th className="p-4">Tanggal Import</th>
                          <th className="p-4">File Name</th>
                          <th className="p-4">Bot Pengirim</th>
                          <th className="p-4">Data Sukses/Total</th>
                          <th className="p-4">Oleh</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Error Log</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-305">
                        {historyData.history.map((item) => {
                          const hasFailedRows = item.failedRows > 0 && item.errorLog;
                          const isExpanded = expandedHistoryId === item.id;
                          
                          return (
                            <React.Fragment key={item.id}>
                              <tr className={`hover:bg-slate-950/10 ${isExpanded ? 'bg-slate-950/30' : ''}`}>
                                <td className="p-4">
                                  <span className="text-slate-400">{new Date(item.createdAt).toLocaleString('id-ID')}</span>
                                </td>
                                <td className="p-4 font-bold text-white">
                                  <span className="truncate max-w-[150px] block" title={item.filename}>{item.originalName.replace(/^import-/, '')}</span>
                                </td>
                                <td className="p-4">
                                  <span className="text-slate-400">@{item.bot.username}</span>
                                </td>
                                <td className="p-4">
                                  <span className="font-bold text-slate-205">{item.successRows} / {item.totalRows}</span>
                                </td>
                                <td className="p-4 text-slate-450">{item.uploadedBy.name}</td>
                                <td className="p-4">
                                  {getStatusBadge(item.status)}
                                </td>
                                <td className="p-4 text-right">
                                  {hasFailedRows ? (
                                    <button
                                      onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                                      className="text-red-400 hover:text-red-300 font-bold flex items-center justify-end space-x-1 ml-auto cursor-pointer"
                                    >
                                      <span>{isExpanded ? 'Tutup' : 'Lihat'}</span>
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  ) : (
                                    <span className="text-slate-500 italic text-[10px]">Aman (0)</span>
                                  )}
                                </td>
                              </tr>
                              
                              {/* Expanded Row Error Detail */}
                              {isExpanded && hasFailedRows && (
                                <tr>
                                  <td colSpan={7} className="p-4 bg-slate-950/60 border-t border-b border-slate-800">
                                    <div className="space-y-2 text-left">
                                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">Daftar Baris CSV yang Gagal Diproses:</span>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                                        {(item.errorLog as Array<{ row: number; error: string }>).map((err, errIdx) => (
                                          <div key={errIdx} className="p-2.5 rounded bg-red-500/5 border border-red-500/10 text-[10px] text-red-300 flex items-start gap-1.5 font-mono">
                                            <span className="font-bold text-red-400 shrink-0">Baris {err.row}:</span>
                                            <span>{err.error}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
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

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getBotAvatarUrl } from '@/lib/avatar';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { 
  Send, Bot, Radio, Paperclip, Plus, Trash2, Eye, 
  Bold, Italic, Code, Strikethrough, Loader2, Sparkles, Image as ImageIcon,
  Heading, FileUp, Settings, HelpCircle, BellOff, ShieldAlert, FileText, X,
  Calendar, RotateCw, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { MediaType, ParseMode, PostStatus, RecurrenceType } from 'shared';

// Standard Tiptap Editor Tool Button
const MenuBarButton = ({ onClick, isActive, children, title }: any) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`p-2 rounded-lg transition-all border cursor-pointer ${
      isActive 
        ? 'bg-primary/20 text-primary border-primary/30' 
        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
    }`}
  >
    {children}
  </button>
);

interface BotData {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}

interface ChannelData {
  id: string;
  name: string;
  username: string | null;
  chatId: string;
}

interface KeyboardButton {
  text: string;
  url: string;
}

const getFullMediaUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api', '');
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
};

function ComposerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const templateId = searchParams.get('templateId');
  const clonePostId = searchParams.get('clonePostId');

  // Core Form states
  const [selectedBotId, setSelectedBotId] = useState('');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  
  // Media states
  const [mediaType, setMediaType] = useState<MediaType>(MediaType.NONE);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Settings states
  const [disableNotification, setDisableNotification] = useState(false);
  const [protectContent, setProtectContent] = useState(false);
  const [disableWebPagePreview, setDisableWebPagePreview] = useState(false);

  // Keyboard button states
  const [keyboardRows, setKeyboardRows] = useState<KeyboardButton[][]>([[]]);

  // Scheduling states
  const [postingMode, setPostingMode] = useState<'IMMEDIATE' | 'SCHEDULED' | 'RECURRING'>('IMMEDIATE');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(RecurrenceType.DAILY);
  const [cronExpression, setCronExpression] = useState('0 9 * * *'); // default: daily at 9am

  // Template variables states
  const [rawTemplateContent, setRawTemplateContent] = useState('');
  const [foundVariables, setFoundVariables] = useState<string[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Query: Fetch bots
  const { data: botsData } = useQuery<{ bots: BotData[] }>({
    queryKey: ['bots'],
    queryFn: () => api.get('/bots'),
  });

  // Query: Fetch channels
  const { data: channelsData } = useQuery<{ channels: ChannelData[] }>({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels'),
  });

  // State to track if editor is empty (to fix the placeholder not disappearing)
  const [editorEmpty, setEditorEmpty] = useState(true);

  // Tiptap Editor Instance
  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    onUpdate: ({ editor }) => {
      setEditorEmpty(editor.isEmpty);
    },
    onCreate: ({ editor }) => {
      setEditorEmpty(editor.isEmpty);
    }
  });

  // Effect: Fetch and pre-fill template if templateId parameter exists
  useEffect(() => {
    if (!templateId || !editor) return;

    const fetchTemplate = async () => {
      try {
        const res = await api.get<{ post: any }>(`/templates/${templateId}`);
        const template = res.post;

        setTitle(template.name);
        setRawTemplateContent(template.content);
        setMediaType(template.mediaType);
        setMediaUrl(template.mediaUrl || '');
        
        if (template.inlineKeyboard && template.inlineKeyboard.inline_keyboard) {
          setKeyboardRows(template.inlineKeyboard.inline_keyboard);
        }

        // Scan for variable tokens: {{variable_name}}
        const regex = /\{\{([^}]+)\}\}/g;
        const variables: string[] = [];
        let match;
        while ((match = regex.exec(template.content)) !== null) {
          const varName = match[1].trim();
          if (!variables.includes(varName)) {
            variables.push(varName);
          }
        }

        setFoundVariables(variables);
        const initialVals: Record<string, string> = {};
        variables.forEach(v => { initialVals[v] = ''; });
        setVariableValues(initialVals);

        // Populate Tiptap editor with raw content
        editor.commands.setContent(template.content);
        setEditorEmpty(template.content === '' || template.content === '<p></p>');

        // Record template usage statistics
        api.post(`/templates/${templateId}/use`, {}).catch(err => {
          console.warn(`Failed to increment template usage: ${err}`);
        });

        toast.success(`Template "${template.name}" berhasil dimuat!`);
      } catch (err: any) {
        toast.error('Gagal memuat template');
      }
    };

    fetchTemplate();
  }, [templateId, editor]);

  // Effect: Fetch and pre-fill post if clonePostId parameter exists
  useEffect(() => {
    if (!clonePostId || !editor) return;

    const fetchPost = async () => {
      try {
        const res = await api.get<{ post: any }>(`/posts/${clonePostId}`);
        const post = res.post;

        setTitle(post.title);
        setSelectedBotId(post.botId || '');
        
        if (post.targets) {
          const channelIds = post.targets.map((t: any) => t.channelId);
          setSelectedChannelIds(channelIds);
        }

        setMediaType(post.mediaType);
        setMediaUrl(post.mediaUrl || '');
        setMediaCaption(post.mediaCaption || '');
        setDisableNotification(post.disableNotification ?? false);
        setProtectContent(post.protectContent ?? false);
        setDisableWebPagePreview(post.disableWebPagePreview ?? false);
        
        if (post.inlineKeyboard && post.inlineKeyboard.inline_keyboard) {
          setKeyboardRows(post.inlineKeyboard.inline_keyboard);
        }

        // Populate Tiptap editor with raw content
        editor.commands.setContent(post.content);
        setEditorEmpty(post.content === '' || post.content === '<p></p>');

        toast.success(`Postingan "${post.title}" berhasil dimuat ke editor!`);
      } catch (err: any) {
        toast.error('Gagal memuat detail postingan');
      }
    };

    fetchPost();
  }, [clonePostId, editor]);

  // Visual visual preview generator replacing variables dynamically
  const getPreviewContent = () => {
    let rawContent = editor?.getHTML() || '';
    
    // Fallback if editor not loaded or empty
    if (!rawContent || rawContent === '<p></p>' || editor?.isEmpty) {
      return '<span class="text-slate-500">Tulis pesan siaran Anda di sini...</span>';
    }

    // Replace variables in preview
    Object.entries(variableValues).forEach(([key, val]) => {
      const token = `{{${key}}}`;
      const displayVal = val ? `<strong>${val}</strong>` : `<span class="text-primary font-bold">[${key}]</span>`;
      rawContent = rawContent.replaceAll(token, displayVal);
    });

    return rawContent;
  };

  // Keyboard rows modifiers
  const addBtnToRow = (rowIndex: number) => {
    const updated = [...keyboardRows];
    updated[rowIndex].push({ text: 'Link Tombol', url: 'https://' });
    setKeyboardRows(updated);
  };

  const removeBtnFromRow = (rowIndex: number, btnIndex: number) => {
    const updated = [...keyboardRows];
    updated[rowIndex].splice(btnIndex, 1);
    setKeyboardRows(updated);
  };

  const updateBtnInfo = (rowIndex: number, btnIndex: number, field: 'text' | 'url', value: string) => {
    const updated = [...keyboardRows];
    updated[rowIndex][btnIndex][field] = value;
    setKeyboardRows(updated);
  };

  const addRow = () => {
    setKeyboardRows([...keyboardRows, []]);
  };

  const removeRow = (rowIndex: number) => {
    if (keyboardRows.length === 1) {
      setKeyboardRows([[]]);
      return;
    }
    const updated = [...keyboardRows];
    updated.splice(rowIndex, 1);
    setKeyboardRows(updated);
  };

  // File Upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Upload gagal');
      }

      setMediaUrl(resData.url);
      
      if (file.type.startsWith('image/')) {
        setMediaType(MediaType.PHOTO);
      } else if (file.type.startsWith('video/')) {
        setMediaType(MediaType.VIDEO);
      } else {
        setMediaType(MediaType.DOCUMENT);
      }

      toast.success('Media berhasil diupload!');
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengupload file');
    } finally {
      setIsUploading(false);
    }
  };

  // Mutation: Submit Post
  const createPostMutation = useMutation<any, any, any>({
    mutationFn: (body) => api.post('/posts', body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      let successMsg = 'Post disimpan sebagai Draft';
      if (data.post.status === PostStatus.QUEUED) {
        successMsg = 'Pesan dikirim ke antrian broadcast!';
      } else if (data.post.status === PostStatus.SCHEDULED) {
        successMsg = 'Pesan berhasil dijadwalkan!';
      }
      toast.success(successMsg);
      router.push('/posts');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal mengirim postingan');
    }
  });

  const handlePostSubmit = (postStatus: 'DRAFT' | 'SEND_NOW') => {
    if (!title) {
      toast.error('Judul internal wajib diisi');
      return;
    }
    if (!selectedBotId) {
      toast.error('Pilih Bot pengirim terlebih dahulu');
      return;
    }
    if (selectedChannelIds.length === 0) {
      toast.error('Pilih minimal satu Channel target');
      return;
    }

    // Replace variables in content before sending
    let finalizedContent = editor?.getHTML() || '';
    let hasEmptyVar = false;
    for (const [key, val] of Object.entries(variableValues)) {
      if (!val) {
        toast.error(`Harap isi nilai variabel [${key}]`);
        hasEmptyVar = true;
        break;
      }
      finalizedContent = finalizedContent.replaceAll(`{{${key}}}`, val);
    }
    if (hasEmptyVar) return;

    // Structure inline keyboard markup
    const inlineKeyboard: any = { inline_keyboard: [] };
    keyboardRows.forEach(row => {
      const rowBtns = row.filter(btn => btn.text && btn.url);
      if (rowBtns.length > 0) {
        inlineKeyboard.inline_keyboard.push(rowBtns);
      }
    });

    const isScheduling = postingMode === 'SCHEDULED' && scheduledAt;
    const isRecurring = postingMode === 'RECURRING' && cronExpression;

    createPostMutation.mutate({
      title,
      content: finalizedContent,
      parseMode: ParseMode.HTML,
      botId: selectedBotId,
      channelIds: selectedChannelIds,
      mediaType,
      mediaUrl: mediaType !== MediaType.NONE ? mediaUrl : null,
      mediaCaption: mediaType !== MediaType.NONE ? mediaCaption : null,
      inlineKeyboard: inlineKeyboard.inline_keyboard.length > 0 ? inlineKeyboard : null,
      disableNotification,
      protectContent,
      disableWebPagePreview,
      status: postStatus === 'DRAFT' ? 'DRAFT' : (postingMode === 'IMMEDIATE' ? 'SEND_NOW' : 'SCHEDULED'),
      scheduledAt: isScheduling ? new Date(scheduledAt).toISOString() : null,
      recurrence: isRecurring ? { type: recurrenceType, cronExpression } : null
    });
  };

  // Find selected bot info for preview
  const selectedBot = botsData?.bots.find(b => b.id === selectedBotId);

  // Toggle channel selection helper
  const toggleChannel = (channelId: string) => {
    if (selectedChannelIds.includes(channelId)) {
      setSelectedChannelIds(selectedChannelIds.filter(id => id !== channelId));
    } else {
      setSelectedChannelIds([...selectedChannelIds, channelId]);
    }
  };

  // Preset Cron helpers
  const handleCronPresetChange = (preset: RecurrenceType) => {
    setRecurrenceType(preset);
    if (preset === RecurrenceType.DAILY) {
      setCronExpression('0 9 * * *'); // 9 am daily
    } else if (preset === RecurrenceType.WEEKLY) {
      setCronExpression('0 9 * * 1'); // 9 am every Monday
    } else if (preset === RecurrenceType.MONTHLY) {
      setCronExpression('0 9 1 * *'); // 9 am first day of month
    }
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 items-start">
      
      {/* LEFT COLUMN: Form Composer */}
      <div className="w-full lg:flex-1 space-y-6">
        <header>
          <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
            <Sparkles className="text-primary w-8 h-8" />
            <span>Post Composer</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Buat postingan siaran dengan Rich Text, tombol inline, dan lampiran media.</p>
        </header>

        <form onSubmit={(e) => e.preventDefault()} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
          
          {/* Variable Inputs Panel (if template contains variables) */}
          {foundVariables.length > 0 && (
            <div className="p-5 bg-primary/5 border border-primary/20 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Settings className="w-4 h-4 text-primary" />
                <span>Variabel Template Terdeteksi ({foundVariables.length})</span>
              </h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Isi kolom berikut untuk memasukkan nilai dinamis ke dalam placeholder template.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {foundVariables.map((v) => (
                  <div key={v} className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-350 block uppercase">Val: {v}</label>
                    <input
                      type="text"
                      required
                      placeholder={`Masukkan nilai untuk {{${v}}}`}
                      value={variableValues[v] || ''}
                      onChange={(e) => setVariableValues({ ...variableValues, [v]: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Title input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">Judul Postingan (Internal/Dashboard Only)</label>
            <input
              type="text"
              placeholder="Contoh: Broadcast Promo Ramadhan 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Select Bot */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">Pilih Bot Pengirim</label>
            <div className="relative">
              <Bot className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">-- Pilih Bot --</option>
                {botsData?.bots.map(b => (
                  <option key={b.id} value={b.id}>{b.name} (@{b.username})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Target Channels Checkboxes */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">Pilih Target Channels / Groups</label>
            {!channelsData?.channels || channelsData.channels.length === 0 ? (
              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl text-center text-xs text-slate-500 flex items-center justify-center space-x-1.5">
                <Radio className="w-4 h-4 text-slate-600" />
                <span>Belum ada channel terhubung. Hubungkan channel terlebih dahulu.</span>
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 max-h-40 overflow-y-auto space-y-2">
                {channelsData.channels.map((ch) => (
                  <label key={ch.id} className="flex items-center space-x-2.5 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedChannelIds.includes(ch.id)}
                      onChange={() => toggleChannel(ch.id)}
                      className="rounded border-slate-800 bg-slate-900 text-primary w-4 h-4 focus:ring-0 focus:ring-offset-0"
                    />
                    <span>{ch.name} {ch.username ? `(@${ch.username})` : `[ID: ${ch.chatId}]`}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Tiptap Rich Text Editor */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">Konten Pesan (formatting HTML)</label>
            <div className="bg-slate-950 border border-slate-850 rounded-xl overflow-hidden">
              {/* Editor Toolbar */}
              {editor && (
                <div className="bg-slate-900 border-b border-slate-850 p-2.5 flex flex-wrap gap-1">
                  <MenuBarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    title="Teks Tebal (Bold)"
                  >
                    <Bold className="w-4 h-4" />
                  </MenuBarButton>
                  <MenuBarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    title="Teks Miring (Italic)"
                  >
                    <Italic className="w-4 h-4" />
                  </MenuBarButton>
                  <MenuBarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                    title="Teks Dicoret"
                  >
                    <Strikethrough className="w-4 h-4" />
                  </MenuBarButton>
                  <MenuBarButton
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    isActive={editor.isActive('code')}
                    title="Monospace inline"
                  >
                    <Code className="w-4 h-4" />
                  </MenuBarButton>
                  <MenuBarButton
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    isActive={editor.isActive('codeBlock')}
                    title="Code Block"
                  >
                    <Heading className="w-4 h-4" />
                  </MenuBarButton>
                </div>
              )}

              {/* Editor Content Area */}
              <div 
                onClick={() => editor?.chain().focus().run()}
                className="p-4 min-h-[160px] text-slate-100 text-sm focus-within:outline-none select-text relative cursor-text"
              >
                {editor && editorEmpty && (
                  <div className="absolute top-4 left-4 text-slate-500 pointer-events-none select-none">
                    Tulis pesan siaran Anda di sini...
                  </div>
                )}
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          {/* Media Attachment */}
          <div className="space-y-3 border-t border-slate-800/60 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">Lampiran Media (Foto / Video / Dokumen)</label>
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as MediaType)}
                className="bg-slate-950 border border-slate-850 text-slate-400 rounded-lg px-2.5 py-1 text-xs focus:outline-none"
              >
                <option value={MediaType.NONE}>Tanpa Media</option>
                <option value={MediaType.PHOTO}>Foto</option>
                <option value={MediaType.VIDEO}>Video</option>
                <option value={MediaType.DOCUMENT}>Dokumen</option>
              </select>
            </div>

            {mediaType !== MediaType.NONE && (
              <div className="space-y-4">
                {/* File Upload drag-drop area */}
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Masukkan URL media langsung atau upload di samping..."
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-650 focus:outline-none"
                  />
                  <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50">
                    <FileUp className="w-4 h-4" />
                    <span>{isUploading ? 'Uploading...' : 'Pilih File'}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                  </label>
                </div>

                {/* Caption Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 block">Keterangan Media (Caption - max 1024 karakter)</label>
                  <textarea
                    placeholder="Keterangan gambar/video (opsional)..."
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 resize-none focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 leading-normal">
                    💡 <strong>Catatan:</strong> Jika diisi, teks ini akan menggantikan <strong>Konten Pesan (formatting HTML)</strong> di atas sebagai keterangan media. Kosongkan jika ingin menggunakan Konten Pesan dengan format HTML.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Inline Keyboard visual builder */}
          <div className="space-y-3 border-t border-slate-800/60 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">Inline Keyboard Buttons Builder</label>
              <button
                type="button"
                onClick={addRow}
                className="text-[10px] font-bold bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris</span>
              </button>
            </div>

            {/* Rows List */}
            <div className="space-y-4">
              {keyboardRows.map((row, rowIndex) => (
                <div key={rowIndex} className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Baris {rowIndex + 1}</span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => addBtnToRow(rowIndex)}
                        className="text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-md cursor-pointer"
                      >
                        + Tambah Tombol
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        className="p-1 text-slate-500 hover:text-red-400 rounded transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Row Buttons Grid inputs */}
                  {row.length === 0 ? (
                    <p className="text-[10px] text-slate-500 text-center py-2">Belum ada tombol di baris ini.</p>
                  ) : (
                    <div className="space-y-2">
                      {row.map((btn, btnIndex) => (
                        <div key={btnIndex} className="flex space-x-2 items-center">
                          <input
                            type="text"
                            required
                            placeholder="Nama Tombol"
                            value={btn.text}
                            onChange={(e) => updateBtnInfo(rowIndex, btnIndex, 'text', e.target.value)}
                            className="w-1/3 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="text"
                            required
                            placeholder="URL Link (https://...)"
                            value={btn.url}
                            onChange={(e) => updateBtnInfo(rowIndex, btnIndex, 'url', e.target.value)}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() => removeBtnFromRow(rowIndex, btnIndex)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-red-400 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ADVANCED: Scheduling & Recurrences Options */}
          <div className="space-y-4 border-t border-slate-800/60 pt-4">
            <label className="text-xs font-bold text-slate-300 block">Jadwal Pengiriman</label>
            
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="postingMode"
                  checked={postingMode === 'IMMEDIATE'}
                  onChange={() => setPostingMode('IMMEDIATE')}
                  className="bg-slate-900 border-slate-800 text-primary w-4 h-4"
                />
                <span>Kirim Sekarang</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="postingMode"
                  checked={postingMode === 'SCHEDULED'}
                  onChange={() => setPostingMode('SCHEDULED')}
                  className="bg-slate-900 border-slate-800 text-primary w-4 h-4"
                />
                <span>Jadwalkan</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="postingMode"
                  checked={postingMode === 'RECURRING'}
                  onChange={() => setPostingMode('RECURRING')}
                  className="bg-slate-900 border-slate-800 text-primary w-4 h-4"
                />
                <span>Berulang (Recurring)</span>
              </label>
            </div>

            {/* If Scheduled */}
            {postingMode === 'SCHEDULED' && (
              <div className="p-4 bg-slate-950/60 border border-slate-850 rounded-2xl space-y-2.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Waktu Pengiriman</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {/* If Recurring */}
            {postingMode === 'RECURRING' && (
              <div className="p-4 bg-slate-950/60 border border-slate-850 rounded-2xl space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pola Perulangan</label>
                    <select
                      value={recurrenceType}
                      onChange={(e) => handleCronPresetChange(e.target.value as RecurrenceType)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-350 rounded-xl px-4 py-2.5 text-xs focus:outline-none"
                    >
                      <option value={RecurrenceType.DAILY}>Setiap Hari</option>
                      <option value={RecurrenceType.WEEKLY}>Setiap Minggu</option>
                      <option value={RecurrenceType.MONTHLY}>Setiap Bulan</option>
                      <option value={RecurrenceType.CUSTOM}>Kustom (Cron)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Format Cron Expression</label>
                    <div className="relative">
                      <RotateCw className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        required
                        disabled={recurrenceType !== RecurrenceType.CUSTOM}
                        value={cronExpression}
                        onChange={(e) => setCronExpression(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Cron format: <code>menit jam hari-bulan bulan hari-minggu</code>. Default harian: <code>0 9 * * *</code> (Setiap hari jam 09:00 WIB).
                </p>
              </div>
            )}
          </div>

          {/* Posting Settings */}
          <div className="space-y-3 border-t border-slate-800/60 pt-4 text-xs">
            <label className="font-bold text-slate-300 block">Pengaturan Pesan Telegram</label>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center space-x-2.5 text-slate-400 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={disableNotification}
                  onChange={(e) => setDisableNotification(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-900 text-primary w-4 h-4 focus:ring-0 focus:ring-offset-0"
                />
                <span>Silent Message (Tanpa Suara)</span>
              </label>

              <label className="flex items-center space-x-2.5 text-slate-400 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={protectContent}
                  onChange={(e) => setProtectContent(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-900 text-primary w-4 h-4 focus:ring-0 focus:ring-offset-0"
                />
                <span>Protect Content (No Forward/Save)</span>
              </label>
            </div>
          </div>

          {/* Form actions */}
          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => handlePostSubmit('DRAFT')}
              disabled={createPostMutation.isPending}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3.5 rounded-xl font-semibold text-sm cursor-pointer transition-all border border-slate-700/50"
            >
              Simpan Draft
            </button>

            <button
              type="button"
              onClick={() => handlePostSubmit('SEND_NOW')}
              disabled={createPostMutation.isPending}
              className="flex-1 bg-primary hover:bg-primary/95 text-white py-3.5 rounded-xl font-bold text-sm cursor-pointer shadow-lg shadow-primary/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {createPostMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{postingMode === 'IMMEDIATE' ? 'Kirim Sekarang' : (postingMode === 'SCHEDULED' ? 'Jadwalkan Post' : 'Aktifkan Perulangan')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* RIGHT COLUMN: Real-time Telegram Preview */}
      <div className="w-full lg:w-96 shrink-0 lg:sticky lg:top-8 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-2">
          <Eye className="w-4 h-4 text-primary" />
          <span>Telegram Live Preview</span>
        </h2>

        {/* Telegram mockup frame */}
        <div className="bg-slate-950 border border-slate-850 rounded-3xl p-5 shadow-2xl space-y-4 font-sans text-xs bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
          {/* Mock Header info */}
          <div className="flex items-center space-x-3 border-b border-slate-850 pb-3">
            {selectedBot?.avatarUrl ? (
              <div className="relative w-8 h-8 shrink-0">
                <img
                  src={getBotAvatarUrl(selectedBot.avatarUrl) || undefined}
                  alt={selectedBot.name}
                  className="w-8 h-8 rounded-full object-cover border border-slate-800"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const sibling = (e.currentTarget as HTMLImageElement).nextElementSibling;
                    if (sibling) {
                      (sibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                />
                <div 
                  className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 text-sm"
                  style={{ display: 'none' }}
                >
                  {selectedBot.name.charAt(0).toUpperCase()}
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 text-sm">
                {selectedBot ? selectedBot.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <div>
              <div className="flex items-center space-x-1">
                <span className="font-bold text-white text-xs">{selectedBot ? selectedBot.name : 'Nama Bot'}</span>
                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[8px] font-bold">bot</span>
              </div>
              <span className="text-[10px] text-slate-500">@{selectedBot ? selectedBot.username : 'bot_username'}</span>
            </div>
          </div>

          {/* Chat message bubble container */}
          <div className="flex items-start space-x-2.5">
            {selectedBot?.avatarUrl ? (
              <div className="relative w-7 h-7 shrink-0">
                <img
                  src={getBotAvatarUrl(selectedBot.avatarUrl) || undefined}
                  alt={selectedBot.name}
                  className="w-7 h-7 rounded-full object-cover border border-slate-800"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const sibling = (e.currentTarget as HTMLImageElement).nextElementSibling;
                    if (sibling) {
                      (sibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                />
                <div 
                  className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 text-[10px]"
                  style={{ display: 'none' }}
                >
                  {selectedBot.name.charAt(0).toUpperCase()}
                </div>
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 shrink-0 text-[10px]">
                {selectedBot ? selectedBot.name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            
            <div className="space-y-2 flex-1 max-w-[85%]">
              {/* Chat bubble body */}
              <div className="bg-slate-900 border border-slate-850 rounded-2xl rounded-tl-none p-3 shadow-lg space-y-2">
                
                {/* Preview media lampiran */}
                {mediaType !== MediaType.NONE && mediaUrl && (
                  <div className="rounded-xl overflow-hidden bg-black/30 border border-slate-800 max-h-48 flex items-center justify-center">
                    {mediaType === MediaType.PHOTO && (
                      <img src={getFullMediaUrl(mediaUrl)} alt="Preview Attachment" className="object-cover w-full max-h-48" />
                    )}
                    {mediaType === MediaType.VIDEO && (
                      <video src={getFullMediaUrl(mediaUrl)} controls className="object-cover w-full max-h-48" />
                    )}
                    {mediaType === MediaType.DOCUMENT && (
                      <div className="p-4 flex items-center space-x-2 text-slate-400">
                        <FileText className="w-8 h-8 text-primary" />
                        <div>
                          <p className="font-bold text-slate-200">Lampiran Dokumen</p>
                          <p className="text-[9px] truncate max-w-[140px]">{mediaUrl}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* HTML formatted message body preview */}
                <div 
                  className="text-slate-100 leading-relaxed text-xs break-words"
                  dangerouslySetInnerHTML={{ 
                    __html: mediaType !== MediaType.NONE && mediaCaption.trim() 
                      ? mediaCaption.replace(/\n/g, '<br />') 
                      : getPreviewContent()
                  }}
                />

                {/* Send time indicator */}
                <div className="text-[9px] text-slate-500 text-right mt-1 font-mono">
                  {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              {/* Inline keyboard rendering layout */}
              {keyboardRows.some(row => row.length > 0) && (
                <div className="space-y-1.5">
                  {keyboardRows.map((row, rIdx) => (
                    <div key={rIdx} className="flex gap-1.5">
                      {row.filter(btn => btn.text).map((btn, bIdx) => (
                        <a
                          key={bIdx}
                          href={btn.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-slate-900/60 hover:bg-slate-850 border border-slate-800 text-slate-200 py-2.5 rounded-xl font-semibold text-[10px] text-center block transition-all"
                        >
                          {btn.text}
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// Wrap with Suspense to prevent useSearchParams hydration bailout issues
export default function ComposerPage() {
  return (
    <SidebarLayout>
      <Suspense fallback={
        <div className="flex justify-center items-center py-20 bg-slate-950">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      }>
        <ComposerContent />
      </Suspense>
    </SidebarLayout>
  );
}

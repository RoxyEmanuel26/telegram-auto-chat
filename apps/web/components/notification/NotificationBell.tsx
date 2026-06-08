'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { 
  Bell, BellOff, CheckCircle, AlertTriangle, 
  Loader2, Check, ExternalLink, Calendar
} from 'lucide-react';
import { toast } from 'sonner';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata: any;
  createdAt: string;
}

export default function NotificationBell() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Query: Fetch notifications
  const { data, isLoading } = useQuery<{ notifications: NotificationItem[] }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 15000, // Poll every 15 seconds for new warnings
  });

  // Mutation: Mark single read
  const markReadMutation = useMutation<any, any, string>({
    mutationFn: (id) => api.put(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal menandai notifikasi');
    }
  });

  // Mutation: Mark all read
  const markAllReadMutation = useMutation<any, any, void>({
    mutationFn: () => api.put('/notifications/read-all', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Semua notifikasi ditandai dibaca');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Gagal memperbarui notifikasi');
    }
  });

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markReadMutation.mutate(item.id);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'POST_SENT':
        return <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />;
      case 'POST_FAILED':
      case 'WEBHOOK_DEACTIVATED':
        return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />;
      default:
        return <Bell className="w-4 h-4 text-primary shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      
      {/* Trigger Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-350 hover:text-white rounded-xl transition-all cursor-pointer relative"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-bold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-slate-900 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Card */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[420px]">
          
          {/* Header */}
          <div className="px-4 py-3 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between shrink-0">
            <span className="font-bold text-xs text-white">Notifikasi Masuk ({unreadCount})</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="text-[10px] text-primary hover:underline font-bold flex items-center space-x-0.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Tandai semua dibaca</span>
              </button>
            )}
          </div>

          {/* List content */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-850/60 max-h-80">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <BellOff className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-500">Tidak ada notifikasi baru.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-4 flex items-start space-x-3 transition-all hover:bg-slate-950/20 cursor-pointer ${
                    !item.isRead ? 'bg-primary/5 border-l-2 border-primary' : ''
                  }`}
                >
                  {getNotificationIcon(item.type)}
                  
                  <div className="flex-1 space-y-1 overflow-hidden">
                    <div className="flex items-start justify-between gap-1">
                      <span className={`text-xs block truncate ${!item.isRead ? 'font-bold text-white' : 'text-slate-300'}`}>{item.title}</span>
                      <span className="text-[8px] text-slate-500 font-mono shrink-0 whitespace-nowrap mt-0.5">
                        {new Date(item.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">{item.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      )}
      
    </div>
  );
}

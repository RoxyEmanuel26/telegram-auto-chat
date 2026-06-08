'use client';

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, usePathname } from 'next/navigation';
import { 
  LogOut, Settings, Bot, Radio, Send, History, Loader2, Menu, X,
  FileText, Database, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import NotificationBell from '../notification/NotificationBell';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, accessToken } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !accessToken) {
      router.push('/login');
    }
  }, [mounted, accessToken, router]);

  const handleLogout = () => {
    clearAuth();
    toast.success('Berhasil keluar dari sistem');
    router.push('/login');
  };

  if (!mounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: Activity },
    { name: 'Telegram Bots', path: '/bots', icon: Bot },
    { name: 'Channels & Groups', path: '/channels', icon: Radio },
    { name: 'Buat Post', path: '/composer', icon: Send },
    { name: 'Template Library', path: '/templates', icon: FileText },
    { name: 'Bulk Import CSV', path: '/imports', icon: Database },
    { name: 'Riwayat Post', path: '/posts', icon: History },
    { name: 'Pengaturan', path: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <svg viewBox="0 0 100 100" className="w-8 h-8 fill-none stroke-primary" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 50 L85 20 L55 85 L45 55 Z" stroke="url(#mobile-logo-grad)" strokeWidth="8" />
            <defs>
              <linearGradient id="mobile-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0088cc" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-xl font-bold tracking-wider text-white">TeleHub</span>
        </div>
        
        <div className="flex items-center space-x-3.5">
          <NotificationBell />
          <button 
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6">
          <div className="hidden md:flex items-center space-x-3 mb-8">
            <svg viewBox="0 0 100 100" className="w-8 h-8 fill-none stroke-primary" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 50 L85 20 L55 85 L45 55 Z" stroke="url(#sidebar-logo-grad)" strokeWidth="8" />
              <defs>
                <linearGradient id="sidebar-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0088cc" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-xl font-bold tracking-wider text-white">TeleHub</span>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;
              return (
                <a
                  key={item.name}
                  href={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-semibold ${
                    isActive 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </a>
              );
            })}
          </nav>
        </div>

        {/* Profile / Logout Section */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600 text-white font-bold shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <h4 className="text-sm font-bold text-white truncate">{user.name}</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium uppercase inline-block">
                {user.role}
              </span>
            </div>
          </div>

          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 cursor-pointer font-semibold transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Background overlay for mobile */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Desktop Header */}
        <header className="hidden md:flex bg-slate-900/40 backdrop-blur border-b border-slate-800/65 px-10 py-4 items-center justify-between shrink-0">
          <div className="text-slate-500 text-xs font-semibold">
            Telehub Broadcast Command Center
          </div>
          <div className="flex items-center space-x-4">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-6 md:p-10 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { 
  Users, CheckCircle, ShieldCheck, Activity, Send, Bot, Radio, 
  Loader2, Sparkles, TrendingUp, AlertTriangle, FileText, ChevronRight
} from 'lucide-react';

interface AnalyticsSummary {
  totalPosts: number;
  activeBotsCount: number;
  activeChannelsCount: number;
  potentialReach: number;
  successfulTargets: number;
  failedTargets: number;
  successRate: number;
}

interface ActivityDataPoint {
  date: string;
  total: number;
  sent: number;
}

interface TemplateData {
  id: string;
  name: string;
  category: string;
  usageCount: number;
}

interface ChannelPerformance {
  id: string;
  name: string;
  username: string | null;
  memberCount: number;
  totalPostAttempts: number;
  successfulPosts: number;
  failedPosts: number;
  successRate: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (mounted && !accessToken) {
      router.push('/login');
    }
  }, [mounted, accessToken, router]);

  // Query: Fetch Analytics Summary
  const { data: analyticsData, isLoading: summaryLoading } = useQuery<{
    summary: AnalyticsSummary;
    postsByStatus: Record<string, number>;
    activityData: ActivityDataPoint[];
    topTemplates: TemplateData[];
  }>({
    queryKey: ['analytics-summary'],
    queryFn: () => api.get('/analytics/summary'),
    enabled: !!accessToken,
  });

  // Query: Fetch Channel Performance
  const { data: channelsData, isLoading: channelsLoading } = useQuery<{
    channelPerformance: ChannelPerformance[];
  }>({
    queryKey: ['analytics-channels'],
    queryFn: () => api.get('/analytics/channels'),
    enabled: !!accessToken,
  });

  if (!mounted || summaryLoading || channelsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  const summary = analyticsData?.summary;
  const activityData = analyticsData?.activityData || [];
  const topTemplates = analyticsData?.topTemplates || [];
  const channels = channelsData?.channelPerformance || [];

  // SVG Chart Coordinates calculation helper
  const renderSVGChart = () => {
    if (activityData.length === 0) return null;

    const width = 500;
    const height = 180;
    const paddingLeft = 35;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 25;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Find max value for Y-axis
    const maxVal = Math.max(...activityData.map(d => d.total), 5); // minimum height limit of 5

    // Generate points
    const points = activityData.map((d, index) => {
      const x = paddingLeft + (index / (activityData.length - 1)) * chartWidth;
      const y = paddingTop + chartHeight - (d.total / maxVal) * chartHeight;
      return { x, y, data: d };
    });

    const sentPoints = activityData.map((d, index) => {
      const x = paddingLeft + (index / (activityData.length - 1)) * chartWidth;
      const y = paddingTop + chartHeight - (d.sent / maxVal) * chartHeight;
      return { x, y, data: d };
    });

    // Create polyline paths
    const pathTotal = points.map(p => `${p.x},${p.y}`).join(' ');
    const pathSent = sentPoints.map(p => `${p.x},${p.y}`).join(' ');

    // Area path under line
    const areaTotal = `${points[0].x},${paddingTop + chartHeight} ` + pathTotal + ` ${points[points.length - 1].x},${paddingTop + chartHeight}`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full text-slate-500 font-sans text-[8px] font-semibold">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0088cc" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = paddingTop + ratio * chartHeight;
          const gridVal = Math.round(maxVal - ratio * maxVal);
          return (
            <g key={idx}>
              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#1e293b" strokeWidth="1" strokeDasharray="3,3" />
              <text x={paddingLeft - 8} y={y + 3} textAnchor="end" className="fill-slate-500 font-mono">{gridVal}</text>
            </g>
          );
        })}

        {/* Area fill */}
        <polygon points={areaTotal} fill="url(#area-grad)" />

        {/* Lines */}
        <polyline points={pathTotal} fill="none" stroke="url(#line-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pathSent} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2,2" />

        {/* Interactive Dots & Tooltips */}
        {points.map((p, idx) => (
          <g key={idx} className="group cursor-pointer">
            <circle cx={p.x} cy={p.y} r="3" className="fill-slate-950 stroke-primary stroke-[1.5] transition-all hover:r-4.5" />
            <circle cx={p.x} cy={p.y} r="8" fill="transparent" />
            {/* Tooltip on hover */}
            <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <rect x={p.x - 25} y={p.y - 28} width="50" height="20" rx="4" className="fill-slate-900 stroke-slate-800 stroke-[1]" />
              <text x={p.x} y={p.y - 19} textAnchor="middle" className="fill-white font-bold font-mono">
                {p.data.total} / {p.data.sent}
              </text>
            </g>
          </g>
        ))}

        {/* X-Axis labels */}
        {points.map((p, idx) => (
          <text key={idx} x={p.x} y={paddingTop + chartHeight + 14} textAnchor="middle" className="fill-slate-500 font-mono">
            {p.data.date}
          </text>
        ))}
      </svg>
    );
  };

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
              <Sparkles className="w-8 h-8 text-primary animate-pulse" />
              <span>TeleHub Dashboard</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Metrik performa realtime, jangkauan anggota, dan status pengiriman siaran.</p>
          </div>
        </header>

        {/* KPI Counter summary cards */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* KPI 1: Reach */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-slate-755 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-semibold block uppercase">Total Jangkauan</span>
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-black text-white block">{summary.potentialReach.toLocaleString('id-ID')}</span>
                <span className="text-[10px] text-slate-500 block mt-1">Dari <strong>{summary.activeChannelsCount} channel</strong> aktif terhubung</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-primary/30" />
            </div>

            {/* KPI 2: Success Rate */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-slate-755 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-semibold block uppercase">Delivery Sukses</span>
                <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-black text-white block">{summary.successRate}%</span>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Sukses: <strong>{summary.successfulTargets}</strong> | Gagal: <strong className={summary.failedTargets > 0 ? 'text-red-400' : ''}>{summary.failedTargets}</strong>
                </span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-green-500/30" />
            </div>

            {/* KPI 3: Total Broadcasts */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-slate-755 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-semibold block uppercase">Total Siaran</span>
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Send className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-black text-white block">{summary.totalPosts}</span>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Draft: <strong>{analyticsData?.postsByStatus?.DRAFT || 0}</strong> | Jadwal: <strong>{analyticsData?.postsByStatus?.SCHEDULED || 0}</strong>
                </span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-purple-500/30" />
            </div>

            {/* KPI 4: Active Bots */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-slate-755 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-semibold block uppercase">Bot Pengirim</span>
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400">
                  <Bot className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-black text-white block">{summary.activeBotsCount} Bot</span>
                <span className="text-[10px] text-slate-500 block mt-1">Aktif & terotorisasi penuh ke Telegram</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-orange-500/30" />
            </div>

          </div>
        )}

        {/* Graphical statistics & template ranking grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* SVG activity chart card */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span>Aktivitas Siaran 7 Hari Terakhir</span>
              </h3>
              <div className="flex items-center space-x-3 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span>Dibuat</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Sukses</span>
                </span>
              </div>
            </div>

            <div className="h-44 w-full flex items-center justify-center">
              {renderSVGChart()}
            </div>
          </div>

          {/* Template ranking card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
              <FileText className="w-4.5 h-4.5 text-primary" />
              <span>Template Terlaris</span>
            </h3>

            {topTemplates.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-12 italic">Belum ada pemakaian template.</p>
            ) : (
              <div className="space-y-3">
                {topTemplates.map((tpl) => (
                  <div key={tpl.id} className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl flex items-center justify-between gap-3 hover:border-slate-800 transition-all">
                    <div className="overflow-hidden">
                      <span className="font-bold text-white text-xs block truncate">{tpl.name}</span>
                      <span className="text-[8px] font-bold text-primary uppercase block mt-0.5">{tpl.category}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-white font-extrabold text-xs block">{tpl.usageCount}x</span>
                      <span className="text-[8px] text-slate-500 block uppercase">Dipakai</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Channel reach list */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Radio className="w-4.5 h-4.5 text-primary animate-pulse" />
            <span>Kinerja Jangkauan Saluran & Grup</span>
          </h3>

          {channels.length === 0 ? (
            <p className="text-slate-400 text-xs text-center py-8">Belum ada channel terdaftar.</p>
          ) : (
            <div className="border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase">
                      <th className="p-4">Saluran Target</th>
                      <th className="p-4">Jumlah Anggota</th>
                      <th className="p-4">Total Broadcast</th>
                      <th className="p-4">Sukses</th>
                      <th className="p-4">Gagal</th>
                      <th className="p-4 text-right">Rasio Sukses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {channels.map((ch) => (
                      <tr key={ch.id} className="hover:bg-slate-950/10">
                        <td className="p-4">
                          <div>
                            <h4 className="font-bold text-white text-sm">{ch.name}</h4>
                            <span className="text-[10px] text-slate-500 block mt-0.5">{ch.username ? `@${ch.username}` : ch.id}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-slate-200">
                          {ch.memberCount.toLocaleString('id-ID')} Anggota
                        </td>
                        <td className="p-4 font-mono">{ch.totalPostAttempts} kali</td>
                        <td className="p-4 text-green-400 font-mono">{ch.successfulPosts}</td>
                        <td className="p-4 font-mono">{ch.failedPosts}</td>
                        <td className="p-4 text-right">
                          <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase border ${
                            ch.successRate >= 90
                              ? 'bg-green-500/10 text-green-400 border-green-500/20'
                              : ch.successRate >= 50
                              ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {ch.successRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

      </div>
    </SidebarLayout>
  );
}

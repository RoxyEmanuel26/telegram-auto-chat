'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { LoginSchema, LoginInput } from 'shared';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  
  const router = useRouter();
  const { setAuth, set2FARequired, twoFactorRequired, tempToken, clearAuth } = useAuthStore();

  // React Hook Form for login
  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  // Handle standard password login
  const onLoginSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const res = await api.post<{
        message: string;
        accessToken?: string;
        refreshToken?: string;
        tempToken?: string;
        twoFactorRequired?: boolean;
        user?: any;
      }>('/auth/login', data);

      if (res.twoFactorRequired && res.tempToken) {
        set2FARequired(res.tempToken);
        toast.info('Autentikasi Dua Faktor (2FA) diperlukan. Masukkan kode OTP Anda.');
      } else if (res.accessToken && res.refreshToken && res.user) {
        setAuth(res.user, res.accessToken, res.refreshToken);
        toast.success(`Selamat datang kembali, ${res.user.name}!`);
        router.push('/dashboard');
      }
    } catch (error: any) {
      toast.error(error.message || 'Login gagal, silakan periksa kredensial Anda');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle 2FA OTP verification
  const onVerify2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      toast.error('Kode OTP harus 6 digit');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post<{
        message: string;
        accessToken: string;
        refreshToken: string;
        user: any;
      }>('/auth/verify-2fa', { code: otpCode }, { token: tempToken || undefined });

      setAuth(res.user, res.accessToken, res.refreshToken);
      toast.success(`Verifikasi 2FA berhasil! Selamat datang, ${res.user.name}`);
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Kode OTP salah atau kedaluwarsa');
    } finally {
      setIsLoading(false);
    }
  };

  const cancel2FA = () => {
    clearAuth();
    setOtpCode('');
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-bg animate-gradient px-4 py-12">
      {/* Background glass floating shapes */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/20 blur-3xl pointer-events-none animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none animate-float" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-md z-10">
        {/* Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl mb-4">
            <svg viewBox="0 0 100 100" className="w-10 h-10 fill-none stroke-white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
              {/* Hybrid logo: paper plane combined with hub nodes */}
              <path d="M15 50 L85 20 L55 85 L45 55 Z" stroke="url(#logo-grad)" strokeWidth="8" />
              <path d="M45 55 L85 20" stroke="white" strokeWidth="5" />
              <circle cx="15" cy="50" r="6" fill="#0088cc" stroke="white" strokeWidth="2"/>
              <circle cx="55" cy="85" r="6" fill="#0088cc" stroke="white" strokeWidth="2"/>
              <circle cx="85" cy="20" r="6" fill="#0088cc" stroke="white" strokeWidth="2"/>
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0088cc" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">TeleHub</h1>
          <p className="text-blue-200/80 text-sm mt-1">One Dashboard, Unlimited Reach</p>
        </div>

        {/* Card Body */}
        <div className="glass rounded-3xl p-8 shadow-2xl transition-all duration-300">
          {!twoFactorRequired ? (
            /* ==============================================================
               Standard Password Login Form
               ============================================================== */
            <form onSubmit={handleSubmit(onLoginSubmit)} className="space-y-6">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-white">Masuk ke Command Center</h2>
                <p className="text-slate-300 text-xs mt-1">Gunakan kredensial akun administrator Anda</p>
              </div>

              {/* Email Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Alamat Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    placeholder="nama@email.com"
                    disabled={isLoading}
                    className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50"
                    {...registerField('email')}
                  />
                </div>
                {errors.email && (
                  <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-3 pl-10 pr-12 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50"
                    {...registerField('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
                )}
              </div>

              {/* Remember Me checkbox */}
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isLoading}
                    className="rounded border-white/10 bg-slate-950/40 text-primary focus:ring-0 focus:ring-offset-0 w-4 h-4"
                    {...registerField('rememberMe')}
                  />
                  <span>Ingat Saya</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl py-3.5 font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-primary/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Dashboard</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* ==============================================================
               2FA OTP Verification Form
               ============================================================== */
            <form onSubmit={onVerify2FASubmit} className="space-y-6">
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-6 h-6 text-teal-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Verifikasi Keamanan</h2>
                <p className="text-slate-300 text-xs mt-1">Masukkan kode 6 digit dari Google Authenticator</p>
              </div>

              {/* OTP Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block text-center">Kode OTP</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  disabled={isLoading}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-4 text-center text-white placeholder-slate-500 text-2xl tracking-[0.5em] font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50"
                  autoFocus
                />
              </div>

              {/* Submit Buttons */}
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={isLoading || otpCode.length !== 6}
                  className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl py-3.5 font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-primary/30 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span>Verifikasi & Lanjutkan</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={cancel2FA}
                  disabled={isLoading}
                  className="w-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl py-3 text-sm font-semibold transition-all"
                >
                  Batal
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

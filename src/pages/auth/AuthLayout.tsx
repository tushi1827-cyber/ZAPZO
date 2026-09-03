import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ShieldCheck, BadgeCheck, Wallet } from 'lucide-react';
import { Logo } from '@/components/Logo';

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* Left panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-ink-950 p-12 lg:flex">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-10 left-10 h-48 w-48 rounded-full bg-accent-400/5 blur-3xl" />
        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-extrabold text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 shadow-glow-purple"><Zap className="h-5 w-5" fill="currentColor" /></span>
            ZAPZO
          </Link>
        </div>
        <div className="relative">
          <h2 className="text-3xl font-bold text-white">Do Tasks. <span className="text-accent-400">Earn Rewards.</span></h2>
          <p className="mt-3 max-w-sm text-white/60">A legitimate task-and-referral rewards platform with transparent verification.</p>
          <div className="mt-8 space-y-4">
            {[
              { icon: BadgeCheck, text: 'Verified tasks with manual review' },
              { icon: Wallet, text: 'Transparent wallet ledger' },
              { icon: ShieldCheck, text: 'Secure, fraud-resistant referrals' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 text-white/70">
                <item.icon className="h-5 w-5 text-brand-400" />
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/40">Earnings are not guaranteed. Rewards require verification.</p>
      </div>

      {/* Right panel */}
      <div className="flex w-full flex-col lg:w-1/2">
        <div className="flex items-center justify-between p-6 lg:hidden">
          <Logo size="sm" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md animate-slide-up">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="mt-2 text-sm text-ink-400">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

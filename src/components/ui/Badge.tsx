import { ReactNode } from 'react';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

const tones: Record<Tone, string> = {
  success: 'bg-success-500/15 text-success-400',
  warning: 'bg-warning-500/15 text-warning-400',
  danger: 'bg-danger-500/15 text-danger-400',
  info: 'bg-brand-500/15 text-brand-400',
  neutral: 'bg-ink-300/30 text-ink-400',
  brand: 'bg-brand-600 text-white',
};

export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`badge ${tones[tone]} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, Tone> = {
    pending: 'warning',
    active: 'success',
    approved: 'success',
    completed: 'success',
    paid: 'success',
    qualified: 'success',
    rejected: 'danger',
    expired: 'danger',
    reversed: 'danger',
    paused: 'info',
    draft: 'neutral',
    processing: 'info',
  };
  return <Badge tone={map[status] ?? 'neutral'}>{status}</Badge>;
}

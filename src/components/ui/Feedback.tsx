import { ReactNode } from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const dims = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6';
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`${dims} animate-spin rounded-full border-2 border-ink-300 border-t-brand-500`} />
    </div>
  );
}

export function FullPageSpinner({ message }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950">
      <Spinner size="lg" />
      {message && <p className="text-sm text-ink-400">{message}</p>}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card animate-pulse p-6">
      <div className="h-4 w-24 rounded bg-ink-300" />
      <div className="mt-3 h-8 w-32 rounded bg-ink-300" />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-3 text-ink-400">{icon}</div>}
      <p className="font-semibold text-ink-50">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

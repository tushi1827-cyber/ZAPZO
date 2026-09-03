import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-10 w-10' : size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-lg' : 'text-xl';
  return (
    <Link to="/" className="inline-flex items-center gap-2 font-display font-extrabold tracking-tight">
      <span className={`${dims} grid place-items-center rounded-xl bg-brand-600 text-white shadow-glow-purple transition-transform hover:scale-105`}>
        <Zap className="h-1/2 w-1/2" fill="currentColor" />
      </span>
      <span className={`${text} text-white`}>ZAPZO</span>
    </Link>
  );
}

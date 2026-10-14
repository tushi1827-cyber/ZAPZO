import { Link } from 'react-router-dom';

const sizeMap = {
  sm: 'h-6',
  md: 'h-7',
  lg: 'h-9',
} as const;

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2">
      <img
        src="/workpixo-logo.png"
        alt="Official WorkPixo logo"
        className={`${sizeMap[size]} w-auto object-contain`}
      />
      <span className="text-sm font-extrabold tracking-tight sm:text-base">
        <span className="text-brand-400">Work</span>
        <span className="text-accent-400">Pixo</span>
      </span>
    </Link>
  );
}

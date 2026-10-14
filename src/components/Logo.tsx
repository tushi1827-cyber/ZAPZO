import { Link } from 'react-router-dom';

const sizeMap = {
  sm: 'h-6',
  md: 'h-7',
  lg: 'h-9',
} as const;

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Link to="/" className="inline-flex items-center">
      <img
        src="/workpixo-logo.png"
        alt="WorkPixo"
        className={`${sizeMap[size]} w-auto object-contain`}
      />
    </Link>
  );
}

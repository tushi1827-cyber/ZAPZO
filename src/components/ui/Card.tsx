import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  accent?: boolean;
}

export function Card({ children, className = '', hover, accent }: CardProps) {
  const base = accent ? 'card-accent' : 'card';
  return (
    <div className={`${base} ${hover ? 'transition-all duration-200 hover:border-brand-600/40 hover:shadow-glow-purple hover:-translate-y-0.5' : ''} ${className}`}>
      {children}
    </div>
  );
}

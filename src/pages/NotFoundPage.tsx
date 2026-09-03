import { Link } from 'react-router-dom';
import { Home, Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 text-center">
      <div className="absolute top-1/2 left-1/2 -z-10 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/10 blur-[120px]" />
      <p className="text-7xl font-extrabold tracking-tight text-white sm:text-8xl">404</p>
      <p className="mt-4 text-xl font-bold text-white">Page not found</p>
      <p className="mt-2 max-w-md text-sm text-ink-400">
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button to="/" size="lg">
          <Home className="h-5 w-5" /> Go Home
        </Button>
        <Button to="/dashboard" variant="secondary" size="lg">
          <Compass className="h-5 w-5" /> Dashboard
        </Button>
      </div>
    </div>
  );
}

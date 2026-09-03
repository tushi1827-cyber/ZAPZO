import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, LayoutDashboard, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';

const landingLinks = [
  { label: 'Home', href: '/' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Tasks', href: '/#tasks-preview' },
  { label: 'Rewards', href: '/#rewards' },
  { label: 'FAQ', href: '/#faq' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const isLanding = location.pathname === '/';

  return (
    <header className={`sticky top-0 z-40 transition-all duration-300 ${scrolled || !isLanding ? 'bg-ink-950/80 backdrop-blur-lg border-b border-ink-200' : 'bg-transparent'}`}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Logo />

        <div className="hidden items-center gap-1 lg:flex">
          {landingLinks.map((link) => (
            <a key={link.label} href={link.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-400 transition hover:bg-ink-800 hover:text-white">
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Button to="/dashboard" variant="secondary" size="sm">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Button>
              {isAdmin && (
                <Button to="/admin" variant="secondary" size="sm">
                  <Shield className="h-4 w-4" /> Admin
                </Button>
              )}
              <button onClick={handleSignOut} className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-white" aria-label="Sign out">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button to="/login" variant="ghost" size="sm">Login</Button>
              <Button to="/register" size="sm">Get Started</Button>
            </div>
          )}

          <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white lg:hidden" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-ink-200 bg-ink-950 px-4 py-4 lg:hidden animate-slide-up">
          <div className="flex flex-col gap-1">
            {landingLinks.map((link) => (
              <a key={link.label} href={link.href} className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-400 hover:bg-ink-800 hover:text-white">
                {link.label}
              </a>
            ))}
            <div className="my-2 h-px bg-ink-200" />
            {user ? (
              <>
                <Link to="/dashboard" className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-400 hover:bg-ink-800 hover:text-white">Dashboard</Link>
                {isAdmin && <Link to="/admin" className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-400 hover:bg-ink-800 hover:text-white">Admin Panel</Link>}
                <button onClick={handleSignOut} className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger-400 hover:bg-danger-500/10">Sign Out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-400 hover:bg-ink-800 hover:text-white">Login</Link>
                <Link to="/register" className="mt-1 btn-primary w-full">Get Started</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

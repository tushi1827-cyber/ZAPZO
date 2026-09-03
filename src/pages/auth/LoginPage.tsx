import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { supabase } from '@/lib/supabase';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const justRegistered = searchParams.get('registered') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    const redirect = searchParams.get('redirect') || '/dashboard';
    navigate(redirect);
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your ZAPZO account to continue earning.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {justRegistered && (
          <div className="flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Account created successfully! Sign in to continue.
          </div>
        )}
        <Input
          label="Email"
          type="email"
          name="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <div>
          <Input
            label="Password"
            type="password"
            name="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <div className="mt-2 text-right">
            <Link to="/forgot-password" className="text-xs font-medium text-brand-400 hover:text-brand-300">
              Forgot password?
            </Link>
          </div>
        </div>
        {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
        <Button type="submit" fullWidth size="lg" disabled={loading}>
          {loading ? <Spinner size="sm" /> : <>Sign In <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-400">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold text-brand-400 hover:text-brand-300">Sign up free</Link>
      </p>
    </AuthLayout>
  );
}

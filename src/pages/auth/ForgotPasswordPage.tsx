import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { supabase } from '@/lib/supabase';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we'll send you a password reset link.">
      {sent ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-brand-400" />
          <p className="mt-4 font-semibold text-white">Check your inbox</p>
          <p className="mt-2 text-sm text-ink-400">If an account exists for {email}, a reset link is on its way.</p>
          <Link to="/login" className="mt-6 inline-block font-semibold text-brand-400 hover:text-brand-300">Back to login</Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
            <Button type="submit" fullWidth size="lg" disabled={loading}>
              {loading ? <Spinner size="sm" /> : <>Send Reset Link <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-ink-400">
            Remembered your password?{' '}
            <Link to="/login" className="font-semibold text-brand-400 hover:text-brand-300">Sign in</Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}

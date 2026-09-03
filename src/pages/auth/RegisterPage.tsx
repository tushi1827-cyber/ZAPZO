import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, User, Mail, Lock, Gift } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { supabase } from '@/lib/supabase';

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(searchParams.get('ref') || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refValid, setRefValid] = useState<boolean | null>(null);

  useEffect(() => {
    const code = searchParams.get('ref');
    if (code) setReferralCode(code.toUpperCase());
  }, [searchParams]);

  useEffect(() => {
    const check = async () => {
      const code = referralCode.trim().toUpperCase();
      if (code.length < 5) { setRefValid(null); return; }
      const { data, error } = await supabase.rpc('referral_code_exists', { p_code: code });
      if (error) return;
      setRefValid(data === true);
    };
    const t = setTimeout(check, 350);
    return () => clearTimeout(t);
  }, [referralCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name.trim(),
          referral_code: referralCode.trim().toUpperCase() || null,
        },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      navigate('/dashboard');
    } else {
      navigate('/login?registered=1');
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Join ZAPZO free — start completing verified tasks and earning rewards.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Full Name"
          name="name"
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
        />
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
        <Input
          label="Password"
          type="password"
          name="password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        <div>
          <Input
            label="Referral Code (optional)"
            name="referral_code"
            placeholder="ZAPZO-XXXXX"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            hint={refValid === true ? 'Valid referral code!' : refValid === false ? 'Code not found — you can still sign up without it.' : 'Enter a friend\'s code to be linked as their referral.'}
          />
        </div>
        {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
        <Button type="submit" fullWidth size="lg" disabled={loading}>
          {loading ? <Spinner size="sm" /> : <>Create Account <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-ink-400">
        By signing up, you agree to our{' '}
        <Link to="/terms" className="underline hover:text-ink-50">Terms</Link> and{' '}
        <Link to="/privacy" className="underline hover:text-ink-50">Privacy Policy</Link>.
      </p>
      <p className="mt-4 text-center text-sm text-ink-400">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-400 hover:text-brand-300">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  User as UserIcon, Mail, Calendar, Zap, Shield, Ban,
  Save, Lock, Copy, Check, CheckCircle2, AlertCircle, SlidersHorizontal,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type AccountTab = 'profile' | 'settings';

const TABS: { id: AccountTab; label: string; icon: typeof UserIcon }[] = [
  { id: 'profile', label: 'Personal Profile', icon: UserIcon },
  { id: 'settings', label: 'Account Settings', icon: SlidersHorizontal },
];

function ProfileSection() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile) setName(profile.name);
  }, [profile]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setNameSuccess(false);
    if (name.trim().length < 2) {
      setNameError('Name must be at least 2 characters.');
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim() })
      .eq('id', user!.id);
    setSavingName(false);
    if (error) {
      setNameError(error.message);
      return;
    }
    await refreshProfile();
    setNameSuccess(true);
    setTimeout(() => setNameSuccess(false), 3000);
  };

  const copyReferralCode = async () => {
    try {
      await navigator.clipboard.writeText(profile?.referral_code || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  if (!profile) return <Spinner size="lg" className="py-20" />;

  const accountInfo = [
    { icon: Mail, label: 'Email', value: user?.email || '—' },
    { icon: Zap, label: 'Referral Code', value: profile.referral_code, mono: true, copyable: true },
    { icon: Calendar, label: 'Member Since', value: new Date(profile.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) },
    { icon: Shield, label: 'Role', value: profile.is_admin ? 'Administrator' : 'Member' },
  ];

  return (
    <div className="space-y-6">
      {profile.is_suspended && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-500/10 p-4 text-sm text-danger-400">
          <Ban className="h-4 w-4 shrink-0" />
          Your account is suspended. Some actions may be restricted.
        </div>
      )}

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-600/15 text-brand-400">
            <UserIcon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-white">{profile.name || 'Unnamed'}</h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={profile.is_suspended ? 'danger' : 'success'}>
                {profile.is_suspended ? 'Suspended' : 'Active'}
              </Badge>
              {profile.is_admin && <Badge tone="brand">Admin</Badge>}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {accountInfo.map((item) => (
            <div key={item.label} className="rounded-xl bg-ink-800/50 p-4">
              <div className="flex items-center gap-2">
                <item.icon className="h-4 w-4 text-ink-400" />
                <p className="text-xs text-ink-400">{item.label}</p>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className={`truncate font-semibold text-white ${item.mono ? 'font-mono' : ''}`}>
                  {item.value}
                </p>
                {item.copyable && (
                  <button
                    onClick={copyReferralCode}
                    className="shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-white"
                    title="Copy code"
                  >
                    {copied ? <Check className="h-4 w-4 text-accent-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-white">Display Name</h2>
        <p className="mt-1 text-sm text-ink-400">This is the name shown on your profile and to administrators.</p>
        <form onSubmit={handleSaveName} className="mt-4 space-y-4">
          <Input
            label="Name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your display name"
            error={nameError || undefined}
          />
          {nameSuccess && (
            <div className="flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Name updated successfully!
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={savingName || name.trim() === profile.name}>
              {savingName ? <Spinner size="sm" /> : <><Save className="h-4 w-4" /> Save Name</>}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SettingsSection() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPasswordSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-brand-400" />
          <h2 className="font-bold text-white">Change Password</h2>
        </div>
        <p className="mt-1 text-sm text-ink-400">Choose a strong password of at least 6 characters.</p>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <Input
            label="New Password"
            type="password"
            name="new_password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            autoComplete="new-password"
          />
          <Input
            label="Confirm New Password"
            type="password"
            name="confirm_password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
            error={passwordError || undefined}
          />
          {passwordSuccess && (
            <div className="flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Password changed successfully!
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <AlertCircle className="h-3.5 w-3.5" />
              You'll stay logged in on this device.
            </p>
            <Button type="submit" disabled={savingPassword || !newPassword || !confirmPassword}>
              {savingPassword ? <Spinner size="sm" /> : <><Lock className="h-4 w-4" /> Update Password</>}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-white">Account Information</h2>
        <p className="mt-1 text-sm text-ink-400">Your registered email and account identifiers.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-ink-800/50 p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-ink-400" />
              <p className="text-xs text-ink-400">Email</p>
            </div>
            <p className="mt-1.5 truncate font-semibold text-white">{user?.email || '—'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function MyAccountPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as AccountTab | null;

  const activeTab: AccountTab = useMemo(() => {
    if (tabParam === 'profile' || tabParam === 'settings') return tabParam;
    return 'profile';
  }, [tabParam]);

  const setTab = (tab: AccountTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">My Account</h1>
        <p className="mt-1 text-sm text-ink-400">Manage your profile details and account security.</p>
      </div>

      {/* Tab navigation */}
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-1 rounded-xl bg-ink-800/60 p-1 sm:min-w-0">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-600 text-white shadow-glow-purple'
                    : 'text-ink-400 hover:bg-ink-800 hover:text-white'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.id === 'profile' ? 'Profile' : 'Settings'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'profile' && <ProfileSection />}
      {activeTab === 'settings' && <SettingsSection />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, IndianRupee, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Feedback';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Settings } from '@/types';

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (error) setLoadError('Failed to load settings.');
      setSettings(data as Settings | null);
      setLoading(false);
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setError('');
    setSaving(true);
    const minW = parseFloat(String(settings.min_withdrawal));
    const refR = parseFloat(String(settings.referral_reward));
    if (isNaN(minW) || minW < 0) { setError('Invalid minimum withdrawal.'); setSaving(false); return; }
    if (isNaN(refR) || refR < 0) { setError('Invalid referral reward.'); setSaving(false); return; }

    const { error: updErr } = await supabase
      .from('settings')
      .update({ min_withdrawal: minW, referral_reward: refR, site_name: settings.site_name })
      .eq('id', 1);
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <AdminPageWrapper title="Settings" subtitle="Configure platform-wide settings.">
      {loadError && <div className="mb-4 rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{loadError}</div>}
      <div className="max-w-2xl">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <SettingsIcon className="h-5 w-5 text-brand-400" />
            <h2 className="font-bold text-white">Platform Configuration</h2>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-ink-400" />
                  Minimum Withdrawal (INR)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={String(settings?.min_withdrawal ?? '')}
                  onChange={(e) => setSettings({ ...settings!, min_withdrawal: parseFloat(e.target.value) })}
                  hint="Users must have at least this amount to request a withdrawal."
                />
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  <Users className="h-4 w-4 text-ink-400" />
                  Referral Reward (INR)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={String(settings?.referral_reward ?? '')}
                  onChange={(e) => setSettings({ ...settings!, referral_reward: parseFloat(e.target.value) })}
                  hint="Amount credited to referrer when a referral qualifies."
                />
              </div>
            </div>

            <div>
              <label className="label">Site Name</label>
              <Input
                value={settings?.site_name ?? ''}
                onChange={(e) => setSettings({ ...settings!, site_name: e.target.value })}
              />
            </div>

            {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
            {success && <div className="rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">Settings saved successfully!</div>}

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner size="sm" /> : <><Save className="h-4 w-4" /> Save Settings</>}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="mt-4 p-5">
          <h3 className="font-semibold text-white">About These Settings</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-400">
            <li>• <strong className="text-ink-50">Minimum Withdrawal</strong> — enforced server-side by the request_withdrawal function.</li>
            <li>• <strong className="text-ink-50">Referral Reward</strong> — applied automatically when a referral qualifies (after referred user's task is approved).</li>
            <li>• Changes take effect immediately for all new operations.</li>
          </ul>
        </Card>
      </div>
    </AdminPageWrapper>
  );
}

import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, IndianRupee, Users, Gift, Plus, Trash2, Power } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Feedback';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Settings as SettingsType, GiftCardDenomination, GiftCardProvider } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PROVIDERS: { value: GiftCardProvider; label: string }[] = [
  { value: 'amazon_gift_card', label: 'Amazon Gift Card' },
  { value: 'flipkart_gift_card', label: 'Flipkart Gift Card' },
  { value: 'google_play_gift_card', label: 'Google Play Gift Card' },
];

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [denominations, setDenominations] = useState<GiftCardDenomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadError, setLoadError] = useState('');
  const [denomLoading, setDenomLoading] = useState(false);
  const [denomError, setDenomError] = useState('');
  const [denomSuccess, setDenomSuccess] = useState('');
  const [newDenomValue, setNewDenomValue] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (error) setLoadError('Failed to load settings.');
      setSettings(data as SettingsType | null);
      const { data: denoms } = await supabase
        .from('gift_card_denominations')
        .select('*')
        .order('provider, value');
      setDenominations((denoms as GiftCardDenomination[]) || []);
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
    setSuccess('Settings saved successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const reloadDenominations = async () => {
    const { data: denoms } = await supabase
      .from('gift_card_denominations')
      .select('*')
      .order('provider, value');
    setDenominations((denoms as GiftCardDenomination[]) || []);
  };

  const handleAddDenomination = async (provider: GiftCardProvider) => {
    const val = parseFloat(newDenomValue);
    if (isNaN(val) || val <= 0) {
      setDenomError('Enter a valid positive amount.');
      return;
    }
    setDenomLoading(true);
    setDenomError('');
    const { error: insErr } = await supabase
      .from('gift_card_denominations')
      .insert({ provider, value: val, is_active: true });
    setDenomLoading(false);
    if (insErr) {
      setDenomError(insErr.message);
      return;
    }
    setNewDenomValue('');
    setDenomSuccess(`Added ${formatMoney(val)} to ${PROVIDERS.find((p) => p.value === provider)?.label}.`);
    setTimeout(() => setDenomSuccess(''), 3000);
    await reloadDenominations();
  };

  const handleToggleDenomination = async (d: GiftCardDenomination) => {
    setDenomLoading(true);
    setDenomError('');
    const { error: updErr } = await supabase
      .from('gift_card_denominations')
      .update({ is_active: !d.is_active })
      .eq('id', d.id);
    setDenomLoading(false);
    if (updErr) {
      setDenomError(updErr.message);
      return;
    }
    await reloadDenominations();
  };

  const handleDeleteDenomination = async (d: GiftCardDenomination) => {
    setDenomLoading(true);
    setDenomError('');
    const { error: delErr } = await supabase
      .from('gift_card_denominations')
      .delete()
      .eq('id', d.id);
    setDenomLoading(false);
    if (delErr) {
      setDenomError(delErr.message);
      return;
    }
    await reloadDenominations();
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <AdminPageWrapper title="Settings" subtitle="Configure platform-wide settings and gift card denominations.">
      {loadError && <div className="mb-4 rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{loadError}</div>}
      <div className="max-w-3xl space-y-6">
        {/* Platform Settings */}
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
            {success && <div className="rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">{success}</div>}

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner size="sm" /> : <><Save className="h-4 w-4" /> Save Settings</>}
              </Button>
            </div>
          </form>
        </Card>

        {/* Gift Card Denomination Management */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="h-5 w-5 text-brand-400" />
            <h2 className="font-bold text-white">Gift Card Denominations</h2>
          </div>
          <p className="mb-6 text-sm text-ink-400">
            Manage which denomination values are available for each gift card provider. Disabling a denomination hides it from users but does not affect existing withdrawal records.
          </p>

          {denomError && <div className="mb-4 rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{denomError}</div>}
          {denomSuccess && <div className="mb-4 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">{denomSuccess}</div>}

          <div className="space-y-6">
            {PROVIDERS.map((provider) => {
              const providerDenoms = denominations.filter((d) => d.provider === provider.value);
              return (
                <div key={provider.value} className="rounded-xl border border-ink-200 p-4">
                  <h3 className="mb-3 font-semibold text-white">{provider.label}</h3>
                  <div className="flex flex-wrap gap-2">
                    {providerDenoms.length === 0 ? (
                      <p className="text-sm text-ink-400">No denominations configured.</p>
                    ) : (
                      providerDenoms.map((d) => (
                        <div
                          key={d.id}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition ${
                            d.is_active
                              ? 'border-brand-500/40 bg-brand-600/10'
                              : 'border-ink-200 bg-ink-800/30 opacity-60'
                          }`}
                        >
                          <span className={`text-sm font-semibold ${d.is_active ? 'text-brand-400' : 'text-ink-400'}`}>
                            {formatMoney(d.value)}
                          </span>
                          <button
                            onClick={() => handleToggleDenomination(d)}
                            disabled={denomLoading}
                            className="rounded p-1 text-ink-400 hover:text-white"
                            title={d.is_active ? 'Disable' : 'Enable'}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDenomination(d)}
                            disabled={denomLoading}
                            className="rounded p-1 text-ink-400 hover:text-danger-400"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Add new denomination */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="w-32">
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="New value"
                        value={newDenomValue}
                        onChange={(e) => setNewDenomValue(e.target.value)}
                        disabled={denomLoading}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAddDenomination(provider.value)}
                      disabled={denomLoading || !newDenomValue}
                    >
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-white">About These Settings</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-400">
            <li>• <strong className="text-ink-50">Minimum Withdrawal</strong> — enforced server-side by the request_withdrawal function.</li>
            <li>• <strong className="text-ink-50">Referral Reward</strong> — applied automatically when a referral qualifies (after referred user's task is approved).</li>
            <li>• <strong className="text-ink-50">Gift Card Denominations</strong> — changes take effect immediately. Existing withdrawals are not affected.</li>
            <li>• Changes take effect immediately for all new operations.</li>
          </ul>
        </Card>
      </div>
    </AdminPageWrapper>
  );
}

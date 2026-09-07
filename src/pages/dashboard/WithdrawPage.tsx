import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine, Wallet, CheckCircle2, AlertCircle, Clock,
  Info, Smartphone, Building2, Gift, Mail, Check,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Withdrawal, WithdrawalMethod, Settings, GiftCardDenomination } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PaymentMethodOption {
  value: WithdrawalMethod;
  label: string;
  description: string;
  icon: typeof Smartphone;
  isGiftCard: boolean;
}

const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'upi', label: 'UPI', description: 'Instant transfer to any UPI ID', icon: Smartphone, isGiftCard: false },
  { value: 'bank_transfer', label: 'Bank Transfer', description: 'Direct deposit to your bank account', icon: Building2, isGiftCard: false },
  { value: 'amazon_gift_card', label: 'Amazon Gift Card', description: 'Redeem for Amazon India gift card', icon: Gift, isGiftCard: true },
  { value: 'flipkart_gift_card', label: 'Flipkart Gift Card', description: 'Redeem for Flipkart gift card', icon: Gift, isGiftCard: true },
  { value: 'google_play_gift_card', label: 'Google Play Gift Card', description: 'Redeem for Google Play gift card', icon: Gift, isGiftCard: true },
];

const GIFT_CARD_PROVIDERS: WithdrawalMethod[] = ['amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card'];

function isGiftCardMethod(m: WithdrawalMethod): boolean {
  return GIFT_CARD_PROVIDERS.includes(m);
}

function methodLabel(m: WithdrawalMethod): string {
  const found = PAYMENT_METHODS.find((p) => p.value === m);
  return found ? found.label : m.replace('_', ' ');
}

export function WithdrawPage() {
  const { user, profile } = useAuth();
  const [balance, setBalance] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [denominations, setDenominations] = useState<GiftCardDenomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<WithdrawalMethod>('upi');
  const [amount, setAmount] = useState('');
  const [selectedDenominationId, setSelectedDenominationId] = useState<string | null>(null);
  const [upiId, setUpiId] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [giftCardEmail, setGiftCardEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    const { data: bal } = await supabase.rpc('get_user_balance');
    setBalance(Number(bal) || 0);
    const { data: s } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    setSettings(s as Settings | null);
    const { data: wds } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setWithdrawals((wds as Withdrawal[]) || []);
    const { data: denoms } = await supabase
      .from('gift_card_denominations')
      .select('*')
      .eq('is_active', true)
      .order('value', { ascending: true });
    setDenominations((denoms as GiftCardDenomination[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const minWithdrawal = Number(settings?.min_withdrawal ?? 5);
  const hasPending = withdrawals.some((w) => w.status === 'pending' || w.status === 'processing');
  const isSuspended = profile?.is_suspended;
  const isGiftCard = isGiftCardMethod(method);

  const availableDenominations = useMemo(
    () => denominations.filter((d) => d.provider === method && d.is_active),
    [denominations, method],
  );

  // When method changes, reset method-specific state
  const handleMethodChange = (m: WithdrawalMethod) => {
    setMethod(m);
    setSelectedDenominationId(null);
    setAmount('');
    setError('');
  };

  const handleDenominationSelect = (d: GiftCardDenomination) => {
    if (d.value > balance) {
      setError(`Insufficient balance for ${formatMoney(d.value)}. Available: ${formatMoney(balance)}.`);
      return;
    }
    setSelectedDenominationId(d.id);
    setAmount(String(d.value));
    setError('');
  };

  const buildPayoutDetails = (): string => {
    if (method === 'upi') {
      return `UPI ID: ${upiId.trim()}`;
    }
    if (method === 'bank_transfer') {
      return `Account Holder: ${accountHolder.trim()}\nAccount Number: ${accountNumber.trim()}\nIFSC Code: ${ifscCode.trim()}\nBank Name: ${bankName.trim()}`;
    }
    // Gift cards
    return `Email: ${giftCardEmail.trim()}`;
  };

  const validateForm = (): { valid: boolean; amt: number; details: string } => {
    setError('');
    let amt = 0;
    let details = '';

    if (isGiftCard) {
      if (!selectedDenominationId) {
        setError('Please select a gift card denomination.');
        return { valid: false, amt: 0, details: '' };
      }
      const denom = availableDenominations.find((d) => d.id === selectedDenominationId);
      if (!denom) {
        setError('Invalid denomination selected.');
        return { valid: false, amt: 0, details: '' };
      }
      if (denom.value > balance) {
        setError(`Insufficient balance. Available: ${formatMoney(balance)}.`);
        return { valid: false, amt: 0, details: '' };
      }
      if (!giftCardEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(giftCardEmail.trim())) {
        setError('Please enter a valid email address for gift card delivery.');
        return { valid: false, amt: 0, details: '' };
      }
      amt = denom.value;
      details = `Email: ${giftCardEmail.trim()}`;
    } else {
      amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) {
        setError('Enter a valid amount.');
        return { valid: false, amt: 0, details: '' };
      }
      if (amt < minWithdrawal) {
        setError(`Minimum withdrawal is ${formatMoney(minWithdrawal)}.`);
        return { valid: false, amt: 0, details: '' };
      }
      if (amt > balance) {
        setError(`Insufficient balance. Available: ${formatMoney(balance)}.`);
        return { valid: false, amt: 0, details: '' };
      }

      if (method === 'upi') {
        if (!upiId.trim() || upiId.trim().length < 5 || !upiId.includes('@')) {
          setError('Please enter a valid UPI ID (e.g. name@upi).');
          return { valid: false, amt: 0, details: '' };
        }
        details = `UPI ID: ${upiId.trim()}`;
      } else if (method === 'bank_transfer') {
        if (!accountHolder.trim()) {
          setError('Account holder name is required.');
          return { valid: false, amt: 0, details: '' };
        }
        if (!accountNumber.trim() || accountNumber.trim().length < 5) {
          setError('Please enter a valid account number.');
          return { valid: false, amt: 0, details: '' };
        }
        if (!ifscCode.trim() || ifscCode.trim().length < 5) {
          setError('Please enter a valid IFSC code.');
          return { valid: false, amt: 0, details: '' };
        }
        if (!bankName.trim()) {
          setError('Bank name is required.');
          return { valid: false, amt: 0, details: '' };
        }
        details = `Account Holder: ${accountHolder.trim()}\nAccount Number: ${accountNumber.trim()}\nIFSC Code: ${ifscCode.trim()}\nBank Name: ${bankName.trim()}`;
      }
    }

    if (isSuspended) {
      setError('Your account is suspended. Contact support.');
      return { valid: false, amt: 0, details: '' };
    }

    return { valid: true, amt, details };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess('');
    const { valid, amt, details } = validateForm();
    if (!valid) return;

    setSubmitting(true);
    const { error: rpcErr } = await supabase.rpc('request_withdrawal', {
      p_amount: amt,
      p_method: method,
      p_payout_details: details,
      p_denomination_id: isGiftCard ? selectedDenominationId : null,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess(
      isGiftCard
        ? `${methodLabel(method)} request for ${formatMoney(amt)} submitted! We will send the gift card to your email.`
        : `Withdrawal request for ${formatMoney(amt)} submitted! Our team will review it shortly.`,
    );
    // Reset form
    setAmount('');
    setUpiId('');
    setAccountHolder('');
    setAccountNumber('');
    setIfscCode('');
    setBankName('');
    setGiftCardEmail('');
    setSelectedDenominationId(null);
    await loadData();
  };

  const canSubmit = !hasPending && !isSuspended && (isGiftCard ? !!selectedDenominationId : !!amount);

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Withdraw</h1>
        <p className="mt-1 text-sm text-ink-400">Request a payout via UPI, Bank Transfer, or redeem a gift card.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Withdrawal form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">New Withdrawal</h2>
              <div className="text-right">
                <p className="text-xs text-ink-400">Available Balance</p>
                <p className="text-lg font-bold text-accent-400">{formatMoney(balance)}</p>
              </div>
            </div>

            {hasPending && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-warning-500/10 p-3 text-sm text-warning-400">
                <Clock className="h-4 w-4 shrink-0" />
                You have a pending or processing withdrawal. Please wait for it to complete before requesting another.
              </div>
            )}

            {success && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            {/* Payment Method Selection */}
            <div className="mt-5">
              <label className="label">Select Payment Method</label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PAYMENT_METHODS.map((opt) => {
              const Icon = opt.icon;
              const selected = method === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleMethodChange(opt.value)}
                  disabled={hasPending}
                  className={`group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                    selected
                      ? 'border-brand-500 bg-brand-600/10 ring-1 ring-brand-500/30'
                      : 'border-ink-200 bg-ink-800/30 hover:border-ink-300 hover:bg-ink-800/60'
                  } ${hasPending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  {selected && (
                    <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <div className={`grid h-10 w-10 place-items-center rounded-lg ${
                    selected ? 'bg-brand-600/20 text-brand-400' : 'bg-ink-800 text-ink-400 group-hover:text-ink-200'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${selected ? 'text-white' : 'text-ink-50'}`}>{opt.label}</p>
                    <p className="text-xs text-ink-400">{opt.description}</p>
                  </div>
                </button>
              );
            })}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {/* UPI Fields */}
              {method === 'upi' && (
                <Input
                  label="UPI ID"
                  type="text"
                  name="upi_id"
                  placeholder="name@upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  disabled={hasPending}
                  hint="Enter your UPI ID (e.g. yourname@paytm)"
                />
              )}

              {/* Bank Transfer Fields */}
              {method === 'bank_transfer' && (
                <div className="space-y-4 rounded-xl border border-ink-200 p-4">
                  <Input
                    label="Account Holder Name"
                    type="text"
                    name="account_holder"
                    placeholder="Full name as per bank records"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    disabled={hasPending}
                  />
                  <Input
                    label="Account Number"
                    type="text"
                    name="account_number"
                    placeholder="Bank account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    disabled={hasPending}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="IFSC Code"
                      type="text"
                      name="ifsc_code"
                      placeholder="e.g. HDFC0001234"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                      disabled={hasPending}
                    />
                    <Input
                      label="Bank Name"
                      type="text"
                      name="bank_name"
                      placeholder="e.g. HDFC Bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      disabled={hasPending}
                    />
                  </div>
                </div>
              )}

              {/* Gift Card Email Field */}
              {isGiftCard && (
                <Input
                  label="Email Address"
                  type="email"
                  name="gift_card_email"
                  placeholder="your@email.com"
                  value={giftCardEmail}
                  onChange={(e) => setGiftCardEmail(e.target.value)}
                  disabled={hasPending}
                  hint={`The ${methodLabel(method)} will be sent to this email address.`}
                />
              )}

              {/* Gift Card Denominations */}
              {isGiftCard && (
                <div>
                  <label className="label">Gift Card Value</label>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {availableDenominations.length === 0 ? (
                      <p className="col-span-full text-sm text-ink-400">No denominations currently available for {methodLabel(method)}.</p>
                    ) : (
                      availableDenominations.map((d) => {
                        const selected = selectedDenominationId === d.id;
                        const insufficient = d.value > balance;
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => handleDenominationSelect(d)}
                            disabled={hasPending || insufficient}
                            className={`relative rounded-xl border p-4 text-center transition-all ${
                              selected
                                ? 'border-brand-500 bg-brand-600/10 ring-1 ring-brand-500/30'
                                : insufficient
                                  ? 'cursor-not-allowed border-ink-200 bg-ink-800/20 opacity-40'
                                  : 'cursor-pointer border-ink-200 bg-ink-800/30 hover:border-ink-300 hover:bg-ink-800/60'
                            }`}
                          >
                            {selected && (
                              <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-white">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                            <p className={`text-lg font-bold ${selected ? 'text-brand-400' : 'text-white'}`}>
                              {formatMoney(d.value)}
                            </p>
                            {insufficient && (
                              <p className="mt-0.5 text-xs text-danger-400">Insufficient balance</p>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Manual Amount for UPI / Bank Transfer */}
              {!isGiftCard && (
                <Input
                  label="Withdrawal Amount (INR)"
                  type="number"
                  step="0.01"
                  name="amount"
                  placeholder={`Min: ${formatMoney(minWithdrawal)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={hasPending || balance < minWithdrawal}
                  hint={`Minimum withdrawal: ${formatMoney(minWithdrawal)} • Available: ${formatMoney(balance)}`}
                />
              )}

              {/* Withdrawal Summary */}
              <div className="rounded-xl border border-ink-200 bg-ink-800/30 p-4">
                <p className="mb-3 text-sm font-semibold text-ink-50">Withdrawal Summary</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-400">Available Balance</span>
                    <span className="font-medium text-white">{formatMoney(balance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-400">Payment Method</span>
                    <span className="font-medium text-white">{methodLabel(method)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-400">{isGiftCard ? 'Gift Card Value' : 'Withdrawal Amount'}</span>
                    <span className="font-medium text-white">
                      {isGiftCard
                        ? (selectedDenominationId ? formatMoney(Number(amount)) : '—')
                        : (amount ? formatMoney(parseFloat(amount) || 0) : '—')}
                    </span>
                  </div>
                  <div className="border-t border-ink-200 pt-2 flex justify-between">
                    <span className="font-semibold text-ink-50">Final Amount</span>
                    <span className="font-bold text-accent-400">
                      {isGiftCard
                        ? (selectedDenominationId ? formatMoney(Number(amount)) : '—')
                        : (amount ? formatMoney(parseFloat(amount) || 0) : '—')}
                    </span>
                  </div>
                </div>
              </div>

              {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

              <Button type="submit" disabled={submitting || !canSubmit || balance < (isGiftCard ? 1 : minWithdrawal)} fullWidth>
                {submitting ? <Spinner size="sm" /> : <>
                  {isGiftCard ? <><Gift className="h-4 w-4" /> Redeem Gift Card</> : <><ArrowDownToLine className="h-4 w-4" /> Request Withdrawal</>}
                </>}
              </Button>

              {!isGiftCard && balance < minWithdrawal && (
                <p className="text-center text-xs text-ink-400">
                  Balance below minimum. <Link to="/dashboard/tasks" className="text-brand-400">Complete tasks</Link> to earn more.
                </p>
              )}
            </form>
          </Card>

          {/* Withdrawal history */}
          <Card className="p-5">
            <h2 className="font-bold text-white">Withdrawal History</h2>
            {withdrawals.length === 0 ? (
              <EmptyState icon={<Wallet className="h-10 w-10" />} title="No withdrawals yet" description="Your withdrawal requests will appear here." />
            ) : (
              <div className="mt-4 space-y-2">
                {withdrawals.map((wd) => {
              const Icon = isGiftCardMethod(wd.method) ? Gift : wd.method === 'upi' ? Smartphone : Building2;
              return (
                <div key={wd.id} className="flex items-center justify-between rounded-xl border border-ink-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800">
                      <Icon className="h-5 w-5 text-ink-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{formatMoney(wd.amount)}</p>
                      <p className="text-xs capitalize text-ink-400">
                        {methodLabel(wd.method)} • {new Date(wd.created_at).toLocaleDateString()}
                      </p>
                      {wd.rejection_reason && <p className="mt-0.5 text-xs text-danger-400">Rejected: {wd.rejection_reason}</p>}
                    </div>
                  </div>
                  <StatusBadge status={wd.status} />
                </div>
              );
            })}
              </div>
            )}
          </Card>
        </div>

        {/* Info sidebar */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-brand-400" />
              <h3 className="font-bold text-white">How withdrawals work</h3>
            </div>
            <ol className="mt-3 space-y-2 text-xs text-ink-400">
              <li className="flex gap-2"><span className="font-bold text-brand-400">1.</span> Choose a payment method and enter details.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-400">2.</span> For gift cards, select a denomination.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-400">3.</span> Funds are reserved in your wallet immediately.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-400">4.</span> Admin reviews the request.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-400">5.</span> Approved: payout sent. Rejected: funds released back.</li>
            </ol>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-warning-400 mt-0.5" />
              <p className="text-xs text-ink-400">
                Gift cards are processed manually and sent to your email. Ensure your email is correct before submitting.
              </p>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-brand-400" />
              <h3 className="font-bold text-white">Gift Card Delivery</h3>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Amazon, Flipkart, and Google Play gift cards are delivered to the email address you provide. Processing typically takes 1-2 business days after approval.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

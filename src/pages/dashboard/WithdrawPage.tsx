import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import upiLogoUrl from '@/assets/upi-logo.svg';
import {
  ArrowDownToLine, CheckCircle2, AlertCircle, Clock,
  Info, Gift, Mail, Check, Landmark, ChevronDown,
} from 'lucide-react';
import { AmazonLogo, FlipkartLogo, GooglePlayLogo } from '@/components/PaymentMethodIcons';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Withdrawal, WithdrawalMethod, Settings, GiftCardDenomination } from '@/types';
import { formatCoins, formatInr, CONVERSION_HINT } from '@/lib/format';

const EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in',
  'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.in', 'live.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me',
  'zoho.com', 'mail.com', 'gmx.com', 'yandex.com', 'rediffmail.com',
  'sify.com', 'inbox.com', 'msn.com', 'comcast.net', 'verizon.net',
  'facebook.com', 'apple.com',
]);

function isValidUpiId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes(' ')) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [before, after] = parts;
  if (!before || before.length < 2) return false;
  if (!/^[a-zA-Z0-9.\-_]+$/.test(before)) return false;
  if (!after || after.length < 2) return false;
  if (!/^[a-zA-Z]/.test(after)) return false;
  if (!/^[a-zA-Z0-9.\-_]+$/.test(after)) return false;
  if (/^\d+$/.test(after)) return false;
  if (EMAIL_DOMAINS.has(after.toLowerCase())) return false;
  if (after.includes('.') && EMAIL_DOMAINS.has(after.toLowerCase())) return false;
  return true;
}

interface PaymentMethodOption {
  value: WithdrawalMethod;
  label: string;
  description: string;
  isGiftCard: boolean;
}

const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'upi', label: 'UPI', description: 'Instant transfer to any UPI ID', isGiftCard: false },
  { value: 'bank_transfer', label: 'Bank Transfer', description: 'Direct deposit to your bank account', isGiftCard: false },
  { value: 'amazon_gift_card', label: 'Amazon Gift Card', description: 'Redeem for Amazon India gift card', isGiftCard: true },
  { value: 'flipkart_gift_card', label: 'Flipkart Gift Card', description: 'Redeem for Flipkart gift card', isGiftCard: true },
  { value: 'google_play_gift_card', label: 'Google Play Gift Card', description: 'Redeem for Google Play gift card', isGiftCard: true },
];

const GIFT_CARD_PROVIDERS: WithdrawalMethod[] = ['amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card'];

function isGiftCardMethod(m: WithdrawalMethod): boolean {
  return GIFT_CARD_PROVIDERS.includes(m);
}

function methodLabel(m: WithdrawalMethod): string {
  const found = PAYMENT_METHODS.find((p) => p.value === m);
  return found ? found.label : m.replace('_', ' ');
}

const inputClass = 'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-success-500 focus:outline-none focus:ring-2 focus:ring-success-500/20 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700';

const QUICK_AMOUNTS = [50, 100, 200];

function CollapsibleCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-5 text-left"
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className="font-bold text-gray-900">{title}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-gray-100 px-5 pb-5 pt-3">{children}</div>}
    </div>
  );
}

function MethodIcon({ method }: { method: WithdrawalMethod }) {
  if (method === 'upi') {
    return <span className="grid h-10 w-10 place-items-center rounded-xl bg-white ring-1 ring-gray-100"><img src={upiLogoUrl} alt="UPI" className="h-5 w-auto px-1" /></span>;
  }
  if (method === 'bank_transfer') {
    return (
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-success-50 text-success-600 ring-1 ring-success-100">
        <Landmark className="h-5 w-5" />
      </span>
    );
  }
  if (method === 'amazon_gift_card') return <span className="grid h-10 w-10 place-items-center"><AmazonLogo className="h-10 w-10" /></span>;
  if (method === 'flipkart_gift_card') return <span className="grid h-10 w-10 place-items-center"><FlipkartLogo className="h-10 w-10" /></span>;
  return <span className="grid h-10 w-10 place-items-center"><GooglePlayLogo className="h-10 w-10" /></span>;
}

function WithdrawStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: 'Pending',
    processing: 'Processing',
    approved: 'Approved',
    paid: 'Completed',
    completed: 'Completed',
    rejected: 'Rejected',
    reversed: 'Reversed',
  };
  const tones: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    processing: 'bg-blue-50 text-blue-700 ring-blue-200',
    approved: 'bg-blue-50 text-blue-700 ring-blue-200',
    paid: 'bg-green-50 text-green-700 ring-green-200',
    completed: 'bg-green-50 text-green-700 ring-green-200',
    rejected: 'bg-red-50 text-red-700 ring-red-200',
    reversed: 'bg-red-50 text-red-700 ring-red-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tones[status] ?? 'bg-gray-50 text-gray-600 ring-gray-200'}`}>
      {labels[status] ?? status}
    </span>
  );
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
  const [upiError, setUpiError] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [giftCardEmail, setGiftCardEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const minWithdrawal = Number(settings?.min_withdrawal ?? 5);
  const hasPending = withdrawals.some((w) => w.status === 'pending' || w.status === 'processing');
  const isSuspended = profile?.is_suspended;
  const isGiftCard = isGiftCardMethod(method);

  const availableDenominations = useMemo(
    () => denominations.filter((d) => d.provider === method && d.is_active),
    [denominations, method],
  );

  const handleMethodChange = (m: WithdrawalMethod) => {
    setMethod(m);
    setSelectedDenominationId(null);
    setAmount('');
    setError('');
    setUpiError('');
  };

  const handleUpiChange = (value: string) => {
    const trimmed = value.trim();
    setUpiId(trimmed);
    if (trimmed && !isValidUpiId(trimmed)) {
      setUpiError('Enter a valid UPI ID, e.g. name@upi');
    } else {
      setUpiError('');
    }
  };

  const handleDenominationSelect = (d: GiftCardDenomination) => {
    if (d.value > balance) {
      setError(`Insufficient balance for ${formatCoins(d.value)}. Available: ${formatCoins(balance)}.`);
      return;
    }
    setSelectedDenominationId(d.id);
    setAmount(String(d.value));
    setError('');
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
        setError(`Insufficient balance. Available: ${formatCoins(balance)}.`);
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
        setError(`Minimum withdrawal is ${formatCoins(minWithdrawal)}.`);
        return { valid: false, amt: 0, details: '' };
      }
      if (amt > balance) {
        setError(`Insufficient balance. Available: ${formatCoins(balance)}.`);
        return { valid: false, amt: 0, details: '' };
      }

      if (method === 'upi') {
        const trimmed = upiId.trim();
        if (!trimmed) {
          setError('UPI ID is required.');
          return { valid: false, amt: 0, details: '' };
        }
        if (!isValidUpiId(trimmed)) {
          setError('Enter a valid UPI ID, e.g. name@upi');
          return { valid: false, amt: 0, details: '' };
        }
        details = `UPI ID: ${trimmed}`;
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
        ? `${methodLabel(method)} request for ${formatCoins(amt)} submitted! We will send the gift card to your email.`
        : `Withdrawal request for ${formatCoins(amt)} submitted! Our team will review it shortly.`,
    );
    setAmount('');
    setUpiId('');
    setUpiError('');
    setAccountHolder('');
    setAccountNumber('');
    setIfscCode('');
    setBankName('');
    setGiftCardEmail('');
    setSelectedDenominationId(null);
    await loadData();
  };

  const upiValid = method === 'upi' ? isValidUpiId(upiId) : true;
  const canSubmit = !hasPending && !isSuspended && upiValid && (isGiftCard ? !!selectedDenominationId : !!amount);

  if (loading) return <Spinner size="lg" className="py-20" />;

  const summaryAmount = isGiftCard
    ? (selectedDenominationId ? Number(amount) : null)
    : (amount ? parseFloat(amount) || 0 : null);

  return (
    <div className="animate-fade-in">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-gray-50 via-white to-gray-50 shadow-sm ring-1 ring-gray-200/70">
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Withdraw</h1>
            <p className="mt-1 text-sm text-gray-500">
              Request a payout via UPI, Bank Transfer, or redeem a gift card. <span className="font-medium text-gray-700">{CONVERSION_HINT}</span>
            </p>
          </div>

          {isSuspended && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Your account is suspended. Withdrawals are unavailable — contact support if you believe this is an error.
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main column */}
            <div className="space-y-6 lg:col-span-2">
              {/* Balance card */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-success-700 via-success-600 to-success-500 p-5 text-white shadow-md sm:p-6">
                <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                <div className="relative">
                  <p className="text-sm font-medium text-white/80">Available Balance</p>
                  <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{formatCoins(balance)}</p>
                  <p className="mt-1.5 text-sm font-medium text-white/85">{formatInr(balance)}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25">
                      Min withdrawal: {formatCoins(minWithdrawal)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25">
                      Max per request: {formatCoins(balance)}
                    </span>
                    {hasPending && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/25 px-3 py-1 text-xs font-medium ring-1 ring-amber-200/50">
                        <Clock className="h-3 w-3" /> A request is awaiting review
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* New withdrawal */}
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200/70 sm:p-6">
                <h2 className="font-bold text-gray-900">New Withdrawal</h2>

                {hasPending && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <Clock className="h-4 w-4 shrink-0" />
                    You have a pending or processing withdrawal. Please wait for it to complete before requesting another.
                  </div>
                )}

                {success && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {success}
                  </div>
                )}

                {/* Payment method selection */}
                <div className="mt-5">
                  <label className={labelClass}>Select Payment Method</label>
                  <div className="mt-2 grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 lg:grid-cols-5">
                    {PAYMENT_METHODS.map((opt) => {
                      const selected = method === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleMethodChange(opt.value)}
                          disabled={hasPending}
                          className={`relative flex h-full min-w-0 flex-col items-start gap-2 rounded-xl border-2 p-3 text-left transition-all duration-200 ${
                            selected
                              ? 'border-success-500 bg-success-50/70'
                              : 'border-gray-200 bg-white hover:border-success-300 hover:bg-success-50/30'
                          } ${hasPending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        >
                          {selected && (
                            <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-success-600 text-white ring-2 ring-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                          <MethodIcon method={opt.value} />
                          <div className="mt-auto min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{opt.label}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-gray-500">{opt.description}</p>
                          </div>
                          {opt.isGiftCard && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success-700 ring-1 ring-success-200">
                              <Gift className="h-2.5 w-2.5" /> Gift Card
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  {/* UPI fields */}
                  {method === 'upi' && (
                    <div>
                      <label htmlFor="upi_id" className={labelClass}>UPI ID</label>
                      <input
                        id="upi_id"
                        name="upi_id"
                        type="text"
                        placeholder="name@upi"
                        value={upiId}
                        onChange={(e) => handleUpiChange(e.target.value)}
                        disabled={hasPending}
                        className={`${inputClass} ${upiError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                      />
                      {upiError ? (
                        <p className="mt-1 text-xs text-red-600">{upiError}</p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-500">Enter your UPI ID (e.g. yourname@oksbi)</p>
                      )}
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
                        <p className="text-xs text-gray-500">Accepted: any valid UPI ID (e.g. name@upi, 9876543210@ybl)</p>
                      </div>
                    </div>
                  )}

                  {/* Bank transfer fields */}
                  {method === 'bank_transfer' && (
                    <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                      <div>
                        <label htmlFor="account_holder" className={labelClass}>Account Holder Name</label>
                        <input id="account_holder" name="account_holder" type="text" placeholder="Full name as per bank records" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} disabled={hasPending} className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor="account_number" className={labelClass}>Account Number</label>
                        <input id="account_number" name="account_number" type="text" placeholder="Bank account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={hasPending} className={inputClass} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor="ifsc_code" className={labelClass}>IFSC Code</label>
                          <input id="ifsc_code" name="ifsc_code" type="text" placeholder="e.g. HDFC0001234" value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} disabled={hasPending} className={inputClass} />
                        </div>
                        <div>
                          <label htmlFor="bank_name" className={labelClass}>Bank Name</label>
                          <input id="bank_name" name="bank_name" type="text" placeholder="e.g. HDFC Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={hasPending} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Gift card email */}
                  {isGiftCard && (
                    <div>
                      <label htmlFor="gift_card_email" className={labelClass}>Email Address</label>
                      <input id="gift_card_email" name="gift_card_email" type="email" placeholder="your@email.com" value={giftCardEmail} onChange={(e) => setGiftCardEmail(e.target.value)} disabled={hasPending} className={inputClass} />
                      <p className="mt-1 text-xs text-gray-500">The {methodLabel(method)} will be sent to this email address.</p>
                    </div>
                  )}

                  {/* Gift card denominations */}
                  {isGiftCard && (
                    <div>
                      <label className={labelClass}>Gift Card Value</label>
                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {availableDenominations.length === 0 ? (
                          <p className="col-span-full text-sm text-gray-500">No denominations currently available for {methodLabel(method)}.</p>
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
                                    ? 'border-success-500 bg-success-50 ring-1 ring-success-500'
                                    : insufficient
                                      ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-50'
                                      : 'cursor-pointer border-gray-200 bg-white hover:border-success-400 hover:bg-success-50/40'
                                }`}
                              >
                                {selected && (
                                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-success-600 text-white">
                                    <Check className="h-3 w-3" />
                                  </span>
                                )}
                                <p className="text-lg font-bold text-gray-900">{formatCoins(d.value)}</p>
                                {insufficient && <p className="mt-0.5 text-xs text-red-600">Insufficient balance</p>}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Manual amount for UPI / Bank transfer */}
                  {!isGiftCard && (
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="amount" className={labelClass}>Withdrawal Amount (Coins)</label>
                        <div className="flex gap-2">
                          {QUICK_AMOUNTS.map((q) => {
                            const eligible = balance >= q && q >= minWithdrawal;
                            return (
                              <button
                                key={q}
                                type="button"
                                disabled={hasPending || !eligible}
                                onClick={() => { setAmount(String(q)); setError(''); }}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                  Number(amount) === q
                                    ? 'border-success-500 bg-success-50 text-success-700'
                                    : eligible
                                      ? 'border-gray-200 text-gray-600 hover:border-success-400 hover:bg-success-50/50 hover:text-success-700'
                                      : 'cursor-not-allowed border-gray-100 text-gray-300'
                                }`}
                              >
                                {q}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            disabled={hasPending || balance < minWithdrawal}
                            onClick={() => { setAmount(String(balance)); setError(''); }}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              Number(amount) === balance && amount !== ''
                                ? 'border-success-500 bg-success-50 text-success-700'
                                : balance >= minWithdrawal
                                  ? 'border-gray-200 text-gray-600 hover:border-success-400 hover:bg-success-50/50 hover:text-success-700'
                                  : 'cursor-not-allowed border-gray-100 text-gray-300'
                            }`}
                          >
                            MAX
                          </button>
                        </div>
                      </div>
                      <input
                        id="amount"
                        name="amount"
                        type="number"
                        step="0.01"
                        placeholder={`Min: ${formatCoins(minWithdrawal)}`}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={hasPending || balance < minWithdrawal}
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Minimum withdrawal: {formatCoins(minWithdrawal)} • Maximum: {formatCoins(balance)} (your available balance)
                      </p>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Withdrawal Summary</p>
                    <div className="mt-3 space-y-2.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Available Balance</span>
                        <span className="font-medium text-gray-700">{formatCoins(balance)} <span className="text-gray-400">· {formatInr(balance)}</span></span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Payment Method</span>
                        <span className="font-medium text-gray-900">{methodLabel(method)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{isGiftCard ? 'Gift Card Value' : 'Withdrawal Amount'}</span>
                        <span className="font-medium text-gray-900">
                          {summaryAmount !== null ? `${formatCoins(summaryAmount)} · ${formatInr(summaryAmount)}` : '—'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between rounded-lg bg-success-50 px-3 py-2.5 ring-1 ring-success-100">
                        <span className="text-sm font-semibold text-gray-900">Final Amount</span>
                        <span className="text-base font-bold text-success-700">
                          {summaryAmount !== null ? `${formatCoins(summaryAmount)} · ${formatInr(summaryAmount)}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !canSubmit || balance < (isGiftCard ? 1 : minWithdrawal)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-success-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-success-500 active:bg-success-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? <Spinner size="sm" /> : <>
                      {isGiftCard ? <><Gift className="h-4 w-4" /> Redeem Gift Card</> : <><ArrowDownToLine className="h-4 w-4" /> Request Withdrawal</>}
                    </>}
                  </button>

                  {!isGiftCard && balance < minWithdrawal && (
                    <p className="text-center text-xs text-gray-500">
                      Balance below minimum. <Link to="/dashboard/tasks" className="font-medium text-success-600 hover:text-success-500">Complete tasks</Link> to earn more.
                    </p>
                  )}
                </form>
              </div>

              {/* Withdrawal history */}
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200/70 sm:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Withdrawal History</h2>
                  {withdrawals.length > 0 && (
                    <span className="text-xs text-gray-400">{withdrawals.length} request{withdrawals.length === 1 ? '' : 's'}</span>
                  )}
                </div>
                {withdrawals.length === 0 ? (
                  <EmptyState icon={<Landmark className="h-10 w-10 text-gray-300" />} title="No withdrawals yet" description="Your withdrawal requests will appear here." />
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {withdrawals.map((wd) => (
                      <div key={wd.id} className="rounded-xl border border-gray-200 bg-white p-4 transition hover:border-success-200 hover:shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">-{formatCoins(wd.amount)}</p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">{methodLabel(wd.method)}</p>
                          </div>
                          <WithdrawStatusBadge status={wd.status} />
                        </div>
                        <p className="mt-2 text-xs text-gray-400">{new Date(wd.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                        {wd.rejection_reason && <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">Rejected: {wd.rejection_reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Info sidebar */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200/70">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-success-600" />
                  <h3 className="font-bold text-gray-900">How withdrawals work</h3>
                </div>
                <ol className="relative mt-4 space-y-5 border-l-2 border-success-100 pl-6">
                  {[
                    'Choose a payment method and enter details.',
                    'For gift cards, select a denomination.',
                    'Funds are reserved in your wallet immediately.',
                    'Admin reviews the request.',
                    'Approved: payout sent. Rejected: funds released back.',
                  ].map((step, i) => (
                    <li key={i} className="relative text-xs leading-5 text-gray-500">
                      <span className="absolute -left-[31px] grid h-5 w-5 place-items-center rounded-full bg-success-50 text-[10px] font-bold text-success-700 ring-2 ring-white">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200/70">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-xs leading-5 text-gray-500">
                    Gift cards are processed manually and sent to your email. Ensure your email is correct before submitting.
                  </p>
                </div>
              </div>
              <CollapsibleCard
                title="Withdrawal Policy"
                icon={<Info className="h-5 w-5 text-success-600" />}
              >
                <p className="text-xs leading-5 text-gray-500">
                  Before requesting a withdrawal, please review our{' '}
                  <Link to="/withdrawal-policy" className="font-medium text-success-600 hover:text-success-500">
                    Withdrawal Policy
                  </Link>{' '}
                  for details on eligibility, processing, and important information about payout details.
                </p>
              </CollapsibleCard>
              <CollapsibleCard
                title="Gift Card Delivery"
                icon={<Mail className="h-5 w-5 text-success-600" />}
              >
                <p className="text-xs leading-5 text-gray-500">
                  Amazon, Flipkart, and Google Play gift cards are delivered to the email address you provide. Processing typically takes 1-2 business days after approval.
                </p>
              </CollapsibleCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

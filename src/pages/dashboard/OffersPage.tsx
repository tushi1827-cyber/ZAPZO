import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, ExternalLink, AlertTriangle, Loader2, Info, Gift } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface OfferwallTransaction {
  id: string;
  transaction_id: string;
  offer_name: string | null;
  points: number;
  status: string;
  is_test: boolean;
  created_at: string;
}

export function OffersPage() {
  const { user, profile } = useAuth();
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [recentOffers, setRecentOffers] = useState<OfferwallTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const publicKey = import.meta.env.VITE_OFFERWALL_PUBLIC_KEY;
  const offerwallUrl = publicKey && user
    ? `https://offerwall.gg/wall/${publicKey}?userId=${user.id}`
    : null;

  const fetchRecentOffers = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('offerwall_transactions')
        .select('id, transaction_id, offer_name, points, status, is_test, created_at')
        .eq('user_id', user.id)
        .eq('is_test', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setRecentOffers(data as OfferwallTransaction[]);
      }
    } catch {
      // Table may not be visible via REST yet due to PostgREST schema cache
    }
    setLoadingHistory(false);
  }, [user]);

  useEffect(() => {
    fetchRecentOffers();
  }, [fetchRecentOffers]);

  if (!publicKey) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Sparkles className="h-7 w-7 text-brand-400" />
            Earn with Offers
          </h1>
          <p className="mt-2 text-ink-400">
            Complete sponsored offers and surveys to earn ZAPZO rewards.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-warning-500/30 bg-warning-500/10 px-6 py-16 text-center">
          <AlertTriangle className="mb-4 h-10 w-10 text-warning-400" />
          <h2 className="text-lg font-semibold text-white">Offers Coming Soon</h2>
          <p className="mt-2 max-w-md text-sm text-ink-400">
            The offerwall is not configured yet. Please check back later.
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isSuspended = profile?.is_suspended;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Sparkles className="h-7 w-7 text-brand-400" />
          Earn with Offers
        </h1>
        <p className="mt-2 text-ink-400">
          Complete sponsored offers and surveys from our partners to earn ZAPZO rewards. Rewards are credited automatically to your wallet.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-brand-600/20 bg-brand-600/10 px-4 py-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
        <div className="text-sm text-ink-300">
          <p className="font-medium text-white">How it works</p>
          <p className="mt-1">
            Click an offer, complete the requirements, and your reward will be added to your wallet automatically once the offer provider confirms completion. Some offers may take a few minutes to process.
          </p>
        </div>
      </div>

      {isSuspended && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Your account is suspended. You may still browse offers, but rewards may not be credited until your account is reactivated.
        </div>
      )}

      {/* Offerwall iframe */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-brand-400" />
            <span className="font-semibold text-white">Sponsored Offers</span>
          </div>
          <a
            href={offerwallUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm font-medium text-brand-400 transition hover:text-brand-300"
          >
            Open in new tab <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="relative w-full" style={{ minHeight: '600px' }}>
          {iframeLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink-900">
              <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
              <p className="mt-3 text-sm text-ink-400">Loading offers...</p>
            </div>
          )}

          {iframeError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink-900 px-6 text-center">
              <AlertTriangle className="mb-4 h-10 w-10 text-warning-400" />
              <h3 className="text-lg font-semibold text-white">Failed to load offers</h3>
              <p className="mt-2 max-w-sm text-sm text-ink-400">
                The offerwall could not be loaded. This may be due to a temporary issue or ad-blocker. Try refreshing the page or opening the offers in a new tab.
              </p>
              <a
                href={offerwallUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                Open offers <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}

          {!iframeError && offerwallUrl && (
            <iframe
              ref={iframeRef}
              src={offerwallUrl}
              title="Offerwall"
              className="h-full w-full"
              style={{ minHeight: '600px', border: 'none' }}
              onLoad={() => setIframeLoading(false)}
              onError={() => {
                setIframeLoading(false);
                setIframeError(true);
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          )}
        </div>
      </div>

      {/* Recent offer rewards */}
      <div className="rounded-2xl border border-ink-200 bg-ink-900">
        <div className="border-b border-ink-200 px-4 py-3">
          <h2 className="font-semibold text-white">Recent Offer Rewards</h2>
        </div>
        <div className="p-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
            </div>
          ) : recentOffers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Sparkles className="mb-2 h-8 w-8 text-ink-400" />
              <p className="text-sm text-ink-400">No offer rewards yet. Complete an offer above to start earning!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-800/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {offer.offer_name || 'Offer Reward'}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {new Date(offer.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {offer.status === 'reversed' ? (
                      <span className="text-sm font-semibold text-danger-400">
                        -{Math.abs(offer.points).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-accent-400">
                        +{offer.points.toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        offer.status === 'reversed'
                          ? 'bg-danger-500/10 text-danger-400'
                          : 'bg-accent-400/10 text-accent-400'
                      }`}
                    >
                      {offer.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

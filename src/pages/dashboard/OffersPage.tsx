import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Info,
  Gift,
  RefreshCw,
  Trophy,
  Target,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface OfferwallTransaction {
  id: string;
  provider_transaction_id: string;
  offer_name: string | null;
  coins_credited: number;
  status: string;
  is_test: boolean;
  created_at: string;
}

interface Offer {
  id: number;
  name: string;
  description: string;
  requirements: string;
  reward: number;
  rewardFormatted: string;
  rewardIsVariable: boolean;
  image: string | null;
  category: string | null;
  type: string | null;
  clickUrl: string | null;
  multipleConversions: boolean;
  featured: boolean;
}

export function OffersPage() {
  const { user, profile } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [recentOffers, setRecentOffers] = useState<OfferwallTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const offerwallWallId =
    import.meta.env.VITE_OFFERWALL_PUBLIC_KEY ||
    '6c94838e7575176ab35b757f8a3896fe';
  const offerwallUrl = user
    ? `https://offerwall.gg/wall/${offerwallWallId}?userId=${user.id}`
    : null;

  const fetchOffers = useCallback(async () => {
    if (!user) return;
    setLoadingOffers(true);
    setOffersError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setOffersError('Authentication required.');
        setLoadingOffers(false);
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/offerwall-offers?page=1&limit=50&sort=payout`;
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.error(
          `[OffersPage] Edge function returned ${response.status}`,
          errBody.slice(0, 200)
        );
        if (response.status === 429) {
          setOffersError('Too many requests. Please wait a moment and try again.');
        } else if (response.status === 503) {
          setOffersError('Unable to load offers right now.');
        } else {
          setOffersError('Unable to load offers right now.');
        }
        setLoadingOffers(false);
        return;
      }

      const data = await response.json();
      const offersArray = Array.isArray(data?.offers)
        ? data.offers
        : Array.isArray(data?.data?.offers)
          ? data.data.offers
          : null;

      if (offersArray) {
        setOffers(offersArray);
      } else {
        console.error('[OffersPage] Unexpected response shape from edge function');
        setOffersError('Unable to load offers right now.');
      }
    } catch (err) {
      console.error(
        '[OffersPage] Network error fetching offers',
        err instanceof Error ? err.message : 'unknown'
      );
      setOffersError('Unable to load offers right now.');
    }
    setLoadingOffers(false);
  }, [user]);

  const fetchRecentOffers = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('offerwall_transactions')
        .select(
          'id, provider_transaction_id, offer_name, coins_credited, status, is_test, created_at'
        )
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
    fetchOffers();
    fetchRecentOffers();
  }, [fetchOffers, fetchRecentOffers]);

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
          Complete sponsored offers and surveys from our partners to earn ZAPZO
          rewards. Rewards are credited automatically to your wallet.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-brand-600/20 bg-brand-600/10 px-4 py-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
        <div className="text-sm text-ink-300">
          <p className="font-medium text-white">How it works</p>
          <p className="mt-1">
            Click an offer, complete the requirements, and your reward will be
            added to your wallet automatically once the offer provider confirms
            completion. Some offers may take a few minutes to process.
          </p>
        </div>
      </div>

      {isSuspended && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Your account is suspended. You may still browse offers, but rewards may
          not be credited until your account is reactivated.
        </div>
      )}

      {/* Sponsored Offers */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-brand-400" />
            <span className="font-semibold text-white">Sponsored Offers</span>
          </div>
          <div className="flex items-center gap-3">
            {offersError && !loadingOffers && (
              <button
                onClick={fetchOffers}
                className="flex items-center gap-1 text-sm font-medium text-brand-400 transition hover:text-brand-300"
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            )}
            <a
              href={offerwallUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm font-medium text-brand-400 transition hover:text-brand-300"
            >
              Open in new tab <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="p-4">
          {/* Loading state */}
          {loadingOffers && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-ink-200 bg-ink-800/50 p-4"
                >
                  <div className="mb-3 h-10 w-10 rounded-lg bg-ink-700" />
                  <div className="mb-2 h-4 w-3/4 rounded bg-ink-700" />
                  <div className="mb-4 h-3 w-full rounded bg-ink-700" />
                  <div className="h-3 w-1/2 rounded bg-ink-700" />
                  <div className="mt-4 h-8 w-full rounded-lg bg-ink-700" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loadingOffers && offersError && offers.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <AlertTriangle className="mb-4 h-10 w-10 text-warning-400" />
              <h3 className="text-lg font-semibold text-white">
                Unable to load offers
              </h3>
              <p className="mt-2 max-w-sm text-sm text-ink-400">{offersError}</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={fetchOffers}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
                >
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
                <a
                  href={offerwallUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-200 transition hover:border-brand-400 hover:text-brand-400"
                >
                  Open offers <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loadingOffers && !offersError && offers.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <Sparkles className="mb-3 h-10 w-10 text-ink-400" />
              <h3 className="text-lg font-semibold text-white">
                No offers available right now
              </h3>
              <p className="mt-2 max-w-sm text-sm text-ink-400">
                New offers appear regularly. Check back soon, or browse the full
                offerwall.
              </p>
              <a
                href={offerwallUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                Open full offerwall <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}

          {/* Offers grid */}
          {!loadingOffers && !offersError && offers.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="group flex flex-col rounded-xl border border-ink-200 bg-ink-800/50 p-4 transition hover:border-brand-500/40 hover:bg-ink-800"
                >
                  {/* Top: icon + reward */}
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-700">
                      {offer.image ? (
                        <img
                          src={offer.image}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display =
                              'none';
                          }}
                        />
                      ) : (
                        <Gift className="h-6 w-6 text-ink-400" />
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="flex items-center gap-1 text-sm font-bold text-accent-400">
                        <Trophy className="h-4 w-4" />
                        {offer.rewardIsVariable ? 'Varies' : offer.rewardFormatted}
                      </span>
                      {offer.multipleConversions && (
                        <span className="mt-0.5 rounded-full bg-accent-400/10 px-2 py-0.5 text-[10px] font-medium text-accent-400">
                          Repeatable
                        </span>
                      )}
                      {offer.featured && (
                        <span className="mt-0.5 rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] font-medium text-brand-400">
                          Featured
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Name + description */}
                  <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-white">
                    {offer.name}
                  </h3>
                  {offer.description && (
                    <p className="mb-2 line-clamp-2 text-xs text-ink-400">
                      {offer.description}
                    </p>
                  )}

                  {/* Requirements */}
                  {offer.requirements && (
                    <div className="mb-3 flex items-start gap-1.5 rounded-lg bg-ink-900/60 px-2.5 py-2">
                      <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                      <p className="line-clamp-2 text-xs text-ink-300">
                        {offer.requirements}
                      </p>
                    </div>
                  )}

                  {/* Category badge */}
                  {offer.category && (
                    <div className="mb-3">
                      <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-medium capitalize text-ink-300">
                        {offer.category}
                      </span>
                    </div>
                  )}

                  {/* Start offer button */}
                  <div className="mt-auto pt-2">
                    {offer.clickUrl ? (
                      <a
                        href={offer.clickUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 group-hover:bg-brand-500"
                      >
                        Start Offer <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink-700 px-4 py-2.5 text-sm font-medium text-ink-400">
                        <CheckCircle2 className="h-4 w-4" /> Unavailable
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
              <p className="text-sm text-ink-400">
                No offer rewards yet. Complete an offer above to start earning!
              </p>
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
                      {new Date(offer.created_at).toLocaleDateString('en-IN', {
                        dateStyle: 'medium',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {offer.status === 'reversed' ? (
                      <span className="text-sm font-semibold text-danger-400">
                        -{Math.abs(offer.coins_credited).toLocaleString('en-IN', {
                          maximumFractionDigits: 0,
                        })}{' '}
                        Coins
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-accent-400">
                        +{offer.coins_credited.toLocaleString('en-IN', {
                          maximumFractionDigits: 0,
                        })}{' '}
                        Coins
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

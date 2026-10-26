import { useState, useEffect, useCallback, useRef } from 'react';
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
  ListChecks,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const OFFERS_CACHE_TTL = 120_000;

interface OffersCache {
  userId: string;
  offers: NormalizedOffer[];
  timestamp: number;
}

let offersCache: OffersCache | null = null;

interface OfferwallTransaction {
  id: string;
  provider_transaction_id: string;
  offer_name: string | null;
  coins_credited: number;
  status: string;
  is_test: boolean;
  created_at: string;
}

interface RawGoal {
  id?: string | number;
  gl_val?: string | null;
  ttl?: string | null;
  instr?: string | null;
  pyt?: { cur?: string; amt?: number } | null;
  inapp_pyt?: { cur?: string; amt?: number } | null;
  ord?: number;
}

interface NormalizedGoal {
  id: string;
  title: string;
  instructions: string | null;
  rewardFormatted: string | null;
  order: number;
}

interface NormalizedOffer {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  category: string | null;
  type: string | null;
  clickUrl: string | null;
  rewardFormatted: string;
  rewardIsVariable: boolean;
  multipleConversions: boolean;
  featured: boolean;
  goals: NormalizedGoal[];
}

function isAbsoluteUrl(val: unknown): val is string {
  return typeof val === 'string' && /^https?:\/\/.+/i.test(val);
}

function getString(val: unknown, fallback = ''): string {
  if (typeof val === 'string' && val.trim()) return val.trim();
  if (typeof val === 'number') return String(val);
  return fallback;
}

function formatPayout(pyt: { cur?: string; amt?: number } | null | undefined): string {
  if (!pyt || typeof pyt.amt !== 'number') return '';
  const amt = pyt.amt.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `${amt} ${pyt.cur || ''}`.trim();
}

function normalizeOffer(raw: Record<string, unknown>): NormalizedOffer {
  const id = getString(raw.id) || getString(raw.offer_id) || Math.random().toString(36);
  const name = getString(raw.name) || getString(raw.offer_name) || 'Untitled Offer';

  const descRaw =
    typeof raw.desc === 'object' && raw.desc !== null
      ? (raw.desc as Record<string, unknown>)
      : null;
  const description =
    getString(raw.description) ||
    getString(descRaw?.raw) ||
    '';

  const crtvs =
    typeof raw.crtvs === 'object' && raw.crtvs !== null
      ? (raw.crtvs as Record<string, unknown>)
      : null;
  const image =
    (isAbsoluteUrl(raw.image) ? raw.image : null) ||
    (isAbsoluteUrl(crtvs?.ic_url) ? (crtvs!.ic_url as string) : null) ||
    null;

  const ctgRaw = Array.isArray(raw.ctg) ? raw.ctg : null;
  const category =
    getString(raw.category) ||
    (ctgRaw && ctgRaw.length > 0 ? getString(ctgRaw[0]) : '') ||
    '';

  const type =
    getString(raw.type) ||
    getString(raw.off_type) ||
    getString(raw.offer_type) ||
    '';

  const trkUrl = isAbsoluteUrl(raw.trk_url) ? raw.trk_url : null;
  const trkUrlBase = isAbsoluteUrl(raw.trk_url_base) ? raw.trk_url_base : null;
  const clickUrlFlat = isAbsoluteUrl(raw.clickUrl) ? raw.clickUrl : null;
  const lpUrl = isAbsoluteUrl(raw.lp_url) ? raw.lp_url : null;
  const clickUrl = clickUrlFlat || trkUrl || trkUrlBase || lpUrl || null;

  const pyt =
    typeof raw.pyt === 'object' && raw.pyt !== null
      ? (raw.pyt as { cur?: string; amt?: number })
      : null;
  const inappPyt =
    typeof raw.inapp_pyt === 'object' && raw.inapp_pyt !== null
      ? (raw.inapp_pyt as { cur?: string; amt?: number })
      : null;

  const rewardFormatted =
    getString(raw.rewardFormatted) ||
    formatPayout(inappPyt) ||
    formatPayout(pyt) ||
    getString(raw.reward ? String(raw.reward) : '') ||
    '';

  const rewardIsVariable =
    typeof raw.rewardIsVariable === 'boolean'
      ? raw.rewardIsVariable
      : Array.isArray(raw.gls) && (raw.gls as RawGoal[]).length > 1;

  const multipleConversions =
    typeof raw.multipleConversions === 'boolean'
      ? raw.multipleConversions
      : Array.isArray(raw.ctg) && (raw.ctg as string[]).includes('MULTI_REWARD');

  const featured =
    typeof raw.featured === 'boolean'
      ? raw.featured
      : Array.isArray(raw.ctg) && (raw.ctg as string[]).includes('NEW');

  const rawGoals = Array.isArray(raw.gls) ? (raw.gls as RawGoal[]) : [];
  const goals: NormalizedGoal[] = rawGoals
    .map((g): NormalizedGoal => ({
      id: getString(g.id) || Math.random().toString(36),
      title: getString(g.ttl) || 'Complete this goal',
      instructions: g.instr ? getString(g.instr) : null,
      rewardFormatted: formatPayout(g.inapp_pyt) || formatPayout(g.pyt) || null,
      order: typeof g.ord === 'number' ? g.ord : 0,
    }))
    .sort((a, b) => a.order - b.order);

  return {
    id,
    name,
    description: description || null,
    image,
    category: category || null,
    type: type || null,
    clickUrl,
    rewardFormatted,
    rewardIsVariable,
    multipleConversions,
    featured,
    goals,
  };
}

function OfferCard({ offer, userId }: { offer: NormalizedOffer; userId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const showImage = offer.image && !imgFailed;
  const hasGoals = offer.goals.length > 0;
  const isMultiStep = hasGoals && offer.goals.length > 1;
  const firstGoalInstr = hasGoals ? offer.goals[0].instructions : null;
  const requirements = firstGoalInstr || null;

  const clickUrl = offer.clickUrl
    ? offer.clickUrl.replace(/\{your_user_id\}|%7Byour_user_id%7D/g, encodeURIComponent(userId))
    : null;

  return (
    <div className="group flex flex-col rounded-xl border border-ink-200 bg-ink-800/50 p-4 transition hover:border-brand-500/40 hover:bg-ink-800">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-700">
          <Gift className="absolute h-6 w-6 text-ink-400" />
          {showImage && (
            <img
              src={offer.image!}
              alt=""
              className="relative h-full w-full object-cover"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className="flex items-center gap-1 text-sm font-bold text-accent-400">
            <Trophy className="h-4 w-4" />
            {offer.rewardIsVariable ? 'Varies' : offer.rewardFormatted || 'Reward'}
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

      <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-white">
        {offer.name}
      </h3>
      {offer.description && (
        <p className="mb-2 line-clamp-2 text-xs text-ink-400">
          {offer.description}
        </p>
      )}

      {requirements && !isMultiStep && (
        <div className="mb-3 flex items-start gap-1.5 rounded-lg bg-ink-900/60 px-2.5 py-2">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
          <p className="line-clamp-3 whitespace-pre-line text-xs text-ink-300">
            {requirements}
          </p>
        </div>
      )}

      {isMultiStep && (
        <div className="mb-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-lg bg-ink-900/60 px-2.5 py-2 text-xs font-medium text-brand-400 transition hover:bg-ink-900"
          >
            <ListChecks className="h-3.5 w-3.5 shrink-0" />
            {offer.goals.length} steps to complete
            {expanded ? (
              <ChevronUp className="ml-auto h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="ml-auto h-3.5 w-3.5" />
            )}
          </button>
          {expanded && (
            <ol className="mt-2 space-y-2">
              {offer.goals.map((goal, idx) => (
                <li
                  key={goal.id}
                  className="rounded-lg border border-ink-200 bg-ink-900/40 p-2.5"
                >
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/20 text-[10px] font-bold text-brand-400">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white">
                        {goal.title}
                      </p>
                      {goal.instructions && (
                        <p className="mt-0.5 whitespace-pre-line text-[11px] text-ink-300">
                          {goal.instructions}
                        </p>
                      )}
                      {goal.rewardFormatted && (
                        <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-accent-400">
                          <Trophy className="h-3 w-3" />
                          {goal.rewardFormatted}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {offer.category && (
        <div className="mb-3">
          <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-medium capitalize text-ink-300">
            {offer.category.replace(/_/g, ' ').toLowerCase()}
          </span>
        </div>
      )}

      <div className="mt-auto pt-2">
        {clickUrl ? (
          <a
            href={clickUrl}
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
  );
}

export function OffersPage() {
  const { user, profile } = useAuth();
  const [offers, setOffers] = useState<NormalizedOffer[]>([]);
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

    if (
      offersCache &&
      offersCache.userId === user.id &&
      Date.now() - offersCache.timestamp < OFFERS_CACHE_TTL
    ) {
      setOffers(offersCache.offers);
      setLoadingOffers(false);
      return;
    }

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

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/offerwall-offers?page=1&limit=20&sort=payout`;
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
        setOffersError('Unable to load offers right now.');
        setLoadingOffers(false);
        return;
      }

      const data = await response.json();
      const rawOffers = Array.isArray(data?.offers)
        ? data.offers
        : Array.isArray(data?.data?.offers)
          ? data.data.offers
          : null;

      if (rawOffers) {
        const normalized = (rawOffers as Record<string, unknown>[]).map(normalizeOffer);
        setOffers(normalized);
        offersCache = {
          userId: user.id,
          offers: normalized,
          timestamp: Date.now(),
        };
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

  const fetchedHistoryRef = useRef(false);

  const fetchRecentOffers = useCallback(async () => {
    if (!user || fetchedHistoryRef.current) return;
    fetchedHistoryRef.current = true;
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
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Sparkles className="h-7 w-7 text-brand-400" />
          Earn with Offers
        </h1>
        <p className="mt-2 text-ink-400">
          Complete sponsored offers and surveys from our partners to earn WorkPixo
          rewards. Rewards are credited automatically to your wallet.
        </p>
      </div>

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

          {!loadingOffers && !offersError && offers.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} userId={user.id} />
              ))}
            </div>
          )}
        </div>
      </div>

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

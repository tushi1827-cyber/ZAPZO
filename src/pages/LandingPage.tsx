import { useState, useEffect } from 'react';
import {
  Zap, CheckCircle2, Users, ShieldCheck, Wallet, BadgeCheck, ClipboardList,
  ArrowRight, Gift, Search, FileCheck, Coins, Share2, TrendingUp,
  AlertCircle, ChevronDown, Rocket, Eye, Fingerprint, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fetchHomepageContent, HomepageContent } from '@/lib/homepageContent';
import { DEFAULT_HOMEPAGE_CONTENT } from '@/lib/homepageContent';

const iconMap: Record<string, React.ComponentType<{ className?: string; fill?: string }>> = {
  Zap, CheckCircle2, Users, ShieldCheck, Wallet, BadgeCheck, ClipboardList,
  ArrowRight, Gift, Search, FileCheck, Coins, Share2, TrendingUp,
  AlertCircle, ChevronDown, Rocket, Eye, Fingerprint, Lock,
};

const trustPoints = [
  'Earnings are not guaranteed and depend on available tasks.',
  'Task availability can change at any time without notice.',
  'Rewards require admin verification before being credited.',
  'Fraudulent activity may result in reward reversal and account suspension.',
  'Users should never pay money to access ordinary earning tasks.',
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
        <span className="font-semibold text-white">{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 text-sm text-ink-400 animate-slide-up">{a}</div>}
    </div>
  );
}

export function LandingPage() {
  const [content, setContent] = useState<HomepageContent>(DEFAULT_HOMEPAGE_CONTENT);

  useEffect(() => {
    fetchHomepageContent().then(setContent);
  }, []);

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-950/40 via-ink-950 to-ink-950" />
        <div className="absolute top-0 left-1/2 -z-10 h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px] animate-glow-pulse" />
        <div className="absolute top-40 right-0 -z-10 h-72 w-72 rounded-full bg-accent-400/5 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-600/30 bg-brand-600/10 px-4 py-1.5 text-sm font-medium text-brand-400 animate-fade-in">
              <Zap className="h-4 w-4" fill="currentColor" />
              {content.heroBadge}
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl md:text-7xl animate-slide-up">
              {content.heroHeadingLine1}
              <br />
              <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-accent-400 bg-clip-text text-transparent">
                {content.heroHeadingLine2}
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-400 animate-slide-up">
              {content.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row animate-slide-up">
              <Button to={content.heroPrimaryButtonUrl} size="lg">
                {content.heroPrimaryButtonText} <ArrowRight className="h-5 w-5" />
              </Button>
              <Button to={content.heroSecondaryButtonUrl} variant="secondary" size="lg">
                {content.heroSecondaryButtonText}
              </Button>
            </div>
            <p className="mt-4 text-xs text-ink-400">{content.heroDisclaimer}</p>
          </div>

          {/* Hero stats */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { icon: ClipboardList, label: 'Task Categories', value: '6+' },
              { icon: BadgeCheck, label: 'Verification', value: 'Manual' },
              { icon: Users, label: 'Referral System', value: 'Qualified' },
              { icon: ShieldCheck, label: 'Security', value: 'RLS' },
            ].map((stat) => (
              <Card key={stat.label} className="p-5 text-center">
                <stat.icon className="mx-auto h-6 w-6 text-brand-500" />
                <p className="mt-2 text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-ink-400">{stat.label}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">How It Works</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{content.howItWorksHeading}</h2>
            <p className="mt-4 text-ink-400">{content.howItWorksDescription}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {content.howItWorksSteps.map((step, i) => {
              const Icon = iconMap[step.icon] || Zap;
              return (
                <Card key={i} hover className="relative p-6">
                  <div className="absolute right-5 top-5 text-5xl font-black text-ink-200">{i + 1}</div>
                  <div className="relative">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600/15 text-brand-400">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-white">{step.title}</h3>
                    <p className="mt-1 text-sm text-ink-400">{step.desc}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-ink-900/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">Features</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{content.featureHeading}</h2>
            <p className="mt-4 text-ink-400">{content.featureDescription}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {content.features.map((feat, i) => {
              const Icon = iconMap[feat.icon] || Zap;
              return (
                <Card key={i} hover className="p-6">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600/15 text-brand-400">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">{feat.title}</h3>
                  <p className="mt-1 text-sm text-ink-400">{feat.desc}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tasks preview */}
      <section id="tasks-preview" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">Tasks</p>
              <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Diverse task categories</h2>
              <p className="mt-4 text-ink-400">Choose from a variety of verified tasks that match your skills and interests. Every task is clearly described with instructions and a stated reward.</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {content.taskCategoryLabels.map((cat) => (
                  <div key={cat} className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-900 px-3 py-2.5 text-sm font-medium text-ink-400">
                    <CheckCircle2 className="h-4 w-4 text-brand-400" />
                    {cat}
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <Button to="/register">Browse Tasks <ArrowRight className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { title: 'Follow & Share Social Campaign', cat: 'Social', reward: '₹50', icon: Share2 },
                { title: 'Complete Product Survey', cat: 'Survey', reward: '₹120', icon: ClipboardList },
                { title: 'Test New App Feature', cat: 'App', reward: '₹200', icon: Fingerprint },
              ].map((task) => (
                <Card key={task.title} hover className="flex items-center gap-4 p-5">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-400/10 text-accent-400">
                    <task.icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{task.title}</p>
                    <p className="text-xs text-ink-400">{task.cat} • Manual verification</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-accent-400">{task.reward}</p>
                    <p className="text-xs text-ink-400">reward</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Referral Section */}
      <section id="rewards" className="scroll-mt-20 bg-ink-900/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <Card accent className="p-8">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white shadow-glow-purple">
                    <Gift className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-ink-400">Your referral code</p>
                    <p className="text-xl font-bold tracking-wider text-white">ZAPZO-X7K29</p>
                  </div>
                </div>
                <div className="mt-6 space-y-4">
                  {[
                    { icon: Users, label: 'Friend registers with your code', tone: 'text-ink-400' },
                    { icon: ClipboardList, label: 'Friend completes an eligible task', tone: 'text-ink-400' },
                    { icon: BadgeCheck, label: 'Task submission is approved', tone: 'text-ink-400' },
                    { icon: Coins, label: 'Referral qualifies — you earn a reward', tone: 'text-accent-400 font-semibold' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-800">
                        <step.icon className="h-5 w-5 text-ink-400" />
                      </div>
                      <span className={`text-sm ${step.tone}`}>{step.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">Qualified Referrals</p>
              <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Refer friends the fair way</h2>
              <p className="mt-4 text-ink-400">
                Share your unique referral code with friends. You earn a referral reward only when your friend signs up AND completes a qualifying task that gets approved. No rewards for mere signups — this keeps the system fair and fraud-resistant.
              </p>
              <ul className="mt-6 space-y-2">
                {['Self-referral prevention', 'Duplicate detection', 'One qualification per referral', 'Transparent referral history'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-ink-400">
                    <CheckCircle2 className="h-4 w-4 text-accent-400" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Card className="p-8 sm:p-10">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-warning-500/15 text-warning-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Our commitment to responsible earning</h2>
                <p className="mt-2 text-ink-400">We believe in transparency. Here is what you should know before you start:</p>
              </div>
            </div>
            <ul className="mt-6 space-y-3">
              {trustPoints.map((point) => (
                <li key={point} className="flex items-start gap-3 rounded-xl bg-ink-800/50 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
                  <span className="text-sm text-ink-400">{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Button to="/responsible-earning" variant="secondary">Read full policy <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-ink-900/30 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">FAQ</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Frequently asked questions</h2>
          </div>
          <div className="mt-10 space-y-3">
            {content.faqs.map((faq, i) => (
              <FaqItem key={i} {...faq} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-10 text-center shadow-glow-purple sm:p-16">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent-400/10" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/5" />
            <div className="relative">
              <TrendingUp className="mx-auto h-10 w-10 text-accent-400" />
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">{content.finalCtaHeading}</h2>
              <p className="mx-auto mt-4 max-w-xl text-white/70">{content.finalCtaDescription}</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button to="/register" variant="secondary" size="lg" className="bg-white text-brand-700 hover:bg-white/90 border-0">
                  Get Started Free <ArrowRight className="h-5 w-5" />
                </Button>
                <Button to="/login" variant="ghost" size="lg" className="text-white hover:bg-white/10">
                  Login
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import { supabase } from '@/lib/supabase';

export interface HomepageFaq {
  q: string;
  a: string;
}

export interface HomepageHowItWorksStep {
  icon: string;
  title: string;
  desc: string;
}

export interface HomepageFeature {
  icon: string;
  title: string;
  desc: string;
}

export interface HomepageContent {
  heroBadge: string;
  heroHeadingLine1: string;
  heroHeadingLine2: string;
  heroSubtitle: string;
  heroPrimaryButtonText: string;
  heroPrimaryButtonUrl: string;
  heroSecondaryButtonText: string;
  heroSecondaryButtonUrl: string;
  heroDisclaimer: string;
  featureHeading: string;
  featureDescription: string;
  howItWorksHeading: string;
  howItWorksDescription: string;
  howItWorksSteps: HomepageHowItWorksStep[];
  features: HomepageFeature[];
  taskCategoryLabels: string[];
  faqs: HomepageFaq[];
  finalCtaHeading: string;
  finalCtaDescription: string;
  footerDescription: string;
}

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  heroBadge: 'Do Tasks. Earn Rewards.',
  heroHeadingLine1: 'Do Tasks.',
  heroHeadingLine2: 'Earn Rewards.',
  heroSubtitle:
    'Complete verified tasks, earn rewards, and grow through qualified referrals. A legitimate, transparent platform. No deposits, no promises, just real work for real rewards.',
  heroPrimaryButtonText: 'Start Earning',
  heroPrimaryButtonUrl: '/register',
  heroSecondaryButtonText: 'Explore Tasks',
  heroSecondaryButtonUrl: '/login',
  heroDisclaimer: 'Free to join. No deposits required. Earnings not guaranteed.',
  featureHeading: 'Built for trust and transparency',
  featureDescription: 'Every feature is designed to keep earning fair, visible, and secure.',
  howItWorksHeading: 'Six simple steps to your first reward',
  howItWorksDescription: 'From sign-up to payout — a clear, transparent process with no hidden steps.',
  howItWorksSteps: [
    { icon: 'Rocket', title: 'Create Account', desc: 'Sign up free and get your unique referral code instantly.' },
    { icon: 'Search', title: 'Choose a Task', desc: 'Browse verified tasks across social, survey, app, and learning categories.' },
    { icon: 'ClipboardList', title: 'Complete Task', desc: 'Follow the task instructions and complete the required actions.' },
    { icon: 'FileCheck', title: 'Submit Proof', desc: 'Submit your proof of completion for verification.' },
    { icon: 'BadgeCheck', title: 'Get Verified', desc: 'Our admin team reviews and verifies your submission.' },
    { icon: 'Coins', title: 'Earn Reward', desc: 'Approved tasks credit rewards directly to your wallet.' },
  ],
  features: [
    { icon: 'BadgeCheck', title: 'Verified Tasks', desc: 'Every task is reviewed by our team before rewards are credited. No fake completions.' },
    { icon: 'Wallet', title: 'Transparent Wallet', desc: 'See every transaction in a clear ledger. Rewards, referrals, withdrawals — all visible.' },
    { icon: 'Users', title: 'Qualified Referrals', desc: 'Refer friends and earn only when they complete a qualifying task. Fair and fraud-resistant.' },
    { icon: 'ShieldCheck', title: 'Secure Account', desc: 'Bank-grade auth with Supabase. Your account and earnings are protected.' },
    { icon: 'Eye', title: 'Admin Verification', desc: 'A dedicated review system ensures proof quality before any reward is paid out.' },
    { icon: 'Lock', title: 'Fraud Protection', desc: 'Self-referral prevention, duplicate detection, and suspicious-activity flagging built in.' },
  ],
  taskCategoryLabels: ['Social', 'Survey', 'Website', 'App', 'Learning', 'Other'],
  faqs: [
    { q: 'Is ZAPZO free to join?', a: 'Yes. Creating an account is completely free. You should never pay anyone to access ordinary earning tasks on ZAPZO.' },
    { q: 'How do I earn rewards?', a: 'Complete verified tasks, submit proof, and once your submission is approved by our review team, the reward is credited to your wallet.' },
    { q: 'Are earnings guaranteed?', a: 'No. Earnings depend on the availability of tasks and successful verification of your submissions. We never promise guaranteed income.' },
    { q: 'How do referrals work?', a: 'Share your unique referral code. When a referred friend signs up AND completes a qualifying task that gets approved, your referral becomes qualified and you earn a referral reward. Signup alone does not generate a reward.' },
    { q: 'Can I refer myself?', a: 'No. Self-referrals are automatically prevented. Attempting to abuse the referral system may result in reward reversal and account suspension.' },
    { q: 'How do withdrawals work?', a: 'Request a withdrawal via UPI or bank transfer once you reach the minimum amount. Each request is manually reviewed by our admin team before being approved and paid.' },
    { q: 'What happens if my submission is rejected?', a: 'You will see the rejection reason on your submission. You can try another task — rejection does not affect your account standing unless fraudulent activity is detected.' },
    { q: 'What is the wallet ledger?', a: 'Every reward, referral bonus, adjustment, and withdrawal is recorded as a transaction in your wallet. You can review your full history at any time for complete transparency.' },
  ],
  finalCtaHeading: 'Ready to start earning?',
  finalCtaDescription: 'Join ZAPZO today, complete verified tasks, and build your rewards through genuine effort.',
  footerDescription: '',
};

export async function fetchHomepageContent(): Promise<HomepageContent> {
  const { data, error } = await supabase
    .from('homepage_content')
    .select('content')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_HOMEPAGE_CONTENT;
  }

  const stored = data.content as Partial<HomepageContent>;
  return { ...DEFAULT_HOMEPAGE_CONTENT, ...stored };
}

export async function saveHomepageContent(content: HomepageContent): Promise<{ success: boolean; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('homepage_content')
    .upsert(
      {
        id: 1,
        content,
        updated_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function resetHomepageContent(): Promise<{ success: boolean; error?: string }> {
  return saveHomepageContent(DEFAULT_HOMEPAGE_CONTENT);
}

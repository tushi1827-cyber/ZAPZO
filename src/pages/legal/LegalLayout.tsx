import { ReactNode, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

interface LegalLayoutProps {
  title: string;
  description?: string;
  lastUpdated?: string;
  children: ReactNode;
}

export function LegalLayout({ title, description, lastUpdated, children }: LegalLayoutProps) {
  useEffect(() => {
    document.title = `${title} — ZAPZO`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', description || `${title} for the ZAPZO task-and-referral rewards platform.`);
    }
    return () => {
      document.title = 'ZAPZO — Do Tasks. Earn Rewards.';
      if (metaDesc) {
        metaDesc.setAttribute('content', 'Complete verified tasks, earn rewards, and grow through qualified referrals on ZAPZO.');
      }
    };
  }, [title, description]);

  return (
    <div className="min-h-screen flex flex-col bg-ink-950">
      <Navbar />
      <main className="flex-1 mx-auto max-w-4xl w-full px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-sm text-ink-400">{description}</p>}
        {lastUpdated && <p className="mt-1 text-sm text-ink-400">Last updated: {lastUpdated}</p>}
        <div className="mt-8 max-w-none space-y-4 text-sm leading-relaxed text-ink-400 sm:text-[15px] [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_p]:text-ink-400 [&_a]:text-brand-400 [&_a]:font-medium [&_a:hover]:text-brand-300 [&_strong]:text-ink-50">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}

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
        {lastUpdated && <p className="mt-2 text-sm text-ink-400">Last updated: {lastUpdated}</p>}
        <div className="mt-8 prose prose-sm prose-invert max-w-none text-ink-400 space-y-4">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}

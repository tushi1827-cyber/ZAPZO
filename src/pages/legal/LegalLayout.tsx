import { ReactNode } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export function LegalLayout({ title, children, lastUpdated }: { title: string; lastUpdated?: string; children: ReactNode }) {
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

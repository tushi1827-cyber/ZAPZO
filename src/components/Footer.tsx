import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

const columns = [
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Contact', to: '/contact' },
      { label: 'Support', to: '/support' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', to: '/terms' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Responsible Earning', to: '/responsible-earning' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'How It Works', to: '/#how-it-works' },
      { label: 'FAQ', to: '/#faq' },
      { label: 'Get Started', to: '/register' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-ink-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-400">
              Do Tasks. Earn Rewards. A legitimate task-and-referral rewards platform.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white">{col.title}</h4>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="text-sm text-ink-400 transition hover:text-brand-400">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-ink-200 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-400">© {new Date().getFullYear()} ZAPZO. All rights reserved.</p>
          <p className="text-xs text-ink-400">
            Earnings are not guaranteed. Rewards require verification. Never pay to access ordinary earning tasks.
          </p>
        </div>
      </div>
    </footer>
  );
}

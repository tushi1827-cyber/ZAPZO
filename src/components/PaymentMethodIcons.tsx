interface IconProps {
  className?: string;
}

export function UpiLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#1A1A2E" />
      <rect width="64" height="64" rx="14" fill="url(#upi_grad)" />
      <defs>
        <linearGradient id="upi_grad" x1="0" y1="0" x2="64" y2="64">
          <stop stopColor="#1A1A2E" />
          <stop offset="1" stopColor="#0F0F1E" />
        </linearGradient>
      </defs>
      <text x="32" y="30" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="20" fill="#E94560">UPI</text>
      <path d="M14 42 H50" stroke="#E94560" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M22 48 L32 56 L42 48" stroke="#E94560" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function BankLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#0D3B66" />
      <path d="M12 26 L32 12 L52 26" fill="#FFD23F" />
      <rect x="12" y="26" width="40" height="3" fill="#FFD23F" />
      <rect x="16" y="30" width="6" height="16" fill="#FFD23F" opacity="0.7" />
      <rect x="26" y="30" width="6" height="16" fill="#FFD23F" opacity="0.7" />
      <rect x="36" y="30" width="6" height="16" fill="#FFD23F" opacity="0.7" />
      <rect x="46" y="30" width="6" height="16" fill="#FFD23F" opacity="0.7" />
      <rect x="10" y="48" width="44" height="4" rx="1" fill="#FFD23F" />
    </svg>
  );
}

export function AmazonLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#232F3E" />
      <text x="32" y="28" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="11" fill="#FF9900">amazon</text>
      <path d="M16 38 C24 46 40 46 48 38" stroke="#FF9900" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M46 36 L49 39 L45 41" stroke="#FF9900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x="32" y="52" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="7" fill="#FFFFFF">Gift Card</text>
    </svg>
  );
}

export function FlipkartLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#2874F0" />
      <text x="32" y="24" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="9" fill="#FFE500">Flipkart</text>
      <circle cx="40" cy="38" r="7" fill="#FFE500" />
      <circle cx="40" cy="38" r="4" fill="#2874F0" />
      <path d="M26 30 L34 34 L26 42 Z" fill="#FFE500" />
      <text x="32" y="52" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="7" fill="#FFFFFF">Gift Card</text>
    </svg>
  );
}

export function GooglePlayLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#0D1117" />
      <path d="M16 14 L36 32 L16 50" stroke="#00D4FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M36 32 L50 24" stroke="#00D4FF" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 14 L42 28 L38 32 L16 50" fill="#00D4FF" opacity="0.15" />
      <path d="M36 32 L50 24" stroke="#00D4FF" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 50 L42 36 L38 32" stroke="#00D4FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M36 32 L50 40" stroke="#00D4FF" strokeWidth="3" strokeLinecap="round" />
      <text x="32" y="56" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="6" fill="#FFFFFF">Gift Card</text>
    </svg>
  );
}

export type PaymentIconType = 'upi' | 'bank' | 'amazon' | 'flipkart' | 'google_play';

export function PaymentIcon({ type, className }: { type: PaymentIconType; className?: string }) {
  switch (type) {
    case 'upi': return <UpiLogo className={className} />;
    case 'bank': return <BankLogo className={className} />;
    case 'amazon': return <AmazonLogo className={className} />;
    case 'flipkart': return <FlipkartLogo className={className} />;
    case 'google_play': return <GooglePlayLogo className={className} />;
  }
}

interface IconProps {
  className?: string;
}

export function UpiLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="upi_bg" x1="0" y1="0" x2="64" y2="64">
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#5b21b6" />
        </linearGradient>
        <linearGradient id="upi_tri" x1="20" y1="28" x2="44" y2="52">
          <stop stopColor="#a3e635" />
          <stop offset="1" stopColor="#84cc16" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#upi_bg)" />
      <rect width="64" height="64" rx="16" fill="#08080d" opacity="0.15" />
      <text x="32" y="26" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="18" fill="#ffffff" letterSpacing="-0.5">UPI</text>
      <path d="M20 30 L32 52 L44 30" stroke="url(#upi_tri)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="32" cy="52" r="2.5" fill="#a3e635" />
    </svg>
  );
}

export function BankLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bank_bg" x1="0" y1="0" x2="64" y2="64">
          <stop stopColor="#1a1a2e" />
          <stop offset="1" stopColor="#0d0d1a" />
        </linearGradient>
        <linearGradient id="bank_roof" x1="12" y1="12" x2="52" y2="26">
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="bank_lime" x1="16" y1="30" x2="48" y2="48">
          <stop stopColor="#a3e635" />
          <stop offset="1" stopColor="#65a30d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#bank_bg)" />
      <path d="M12 26 L32 14 L52 26 Z" fill="url(#bank_roof)" />
      <rect x="10" y="26" width="44" height="3" rx="1.5" fill="url(#bank_roof)" />
      <rect x="16" y="31" width="5" height="15" rx="1" fill="url(#bank_lime)" opacity="0.85" />
      <rect x="26" y="31" width="5" height="15" rx="1" fill="url(#bank_lime)" opacity="0.65" />
      <rect x="36" y="31" width="5" height="15" rx="1" fill="url(#bank_lime)" opacity="0.65" />
      <rect x="43" y="31" width="5" height="15" rx="1" fill="url(#bank_lime)" opacity="0.85" />
      <rect x="8" y="48" width="48" height="4" rx="2" fill="url(#bank_roof)" />
    </svg>
  );
}

export function AmazonLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 175 60" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Amazon">
      <path d="M40 42 C55 52 80 52 95 40 C94 38 91 37 89 38 C75 45 58 45 43 36 C41 35 39 40 40 42 Z" fill="#FF9900" />
      <path d="M88 34 L95 40 L88 47" stroke="#FF9900" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x="62" y="34" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="30" fill="#232F3E" letterSpacing="-1">amazon</text>
    </svg>
  );
}

export function FlipkartLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 160 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flipkart">
      <text x="0" y="33" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="26" fill="#2874F0" letterSpacing="-0.5" fontStyle="italic">Flipkart</text>
      <text x="105" y="33" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="16" fill="#FFC700" letterSpacing="0">+</text>
      <circle cx="120" cy="24" r="11" fill="#FFC700" />
      <path d="M114 18 L127 24 L114 30 Z" fill="#2874F0" />
    </svg>
  );
}

export function GooglePlayLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Google Play">
      <path d="M48 32 C32 41 32 59 48 68 L314 222 L260 276 L22 38 C16 42 12 50 12 58 C12 66 16 74 22 78 L260 276 L314 330 L48 444 C32 453 32 471 48 480 L78 464 L354 304 L304 256 L354 208 L78 48 L48 32 Z" fill="#00C2FF" transform="translate(70 0)" />
      <path d="M304 256 L354 304 L424 264 C448 250 448 222 424 208 L354 208 L304 256 Z" fill="#00C2FF" transform="translate(70 0)" />
      <path d="M48 68 L304 208 L354 208 L78 48 L48 68 Z" fill="#00E676" transform="translate(70 0)" />
      <path d="M48 444 L304 304 L354 304 L78 464 L48 444 Z" fill="#FF3A44" transform="translate(70 0)" />
      <path d="M304 208 L354 208 L304 256 L260 276 L304 208 Z" fill="#FFCD00" transform="translate(70 0)" />
      <path d="M304 304 L354 304 L304 256 L260 276 L304 304 Z" fill="#FFCD00" transform="translate(70 0)" />
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

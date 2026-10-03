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
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="amz_bg" x1="0" y1="0" x2="64" y2="64">
          <stop stopColor="#232F3E" />
          <stop offset="1" stopColor="#131A22" />
        </linearGradient>
        <linearGradient id="amz_smile" x1="16" y1="36" x2="48" y2="42">
          <stop stopColor="#FF9900" />
          <stop offset="1" stopColor="#FFB84D" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#amz_bg)" />
      <text x="32" y="26" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="10" fill="#FF9900" letterSpacing="0.5">amazon</text>
      <path d="M16 36 C24 45 40 45 48 36" stroke="url(#amz_smile)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M45 33 L49 37 L44 40" stroke="url(#amz_smile)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x="32" y="52" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="6.5" fill="#a3e635" letterSpacing="0.8">GIFT CARD</text>
    </svg>
  );
}

export function FlipkartLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fk_bg" x1="0" y1="0" x2="64" y2="64">
          <stop stopColor="#2874F0" />
          <stop offset="1" stopColor="#1452C9" />
        </linearGradient>
        <linearGradient id="fk_star" x1="34" y1="30" x2="42" y2="42">
          <stop stopColor="#FFE500" />
          <stop offset="1" stopColor="#FFC700" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#fk_bg)" />
      <text x="32" y="22" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="8" fill="#FFE500" letterSpacing="0.3">Flipkart</text>
      <path d="M26 28 L36 34 L26 42 Z" fill="url(#fk_star)" />
      <circle cx="38" cy="38" r="6" fill="url(#fk_star)" />
      <path d="M36 34 L42 40" stroke="#2874F0" strokeWidth="2.5" strokeLinecap="round" />
      <text x="32" y="52" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="6.5" fill="#a3e635" letterSpacing="0.8">GIFT CARD</text>
    </svg>
  );
}

export function GooglePlayLogo({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gp_bg" x1="0" y1="0" x2="64" y2="64">
          <stop stopColor="#0D1117" />
          <stop offset="1" stopColor="#050810" />
        </linearGradient>
        <linearGradient id="gp_tri1" x1="16" y1="14" x2="38" y2="32">
          <stop stopColor="#00D4FF" />
          <stop offset="1" stopColor="#0099CC" />
        </linearGradient>
        <linearGradient id="gp_tri2" x1="16" y1="50" x2="38" y2="32">
          <stop stopColor="#a3e635" />
          <stop offset="1" stopColor="#65a30d" />
        </linearGradient>
        <linearGradient id="gp_tri3" x1="38" y1="24" x2="50" y2="40">
          <stop stopColor="#FF6B6B" />
          <stop offset="1" stopColor="#E04545" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#gp_bg)" />
      <path d="M16 14 L38 30 L34 34 L16 50 Z" fill="url(#gp_tri1)" />
      <path d="M16 50 L34 34 L38 30 L16 14 Z M16 50 L34 34 L38 38 L20 52 Z" fill="url(#gp_tri2)" opacity="0.85" />
      <path d="M38 30 L50 24 L40 36 L36 32 Z" fill="url(#gp_tri3)" />
      <path d="M38 38 L50 40 L40 48 L36 40 Z" fill="url(#gp_tri2)" />
      <text x="32" y="56" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="5.5" fill="#a3e635" letterSpacing="0.5">GIFT CARD</text>
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

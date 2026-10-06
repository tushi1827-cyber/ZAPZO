export function formatCoins(value: number): string {
  const n = Number(value) || 0;
  return `${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Coins`;
}

export function formatSignedCoins(value: number): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const str = `${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Coins`;
  return n >= 0 ? `+${str}` : `-${str}`;
}

export function formatCoinsShort(value: number): string {
  const n = Number(value) || 0;
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr Coins`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L Coins`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K Coins`;
  return `${n.toFixed(0)} Coins`;
}

export function coinsToINR(value: number): number {
  return (Number(value) || 0) * 0.10;
}

export function formatINREquivalent(value: number): string {
  const inr = coinsToINR(value);
  return `\u2248 \u20B9${inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

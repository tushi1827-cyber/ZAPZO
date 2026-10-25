export const COINS_PER_RUPEE = 10;

export const inrToCoins = (inr: number): number =>
  Math.round(Number(inr) * COINS_PER_RUPEE);

export const coinsToInr = (coins: number): number =>
  Number(coins) / COINS_PER_RUPEE;

export const formatCoins = (inr: number): string =>
  `${inrToCoins(inr).toLocaleString('en-IN')} Coins`;

export const formatInr = (inr: number): string =>
  `₹${Number(inr).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

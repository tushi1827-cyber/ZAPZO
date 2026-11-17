# Project memory

## Product intent & audience

- WorkPixo: a coin-based rewards/earnings platform where users accumulate coins and withdraw them as real currency.
- Coin conversion is fixed: 10 Coins = ₹1 (INR). Never change this.
- Audience: everyday users withdrawing earned coins to Indian payment methods (UPI, gift cards, etc.).

## Brand personality & voice

- Premium light fintech aesthetic — clean, trustworthy, polished, production-grade.
- Not cookie-cutter; designs should feel distinct and refined.
- UI copy is functional and clear (validation messages, limits, statuses).

## Visual design & UX direction

- **Theme:** Premium light fintech. Subtle premium green gradients for balance/hero elements.
- **Color cues:** Green for selected states, accents, and final-amount highlights; muted secondary rows for summary hierarchy.
- **Layout/cards:** Content grouped in clean cards with consistent spacing and alignment. Payment method cards kept equal-sized with compact logos/icons in white chips.
- **Selection pattern:** Selected payment method shows a clear green border plus a checkmark badge.
- **Hierarchy:** Primary figure (coin balance) large/hero; INR equivalent secondary; summary rows muted except Final Amount highlighted in green-tinted row.
- **Quick actions:** Quick amount buttons (50, 100, 200, MAX) that are disabled when outside min limit or available balance — never bypass validation.
- **History:** Compact per-item cards with amount, date, method, status badge, and rejection reason if present.
- **Timelines:** Numbered vertical timeline with connecting line for step-by-step explainers.
- **Long content:** Policy and delivery sections collapsible (collapsed by default) to reduce page length; preserve all text.
- **Icons:** lucide-react only.

## Decisions, constraints & rationale

- Stack: Vite + React + JSX, Tailwind CSS, lucide-react. No extra UI/icon packages unless explicitly requested.
- Imports use `@/` path alias mapping to `src/`.
- Do not change withdrawal APIs, database, RPC functions, validation rules, payment logic, min/max limits, or coin conversion.
- Do not invent processing times or payment guarantees.
- Do not deploy to production.
- After changes, run typecheck and build and report modified files.
- Polish/iterate on existing designs rather than full redesigns when requested.
- Likely backend: Supabase (RPC functions referenced).

## Open questions & assumptions

- Exact minimum/maximum withdrawal limits and their source values are defined in existing page logic (not restated here).
- Available payment methods (UPI and others) are fixed by existing code; specific list not enumerated in memory.
- Backend/DB schema and RPC function names are owned by existing code; not documented here to avoid drift.
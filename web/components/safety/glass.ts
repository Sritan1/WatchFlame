import type { CSSProperties } from 'react';

// Shared matte-glass surface for the Safety page cards. Translucent + backdrop
// blur so the "Still Waters" backdrop breathes through, matching the reference
// design (web-safety.jsx SF_CARD). Kept in one place so every Safety card reads
// as one family.
export const GLASS_CARD: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(17,21,27,0.62), rgba(13,17,23,0.55))',
  border: '0.5px solid rgba(255,255,255,0.09)',
  boxShadow: '0 16px 50px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
};

/** Glass for the "Suggested Direction" command card. Uses the SAME blackish
 *  fill as the other Safety cards (no warm tint); the command-card emphasis
 *  comes from a faint risk-toned accent ring + the gold compass/CTA inside, so
 *  it reads as part of the family rather than a differently-coloured card. The
 *  ring colour stays risk-adaptive (subtle when calm, redder under real threat). */
export function glassCommandCard(glowRgb: string): CSSProperties {
  return {
    ...GLASS_CARD,
    border: `0.5px solid rgba(${glowRgb}, 0.22)`,
    boxShadow: `0 22px 60px rgba(0,0,0,0.42), 0 0 36px rgba(${glowRgb}, 0.05), inset 0 1px 0 rgba(255,255,255,0.06)`,
  };
}

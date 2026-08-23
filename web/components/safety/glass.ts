import type { CSSProperties } from 'react';

// The shared glass surface for the Safety cards. Translucent, with a backdrop blur
// so the scene behind shows through. Kept in one place so every card on the page
// belongs to one family.
export const GLASS_CARD: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(17,21,27,0.62), rgba(13,17,23,0.55))',
  border: '0.5px solid rgba(255,255,255,0.09)',
  boxShadow: '0 16px 50px rgba(0,0,0,0.35)',
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
};

/** Glass for the suggested-direction card. Same fill as its siblings, with the
 *  emphasis coming from a faint risk-toned ring and the gold compass inside. It
 *  stays part of the family instead of becoming a differently colored card. */
export function glassCommandCard(glowRgb: string): CSSProperties {
  return {
    ...GLASS_CARD,
    border: `0.5px solid rgba(${glowRgb}, 0.22)`,
    boxShadow: `0 22px 60px rgba(0,0,0,0.42), 0 0 36px rgba(${glowRgb}, 0.05), inset 0 1px 0 rgba(255,255,255,0.06)`,
  };
}

// premium.jsx — premium primitive elements shared by Safety + Risk

// Section ribbon: dot + eyebrow + hairline running to edge — used as section divider
const SectionRibbon = ({ ae, color, eyebrow, action }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '0 20px',
  }}>
    <span style={{
      width: 5, height: 5, borderRadius: 99, background: color,
      boxShadow: `0 0 8px ${color}`, flexShrink: 0,
    }} />
    <span style={{
      fontFamily: ae.fontMono, fontSize: 10.5, fontWeight: 600,
      letterSpacing: '0.18em', color,
      textTransform: ae.chipUpper ? 'uppercase' : 'none',
      whiteSpace: 'nowrap',
    }}>{eyebrow}</span>
    <div style={{
      flex: 1, height: 0.5, background: `linear-gradient(90deg, rgba(${hexToRgb(color)}, 0.5), transparent)`,
    }} />
    {action}
  </div>
);

// Index badge — mono numeric label for ordered items
const IndexBadge = ({ ae, n, color }) => (
  <span style={{
    fontFamily: ae.fontMono, fontSize: 10, fontWeight: 600,
    letterSpacing: '0.06em', color: color || ae.textMute,
    fontVariantNumeric: 'tabular-nums',
    minWidth: 22, textAlign: 'right',
  }}>{String(n).padStart(2, '0')}</span>
);

// Faint grid pattern overlay — used inside featured cards
const GridPattern = ({ opacity = 0.04, color = '#fff' }) => (
  <svg style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    width: '100%', height: '100%',
  }}>
    <defs>
      <pattern id="grid-p" width="14" height="14" patternUnits="userSpaceOnUse">
        <path d="M 14 0 L 0 0 0 14" fill="none" stroke={color} strokeWidth="0.5" opacity={opacity} />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid-p)" />
  </svg>
);

// Diagonal stripe pattern overlay — for "federal/official" feel on FEMA card
const StripePattern = ({ color, opacity = 0.05 }) => (
  <svg style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    width: '100%', height: '100%',
  }}>
    <defs>
      <pattern id="stripe-p" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="10" stroke={color} strokeWidth="1" opacity={opacity} />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#stripe-p)" />
  </svg>
);

// Progress arc — semicircle, fills from left to right
const ProgressArc = ({ value, total, color, glowRgb, ae, size = 86 }) => {
  const pct = value / total;
  const r = (size - 12) / 2;
  const c = size / 2;
  const arcLen = Math.PI * r;
  const dash = arcLen * pct;
  return (
    <div style={{
      position: 'relative', width: size, height: size / 2 + 8,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        <path d={`M 6 ${c} A ${r} ${r} 0 0 1 ${size - 6} ${c}`}
              fill="none" stroke={ae.line} strokeWidth="4" strokeLinecap="round" />
        <path d={`M 6 ${c} A ${r} ${r} 0 0 1 ${size - 6} ${c}`}
              fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${dash} ${arcLen}`}
              style={{
                transition: 'stroke-dasharray 0.5s cubic-bezier(0.2, 0.7, 0.3, 1)',
                filter: `drop-shadow(0 0 6px ${color})`,
              }} />
      </svg>
      <div style={{
        position: 'absolute', bottom: 4, left: 0, right: 0,
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: ae.fontDisplay, fontSize: 22, fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking, color: ae.text, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>{value}<span style={{ color: ae.textMute, fontWeight: 400 }}>/{total}</span></div>
      </div>
    </div>
  );
};

// Compass rose — points N/E/S/W with one highlighted direction
const CompassRose = ({ ae, color, glowRgb, direction = 'N', size = 110 }) => {
  const c = size / 2;
  const angles = { N: -90, E: 0, S: 90, W: 180 };
  const dirAngle = angles[direction];
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="rose-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="60%" stopColor={color} stopOpacity="0.05" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* outer halo */}
        <circle cx={c} cy={c} r={c - 4} fill="url(#rose-glow)" />
        {/* outer ring */}
        <circle cx={c} cy={c} r={c - 6} fill="none" stroke={ae.lineStrong} strokeWidth="0.5" />
        <circle cx={c} cy={c} r={c - 18} fill="none" stroke={ae.line} strokeWidth="0.5" strokeDasharray="2 3" />
        {/* tick marks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = i * 15 * Math.PI / 180;
          const x1 = c + Math.cos(a) * (c - 8);
          const y1 = c + Math.sin(a) * (c - 8);
          const x2 = c + Math.cos(a) * (c - (i % 3 === 0 ? 13 : 11));
          const y2 = c + Math.sin(a) * (c - (i % 3 === 0 ? 13 : 11));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={i % 6 === 0 ? ae.lineStrong : ae.line} strokeWidth="0.5" />;
        })}
        {/* direction letters */}
        {['N','E','S','W'].map((d, i) => {
          const a = (i * 90 - 90) * Math.PI / 180;
          const x = c + Math.cos(a) * (c - 26);
          const y = c + Math.sin(a) * (c - 26) + 3.5;
          const active = d === direction;
          return (
            <text key={d} x={x} y={y} textAnchor="middle"
              fontFamily={ae.fontMono} fontSize="9.5" fontWeight={active ? 700 : 500}
              fill={active ? color : ae.textMute} letterSpacing="0.04em">{d}</text>
          );
        })}
        {/* arrow needle */}
        <g transform={`rotate(${dirAngle + 90} ${c} ${c})`}>
          <polygon points={`${c},${c - (c - 22)} ${c - 5},${c + 4} ${c + 5},${c + 4}`}
            fill={color}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          <polygon points={`${c},${c + (c - 32)} ${c - 4},${c - 2} ${c + 4},${c - 2}`}
            fill={`rgba(${glowRgb}, 0.30)`} />
          <circle cx={c} cy={c} r="4" fill={color}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          <circle cx={c} cy={c} r="1.5" fill="#fff" />
        </g>
      </svg>
    </div>
  );
};

// Score Gauge — horizontal arc going through low/mod/high/ext zones
const ScoreGauge = ({ ae, score, accent }) => {
  const zones = [
    { until: 0.27, color: RISK_LEVELS.low.color,      label: 'LOW' },
    { until: 0.33, color: RISK_LEVELS.moderate.color, label: 'MOD' },
    { until: 0.42, color: getRisk('high', accent).color,     label: 'HIGH' },
    { until: 1.00, color: getRisk('extreme', accent).color,  label: 'EXT' },
  ];
  const W = 320, H = 64, pad = 6;
  const innerW = W - pad * 2;
  // Stacked segments
  let cursor = 0;
  const segments = zones.map((z, i) => {
    const prev = cursor;
    cursor = z.until;
    return { ...z, from: prev, to: z.until, w: (z.until - prev) * innerW };
  });
  const markerX = pad + Math.min(1, Math.max(0, score)) * innerW;
  return (
    <div style={{ position: 'relative', width: W, maxWidth: '100%', height: H, margin: '0 auto' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* track segments */}
        {segments.map((s, i) => {
          const x = pad + s.from * innerW;
          return (
            <g key={i}>
              <rect x={x + 0.5} y={28} width={s.w - 1} height="6" rx="3"
                fill={`rgba(${hexToRgb(s.color)}, 0.18)`} stroke={`rgba(${hexToRgb(s.color)}, 0.40)`} strokeWidth="0.5" />
              <text x={x + s.w / 2} y={50}
                fontFamily={ae.fontMono} fontSize="9" fontWeight="600" letterSpacing="0.12em"
                fill={`rgba(${hexToRgb(s.color)}, 0.85)`} textAnchor="middle">{s.label}</text>
              {/* zone boundary tick */}
              {i < segments.length - 1 && (
                <line x1={x + s.w} y1="24" x2={x + s.w} y2="38"
                  stroke={ae.lineStrong} strokeWidth="0.5" />
              )}
            </g>
          );
        })}
        {/* marker */}
        <g>
          <line x1={markerX} y1="14" x2={markerX} y2="38" stroke="#fff" strokeWidth="1.5" />
          <circle cx={markerX} cy="14" r="5" fill="#fff"
            style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.7))' }} />
          <text x={markerX} y="9" textAnchor="middle"
            fontFamily={ae.fontMono} fontSize="9" fontWeight="700" letterSpacing="0.08em"
            fill="#fff">SCORE</text>
        </g>
      </svg>
    </div>
  );
};

// Glass segmented control
const GlassSegmented = ({ ae, value, options, onChange, color, glowRgb, size = 'md' }) => {
  const h = size === 'sm' ? 32 : 38;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 4,
      padding: 4, borderRadius: ae.radius,
      background: 'rgba(0,0,0,0.30)',
      border: `0.5px solid ${ae.line}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange && onChange(o.id)} style={{
            height: h, borderRadius: ae.radius - 4, border: 'none',
            background: active
              ? `linear-gradient(180deg, rgba(${glowRgb},0.95), rgba(${glowRgb},0.72))`
              : 'transparent',
            color: active ? '#fff' : ae.textMute,
            fontFamily: ae.fontMono, fontSize: 10.5, fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
            cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.2, 0.7, 0.3, 1)',
            boxShadow: active
              ? `0 4px 14px rgba(${glowRgb}, 0.32), inset 0 1px 0 rgba(255,255,255,0.15)`
              : 'none',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
};

// Stat tile — eyebrow + big number + unit + optional sub-text. For compact data cells.
const StatTile = ({ ae, label, value, unit, sub, accent, icon }) => (
  <div style={{
    background: ae.surface, border: ae.cardBorder, borderRadius: ae.radius,
    padding: 12, position: 'relative', overflow: 'hidden',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Eyebrow ae={ae}>{label}</Eyebrow>
      {icon && (
        <Icon name={icon} size={13} color={accent || ae.textMute} strokeWidth={1.6} />
      )}
    </div>
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{
        fontFamily: ae.fontDisplay, fontSize: 22, fontWeight: ae.titleWeight,
        letterSpacing: ae.titleTracking, color: accent || ae.text,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>{value}</span>
      {unit && (
        <span style={{ fontFamily: ae.fontMono, fontSize: 11, color: ae.textDim }}>{unit}</span>
      )}
    </div>
    {sub && (
      <div style={{
        marginTop: 4, fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
        letterSpacing: '0.04em',
      }}>{sub}</div>
    )}
  </div>
);

Object.assign(window, {
  SectionRibbon, IndexBadge, GridPattern, StripePattern,
  ProgressArc, CompassRose, ScoreGauge, GlassSegmented, StatTile,
});

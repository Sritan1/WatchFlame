// safety.jsx — Safety Actions panel + Incident details + Alert card

const TiltCardS = window.TiltCard;
const AnimatedNumberS = window.AnimatedNumber;

// Shared app header (hamburger / EMBER WATCH / pin) — Status-aligned styling
const AppHeader = ({ ae, accent, onNavigate, tint = 'safety' }) => {
  const r = getRisk('extreme', accent);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 18px', height: 48,
    }}>
      <button style={{
        background: 'transparent', border: 'none', padding: 6, cursor: 'pointer',
        display: 'flex', alignItems: 'center',
      }}>
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
          <rect x="0" y="0"   width="20" height="2.2" rx="1.1" fill={r.color} />
          <rect x="0" y="6.9" width="20" height="2.2" rx="1.1" fill={r.color} />
          <rect x="0" y="13.8" width="20" height="2.2" rx="1.1" fill={r.color} />
        </svg>
      </button>
      <div style={{
        fontFamily: ae.fontDisplay, fontSize: 13, fontWeight: 700,
        letterSpacing: '0.22em', color: ae.text, whiteSpace: 'nowrap',
      }}>EMBER WATCH</div>
      <button onClick={() => onNavigate && onNavigate('map')} style={{
        width: 32, height: 32, borderRadius: 99,
        background: ae.surface,
        border: ae.cardBorder,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}>
        <Icon name="pin" size={14} color={ae.textDim} strokeWidth={1.6} />
      </button>
    </div>
  );
};

const HeaderDivider = ({ color, ae }) => (
  <div style={{ position: 'relative', height: 0.5, marginTop: 12, marginBottom: 4 }}>
    <div style={{
      position: 'absolute', left: 18, right: 18, top: 0, height: 0.5,
      background: ae.line,
    }} />
  </div>
);

const ScreenVignette = ({ color, side = 'right' }) => (
  <div style={{
    position: 'absolute', top: -60,
    left: side === 'left' ? -80 : 'auto', right: side === 'right' ? -80 : 'auto',
    width: 320, height: 240, pointerEvents: 'none',
    background: `radial-gradient(ellipse at center, ${color}, transparent 70%)`,
    filter: 'blur(40px)', opacity: 0.55, zIndex: 0,
  }} />
);

// Dot + Eyebrow row (centered) — matches Status's small-label aesthetic
const EyebrowPill = ({ ae, color, children }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', borderRadius: 999,
    background: `rgba(${hexToRgb(color)}, 0.10)`,
    border: `0.5px solid rgba(${hexToRgb(color)}, 0.28)`,
  }}>
    <span style={{
      width: 6, height: 6, borderRadius: 99, background: color,
      boxShadow: `0 0 8px ${color}`,
    }} />
    <span style={{
      fontFamily: ae.fontMono, fontSize: 10.5, fontWeight: 600,
      letterSpacing: '0.14em',
      textTransform: ae.chipUpper ? 'uppercase' : 'none',
      color,
    }}>{children}</span>
  </div>
);

// Featured card with top accent stripe + soft glow shadow — borrowed from Status's incident card
const FeatureCard = ({ ae, accentColor, accentRgb, children, onClick, padding = 16, style = {} }) => (
  <TiltCardS max={4} onClick={onClick} style={{
    background: ae.surface,
    border: `0.5px solid rgba(${accentRgb}, 0.25)`,
    borderRadius: ae.radius,
    overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
    boxShadow: `0 18px 40px rgba(${accentRgb}, 0.10), 0 1px 0 rgba(255,255,255,0.05) inset`,
    ...style,
  }}>
    <div style={{
      height: 3,
      background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
      boxShadow: `0 0 12px ${accentColor}`,
    }} />
    <div style={{ padding }}>{children}</div>
  </TiltCardS>
);

const SafetyScreen = ({ ae, risk, accent, onNavigate, fire, safetyBg = 'rings' }) => {
  const r = getRisk(risk, accent);
  const [checked, setChecked] = React.useState({});
  const toggle = (id) => setChecked(s => ({ ...s, [id]: !s[id] }));
  const [evac, setEvac] = React.useState('away');

  const amber = '#E8B339';
  const amberRgb = '232, 179, 57';
  const evacColor = r.color;
  const evacGlow = r.glow;
  const headingColor = (risk === 'high' || risk === 'extreme') ? r.color : '#F25C44';

  const checklist = [
    { id: 'gobag',    label: "Pack emergency 'Go Bag'" },
    { id: 'devices',  label: 'Charge all mobile devices' },
    { id: 'windows',  label: 'Close all windows and doors' },
    { id: 'gutters',  label: 'Clear leaves from gutters' },
    { id: 'pets',     label: 'Confirm pets and family contacts' },
    { id: 'meds',     label: 'Gather essential medications' },
  ];
  const doneItems = checklist.filter(c => checked[c.id]).length;

  return (
    <div style={{ position: 'absolute', inset: 0, background: ae.bg, overflow: 'hidden' }}>
      <div className="ember-scroll" style={{
        position: 'absolute', inset: 0, paddingTop: 52,
        paddingBottom: 110, overflowY: 'auto', zIndex: 1,
      }}>
        <AppHeader ae={ae} accent={accent} onNavigate={onNavigate} tint="safety" />
        <HeaderDivider ae={ae} />

        {/* SAFETY CENTER ribbon */}
        <div className="ember-fade-up" style={{ padding: '20px 0 18px' }}>
          <SectionRibbon ae={ae} color={amber} eyebrow="Safety Center" />
        </div>

        {/* FEMA card — premium federal alert tile */}
        <div className="ember-fade-up" style={{ padding: '0 16px' }}>
          <TiltCardS max={4} style={{
            position: 'relative', overflow: 'hidden',
            background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
            border: `0.5px solid rgba(${amberRgb}, 0.28)`,
            borderRadius: ae.radius,
            boxShadow: `0 20px 50px rgba(${amberRgb}, 0.12), inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}>
            {/* top glow stripe */}
            <div style={{
              height: 3,
              background: `linear-gradient(90deg, transparent, ${amber}, transparent)`,
              boxShadow: `0 0 14px ${amber}`,
            }} />
            {/* subtle diagonal stripe pattern */}
            <StripePattern color={amber} opacity={0.04} />
            {/* corner glow */}
            <div style={{
              position: 'absolute', top: -40, right: -40,
              width: 180, height: 180, borderRadius: '50%',
              background: `radial-gradient(circle, rgba(${amberRgb}, 0.18), transparent 70%)`,
              filter: 'blur(20px)', pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative', padding: 18 }}>
              {/* Top row — eyebrow + external */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 99, background: amber,
                    boxShadow: `0 0 8px ${amber}`,
                    animation: 'ember-flicker 2s ease-in-out infinite',
                  }} />
                  <span style={{
                    fontFamily: ae.fontMono, fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.16em', color: amber,
                    textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  }}>FEMA Active In Your Area</span>
                </div>
                <button style={{
                  background: 'transparent', border: 'none', padding: 4,
                  cursor: 'pointer', display: 'flex',
                }}>
                  <Icon name="external" size={14} color={amber} strokeWidth={1.6} />
                </button>
              </div>

              {/* Main row — seal + identity */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginTop: 14 }}>
                <div style={{
                  position: 'relative',
                  width: 56, height: 56, borderRadius: 14,
                  background: `radial-gradient(circle at 30% 30%, rgba(${amberRgb}, 0.30), rgba(${amberRgb}, 0.10))`,
                  border: `0.5px solid rgba(${amberRgb}, 0.40)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  boxShadow: `0 6px 20px rgba(${amberRgb}, 0.20), inset 0 1px 0 rgba(255,255,255,0.10)`,
                }}>
                  <Icon name="warn" size={26} color={amber} strokeWidth={1.6} />
                  {/* pulse ring */}
                  <div style={{
                    position: 'absolute', inset: -3, borderRadius: 16,
                    border: `0.5px solid rgba(${amberRgb}, 0.30)`,
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: ae.fontDisplay, fontSize: 24, fontWeight: ae.titleWeight,
                    letterSpacing: ae.titleTracking, color: ae.text, lineHeight: 1.05,
                  }}>FM-5632 · Fire</div>
                  <div style={{
                    marginTop: 6, fontFamily: ae.fontMono, fontSize: 11,
                    color: amber, letterSpacing: '0.18em', fontWeight: 600,
                    textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  }}>COW CREEK FIRE</div>
                  <div style={{
                    marginTop: 2, fontFamily: ae.fontBody, fontSize: 12.5,
                    color: ae.textMute, lineHeight: 1.4,
                  }}>Designated for Levy, FL</div>
                </div>
              </div>

              {/* Divider */}
              <div style={{
                height: 0.5, marginTop: 16,
                background: `linear-gradient(90deg, transparent, rgba(${amberRgb}, 0.30), transparent)`,
              }} />

              {/* Action row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                <button style={{
                  height: 42, borderRadius: ae.radius,
                  background: `linear-gradient(180deg, rgba(${amberRgb}, 0.16), rgba(${amberRgb}, 0.06))`,
                  border: `0.5px solid rgba(${amberRgb}, 0.40)`,
                  color: amber, cursor: 'pointer',
                  fontFamily: ae.fontMono, fontSize: 10.5, fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`,
                }}>
                  <Icon name="pin" size={13} color={amber} strokeWidth={1.8} /> Show On Map
                </button>
                <button style={{
                  height: 42, borderRadius: ae.radius,
                  background: 'transparent',
                  border: `0.5px solid rgba(${amberRgb}, 0.25)`,
                  color: amber, cursor: 'pointer',
                  fontFamily: ae.fontMono, fontSize: 10.5, fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  FEMA Page <Icon name="external" size={12} color={amber} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          </TiltCardS>
        </div>

        {/* Stay Aware + Closest Active Fire — paired layout (asymmetric) */}
        <div className="ember-fade-up" style={{
          padding: '14px 16px 0', display: 'grid', gap: 10,
        }}>
          {/* Stay Aware advisory */}
          <div style={{
            position: 'relative', overflow: 'hidden',
            background: ae.surface, border: `0.5px solid rgba(${amberRgb}, 0.18)`,
            borderRadius: ae.radius, padding: 14,
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `rgba(${amberRgb}, 0.10)`,
                border: `0.5px solid rgba(${amberRgb}, 0.28)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon name="warn" size={16} color={amber} strokeWidth={1.6} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: ae.fontDisplay, fontSize: 17, fontWeight: ae.titleWeight,
                  letterSpacing: ae.titleTracking, color: amber, lineHeight: 1.15,
                }}>Stay Aware</div>
                <div style={{
                  marginTop: 4, fontFamily: ae.fontBody, fontSize: 13, lineHeight: 1.45,
                  color: ae.textDim,
                }}>Conditions favor fire growth. Review your plan and keep an eye on local alerts.</div>
              </div>
            </div>
          </div>

          {/* Closest active fire — stat with mini bearing arrow */}
          <div style={{
            background: ae.surface, border: ae.cardBorder, borderRadius: ae.radius,
            padding: 14, display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: `rgba(${r.glow}, 0.08)`,
              border: `0.5px solid rgba(${r.glow}, 0.25)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name="flame" size={16} color={r.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow ae={ae}>Closest Active Fire</Eyebrow>
              <div style={{
                marginTop: 3, fontFamily: ae.fontDisplay,
                fontSize: 16, fontWeight: ae.titleWeight,
                letterSpacing: ae.titleTracking, color: ae.text,
                fontVariantNumeric: 'tabular-nums',
              }}>28 <span style={{ color: ae.textDim, fontSize: 12, fontWeight: 400 }}>mi away</span></div>
            </div>
            {/* mini bar visualization */}
            <div style={{
              width: 56, height: 36, position: 'relative',
              display: 'flex', alignItems: 'flex-end', gap: 2.5,
            }}>
              {[8, 14, 20, 28, 22, 16].map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: h, borderRadius: 1,
                  background: i === 3 ? r.color : `rgba(${r.glow}, 0.2)`,
                  boxShadow: i === 3 ? `0 0 8px ${r.color}` : 'none',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* IMMEDIATE PREPARATION section */}
        <div className="ember-fade-up" style={{ padding: '32px 0 0' }}>
          <SectionRibbon ae={ae} color={headingColor} eyebrow={`Action Checklist · ${doneItems}/${checklist.length} Complete`} />
        </div>

        {/* Heading + progress arc row */}
        <div className="ember-fade-up" style={{
          padding: '14px 20px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <h2 style={{
            margin: 0, fontFamily: ae.fontDisplay,
            fontSize: 28, fontWeight: ae.titleWeight, letterSpacing: ae.titleTracking,
            color: headingColor, lineHeight: 1.0, flex: 1,
            textWrap: 'balance',
          }}>Immediate Preparation</h2>
          <ProgressArc value={doneItems} total={checklist.length}
            color={headingColor} glowRgb={r.glow} ae={ae} size={92} />
        </div>

        {/* Checklist — premium card with index numbers + hairline dividers */}
        <div className="ember-fade-up" style={{ padding: '16px 16px 0' }}>
          <Card ae={ae} padding={0} style={{
            background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          }}>
            {checklist.map((it, i) => (
              <div key={it.id} onClick={() => toggle(it.id)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                borderTop: i === 0 ? 'none' : `0.5px solid ${ae.line}`,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <IndexBadge ae={ae} n={i + 1} color={checked[it.id] ? r.color : ae.textMute} />
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: checked[it.id]
                    ? `1.5px solid ${r.color}`
                    : `1.5px solid ${ae.lineStrong}`,
                  background: checked[it.id]
                    ? `linear-gradient(180deg, rgba(${r.glow},1), rgba(${r.glow},0.78))`
                    : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.18s', flexShrink: 0,
                  boxShadow: checked[it.id]
                    ? `0 0 12px rgba(${r.glow}, 0.5), inset 0 1px 0 rgba(255,255,255,0.15)`
                    : 'none',
                }}>
                  {checked[it.id] && <Icon name="check" size={13} color="#fff" strokeWidth={2.5} />}
                </div>
                <span style={{
                  flex: 1, fontFamily: ae.fontBody, fontSize: 14,
                  color: checked[it.id] ? ae.textMute : ae.text,
                  textDecoration: checked[it.id] ? 'line-through' : 'none',
                  transition: 'all 0.18s', lineHeight: 1.35,
                }}>{it.label}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Heading + segmented control row */}
        <div className="ember-fade-up" style={{ padding: '32px 16px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 4px',
          }}>
            <h2 style={{
              margin: 0, fontFamily: ae.fontDisplay,
              fontSize: 24, fontWeight: ae.titleWeight, letterSpacing: ae.titleTracking,
              color: ae.text, lineHeight: 1.0,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="navArrow" size={18} color="#4FA8FF" strokeWidth={1.6} />
              </span>
              Evacuation Routes
            </h2>
          </div>
          <div style={{ marginTop: 14 }}>
            <GlassSegmented ae={ae} value={evac}
              options={[
                { id: 'away',    label: 'Away From Fire' },
                { id: 'shelter', label: 'Nearest Shelter' },
              ]}
              onChange={setEvac} color={evacColor} glowRgb={evacGlow} />
          </div>
        </div>

        {/* Suggested Direction — premium featured card with compass rose */}
        <div className="ember-fade-up" style={{ padding: '14px 16px 0' }}>
          <TiltCardS max={4} style={{
            position: 'relative', overflow: 'hidden',
            background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
            border: `0.5px solid rgba(${evacGlow}, 0.30)`,
            borderRadius: ae.radius,
            boxShadow: `0 24px 50px rgba(${evacGlow}, 0.18), inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}>
            {/* top stripe */}
            <div style={{
              height: 3,
              background: `linear-gradient(90deg, transparent, ${evacColor}, transparent)`,
              boxShadow: `0 0 14px ${evacColor}`,
            }} />
            <GridPattern opacity={0.05} />
            {/* corner glow */}
            <div style={{
              position: 'absolute', bottom: -80, right: -80,
              width: 240, height: 240, borderRadius: '50%',
              background: `radial-gradient(circle, rgba(${evacGlow}, 0.20), transparent 70%)`,
              filter: 'blur(28px)', pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative', padding: 18 }}>
              {/* Eyebrow row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 99, background: evacColor,
                  boxShadow: `0 0 8px ${evacColor}`,
                  animation: 'ember-flicker 1.8s ease-in-out infinite',
                }} />
                <span style={{
                  fontFamily: ae.fontMono, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.16em', color: evacColor,
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}>Suggested Direction</span>
              </div>

              {/* Compass + heading composition */}
              <div style={{
                marginTop: 16, display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ flexShrink: 0 }}>
                  <CompassRose ae={ae} color={evacColor} glowRgb={evacGlow} direction="N" size={108} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: ae.fontDisplay,
                    fontSize: 44, fontWeight: ae.titleWeight, letterSpacing: '-0.04em',
                    color: ae.text, lineHeight: 0.95,
                  }}>Head N</div>
                  <div style={{
                    marginTop: 10, fontFamily: ae.fontMono, fontSize: 11.5,
                    color: ae.textDim, letterSpacing: '0.04em', lineHeight: 1.4,
                  }}>Routing 50 mi away · fire is S at 28 mi</div>
                </div>
              </div>

              {/* Divider */}
              <div style={{
                height: 0.5, marginTop: 18,
                background: `linear-gradient(90deg, transparent, ${ae.lineStrong}, transparent)`,
              }} />

              <p style={{
                margin: '14px 0 0', fontFamily: ae.fontBody, fontSize: 13, lineHeight: 1.55,
                color: ae.textDim,
              }}>Suggestion only — targets a point 50 mi in the opposite direction of the nearest detected fire. Your phone's maps app figures out actual roads. Always follow official guidance from local authorities.</p>

              <div style={{ marginTop: 16 }}>
                <Button ae={ae} variant="primary" full icon="external" color={evacColor}>Get Directions</Button>
              </div>
            </div>
          </TiltCardS>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Incident Details
// ─────────────────────────────────────────────────────────────
const IncidentScreen = ({ ae, risk, accent, onNavigate, fire }) => {
  const r = getRisk(risk, accent);
  const timeline = [
    { t: '14:32', label: 'Containment increased to ' + fire.containment + '%', tag: 'update' },
    { t: '12:08', label: 'Evacuation order issued for Zone 3-B', tag: 'evac' },
    { t: '09:44', label: 'Wind shifted to ' + fire.windDir + ', ' + fire.wind + ' mph', tag: 'wx' },
    { t: '06:15', label: 'Air tanker support deployed', tag: 'ops' },
    { t: 'Yesterday', label: 'Fire reported, evacuation advisory issued', tag: 'init' },
  ];

  return (
    <div className="ember-scroll" style={{
      position: 'absolute', inset: 0, paddingTop: 56,
      paddingBottom: 110, overflowY: 'auto', background: ae.bg,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 44,
      }}>
        <button onClick={() => onNavigate('map')} style={{
          background: 'transparent', border: 'none', color: ae.textDim, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, fontFamily: ae.fontBody, fontSize: 14,
        }}>
          <Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} /> Map
        </button>
        <Eyebrow ae={ae}>Incident</Eyebrow>
        <button onClick={() => onNavigate('share')} style={{
          background: 'transparent', border: 'none', color: ae.textDim, cursor: 'pointer',
          padding: 4,
        }}>
          <Icon name="share" size={16} />
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding: '6px 20px 0' }}>
        <RiskPill risk={r} ae={ae} />
        <h1 style={{
          margin: '12px 0 4px',
          fontFamily: ae.fontDisplay,
          fontSize: 30, fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking, lineHeight: 1.05,
          color: ae.text,
        }}>{fire.name}</h1>
        <div style={{
          fontFamily: ae.fontMono, fontSize: 12, color: ae.textDim,
          letterSpacing: '0.04em',
        }}>{fire.region} · ID #{fire.id}</div>
      </div>

      {/* Quick stats */}
      <div style={{ padding: '16px 16px 0' }}>
        <Card ae={ae} padding={0}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {[
              { l: 'Size', v: fire.acres, u: 'acres', accent: false },
              { l: 'Containment', v: fire.containment, u: '%', accent: true },
              { l: 'Distance', v: fire.distance, u: 'mi', accent: false },
              { l: 'Personnel', v: fire.personnel, u: 'on scene', accent: false },
            ].map((s, i) => (
              <div key={s.l} style={{
                padding: 16,
                borderRight: i % 2 === 0 ? `0.5px solid ${ae.line}` : 'none',
                borderBottom: i < 2 ? `0.5px solid ${ae.line}` : 'none',
              }}>
                <Eyebrow ae={ae}>{s.l}</Eyebrow>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{
                    fontFamily: ae.fontDisplay, fontSize: 24, fontWeight: ae.titleWeight,
                    letterSpacing: ae.titleTracking,
                    color: s.accent ? r.color : ae.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{s.v}</span>
                  <span style={{ fontFamily: ae.fontMono, fontSize: 11, color: ae.textDim }}>{s.u}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Wind / spread visualization */}
      <div style={{ padding: '16px 16px 0' }}>
        <Card ae={ae} padding={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Eyebrow ae={ae}>Spread Forecast (Next 12h)</Eyebrow>
            <span style={{
              fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
            }}>NWS</span>
          </div>
          <div style={{ position: 'relative', height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="270" height="130" viewBox="0 0 270 130">
              <defs>
                <radialGradient id="wind-cone" cx="20%" cy="50%" r="80%">
                  <stop offset="0%" stopColor={r.color} stopOpacity="0.5" />
                  <stop offset="60%" stopColor={r.color} stopOpacity="0.15" />
                  <stop offset="100%" stopColor={r.color} stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Compass */}
              <circle cx="55" cy="65" r="42" fill="none" stroke={ae.line} strokeWidth="0.5" />
              <circle cx="55" cy="65" r="28" fill="none" stroke={ae.line} strokeWidth="0.5" strokeDasharray="2 3" />
              {['N','E','S','W'].map((d, i) => {
                const a = i * 90 - 90;
                const x = 55 + Math.cos(a * Math.PI / 180) * 50;
                const y = 65 + Math.sin(a * Math.PI / 180) * 50;
                return <text key={d} x={x} y={y + 3} textAnchor="middle"
                       fontFamily={ae.fontMono} fontSize="9" fill={ae.textMute}>{d}</text>;
              })}
              {/* Wind arrow */}
              <g transform={`rotate(${fire.windAngle - 90} 55 65)`}>
                <line x1="55" y1="65" x2="95" y2="65" stroke={r.color} strokeWidth="2" strokeLinecap="round" />
                <polygon points="92,60 100,65 92,70" fill={r.color} />
              </g>
              <circle cx="55" cy="65" r="3" fill={r.color} />

              {/* Spread cone */}
              <ellipse cx="180" cy="65" rx="80" ry="40" fill="url(#wind-cone)" />
              <circle cx="140" cy="65" r="6" fill={r.color}
                      style={{ filter: `drop-shadow(0 0 8px ${r.color})` }} />
              {/* Hour ticks */}
              {[3, 6, 9, 12].map((h, i) => (
                <g key={h}>
                  <line x1={150 + i * 24} y1="55" x2={150 + i * 24} y2="75"
                        stroke={ae.lineStrong} strokeWidth="0.5" strokeDasharray="2 2" />
                  <text x={150 + i * 24} y="92" textAnchor="middle"
                        fontFamily={ae.fontMono} fontSize="8.5" fill={ae.textMute}>+{h}h</text>
                </g>
              ))}
            </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 10, borderTop: `0.5px solid ${ae.line}` }}>
            <div>
              <Eyebrow ae={ae}>Wind</Eyebrow>
              <div style={{ marginTop: 4, fontFamily: ae.fontMono, fontSize: 13, color: ae.text }}>
                {fire.windDir} {fire.wind} mph
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Eyebrow ae={ae}>Affected Zones</Eyebrow>
              <div style={{ marginTop: 4, fontFamily: ae.fontMono, fontSize: 13, color: ae.text }}>
                3-B, 4-A, 4-C
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Timeline */}
      <div style={{ padding: '16px 16px 0' }}>
        <Eyebrow ae={ae}>Timeline</Eyebrow>
        <div style={{ marginTop: 12, paddingLeft: 4 }}>
          {timeline.map((e, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, paddingBottom: 16,
              position: 'relative',
            }}>
              {i < timeline.length - 1 && (
                <div style={{
                  position: 'absolute', left: 5, top: 14, bottom: 0,
                  width: 0.5, background: ae.line,
                }} />
              )}
              <div style={{
                width: 11, height: 11, borderRadius: 99, marginTop: 3,
                background: i === 0 ? r.color : ae.surface2,
                border: `1.5px solid ${i === 0 ? r.color : ae.lineStrong}`,
                boxShadow: i === 0 ? `0 0 10px ${r.color}` : 'none',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, paddingTop: 0 }}>
                <div style={{
                  fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
                  letterSpacing: '0.06em',
                  textTransform: ae.chipUpper ? 'uppercase' : 'none',
                }}>{e.t} · {e.tag}</div>
                <div style={{
                  marginTop: 3, fontFamily: ae.fontBody, fontSize: 14,
                  color: ae.text, lineHeight: 1.35,
                }}>{e.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Shareable Alert Card
// ─────────────────────────────────────────────────────────────
const ShareScreen = ({ ae, risk, accent, onNavigate, fire, location }) => {
  const r = getRisk(risk, accent);
  const [copied, setCopied] = React.useState(false);
  const headlines = {
    low: 'All Clear',
    moderate: 'Stay Aware',
    high: 'Active Fire Nearby',
    extreme: 'Evacuate Now',
  };
  const instructions = {
    low: 'No action needed.',
    moderate: 'Monitor conditions and prepare.',
    high: 'Pack go-bag. Stand by for orders.',
    extreme: 'Leave immediately. Use evac route.',
  };

  return (
    <div className="ember-scroll" style={{
      position: 'absolute', inset: 0, paddingTop: 56,
      paddingBottom: 110, overflowY: 'auto', background: ae.bg,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 44,
      }}>
        <button onClick={() => onNavigate('home')} style={{
          background: 'transparent', border: 'none', color: ae.textDim, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, fontFamily: ae.fontBody, fontSize: 14,
        }}>
          <Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} /> Back
        </button>
        <Eyebrow ae={ae}>Share Alert</Eyebrow>
        <div style={{ width: 50 }} />
      </div>

      <div style={{ padding: '8px 20px 0' }}>
        <h1 style={{
          margin: 0,
          fontFamily: ae.fontDisplay,
          fontSize: 26, fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking, lineHeight: 1.1,
          color: ae.text,
        }}>Send a clear, calm update</h1>
        <p style={{
          margin: '6px 0 0',
          fontFamily: ae.fontBody, fontSize: 14, lineHeight: 1.45,
          color: ae.textDim,
        }}>Designed for messages and social. Family-friendly, no jargon.</p>
      </div>

      {/* The shareable card */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: ae.radiusLg,
          background: `linear-gradient(180deg, ${ae.surface2}, ${ae.surface})`,
          border: `0.5px solid rgba(${r.glow}, 0.30)`,
          padding: 22,
          boxShadow: `0 20px 60px rgba(${r.glow}, 0.20)`,
        }}>
          {/* Glow */}
          <div style={{
            position: 'absolute', top: -50, right: -50,
            width: 200, height: 200, borderRadius: '50%',
            background: `radial-gradient(circle, rgba(${r.glow}, 0.4), transparent 70%)`,
            filter: 'blur(20px)',
          }} />
          {/* Brand */}
          <div style={{
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 26,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: r.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 12px ${r.color}`,
              }}>
                <Icon name="flame" size={15} color="#fff" strokeWidth={2} />
              </div>
              <span style={{
                fontFamily: ae.fontDisplay, fontSize: 14, fontWeight: 700,
                letterSpacing: '0.02em', color: ae.text,
              }}>EMBER</span>
            </div>
            <span style={{
              fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
              letterSpacing: '0.08em',
              textTransform: ae.chipUpper ? 'uppercase' : 'none',
            }}>14:32 · Apr 28</span>
          </div>

          {/* Risk pill */}
          <div style={{ position: 'relative' }}>
            <RiskPill risk={r} ae={ae} />
          </div>

          {/* Headline */}
          <h2 style={{
            position: 'relative',
            margin: '14px 0 6px',
            fontFamily: ae.fontDisplay,
            fontSize: 36, fontWeight: ae.titleWeight,
            letterSpacing: ae.titleTracking, lineHeight: 1.0,
            color: ae.text, textWrap: 'balance',
          }}>{headlines[risk]}</h2>

          <div style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: ae.fontMono, fontSize: 12, color: ae.textDim,
            letterSpacing: '0.04em',
            marginBottom: 18,
          }}>
            <Icon name="pin" size={12} /> {location}
            {risk !== 'low' && <> · {fire.distance} mi from {fire.name}</>}
          </div>

          {/* Instruction box */}
          <div style={{
            position: 'relative',
            padding: '14px 14px',
            background: `rgba(${r.glow}, 0.08)`,
            border: `0.5px solid rgba(${r.glow}, 0.22)`,
            borderRadius: ae.radius,
          }}>
            <Eyebrow ae={ae} color={r.color}>What to do</Eyebrow>
            <div style={{
              marginTop: 4, fontFamily: ae.fontDisplay,
              fontSize: 17, fontWeight: 500,
              letterSpacing: ae.titleTracking,
              color: ae.text, lineHeight: 1.35,
            }}>{instructions[risk]}</div>
          </div>

          {/* Footer */}
          <div style={{
            position: 'relative',
            marginTop: 18, paddingTop: 14,
            borderTop: `0.5px solid ${ae.line}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{
              fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
              letterSpacing: '0.04em',
            }}>ember.app/alert/{fire.id}</span>
            <span style={{
              fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
              letterSpacing: '0.04em',
            }}>Source: CAL FIRE · NWS</span>
          </div>
        </div>
      </div>

      {/* Share targets */}
      <div style={{ padding: '20px 16px 0' }}>
        <Eyebrow ae={ae}>Send via</Eyebrow>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { l: 'Message', i: 'bell' },
            { l: 'Email', i: 'share' },
            { l: 'Copy', i: 'download' },
            { l: 'More', i: 'plus' },
          ].map(t => (
            <button key={t.l} onClick={() => { if (t.l === 'Copy') { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
                    style={{
                      padding: '14px 0', borderRadius: ae.radius,
                      background: ae.surface, border: ae.cardBorder,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      cursor: 'pointer',
                    }}>
              <Icon name={t.i} size={18} color={ae.text} />
              <span style={{
                fontFamily: ae.fontMono, fontSize: 10, color: ae.textDim,
                letterSpacing: '0.06em',
                textTransform: ae.chipUpper ? 'uppercase' : 'none',
              }}>{t.l === 'Copy' && copied ? 'Copied!' : t.l}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <Button ae={ae} variant="primary" full icon="share"
                color={r.color}
                onClick={() => {}}>Share Alert</Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Alerts list (tab destination)
// ─────────────────────────────────────────────────────────────
const AlertsScreen = ({ ae, risk, accent, onNavigate, fires }) => {
  const items = [
    { t: '2 min ago', title: 'Containment increased to 22%', sev: 'high', tag: 'Update' },
    { t: '38 min ago', title: 'Evacuation order: Zone 3-B', sev: 'extreme', tag: 'Evacuation' },
    { t: '2 hr ago', title: 'Wind shift expected this evening', sev: 'moderate', tag: 'Weather' },
    { t: 'Yesterday', title: 'New fire detected: Tilden Ridge', sev: 'high', tag: 'New Fire' },
    { t: 'Yesterday', title: 'Air quality advisory issued', sev: 'moderate', tag: 'Air Quality' },
    { t: '3 days ago', title: 'Red Flag warning for region', sev: 'moderate', tag: 'Forecast' },
  ];

  return (
    <div className="ember-scroll" style={{
      position: 'absolute', inset: 0, paddingTop: 56,
      paddingBottom: 110, overflowY: 'auto', background: ae.bg,
    }}>
      <div style={{ padding: '8px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{
          margin: 0, fontFamily: ae.fontDisplay,
          fontSize: 32, fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking,
          color: ae.text,
        }}>Alerts</h1>
        <Icon name="settings" size={20} color={ae.textDim} />
      </div>

      <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => {
          const ir = getRisk(it.sev, accent);
          return (
            <Card key={i} ae={ae} padding={14}
                  onClick={() => onNavigate(i === 1 ? 'incident' : 'home')}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: ae.radius,
                  background: `rgba(${ir.glow}, 0.12)`,
                  border: `0.5px solid rgba(${ir.glow}, 0.25)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon name="bell" size={16} color={ir.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{
                      fontFamily: ae.fontMono, fontSize: 10, color: ir.color,
                      letterSpacing: '0.08em',
                      textTransform: ae.chipUpper ? 'uppercase' : 'none',
                      fontWeight: 600,
                    }}>{it.tag}</span>
                    <span style={{
                      fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
                    }}>{it.t}</span>
                  </div>
                  <div style={{
                    marginTop: 4, fontFamily: ae.fontBody, fontSize: 14,
                    color: ae.text, lineHeight: 1.35,
                  }}>{it.title}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

Object.assign(window, { SafetyScreen, IncidentScreen, ShareScreen, AlertsScreen, AppHeader, HeaderDivider, ScreenVignette, EyebrowPill, FeatureCard });

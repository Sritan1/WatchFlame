// home.jsx — Home / Alert Status screen

const { useState: useStateH, useEffect: useEffectH } = React;
const EmberBackground = window.EmberBackground;
const TiltCard = window.TiltCard;
const AnimatedNumber = window.AnimatedNumber;
const CursorParallax = window.CursorParallax;
const HeroOrb = window.HeroOrb;
const ShimmerPill = window.ShimmerPill;
const Sparkline = window.Sparkline;
const WindDial = window.WindDial;

// Word-by-word stagger
const Stagger = ({ text, baseDelay = 60, startDelay = 0, style }) => {
  const words = text.split(' ');
  return (
    <span style={style}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span className="px-word" style={{ animationDelay: `${startDelay + i * baseDelay}ms` }}>
            {w}
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </React.Fragment>
      ))}
    </span>
  );
};

const HomeScreen = ({ ae, risk, accent, pulseSpeed, bgStyle, onNavigate, location, fire }) => {
  const isAlarming = risk === 'high' || risk === 'extreme';
  const r = getRisk(risk, accent);
  const pulseDur = 4 - (pulseSpeed / 100) * 2.5; // 1.5s..4s

  // Synthesized distance trend over the last few hours
  const distanceTrend = React.useMemo(() => {
    const base = risk === 'low' ? 32 : parseFloat(fire.distance);
    const trend = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      // gradually closer if alarming, drifting if not
      const drift = (Math.sin(i * 1.3) * 0.6 + (Math.random() - 0.5) * 0.4);
      const val = isAlarming ? (base + 4 - t * 4 + drift) : (base + drift * 1.5);
      trend.push(val);
    }
    return trend;
  }, [risk, fire.distance, isAlarming]);

  const headlineMap = {
    low: 'No Nearby Fires',
    moderate: 'Smoke Advisory',
    high: 'Fire Detected Nearby',
    extreme: 'Evacuate Immediately',
  };
  const subMap = {
    low: 'Conditions are calm. No active fires within 30 mi.',
    moderate: 'Air quality reduced. Stay informed for changes.',
    high: 'Active fire in your area. Prepare to evacuate.',
    extreme: 'Mandatory evacuation order in effect for your zone.',
  };

  // Status orb — concentric pulse rings + rotating glass rings + cursor parallax
  const Orb = () => {
    return (
      <CursorParallax strength={10}>
      <div style={{
        position: 'relative', width: 220, height: 220,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto',
      }}>
        {/* Outer pulse rings */}
        {isAlarming && [0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute', width: 90, height: 90, borderRadius: '50%',
            border: `1px solid ${r.color}`,
            animation: `ember-pulse-2 ${pulseDur}s cubic-bezier(0.2, 0.7, 0.3, 1) infinite`,
            animationDelay: `${i * (pulseDur / 3)}s`,
          }} />
        ))}

        {/* Slow rotating glass rings — Saturn-style depth */}
        <div className="px-ring" style={{
          position: 'absolute', width: 200, height: 90, borderRadius: '50%',
          border: `0.5px solid rgba(255,255,255,0.10)`,
          transform: 'rotate(0deg)',
          boxShadow: `inset 0 0 20px rgba(${r.glow}, ${isAlarming ? 0.15 : 0.05})`,
        }} />
        <div className="px-ring-rev" style={{
          position: 'absolute', width: 170, height: 70, borderRadius: '50%',
          border: `0.5px dashed rgba(${r.glow}, ${isAlarming ? 0.35 : 0.12})`,
          transform: 'rotate(20deg)',
        }} />
        <div className="px-ring" style={{
          position: 'absolute', width: 150, height: 150, borderRadius: '50%',
          border: `0.5px solid rgba(255,255,255,0.06)`,
        }} />

        {/* Soft glow */}
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${r.glow}, ${isAlarming ? 0.32 : 0.10}) 0%, transparent 60%)`,
          filter: 'blur(10px)',
        }} />

        {/* Core */}
        <div style={{
          position: 'relative', width: 96, height: 96, borderRadius: '50%',
          background: isAlarming
            ? `radial-gradient(circle at 30% 30%, ${r.color}, rgba(${r.glow}, 0.6) 60%, rgba(${r.glow}, 0.2))`
            : `radial-gradient(circle at 30% 30%, ${ae.surface2}, ${ae.surface})`,
          border: `0.5px solid rgba(${r.glow}, ${isAlarming ? 0.6 : 0.15})`,
          boxShadow: isAlarming
            ? `0 0 60px rgba(${r.glow}, 0.45), inset 0 0 30px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,0.3)`
            : `inset 0 0 20px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: isAlarming ? `ember-flicker ${pulseDur * 0.7}s ease-in-out infinite` : 'none',
        }}>
          {/* Inner highlight (glass reflection) */}
          <div style={{
            position: 'absolute', top: 8, left: 14, width: 36, height: 18, borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.45), transparent 70%)',
            filter: 'blur(2px)',
            opacity: 0.7,
          }} />
          <Icon name={isAlarming ? 'flame' : 'shield'} size={38}
                color={isAlarming ? '#fff' : ae.textDim} strokeWidth={1.5} />
        </div>
      </div>
      </CursorParallax>
    );
  };

  return (
    <div className="ember-scroll" style={{
      position: 'absolute', inset: 0, paddingTop: 56,
      paddingBottom: 110, overflowY: 'auto', background: ae.bg,
    }}>
      {/* Animated background */}
      <EmberBackground ae={ae} risk={risk} accent={accent} pulseSpeed={pulseSpeed} style={bgStyle} />

      {/* Content sits above background */}
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Top bar — location + settings */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 44,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="pin" size={14} color={ae.textDim} strokeWidth={1.6} />
          <span style={{
            fontFamily: ae.fontMono, fontSize: 11, color: ae.textDim,
            letterSpacing: '0.06em',
            textTransform: ae.chipUpper ? 'uppercase' : 'none',
          }}>{location}</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
          letterSpacing: '0.08em',
          textTransform: ae.chipUpper ? 'uppercase' : 'none',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: '#3FB68B' }} />
          Live · 9:41
        </div>
      </div>

      {/* Status orb */}
      <div className="ember-fade-up" style={{ marginTop: 14, marginBottom: 14 }}>
        <HeroOrb ae={ae} risk={risk} accent={accent} pulseSpeed={pulseSpeed} getRisk={getRisk} />
      </div>

      {/* Headline */}
      <div className="ember-fade-up" style={{ padding: '0 24px', textAlign: 'center', marginBottom: 4 }}>
        <ShimmerPill risk={r} ae={ae} />
      </div>
      <div style={{ padding: '0 24px', textAlign: 'center', marginTop: 12 }}>
        <h1 key={risk} style={{
          margin: 0,
          fontFamily: ae.fontDisplay,
          fontSize: 38, fontWeight: ae.titleWeight,
          letterSpacing: ae.titleTracking, lineHeight: 1.05,
          color: ae.text, textWrap: 'balance',
        }}>
          <Stagger text={headlineMap[risk]} baseDelay={70} startDelay={140} />
        </h1>
        <p key={risk + '-p'} className="ember-fade-up" style={{
          margin: '10px auto 0', maxWidth: 280,
          fontFamily: ae.fontBody, fontSize: 14.5, lineHeight: 1.45,
          color: ae.textDim,
          animationDelay: '420ms',
        }}>{subMap[risk]}</p>
      </div>

      {/* Distance + Wind cards */}
      <div className="ember-fade-up" style={{ padding: '24px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <TiltCard style={{
          background: ae.surface, border: ae.cardBorder, borderRadius: ae.radius, padding: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Eyebrow ae={ae}>Nearest Fire</Eyebrow>
            <Sparkline data={distanceTrend} color={isAlarming ? r.color : ae.textDim}
                       ae={ae} width={50} height={18} />
          </div>
          <div style={{
            marginTop: 8, fontFamily: ae.fontDisplay,
            fontSize: 28, fontWeight: ae.titleWeight,
            letterSpacing: ae.titleTracking,
            color: isAlarming ? r.color : ae.text,
            fontVariantNumeric: 'tabular-nums',
          }}>
            <AnimatedNumber value={risk === 'low' ? 32.4 : parseFloat(fire.distance)}
                            format={(n) => n.toFixed(1)} />
            <span style={{ fontSize: 13, color: ae.textDim, marginLeft: 4, fontWeight: 400 }}>mi</span>
          </div>
          <div style={{
            marginTop: 4, fontFamily: ae.fontMono, fontSize: 11, color: ae.textDim,
            letterSpacing: '0.04em',
          }}>
            {risk === 'low' ? 'Out of range' : `${fire.bearing} of you`}
          </div>
        </TiltCard>
        <TiltCard style={{
          background: ae.surface, border: ae.cardBorder, borderRadius: ae.radius, padding: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Eyebrow ae={ae}>Wind</Eyebrow>
            <WindDial angle={fire.windAngle} color={isAlarming ? r.color : ae.text}
                      ae={ae} size={44} unit="" />
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontFamily: ae.fontDisplay, fontSize: 28, fontWeight: ae.titleWeight,
              letterSpacing: ae.titleTracking, color: ae.text,
              fontVariantNumeric: 'tabular-nums',
            }}>
              <AnimatedNumber value={fire.wind} format={(n) => Math.round(n)} />
            </span>
            <span style={{ fontSize: 13, color: ae.textDim }}>mph</span>
          </div>
          <div style={{
            marginTop: 4, fontFamily: ae.fontMono, fontSize: 11, color: ae.textDim,
            letterSpacing: '0.04em',
          }}>
            {fire.windDir} → toward you
          </div>
        </TiltCard>
      </div>

      {/* Active incident card */}
      {isAlarming && (
        <div className="ember-fade-up" style={{ padding: '10px 16px 0' }}>
          <TiltCard max={4} style={{
            background: ae.surface,
            border: `0.5px solid rgba(${r.glow}, 0.30)`,
            borderRadius: ae.radius,
            overflow: 'hidden',
            cursor: 'pointer',
            boxShadow: `0 18px 40px rgba(${r.glow}, 0.15), 0 1px 0 rgba(255,255,255,0.05) inset`,
          }} onClick={() => onNavigate('incident')}>
            {/* Top stripe with glow */}
            <div style={{
              height: 3,
              background: `linear-gradient(90deg, transparent, ${r.color}, transparent)`,
              boxShadow: `0 0 12px ${r.color}`,
            }} />
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Eyebrow ae={ae} color={r.color}>Active Incident</Eyebrow>
                  <div style={{
                    marginTop: 6, fontFamily: ae.fontDisplay,
                    fontSize: 20, fontWeight: ae.titleWeight,
                    letterSpacing: ae.titleTracking, color: ae.text,
                  }}>{fire.name}</div>
                </div>
                <div style={{
                  width: 30, height: 30, borderRadius: 99,
                  background: `rgba(${r.glow}, 0.10)`,
                  border: `0.5px solid rgba(${r.glow}, 0.25)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform 0.3s cubic-bezier(0.2, 0.7, 0.3, 1)',
                }} className="px-icon">
                  <Icon name="chevron" size={14} color={r.color} />
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { l: 'Size', v: fire.acres, suffix: ' ac', anim: false },
                  { l: 'Containment', v: fire.containment, suffix: '%', anim: true },
                  { l: 'Updated', v: fire.updated, suffix: '', anim: false },
                ].map(s => (
                  <div key={s.l}>
                    <div style={{
                      fontFamily: ae.fontMono, fontSize: 9.5, color: ae.textMute,
                      letterSpacing: '0.08em',
                      textTransform: ae.chipUpper ? 'uppercase' : 'none',
                    }}>{s.l}</div>
                    <div style={{
                      marginTop: 3, fontFamily: ae.fontMono, fontSize: 14,
                      color: ae.text, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {s.anim
                        ? <><AnimatedNumber value={s.v} format={(n) => Math.round(n)} />{s.suffix}</>
                        : (s.v + s.suffix)}
                    </div>
                  </div>
                ))}
              </div>
              {/* Containment bar with animated fill + traveling sweep */}
              <div style={{
                marginTop: 14, height: 4, borderRadius: 99,
                background: ae.line, overflow: 'hidden', position: 'relative',
              }}>
                <div style={{
                  width: `${fire.containment}%`, height: '100%',
                  background: `linear-gradient(90deg, rgba(${r.glow}, 0.7), ${r.color})`,
                  borderRadius: 99,
                  boxShadow: `0 0 10px ${r.color}`,
                  transition: 'width 1.2s cubic-bezier(0.3, 1, 0.4, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div className="px-sweep" />
                </div>
              </div>
            </div>
          </TiltCard>
        </div>
      )}

      {/* CTAs */}
      <div className="ember-fade-up" style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button ae={ae} variant="primary" full icon="map"
                color={isAlarming ? r.color : null}
                onClick={() => onNavigate('map')}>View Live Map</Button>
        <Button ae={ae} variant="secondary" full icon="package"
                onClick={() => onNavigate('safety')}>Safety Actions</Button>
      </div>

      {/* Risk meter */}
      <div className="ember-fade-up" style={{ padding: '20px 16px 0' }}>
        <Card ae={ae} padding={14}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Eyebrow ae={ae}>Regional Risk Index</Eyebrow>
            <span style={{
              fontFamily: ae.fontMono, fontSize: 10, color: ae.textMute,
            }}>CAL FIRE · NWS</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['low', 'moderate', 'high', 'extreme'].map((lv, i) => {
              const lr = getRisk(lv, accent);
              const active = i <= ['low','moderate','high','extreme'].indexOf(risk);
              return (
                <div key={lv} style={{ flex: 1 }}>
                  <div className={`px-bar ${lv === risk ? 'px-bar-active' : ''}`} style={{
                    height: 6, borderRadius: 2,
                    background: active ? `linear-gradient(180deg, ${lr.color}, rgba(${lr.glow}, 0.7))` : ae.line,
                    animationDelay: `${i * 90}ms`,
                    '--bar-color': active && lv === risk ? lr.color : 'transparent',
                  }} />
                  <div style={{
                    marginTop: 6, fontFamily: ae.fontMono, fontSize: 9.5,
                    color: lv === risk ? lr.color : ae.textMute,
                    letterSpacing: '0.08em',
                    textTransform: ae.chipUpper ? 'uppercase' : 'none',
                    fontWeight: lv === risk ? 600 : 400,
                    transition: 'color 0.3s ease',
                  }}>{lr.label}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      </div>
    </div>
  );
};

window.HomeScreen = HomeScreen;

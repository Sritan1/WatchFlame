# Ember — Premium UI Playbook

A practical guide to replicating the visual language, motion, and interaction patterns from this project. Written for future Claude sessions; reads top-to-bottom or as a reference.

The goal of this style: **cinematic, instrument-panel feel** — glassy, layered, slightly futuristic, with motion that always *means something*. Not gimmicky. Every animation should reinforce state, draw the eye to what matters, or reward interaction.

---

## 1. Foundational Principles

1. **Restraint first, drama second.** Most surfaces are quiet. Reserve the heavy treatment (sweeping arcs, scan beams, pulse rings) for one *hero* element per screen.
2. **Motion = state.** If something animates, it should be communicating something — risk level, freshness, progress, focus. Never animate for decoration.
3. **Depth through layers, not shadows.** Build depth with stacked translucent surfaces, subtle borders, inner highlights, and inset shadows — not chunky drop shadows.
4. **Tabular numerics + mono labels.** Mixed mono-eyebrow + display-numeric is the look. Lock numbers with `font-variant-numeric: tabular-nums`.
5. **One accent at a time.** A "risk color" (or product accent) drives glow, arcs, highlights, active states. Don't introduce a second hue unless it carries semantic meaning.
6. **Respect the background.** Animated backgrounds are calm. Interface elements get the creativity. Always vignette + scrim where text sits.

---

## 2. The Token System

Every component takes an `ae` (aesthetic) prop. This is the single source of truth for styling and lets you swap aesthetics globally.

```js
const AESTHETICS = {
  gov: {
    bg: '#0B0E12', surface: '#10141B', surface2: '#161B24',
    line: 'rgba(255,255,255,0.07)', lineStrong: 'rgba(255,255,255,0.14)',
    text: '#F2F4F7', textDim: 'rgba(255,255,255,0.62)', textMute: 'rgba(255,255,255,0.42)',
    fontDisplay: '"Inter Tight", system-ui, sans-serif',
    fontBody: '"Inter", system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
    radius: 12, radiusLg: 16,
    cardBorder: '0.5px solid rgba(255,255,255,0.09)',
    titleWeight: 700, titleTracking: '-0.02em',
    chipUpper: true,
  },
  // ...startup, tactical
};
```

**Rules of thumb:**
- 3 text tiers: `text` (high), `textDim` (60-65%), `textMute` (40-45%).
- 2 surface tiers: `surface` (cards), `surface2` (inset / nested).
- Borders are always `0.5px` — never 1px. Looks crisper, more premium.
- Two radii: `radius` (most things) and `radiusLg` (hero cards, tab bar shell).

**Risk / accent colors** carry both a `color` and a `glow` (rgb triplet) so you can build rgba shadows on the fly:

```js
{ color: '#FF7A3A', glow: '255, 122, 58' }
// Use: boxShadow: `0 0 24px rgba(${r.glow}, 0.4)`
```

---

## 3. Typography

| Use | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Hero headline | Display | 32–40 px | 600–700 | -0.025em |
| Card title | Display | 16–20 px | 600 | -0.01em |
| Body | Body | 14–14.5 px | 400–500 | 0 |
| Eyebrow / chip | Mono | 10–11 px | 500–600 | +0.08–0.12em, UPPERCASE |
| Numeric value | Display, tabular | 24–28 px | 600+ | -0.02em |
| Metric label | Mono | 9.5–11 px | 500 | +0.06em, often UPPERCASE |

**The mono eyebrow is the signature.** Every section gets one. Short, uppercase, tracked out, muted — this is what makes the UI feel like an instrument.

```jsx
<div style={{
  fontFamily: ae.fontMono, fontSize: 10.5,
  color: ae.textMute, letterSpacing: '0.12em',
  textTransform: ae.chipUpper ? 'uppercase' : 'none',
  fontWeight: 500,
}}>SECTION LABEL</div>
```

---

## 4. The Core Microinteraction Primitives

Build these once, use them everywhere. They live in `interactions.jsx`.

### `AnimatedNumber`
Smoothly counts to a value. Re-runs when value changes. Use for every numeric metric.

```jsx
<AnimatedNumber value={42.7} format={(n) => n.toFixed(1)} duration={1100} />
```

Easing: `1 - Math.pow(1 - t, 3.2)` — fast start, soft landing. Don't use ease-in-out; numbers landing should feel decisive.

### `TiltCard`
Subtle 3D tilt that follows the cursor + cursor-position-aware shine. Exposes `--mx`, `--my` CSS variables for child glow effects.

Core math:
```js
const x = (e.clientX - rect.left) / rect.width;   // 0..1
const y = (e.clientY - rect.top)  / rect.height;
const rx = (0.5 - y) * MAX_DEG * 2;
const ry = (x - 0.5) * MAX_DEG * 2;
el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.012)`;
```

**Tilt max:** 4–6 degrees. More than that breaks the "interface" feel.
**Transition out:** 0.45s with `cubic-bezier(0.2, 0.7, 0.3, 1)` so the card eases home, never snaps.

### `ScreenTransition`
Wraps content keyed by `keyId`. On change: scale-down + slight blur + fade-out, swap, fade-in. ~380ms total.

```jsx
<ScreenTransition keyId={screen}>{screens[screen]}</ScreenTransition>
```

Phase out is **45% of duration** — start drawing the new screen before the old is fully gone for a sense of momentum.

### `CursorParallax`
Translates children based on cursor distance from element center. Use for the hero orb and other focal elements.

**Strength:** 6–14px is the sweet spot. The transition is slow (0.6s) so it drifts rather than tracks.

### `Ripple`
Click ripple from cursor origin. Add to any clickable card.

```jsx
<Ripple color="rgba(255,255,255,0.35)">
  <button>...</button>
</Ripple>
```

---

## 5. The Premium Component Patterns

### 5.1 The Cinematic Orb (HeroOrb)
One per screen. The visual anchor. Layered:

1. **Outermost: pulse rings.** 2–3 expanding circles when state is alarming. Each `border: 1px solid ${color}`, animation `ember-pulse-2` (scale 0.8 → 3.2, opacity 0.6 → 0), staggered delays.
2. **Soft glow.** A blurred radial-gradient div behind everything.
3. **Tick ring.** 60 SVG tick marks; long every 5 (0.9 stroke), short between (0.5 stroke, lower opacity).
4. **Track + arc.** Full faint circle as track, gradient-stroked arc as fill. Use `strokeDasharray` to set how much shows. `linearGradient` along the arc gives it depth.
5. **Endpoint dot.** Bright color core inside a glowing outer at the tip of the arc, computed from arc ratio.
6. **Counter-rotating dashed ring.** Inside the arc, slow rotation (22s linear infinite), `strokeDasharray="2 5"`. Sells "alive."
7. **Scanner sweep.** Only when alarming. A conic pie-slice path filled with a radial gradient, rotated by an infinite animation (6s).
8. **Glassy core.** A small circle with: risk-tinted radial gradient, `0.5px` border, inset shadow stack (white top-highlight + dark bottom-shadow), plus a small blurred white "reflection" ellipse top-left and a `conic-gradient` overlay with `mix-blend-mode: overlay` for shine.

**The arc grows on state change** thanks to `transition: stroke-dasharray 1.2s cubic-bezier(0.3, 1.2, 0.4, 1)`. The 1.2 overshoot makes it feel snappy and physical.

### 5.2 The Glass Card
Default card recipe:

```js
{
  background: ae.surface,
  border: ae.cardBorder,
  borderRadius: ae.radius,
}
```

When alarming/emphasized, add:
- Risk-colored border at low alpha: `border: 0.5px solid rgba(${r.glow}, 0.30)`
- Glow shadow: `boxShadow: 0 18px 40px rgba(${r.glow}, 0.15), 0 1px 0 rgba(255,255,255,0.05) inset`
- A top-edge stripe (3px gradient bar with glow) as a header accent

**Hover effects** (applied via the TiltCard `::before` / `::after`):
- Cursor-positioned soft white radial glow (mix-blend: overlay)
- Border-glow ring using the `mask-composite: exclude` trick

### 5.3 The Shine-Sweep Button
Buttons that feel premium:

```css
.px-btn { overflow: hidden; transition: transform .22s; }
.px-btn::before {
  /* cursor-following soft highlight */
  background: radial-gradient(circle 180px at var(--mx) var(--my),
              rgba(255,255,255,0.22), transparent 60%);
  opacity: 0; transition: opacity .3s;
}
.px-btn:hover::before { opacity: 1; }
.px-btn:hover { transform: translateY(-1px) scale(1.005); }
.px-btn:active { transform: translateY(0) scale(0.985); transition-duration: .08s; }

/* Primary button rotating conic sheen */
.px-btn.px-primary::after {
  inset: -50%; border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0deg,
              rgba(255,255,255,0.18) 30deg, transparent 90deg);
  animation: px-rotate 8s linear infinite;
  mix-blend-mode: overlay;
}
```

On mousemove, JS writes `--mx`/`--my` CSS vars for the cursor-tracking glow. Icons inside primary buttons translate 2px right on hover for "go" affordance.

### 5.4 The Morphing Tab Bar
Bottom nav with a **single thumb that slides between tabs** (springy easing):

```css
.px-tab-thumb {
  position: absolute; top: 8px; bottom: 8px;
  transition: left .45s cubic-bezier(0.5, 1.6, 0.4, 1),
              width .45s cubic-bezier(0.5, 1.6, 0.4, 1),
              background .3s, box-shadow .3s;
}
```

The thumb position is computed from active-tab index. Background is a soft radial gradient in the accent color. The icon of the active tab scales up 8% with a drop-shadow filter glow, and switches stroke weight from 1.5 to 2.

### 5.5 The Shimmer Pill
Replaces a static badge. Built from:
- Risk-tinted gradient background + soft border
- A dot with an outer expanding-ring pulse (`@keyframes ember-pulse`)
- An overlay `<span>` with a 40%-wide white-to-transparent gradient running `px-sweep` infinite (~3.4s) — gives it a continuous sheen.

### 5.6 Sparkline + WindDial (Inline Data Decoration)
Cards become instruments by tucking a tiny SVG visualization in the top-right corner:

- **Sparkline:** Vertical bars, last bar gets the accent color + a pulsing opacity animation + a faint glowing outline. ~50×18 px.
- **WindDial:** 24 tick marks (long every 6), an arrow polygon rotated to the bearing with `transition: transform 0.9s cubic-bezier(0.3, 1.2, 0.4, 1)` — overshoot, snap into place.

Both are pure SVG. No external charting lib needed for these sizes.

### 5.7 Animated Progress Bars
Containment / health bars get two layers:
1. The filled portion: `linear-gradient(90deg, rgba(${glow}, 0.7), ${color})`, `transition: width 1.2s cubic-bezier(0.3, 1, 0.4, 1)`, `boxShadow: 0 0 10px ${color}`
2. Inside, a `<div class="px-sweep">` — 30%-wide white gradient running across, infinite, with a 1s start delay so the bar fills first, then sweeps.

### 5.8 Stagger Headline
Splits text on spaces, wraps each word in `<span class="px-word">`, increments `animation-delay` per word.

```css
@keyframes px-word-in {
  from { opacity: 0; transform: translateY(10px); filter: blur(4px); }
  to   { opacity: 1; transform: translateY(0); filter: blur(0); }
}
```

Word delay: 60–80ms. Start delay: 100–200ms after the surrounding container fades in. The blur-clear is the magic — it feels filmic.

Key the wrapping `<h1>` by your state so React remounts on change and replays the animation.

### 5.9 Risk Meter (Segmented Indicator)
4 vertical bars, all bars up to current state are filled. Each bar gets:
- A staggered rise animation (`animationDelay: i * 90ms`, scaleY from 0)
- The active one gets `.px-bar-active` which runs a continuous box-shadow shimmer (`@keyframes px-bar-shimmer`) — glow intensifies and recedes every 2.4s.

CSS variable trick: pass the bar's accent color as `'--bar-color': lr.color` so the keyframes can reference it.

---

## 6. The Motion Vocabulary

A short, consistent set of easings and timings. Don't invent more.

| Use case | Duration | Easing |
|---|---|---|
| Hover lift / scale | 0.22s | `cubic-bezier(0.2, 0.7, 0.3, 1)` |
| Click compress | 0.08s | same |
| Card tilt return | 0.45s | same |
| Number counter | 1.1s | cubic ease-out (`1 - (1-t)^3.2`) |
| Bar / arc fill | 1.2s | `cubic-bezier(0.3, 1.2, 0.4, 1)` (overshoot) |
| Screen transition | 0.38s | `cubic-bezier(0.2, 0.7, 0.3, 1)` |
| Tab thumb glide | 0.45s | `cubic-bezier(0.5, 1.6, 0.4, 1)` (springy) |
| Word stagger | 0.55s | `cubic-bezier(0.2, 0.7, 0.3, 1)` |

**Keyframe palette** (inject once at app start):

- `ember-pulse` — expanding ring (scale 0.8→2.4, opacity 0.9→0)
- `ember-pulse-2` — bigger expanding ring (scale 0.8→3.2, opacity 0.6→0)
- `ember-flicker` — opacity 0.85↔1
- `ember-fade-up` — opacity 0→1, translateY 8→0
- `px-sweep` — translateX(-100% → 220%) for traveling sheen
- `px-rotate` — full 360° rotation
- `px-ripple` — scale 0→1, opacity 0.5→0
- `px-bar-rise` — scaleY 0→1 with overshoot
- `px-bar-shimmer` — box-shadow glow breathing
- `px-word-in` — opacity + Y + blur for stagger

---

## 7. Depth & Glassmorphism

Every surface gets a recipe of:

1. **Translucent fill** — `rgba(...,  0.45–0.55)` of the surface tone.
2. **0.5px border** — `rgba(255,255,255, 0.08–0.14)`.
3. **Backdrop blur** — `backdrop-filter: blur(20px) saturate(160%)` on overlays / tab bar / floating panels. Skip on backgrounds (expensive + redundant).
4. **Inner top highlight** — `inset 0 1px 0 rgba(255,255,255, 0.05–0.12)`.
5. **Top hairline highlight** (optional, for major surfaces) — an absolutely-positioned 1px-tall `linear-gradient(90deg, transparent, white, transparent)` strip with margins of 24px on each side.
6. **Bottom inset shadow** for spheres/orbs — `inset 0 -10px 20px rgba(0,0,0,0.25)` gives a pinched, weighted bottom edge.

**Outer shadow recipe:**
```
boxShadow:
  inset 0 1px 0 rgba(255,255,255,0.06),
  0 18px 40px rgba(0,0,0,0.55),
  0 0 0 0.5px rgba(255,255,255,0.04)
```

Three layers: inner highlight, outer drop, hairline outline.

---

## 8. Layout Rhythm

Standard mobile screen padding:
- Outer horizontal: 16px for content gutters, 20px for hero/headline blocks
- Section vertical spacing: 16–24px between major blocks
- Card padding: 14px (compact) or 16px (default)
- Stat-card grid: `grid-template-columns: 1fr 1fr` with `gap: 10px`

**Top bar:** 44px height, 0/20px padding, mono micro-eyebrow elements left + right.
**Bottom tab bar:** 64px shell with 12px outer margin, 8px inset for the thumb track. Padded above by a gradient scrim that fades to bg.

---

## 9. Backgrounds (How They Stay Out of the Way)

Backgrounds live behind a `zIndex: 0` div; content wraps in `zIndex: 1`. Each animated background ends with three legibility-protection layers:

```jsx
<>
  <canvas ref={canvasRef} />
  {/* Vignette */}
  <div style={{ background: `radial-gradient(ellipse 90% 70% at 50% 45%, transparent 35%, rgba(0,0,0,0.50) 95%)` }} />
  {/* Top scrim — protects nav */}
  <div style={{ height: 160, background: `linear-gradient(180deg, ${ae.bg}, transparent)`, opacity: 0.55 }} />
  {/* Bottom scrim — protects tab bar */}
  <div style={{ height: 200, background: `linear-gradient(0deg, ${ae.bg}, transparent)`, opacity: 0.7 }} />
</>
```

Always honor `prefers-reduced-motion`: render one static frame and stop the rAF loop.

---

## 10. File / Architecture Conventions

```
tokens.jsx          → AESTHETICS, risk palettes, getRisk()
primitives.jsx      → Icon, Card, Button, RiskPill, StatRow, Eyebrow, TabBar
interactions.jsx    → AnimatedNumber, TiltCard, ScreenTransition, CursorParallax,
                      HeroOrb, ShimmerPill, Sparkline, WindDial, Ripple,
                      injectInteractionStyles
background-*.jsx    → One animated bg variant per file; window.XBackground
background.jsx      → Dispatcher: picks a variant by name
home.jsx, map.jsx, screens.jsx → Per-screen layouts
```

**Critical loading rule** (React + Babel, multiple JSX files):
- Each `<script type="text/babel">` gets its own scope.
- Export everything you share via `Object.assign(window, { ... })` or `window.X = X`.
- Load order matters in the HTML: tokens → primitives → interactions → backgrounds → background dispatcher → screens.
- **Never name your styles object just `styles`** — name it `homeStyles`, `orbStyles`, etc. Style globals collide silently across babel scripts.

**One main HTML file**, multiple JSX modules loaded with `<script type="text/babel" src="...">`. Keep individual JSX files under ~500 lines; split aggressively.

---

## 11. The Anti-Patterns (Don't)

- Don't use 1px borders or chunky drop-shadows. They flatten the depth illusion.
- Don't animate everything on a screen — pick one or two focal elements per surface.
- Don't use rounded corners with a left-border colored accent. AI slop tell.
- Don't gradient-fill backgrounds with strong color saturation. Backgrounds should be quiet.
- Don't put gradients on every button. Reserve gradient + sheen for the primary.
- Don't use emoji unless the brand explicitly requires them.
- Don't use ease-in-out for state-driven motion. Use ease-out (cubic 3.2 power) or springy overshoots.
- Don't snap. Always transition between states. Even color changes get a 200–300ms ease.
- Don't mix more than two type families. Display + mono is the recipe.
- Don't use `scrollIntoView()` — breaks embeds.

---

## 12. Quick Checklist for "Premium-ifying" a Screen

When adding the treatment to a new screen, work through this order:

1. **Pick the hero element.** Replace its plain version with an instrument-style component (orb, dial, ring, or chart with glow).
2. **Animate every number** through `AnimatedNumber`.
3. **Wrap cards in `TiltCard`** with `max={4–5}`. Set the `--mx/--my` shine.
4. **Replace static badges with `ShimmerPill`.**
5. **Add inline micro-charts** (Sparkline / WindDial / mini-bar) in card top-right corners.
6. **Restyle primary buttons** with the conic sheen + cursor highlight.
7. **Stagger the headline** by words with blur-clear.
8. **Bottom nav:** swap any static active state for the morphing thumb.
9. **Wrap the screen in `ScreenTransition`** keyed by route/screen.
10. **Audit motion timings** against the table in §6 — replace one-offs with the standard set.
11. **Audit shadows** — replace any single drop-shadow with the three-layer recipe in §7.
12. **Reduced-motion check** — anything > 0.5s of looping motion needs a static fallback.

---

## 13. The One-Liner Aesthetic Brief

> Glassy, layered, instrument-grade UI with confident typography, single-accent color signaling, and motion that breathes life into data — every transition tells the user what changed, never just decorates.

Build to that and you'll hit the same feeling.

// background.jsx — Ember animated background (Gradient & Wave variant)
// Flowing color fields + soft sine waves. No particles.
// Risk-aware: hue, intensity, and motion scale with risk level.

const WavesBackground = ({ ae, risk, accent, pulseSpeed = 70 }) => {
  const canvasRef = React.useRef(null);
  const r = getRisk(risk, accent);
  const isAlarming = risk === 'high' || risk === 'extreme';
  const isCalm = risk === 'low';

  const palettes = {
    low:      [{r: 90,  g: 160, b: 200}, {r: 110, g: 200, b: 180}, {r: 80,  g: 130, b: 170}],
    moderate: [{r: 232, g: 179, b: 57},  {r: 220, g: 130, b: 60},  {r: 180, g: 100, b: 70}],
    high:     [{r: 255, g: 122, b: 58},  {r: 240, g: 90,  b: 50},  {r: 200, g: 60,  b: 40}],
    extreme:  [{r: 255, g: 100, b: 50},  {r: 240, g: 60,  b: 40},  {r: 180, g: 30,  b: 30}],
  };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, DPR = 1;
    let raf;
    let running = true;

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    const colors = palettes[risk] || palettes.high;
    const intensity = isCalm ? 0.4 : (risk === 'moderate' ? 0.75 : 1.0);
    const speedMult = 0.4 + (pulseSpeed / 100) * 1.0;

    // ── BLOBS: large, slow-drifting radial gradients (the "flowing color fields")
    const BLOB_COUNT = isCalm ? 3 : 4;
    const blobs = [];
    for (let i = 0; i < BLOB_COUNT; i++) {
      blobs.push({
        cx: Math.random(),
        cy: Math.random(),
        rad: 0.45 + Math.random() * 0.35,        // % of max(W,H)
        // Lissajous-ish drift
        ax: 0.18 + Math.random() * 0.20,
        ay: 0.12 + Math.random() * 0.18,
        fx: (0.00006 + Math.random() * 0.00012) * speedMult,
        fy: (0.00005 + Math.random() * 0.00010) * speedMult,
        phx: Math.random() * Math.PI * 2,
        phy: Math.random() * Math.PI * 2,
        color: colors[i % colors.length],
        alpha: (0.30 + Math.random() * 0.18) * intensity,
        // breathing
        breathFreq: (0.0003 + Math.random() * 0.0004) * speedMult,
        breathPhase: Math.random() * Math.PI * 2,
      });
    }

    // ── WAVES: stacked sine bands (filled translucent ribbons)
    const WAVE_COUNT = isCalm ? 3 : 5;
    const waves = [];
    for (let i = 0; i < WAVE_COUNT; i++) {
      waves.push({
        // band centerline as fraction of H
        y: 0.20 + (i / WAVE_COUNT) * 0.85 + (Math.random() - 0.5) * 0.05,
        amp1: 26 + Math.random() * 36,
        amp2: 14 + Math.random() * 22,
        freq1: 0.0010 + Math.random() * 0.0014,
        freq2: 0.0024 + Math.random() * 0.0030,
        speed1: (0.00012 + Math.random() * 0.00022) * speedMult,
        speed2: (0.00020 + Math.random() * 0.00030) * speedMult,
        phase1: Math.random() * Math.PI * 2,
        phase2: Math.random() * Math.PI * 2,
        thickness: 38 + Math.random() * 56, // band fill height
        color: colors[i % colors.length],
        alpha: (0.10 + Math.random() * 0.10) * intensity,
        edgeAlpha: (0.30 + Math.random() * 0.25) * intensity, // outline glow
      });
    }

    let lastT = performance.now();
    const frame = (t) => {
      if (!running) return;
      const dt = Math.min(64, t - lastT);
      lastT = t;

      ctx.clearRect(0, 0, W, H);

      // Composite mode for warm color blending
      const prevComp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = isCalm ? 'lighter' : 'lighter';

      // ── Draw blobs (radial gradients, big & soft)
      const Rmax = Math.max(W, H);
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        b.phx += b.fx * dt;
        b.phy += b.fy * dt;
        b.breathPhase += b.breathFreq * dt;

        const cx = (b.cx + Math.sin(b.phx) * b.ax) * W;
        const cy = (b.cy + Math.cos(b.phy) * b.ay) * H;
        const breath = 0.85 + 0.15 * Math.sin(b.breathPhase);
        const radius = b.rad * Rmax * breath;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        const c = b.color;
        grad.addColorStop(0,   `rgba(${c.r}, ${c.g}, ${c.b}, ${b.alpha})`);
        grad.addColorStop(0.4, `rgba(${c.r}, ${c.g}, ${c.b}, ${b.alpha * 0.45})`);
        grad.addColorStop(0.7, `rgba(${c.r}, ${c.g}, ${c.b}, ${b.alpha * 0.15})`);
        grad.addColorStop(1,   `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Draw waves (filled bands with vertical fade + glowing edge)
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        w.phase1 += w.speed1 * dt;
        w.phase2 += w.speed2 * dt;

        const yMid = w.y * H;
        const half = w.thickness * 0.5;
        const step = 8;

        // Vertical gradient for the band (so it fades out top & bottom)
        const vgrad = ctx.createLinearGradient(0, yMid - half, 0, yMid + half);
        const c = w.color;
        vgrad.addColorStop(0,   `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
        vgrad.addColorStop(0.5, `rgba(${c.r}, ${c.g}, ${c.b}, ${w.alpha})`);
        vgrad.addColorStop(1,   `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);

        // Fill ribbon
        ctx.beginPath();
        // top edge L→R
        for (let x = -20; x <= W + 20; x += step) {
          const off = Math.sin(x * w.freq1 + w.phase1) * w.amp1
                    + Math.sin(x * w.freq2 + w.phase2) * w.amp2;
          const y = yMid + off - half;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        // bottom edge R→L
        for (let x = W + 20; x >= -20; x -= step) {
          const off = Math.sin(x * w.freq1 + w.phase1) * w.amp1
                    + Math.sin(x * w.freq2 + w.phase2) * w.amp2;
          const y = yMid + off + half;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = vgrad;
        ctx.fill();

        // Glowing centerline
        ctx.beginPath();
        for (let x = -20; x <= W + 20; x += step) {
          const off = Math.sin(x * w.freq1 + w.phase1) * w.amp1
                    + Math.sin(x * w.freq2 + w.phase2) * w.amp2;
          const y = yMid + off;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${w.edgeAlpha})`;
        ctx.shadowBlur = 16;
        ctx.shadowColor = `rgba(${c.r}, ${c.g}, ${c.b}, ${w.edgeAlpha * 0.9})`;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.globalCompositeOperation = prevComp;

      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener('resize', resize);
    if (reduced) {
      frame(performance.now());
      running = false;
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [risk, accent, pulseSpeed]);

  // Static layered ambience — risk-tuned base
  const c0 = palettes[risk][0];
  const c1 = palettes[risk][1];
  const c2 = palettes[risk][2];
  const topGlow = isCalm
    ? 'rgba(80, 130, 170, 0.06)'
    : `rgba(${c0.r}, ${c0.g}, ${c0.b}, ${isAlarming ? 0.14 : 0.09})`;
  const bottomGlow = isCalm
    ? 'rgba(60, 100, 140, 0.04)'
    : `rgba(${c1.r}, ${c1.g}, ${c1.b}, ${isAlarming ? 0.16 : 0.10})`;
  const sideGlow = `rgba(${c2.r}, ${c2.g}, ${c2.b}, ${isAlarming ? 0.10 : 0.05})`;

  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden',
      pointerEvents: 'none',
      background: `
        radial-gradient(ellipse 90% 50% at 30% 100%, ${bottomGlow}, transparent 70%),
        radial-gradient(ellipse 70% 40% at 70% -10%, ${topGlow}, transparent 70%),
        radial-gradient(ellipse 40% 80% at 100% 50%, ${sideGlow}, transparent 70%),
        ${ae.bg}
      `,
    }}>
      <canvas ref={canvasRef} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        display: 'block',
      }} />
      {/* Vignette to protect text legibility */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 90% 70% at 50% 45%, transparent 30%, rgba(0,0,0,0.50) 95%)`,
      }} />
      {/* Top + bottom scrims */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 160,
        background: `linear-gradient(180deg, ${ae.bg} 0%, rgba(0,0,0,0.0) 100%)`,
        opacity: 0.6,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 200,
        background: `linear-gradient(0deg, ${ae.bg} 5%, rgba(0,0,0,0.0) 100%)`,
        opacity: 0.7,
      }} />
    </div>
  );
};

window.WavesBackground = WavesBackground;

const N = (n: number) => Array.from({ length: n }, (_, i) => i);

/* ─── Weather — rotating sun glow + rays ─────────────────── */
export function WeatherScene() {
  const rays = N(12).map((i) => {
    const a = (i * 30 * Math.PI) / 180;
    const r1 = 42, r2 = 80 + (i % 3) * 14;
    return { x1: 110 + Math.cos(a) * r1, y1: 110 + Math.sin(a) * r1, x2: 110 + Math.cos(a) * r2, y2: 110 + Math.sin(a) * r2 };
  });

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#040d28 0%,#071840 50%,#040d28 100%)' }} />

      {/* Wide halo */}
      <div className="absolute rounded-full" style={{
        top: '34%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 220, height: 220,
        background: 'radial-gradient(circle,rgba(255,200,60,.07) 0%,transparent 70%)',
        animation: 'agent-glow-p 4s ease-in-out infinite',
      }} />

      {/* Rotating rays */}
      <div className="absolute" style={{
        top: '34%', left: '50%', transform: 'translate(-50%,-50%)',
        animation: 'agent-rays 22s linear infinite',
      }}>
        <svg width="220" height="220" viewBox="0 0 220 220" style={{ overflow: 'visible' }}>
          {rays.map((r, i) => (
            <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
              stroke={`rgba(255,220,80,${0.12 + (i % 3) * 0.06})`}
              strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </svg>
      </div>

      {/* Sun core */}
      <div className="absolute rounded-full" style={{
        top: '34%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 56, height: 56,
        background: 'radial-gradient(circle,#ffe878 0%,#ffc020 55%,transparent 100%)',
        boxShadow: '0 0 40px rgba(255,200,50,.55),0 0 90px rgba(255,170,0,.18)',
        animation: 'agent-glow-p 3s ease-in-out infinite',
      }} />

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── System — radar rings + mini gauge bars ─────────────── */
export function SystemScene() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#011818 0%,#022828 50%,#011818 100%)' }} />

      {/* Dot-grid overlay */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'radial-gradient(circle,rgba(45,212,191,.08) 1px,transparent 1px)',
        backgroundSize: '20px 20px',
      }} />

      {/* Pulsing rings */}
      {N(4).map((i) => (
        <div key={i} className="absolute rounded-full" style={{
          top: '38%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 72, height: 72,
          border: '1px solid rgba(45,212,191,.7)',
          animation: `agent-ring 3.6s ease-out ${i * 0.9}s infinite`,
        }} />
      ))}

      {/* Core dot */}
      <div className="absolute rounded-full" style={{
        top: '38%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 20, height: 20,
        background: 'rgba(45,212,191,.95)',
        boxShadow: '0 0 28px rgba(45,212,191,.7)',
        animation: 'agent-glow-p 2s ease-in-out infinite',
      }} />

      {/* Mini gauge bars */}
      <div className="absolute bottom-5 left-5 right-5 space-y-1" style={{ opacity: .45 }}>
        {[['CPU', 48], ['RAM', 63], ['Disk', 31]] .map(([label, pct]) => (
          <div key={label as string} className="flex items-center gap-2">
            <span className="text-[7px] text-teal-400/80 w-5">{label}</span>
            <div className="flex-1 h-[3px] rounded-full" style={{ background: 'rgba(45,212,191,.12)' }}>
              <div className="h-full rounded-full" style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg,#2dd4bf,#22d3ee)',
              }} />
            </div>
            <span className="text-[7px] text-teal-400/60 w-5 text-right">{pct}%</span>
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── Stocks — floating particles + trend line ───────────── */
export function StocksScene({ rising = true }: { rising?: boolean }) {
  const dots = N(16).map((i) => ({
    left: `${(i * 6 + 3) % 92}%`,
    size: i % 3 === 0 ? 6 : i % 3 === 1 ? 4 : 3,
    dur:  `${2.2 + (i * 0.35) % 1.8}s`,
    del:  `${(i * 0.28) % 3.2}s`,
    op:   0.35 + (i % 4) * 0.15,
  }));

  const linePoints = rising
    ? '0,160 80,130 160,108 240,85 320,68 400,48 480,30 520,18'
    : '0,18  80,38  160,62  240,84 320,100 400,122 480,148 520,162';

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{
        background: rising
          ? 'linear-gradient(180deg,#010f06 0%,#021a0c 55%,#010f06 100%)'
          : 'linear-gradient(180deg,#100205 0%,#1e0508 55%,#100205 100%)',
      }} />

      {/* Trend line */}
      <div className="absolute inset-0" style={{ opacity: .15 }}>
        <svg width="100%" height="100%" viewBox="0 0 520 180" preserveAspectRatio="none">
          <polyline points={linePoints} fill="none"
            stroke={rising ? 'rgba(74,222,128,.9)' : 'rgba(248,113,113,.9)'} strokeWidth="3" />
        </svg>
      </div>

      {/* Gradient fill under line */}
      <div className="absolute inset-0" style={{ opacity: .06 }}>
        <svg width="100%" height="100%" viewBox="0 0 520 180" preserveAspectRatio="none">
          <polygon
            points={`${linePoints} 520,180 0,180`}
            fill={rising ? 'rgba(74,222,128,1)' : 'rgba(248,113,113,1)'} />
        </svg>
      </div>

      {/* Floating dots */}
      {dots.map((d, i) => (
        <div key={i} className="absolute rounded-full" style={{
          left: d.left,
          [rising ? 'bottom' : 'top']: '8%',
          width: d.size, height: d.size,
          background: rising ? `rgba(74,222,128,${d.op})` : `rgba(248,113,113,${d.op})`,
          animation: `${rising ? 'agent-rise' : 'agent-fall-p'} ${d.dur} ease-in-out ${d.del} infinite`,
        }} />
      ))}

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── GitHub — amber code rain ───────────────────────────── */
const CODE_CHARS = '01アイウエオカキクケコサシスセソ</>{}[]';

export function GitHubScene() {
  const cols = N(10).map((i) => ({
    left: `${i * 10 + (i % 3) * 2}%`,
    chars: N(6).map((j) => CODE_CHARS[(i * 3 + j * 7) % CODE_CHARS.length]),
    dur:  `${3 + (i * 0.4) % 2}s`,
    del:  `${(i * 0.55) % 3.5}s`,
    op:   0.25 + (i % 3) * 0.1,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#100d02 0%,#1c1602 55%,#100d02 100%)' }} />

      {/* Amber glow orb */}
      <div className="absolute rounded-full" style={{
        top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 180, height: 180,
        background: 'radial-gradient(circle,rgba(251,191,36,.06) 0%,transparent 70%)',
        animation: 'agent-glow-p 4s ease-in-out infinite',
      }} />

      {/* Code columns */}
      {cols.map((col, i) => (
        <div key={i} className="absolute font-mono" style={{
          left: col.left,
          top: 0,
          fontSize: 10,
          lineHeight: '16px',
          color: `rgba(251,191,36,${col.op})`,
          animation: `agent-code ${col.dur} linear ${col.del} infinite`,
          letterSpacing: '0.05em',
          userSelect: 'none',
        }}>
          {col.chars.map((c, j) => (
            <div key={j} style={{ opacity: 1 - j * 0.13 }}>{c}</div>
          ))}
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── News — scrolling ticker lines ─────────────────────── */
const TICKER_ITEMS = [
  'BREAKING · Top stories · AI in focus · Markets update',
  'Latest · World news · Tech · Science · Entertainment',
];

export function NewsScene() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#020a14 0%,#051628 55%,#020a14 100%)' }} />

      {/* Globe wireframe */}
      <div className="absolute rounded-full" style={{
        top: '32%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 100, height: 100,
        border: '1px solid rgba(56,189,248,.12)',
        boxShadow: '0 0 40px rgba(56,189,248,.06)',
      }}>
        {N(5).map((i) => (
          <div key={i} className="absolute inset-0 rounded-full" style={{
            border: '1px solid rgba(56,189,248,.07)',
            transform: `scaleX(${0.3 + i * 0.15})`,
          }} />
        ))}
        {N(4).map((i) => (
          <div key={i} className="absolute left-0 right-0" style={{
            top: `${(i + 1) * 18}%`,
            height: 1,
            background: 'rgba(56,189,248,.06)',
          }} />
        ))}
      </div>

      {/* Glow behind globe */}
      <div className="absolute rounded-full" style={{
        top: '32%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 200, height: 200,
        background: 'radial-gradient(circle,rgba(56,189,248,.05) 0%,transparent 70%)',
        animation: 'agent-glow-p 5s ease-in-out infinite',
      }} />

      {/* Ticker */}
      {TICKER_ITEMS.map((text, row) => (
        <div key={row} className="absolute overflow-hidden" style={{
          bottom: row === 0 ? 22 : 38,
          left: 0, right: 0,
          height: 14,
          opacity: row === 0 ? 0.35 : 0.2,
        }}>
          <div className="flex whitespace-nowrap" style={{
            animation: `agent-ticker ${18 + row * 6}s linear infinite`,
          }}>
            <span className="text-[9px] text-sky-300 tracking-wide pr-16">{text} ·&nbsp;</span>
            <span className="text-[9px] text-sky-300 tracking-wide pr-16">{text} ·&nbsp;</span>
          </div>
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── Calendar — calendar grid with highlighted dates ─────── */
export function CalendarScene() {
  const highlighted = new Set([3, 8, 14, 19, 22]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#0b0520 0%,#150a35 55%,#0b0520 100%)' }} />

      {/* Glow orb */}
      <div className="absolute rounded-full" style={{
        top: '30%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 220, height: 220,
        background: 'radial-gradient(circle,rgba(167,139,250,.07) 0%,transparent 70%)',
        animation: 'agent-glow-p 4s ease-in-out infinite',
      }} />

      {/* Calendar grid */}
      <div className="absolute" style={{
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        display: 'grid', gridTemplateColumns: 'repeat(7,1fr)',
        gap: 5, width: 182, opacity: .45,
      }}>
        {N(35).map((i) => (
          <div key={i} className="rounded-sm flex items-center justify-center" style={{
            width: 22, height: 22,
            background: highlighted.has(i) ? 'rgba(167,139,250,.5)' : 'rgba(167,139,250,.07)',
            border: highlighted.has(i) ? '1px solid rgba(167,139,250,.6)' : '1px solid rgba(167,139,250,.1)',
            fontSize: 7,
            color: highlighted.has(i) ? 'rgba(221,214,254,1)' : 'rgba(167,139,250,.5)',
          }}>
            {i + 1}
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── Email — floating envelope shapes ──────────────────── */
export function EmailScene() {
  const envelopes = N(6).map((i) => ({
    left: `${10 + i * 14}%`,
    top:  `${15 + (i % 3) * 22}%`,
    size: 18 + (i % 3) * 6,
    dur:  `${3 + (i * 0.5) % 2}s`,
    del:  `${(i * 0.6) % 3}s`,
    op:   0.15 + (i % 3) * 0.1,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#011610 0%,#02251a 55%,#011610 100%)' }} />

      {/* Glow */}
      <div className="absolute rounded-full" style={{
        top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 200, height: 200,
        background: 'radial-gradient(circle,rgba(52,211,153,.06) 0%,transparent 70%)',
        animation: 'agent-glow-p 4s ease-in-out infinite',
      }} />

      {/* Envelopes */}
      {envelopes.map((e, i) => (
        <div key={i} className="absolute" style={{
          left: e.left, top: e.top,
          animation: `agent-float ${e.dur} ease-in-out ${e.del} infinite`,
        }}>
          <svg width={e.size} height={e.size * 0.72} viewBox="0 0 28 20" style={{ opacity: e.op }}>
            <rect x="0" y="0" width="28" height="20" rx="2"
              stroke="rgba(52,211,153,.9)" strokeWidth="1.2" fill="none" />
            <polyline points="0,0 14,12 28,0"
              stroke="rgba(52,211,153,.7)" strokeWidth="1.2" fill="none" />
          </svg>
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── Smart Home — warm glow + house silhouette ─────────── */
export function SmarthomeScene() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#120900 0%,#201200 55%,#120900 100%)' }} />

      {/* Warm glow rings */}
      {N(4).map((i) => (
        <div key={i} className="absolute rounded-full" style={{
          top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 60, height: 60,
          border: '1px solid rgba(251,146,60,.6)',
          animation: `agent-ring 3.8s ease-out ${i * 0.95}s infinite`,
        }} />
      ))}

      {/* House silhouette */}
      <div className="absolute" style={{
        top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
      }}>
        <svg width="64" height="52" viewBox="0 0 64 52" style={{ opacity: .6 }}>
          {/* Roof */}
          <polygon points="32,2 62,28 2,28"
            stroke="rgba(251,146,60,.8)" strokeWidth="1.5" fill="none" />
          {/* Walls */}
          <rect x="10" y="28" width="44" height="22" rx="1"
            stroke="rgba(251,146,60,.6)" strokeWidth="1.2" fill="none" />
          {/* Door */}
          <rect x="26" y="36" width="12" height="14" rx="1"
            stroke="rgba(251,146,60,.5)" strokeWidth="1" fill="none" />
          {/* Window */}
          <rect x="13" y="32" width="10" height="9" rx="1"
            stroke="rgba(251,146,60,.5)" strokeWidth="1" fill="rgba(251,146,60,.08)" />
          <rect x="41" y="32" width="10" height="9" rx="1"
            stroke="rgba(251,146,60,.5)" strokeWidth="1" fill="rgba(251,146,60,.08)" />
        </svg>
      </div>

      {/* Core glow */}
      <div className="absolute rounded-full" style={{
        top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 14, height: 14,
        background: 'rgba(251,146,60,.9)',
        boxShadow: '0 0 30px rgba(251,146,60,.6)',
        animation: 'agent-glow-p 2.5s ease-in-out infinite',
      }} />

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── WhatsApp — floating message bubbles ────────────────── */
export function WhatsappScene() {
  const bubbles = N(7).map((i) => ({
    left:  `${8 + i * 12}%`,
    top:   `${12 + (i % 4) * 18}%`,
    width: 50 + (i % 3) * 22,
    isMe:  i % 2 === 0,
    dur:   `${3.5 + (i * 0.4) % 1.5}s`,
    del:   `${(i * 0.5) % 3}s`,
    op:    0.18 + (i % 3) * 0.07,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#010e08 0%,#011a0f 55%,#010e08 100%)' }} />

      {/* Glow */}
      <div className="absolute rounded-full" style={{
        top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 200, height: 200,
        background: 'radial-gradient(circle,rgba(37,211,102,.06) 0%,transparent 70%)',
        animation: 'agent-glow-p 4s ease-in-out infinite',
      }} />

      {bubbles.map((b, i) => (
        <div key={i} className="absolute rounded-2xl" style={{
          left: b.isMe ? 'auto' : b.left,
          right: b.isMe ? b.left : 'auto',
          top: b.top,
          width: b.width, height: 14,
          border: '1px solid rgba(37,211,102,.5)',
          borderRadius: b.isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          animation: `agent-float ${b.dur} ease-in-out ${b.del} infinite`,
          opacity: b.op,
        }} />
      ))}

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── Portfolio — animated chart + rising numbers ────────── */
export function PortfolioScene() {
  const numbers = N(8).map((i) => ({
    left: `${8 + i * 11}%`,
    text: ['+2.4%', '₹1.2L', '+0.8%', '↑14.3', '₹85K', '+3.1%', '↑9.2', '₹2.5L'][i],
    dur:  `${3 + (i * 0.4) % 2}s`,
    del:  `${(i * 0.45) % 3.5}s`,
    op:   0.2 + (i % 3) * 0.1,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#0f0208 0%,#1a0410 55%,#0f0208 100%)' }} />

      {/* Chart line */}
      <div className="absolute inset-0" style={{ opacity: .18 }}>
        <svg width="100%" height="100%" viewBox="0 0 520 180" preserveAspectRatio="none">
          <polyline
            points="0,160 65,140 130,118 195,100 260,82 325,60 390,42 455,26 520,12"
            fill="none" stroke="rgba(20,184,166,.9)" strokeWidth="3" />
          <polygon
            points="0,160 65,140 130,118 195,100 260,82 325,60 390,42 455,26 520,12 520,180 0,180"
            fill="rgba(20,184,166,.06)" />
        </svg>
      </div>

      {/* Floating numbers */}
      {numbers.map((n, i) => (
        <div key={i} className="absolute font-mono" style={{
          left: n.left, bottom: '18%',
          fontSize: 9,
          color: 'rgba(20,184,166,.9)',
          animation: `agent-rise ${n.dur} ease-in-out ${n.del} infinite`,
          opacity: n.op,
          letterSpacing: '0.03em',
        }}>
          {n.text}
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── General / fallback — abstract particle field ──────── */
export function GeneralScene({ rgb }: { rgb: string }) {
  const dots = N(20).map((i) => ({
    left: `${(i * 4.8 + 2) % 95}%`,
    top:  `${(i * 7.3 + 5) % 80}%`,
    size: i % 4 === 0 ? 4 : i % 4 === 1 ? 3 : 2,
    dur:  `${3 + (i * 0.3) % 2}s`,
    del:  `${(i * 0.4) % 4}s`,
    op:   0.12 + (i % 4) * 0.06,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{
        background: `linear-gradient(180deg,rgba(${rgb},.04) 0%,rgba(${rgb},.02) 50%,rgba(${rgb},.04) 100%)`,
      }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#040818 0%,#07091a 100%)' }} />

      {/* Center glow */}
      <div className="absolute rounded-full" style={{
        top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 200, height: 200,
        background: `radial-gradient(circle,rgba(${rgb},.08) 0%,transparent 70%)`,
        animation: 'agent-glow-p 4s ease-in-out infinite',
      }} />

      {dots.map((d, i) => (
        <div key={i} className="absolute rounded-full" style={{
          left: d.left, top: d.top,
          width: d.size, height: d.size,
          background: `rgba(${rgb},${d.op + .3})`,
          animation: `agent-float ${d.dur} ease-in-out ${d.del} infinite`,
        }} />
      ))}

      <div className="absolute inset-x-0 bottom-0 h-28"
        style={{ background: 'linear-gradient(to top,#07091a,transparent)' }} />
    </div>
  );
}

/* ─── Router: picks scene by agent id ───────────────────── */
export function AgentBackground({ agentId, isRising }: { agentId: string; isRising?: boolean }) {
  switch (agentId) {
    case 'weather':   return <WeatherScene />;
    case 'system':    return <SystemScene />;
    case 'stock':     return <StocksScene rising={isRising} />;
    case 'github':    return <GitHubScene />;
    case 'news':      return <NewsScene />;
    case 'calendar':  return <CalendarScene />;
    case 'email':     return <EmailScene />;
    case 'smarthome': return <SmarthomeScene />;
    case 'whatsapp':  return <WhatsappScene />;
    case 'portfolio': return <PortfolioScene />;
    default:          return <GeneralScene rgb="167,139,250" />;
  }
}

export interface AgentPaletteEntry {
  text:     string;
  bg:       string;
  border:   string;
  ring:     string;
  glowRgba: string;
  neonRgba: string;
}

export const AGENT_PALETTE: Record<string, AgentPaletteEntry> = {
  weather:     { text: 'text-cyan-400',    bg: 'bg-cyan-400/10',    border: 'border-cyan-400/25',    ring: 'ring-cyan-400/30',    glowRgba: 'rgba(34,211,238,0.35)',   neonRgba: 'rgba(34,211,238,0.7)'   },
  calendar:    { text: 'text-violet-400',  bg: 'bg-violet-400/10',  border: 'border-violet-400/25',  ring: 'ring-violet-400/30',  glowRgba: 'rgba(167,139,250,0.35)',  neonRgba: 'rgba(167,139,250,0.7)'  },
  email:       { text: 'text-rose-400',    bg: 'bg-rose-400/10',    border: 'border-rose-400/25',    ring: 'ring-rose-400/30',    glowRgba: 'rgba(251,113,133,0.35)',  neonRgba: 'rgba(251,113,133,0.7)'  },
  github:      { text: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/25',   ring: 'ring-amber-400/30',   glowRgba: 'rgba(251,191,36,0.35)',   neonRgba: 'rgba(251,191,36,0.7)'   },
  stock:       { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/25', ring: 'ring-emerald-400/30', glowRgba: 'rgba(52,211,153,0.35)',   neonRgba: 'rgba(52,211,153,0.7)'   },
  news:        { text: 'text-sky-400',     bg: 'bg-sky-400/10',     border: 'border-sky-400/25',     ring: 'ring-sky-400/30',     glowRgba: 'rgba(56,189,248,0.35)',   neonRgba: 'rgba(56,189,248,0.7)'   },
  smarthome:   { text: 'text-orange-400',  bg: 'bg-orange-400/10',  border: 'border-orange-400/25',  ring: 'ring-orange-400/30',  glowRgba: 'rgba(251,146,60,0.35)',   neonRgba: 'rgba(251,146,60,0.7)'   },
  portfolio:   { text: 'text-pink-400',    bg: 'bg-pink-400/10',    border: 'border-pink-400/25',    ring: 'ring-pink-400/30',    glowRgba: 'rgba(244,114,182,0.35)',  neonRgba: 'rgba(244,114,182,0.7)'  },
  whatsapp:    { text: 'text-green-400',   bg: 'bg-green-400/10',   border: 'border-green-400/25',   ring: 'ring-green-400/30',   glowRgba: 'rgba(74,222,128,0.35)',   neonRgba: 'rgba(74,222,128,0.7)'   },
  notes:       { text: 'text-purple-400',  bg: 'bg-purple-400/10',  border: 'border-purple-400/25',  ring: 'ring-purple-400/30',  glowRgba: 'rgba(192,132,252,0.35)',  neonRgba: 'rgba(192,132,252,0.7)'  },
  socialmedia: { text: 'text-red-400',     bg: 'bg-red-400/10',     border: 'border-red-400/25',     ring: 'ring-red-400/30',     glowRgba: 'rgba(248,113,113,0.35)',  neonRgba: 'rgba(248,113,113,0.7)'  },
  websearch:   { text: 'text-indigo-400',  bg: 'bg-indigo-400/10',  border: 'border-indigo-400/25',  ring: 'ring-indigo-400/30',  glowRgba: 'rgba(129,140,248,0.35)',  neonRgba: 'rgba(129,140,248,0.7)'  },
  calculator:  { text: 'text-amber-300',   bg: 'bg-amber-300/10',   border: 'border-amber-300/25',   ring: 'ring-amber-300/30',   glowRgba: 'rgba(252,211,77,0.35)',   neonRgba: 'rgba(252,211,77,0.7)'   },
  memory:      { text: 'text-teal-400',    bg: 'bg-teal-400/10',    border: 'border-teal-400/25',    ring: 'ring-teal-400/30',    glowRgba: 'rgba(45,212,191,0.35)',   neonRgba: 'rgba(45,212,191,0.7)'   },
  briefing:    { text: 'text-cyan-300',    bg: 'bg-cyan-300/10',    border: 'border-cyan-300/25',    ring: 'ring-cyan-300/30',    glowRgba: 'rgba(103,232,249,0.35)',  neonRgba: 'rgba(103,232,249,0.7)'  },
  general:     { text: 'text-violet-400',  bg: 'bg-violet-400/10',  border: 'border-violet-400/25',  ring: 'ring-violet-400/30',  glowRgba: 'rgba(167,139,250,0.35)',  neonRgba: 'rgba(167,139,250,0.7)'  },
  system:      { text: 'text-teal-400',    bg: 'bg-teal-400/10',    border: 'border-teal-400/25',    ring: 'ring-teal-400/30',    glowRgba: 'rgba(45,212,191,0.35)',   neonRgba: 'rgba(45,212,191,0.7)'   },
  google:      { text: 'text-blue-400',    bg: 'bg-blue-400/10',    border: 'border-blue-400/25',    ring: 'ring-blue-400/30',    glowRgba: 'rgba(96,165,250,0.35)',   neonRgba: 'rgba(96,165,250,0.7)'   },
};

export const AGENT_PALETTE_FALLBACK: AgentPaletteEntry = AGENT_PALETTE['general']!;

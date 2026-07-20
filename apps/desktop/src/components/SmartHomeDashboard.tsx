import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Airplay,
  AlertTriangle,
  Battery,
  Blinds,
  Bot,
  BatteryCharging,
  ChevronDown,
  ChevronUp,
  Droplets,
  ExternalLink,
  Fan,
  Flame,
  Home,
  Lightbulb,
  Loader2,
  Lock,
  LockOpen,
  Mic,
  Moon,
  RefreshCw,
  Sliders,
  Sparkles,
  Sun,
  Thermometer,
  ToggleRight,
  Tv,
  Wind,
  X,
  Zap,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────── */

interface HAEntity {
  entity_id:    string;
  state:        string;
  attributes:   Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

interface StatesResponse {
  domains: Record<string, HAEntity[]>;
  total:   number;
}

type Category = 'all' | 'light' | 'switch' | 'climate' | 'cover' | 'media_player' | 'fan' | 'lock' | 'scene' | 'automation' | 'sensor' | 'binary_sensor';

interface SmartHomeDashboardProps {
  endpoint: string;
  token:    string;
  onClose:  () => void;
  onVoice?: (text: string) => void;
}

/* ─── Constants ─────────────────────────────────────────────────── */

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string; glow: string; border: string; bg: string; dot: string }> = {
  all:          { label: 'All',         icon: Home,        color: 'text-slate-300',   glow: '',                          border: 'border-slate-500/30',   bg: 'bg-slate-500/10',   dot: 'bg-slate-400'    },
  light:        { label: 'Lights',      icon: Lightbulb,   color: 'text-amber-300',   glow: 'shadow-amber-400/20',       border: 'border-amber-400/30',   bg: 'bg-amber-400/8',    dot: 'bg-amber-400'    },
  switch:       { label: 'Switches',    icon: ToggleRight,  color: 'text-cyan-300',    glow: 'shadow-cyan-400/20',        border: 'border-cyan-400/30',    bg: 'bg-cyan-400/8',     dot: 'bg-cyan-400'     },
  climate:      { label: 'Climate',     icon: Thermometer, color: 'text-rose-300',    glow: 'shadow-rose-400/20',        border: 'border-rose-400/30',    bg: 'bg-rose-400/8',     dot: 'bg-rose-400'     },
  cover:        { label: 'Covers',      icon: Blinds,      color: 'text-violet-300',  glow: 'shadow-violet-400/20',      border: 'border-violet-400/30',  bg: 'bg-violet-400/8',   dot: 'bg-violet-400'   },
  media_player: { label: 'Media',       icon: Tv,          color: 'text-sky-300',     glow: 'shadow-sky-400/20',         border: 'border-sky-400/30',     bg: 'bg-sky-400/8',      dot: 'bg-sky-400'      },
  fan:          { label: 'Fans',        icon: Fan,         color: 'text-teal-300',    glow: 'shadow-teal-400/20',        border: 'border-teal-400/30',    bg: 'bg-teal-400/8',     dot: 'bg-teal-400'     },
  lock:         { label: 'Locks',       icon: Lock,        color: 'text-red-300',     glow: 'shadow-red-400/20',         border: 'border-red-400/30',     bg: 'bg-red-400/8',      dot: 'bg-red-400'      },
  scene:        { label: 'Scenes',      icon: Sparkles,    color: 'text-fuchsia-300', glow: 'shadow-fuchsia-400/20',     border: 'border-fuchsia-400/30', bg: 'bg-fuchsia-400/8',  dot: 'bg-fuchsia-400'  },
  automation:   { label: 'Automation',  icon: Zap,         color: 'text-orange-300',  glow: 'shadow-orange-400/20',      border: 'border-orange-400/30',  bg: 'bg-orange-400/8',   dot: 'bg-orange-400'   },
  sensor:       { label: 'Sensors',     icon: Activity,    color: 'text-emerald-300', glow: 'shadow-emerald-400/20',     border: 'border-emerald-400/30', bg: 'bg-emerald-400/8',  dot: 'bg-emerald-400'  },
  binary_sensor:{ label: 'Sensors',     icon: Activity,    color: 'text-emerald-300', glow: 'shadow-emerald-400/20',     border: 'border-emerald-400/30', bg: 'bg-emerald-400/8',  dot: 'bg-emerald-400'  },
  input_boolean:{ label: 'Helpers',     icon: Bot,         color: 'text-slate-300',   glow: '',                          border: 'border-slate-400/30',   bg: 'bg-slate-400/8',    dot: 'bg-slate-400'    },
  vacuum:       { label: 'Vacuums',     icon: Wind,        color: 'text-indigo-300',  glow: 'shadow-indigo-400/20',      border: 'border-indigo-400/30',  bg: 'bg-indigo-400/8',   dot: 'bg-indigo-400'   },
};

const DOMAIN_SECTION_ORDER: Category[] = [
  'light', 'switch', 'climate', 'cover', 'media_player', 'fan', 'lock',
  'scene', 'automation', 'sensor', 'binary_sensor',
];

const ACTIVE_STATES = new Set(['on', 'open', 'playing', 'home', 'unlocked', 'cleaning', 'active']);
const isActive = (e: HAEntity) => ACTIVE_STATES.has(e.state?.toLowerCase());

const QUICK_COLORS: { name: string; rgb: [number, number, number] }[] = [
  { name: 'White',  rgb: [255, 255, 255] },
  { name: 'Warm',   rgb: [255, 200, 120] },
  { name: 'Red',    rgb: [255, 60,  60]  },
  { name: 'Green',  rgb: [60,  220, 100] },
  { name: 'Blue',   rgb: [60,  130, 255] },
  { name: 'Purple', rgb: [200, 80,  255] },
  { name: 'Pink',   rgb: [255, 105, 180] },
  { name: 'Cyan',   rgb: [0,   230, 230] },
  { name: 'Yellow', rgb: [255, 240, 0]   },
  { name: 'Orange', rgb: [255, 140, 0]   },
];

/* ─── Helpers ───────────────────────────────────────────────────── */

function friendlyName(e: HAEntity): string {
  return (e.attributes.friendly_name as string) || e.entity_id.split('.')[1].replace(/_/g, ' ');
}
function entityDomain(e: HAEntity): string { return e.entity_id.split('.')[0]; }

function sensorIcon(deviceClass: string | undefined): React.ElementType {
  if (!deviceClass) return Activity;
  const m: Record<string, React.ElementType> = {
    temperature: Thermometer,
    humidity:    Droplets,
    power:       Zap,
    energy:      BatteryCharging,
    voltage:     Activity,
    current:     Activity,
    battery:     Battery,
    illuminance: Sun,
    motion:      Moon,
    door:        Home,
    window:      Home,
    smoke:       Wind,
    co2:         Wind,
    pressure:    Activity,
    timestamp:   Moon,
  };
  return m[deviceClass] ?? Activity;
}

function sensorColor(deviceClass: string | undefined): string {
  if (!deviceClass) return 'text-emerald-400';
  const m: Record<string, string> = {
    temperature: 'text-rose-400',
    humidity:    'text-sky-400',
    power:       'text-yellow-400',
    energy:      'text-yellow-400',
    voltage:     'text-blue-400',
    current:     'text-blue-400',
    battery:     'text-green-400',
    illuminance: 'text-amber-400',
    motion:      'text-violet-400',
  };
  return m[deviceClass] ?? 'text-emerald-400';
}

async function callService(endpoint: string, token: string, domain: string, service: string, data: Record<string, unknown>) {
  const res = await fetch(`${BACKEND_URL}/api/smarthome/call`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ endpoint, token, domain, service, data }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ─── iOS-style toggle ──────────────────────────────────────────── */

function Toggle({ on, onChange, busy }: { on: boolean; onChange: () => void; busy: boolean }) {
  return (
    <motion.button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      disabled={busy}
      className={`relative flex-shrink-0 w-10 h-5.5 rounded-full transition-colors duration-300 focus:outline-none ${
        on ? 'bg-emerald-500' : 'bg-slate-700'
      }`}
      style={{ height: 22, width: 40 }}
      whileTap={{ scale: 0.9 }}
    >
      {busy
        ? <Loader2 className="absolute inset-0 m-auto h-3 w-3 text-white animate-spin" />
        : (
          <motion.div
            className="absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow-md"
            animate={{ x: on ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )
      }
    </motion.button>
  );
}

/* ─── Light card ────────────────────────────────────────────────── */

function LightCard({ entity, endpoint, token, onRefresh }: { entity: HAEntity; endpoint: string; token: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy]         = useState(false);
  const on        = isActive(entity);
  const brightness= entity.attributes.brightness as number | undefined;
  const brightPct = brightness != null ? Math.round((brightness / 255) * 100) : 100;
  const rgb       = entity.attributes.rgb_color as [number, number, number] | undefined;
  const colorTemp = entity.attributes.color_temp as number | undefined;
  const name      = friendlyName(entity);

  const doService = useCallback(async (service: string, data: Record<string, unknown>) => {
    setBusy(true);
    try {
      await callService(endpoint, token, 'light', service, { entity_id: entity.entity_id, ...data });
      setTimeout(onRefresh, 600);
    } finally { setBusy(false); }
  }, [endpoint, token, entity.entity_id, onRefresh]);

  const glowColor = rgb ? `rgb(${rgb.join(',')})` : '#fbbf24';

  return (
    <motion.div
      layout
      className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
        on ? 'border-amber-400/40 bg-gradient-to-br from-amber-400/10 to-orange-400/5' : 'border-white/8 bg-white/3'
      }`}
      style={on ? { boxShadow: `0 4px 24px ${glowColor}22` } : {}}
    >
      <div className="flex items-center gap-3 p-3.5">
        {/* Bulb icon with glow */}
        <motion.div
          animate={on ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className={`relative flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            on ? 'bg-amber-400/20 border border-amber-400/40' : 'bg-white/5 border border-white/10'
          }`}
        >
          {on && <div className="absolute inset-0 rounded-xl bg-amber-400/10 blur-sm" />}
          <Lightbulb className={`h-4 w-4 relative z-10 ${on ? 'text-amber-300' : 'text-slate-600'}`} />
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold truncate ${on ? 'text-amber-100' : 'text-slate-400'}`}>{name}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {on ? (
              <span className="flex items-center gap-1.5">
                <span>{brightPct}% brightness</span>
                {rgb && <span className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block" style={{ background: `rgb(${rgb.join(',')})` }} />}
              </span>
            ) : 'Off'}
          </div>
        </div>

        <Toggle on={on} busy={busy} onChange={() => doService(on ? 'turn_off' : 'turn_on', {})} />

        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/8 transition"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 space-y-3.5 border-t border-white/6 pt-3">
              {/* Brightness */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Sliders className="h-3 w-3" /> Brightness
                  </span>
                  <span className="text-[10px] font-mono text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded-md">{brightPct}%</span>
                </div>
                <div className="relative">
                  <input
                    type="range" min={1} max={100} value={brightPct}
                    onChange={(e) => doService('turn_on', { brightness_pct: Number(e.target.value) })}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer accent-amber-400"
                    style={{ background: `linear-gradient(to right, #fbbf24 ${brightPct}%, #1f2937 ${brightPct}%)` }}
                  />
                </div>
              </div>

              {/* Color temp */}
              {colorTemp != null && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Flame className="h-3 w-3" /> Color Temp
                    </span>
                    <span className="text-[10px] font-mono text-orange-300 bg-orange-400/10 px-1.5 py-0.5 rounded-md">{colorTemp}K</span>
                  </div>
                  <input
                    type="range" min={153} max={500} value={colorTemp}
                    onChange={(e) => doService('turn_on', { color_temp: Number(e.target.value) })}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                    style={{ background: 'linear-gradient(to right, #ffe4b5, #ff6b00)' }}
                  />
                </div>
              )}

              {/* Quick colors */}
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Quick Colors</div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_COLORS.map((c) => {
                    const active = rgb && rgb[0] === c.rgb[0] && rgb[1] === c.rgb[1] && rgb[2] === c.rgb[2];
                    return (
                      <motion.button
                        key={c.name}
                        whileHover={{ scale: 1.25, y: -2 }}
                        whileTap={{ scale: 0.85 }}
                        title={c.name}
                        onClick={() => doService('turn_on', { rgb_color: c.rgb })}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${active ? 'border-white scale-110' : 'border-white/20'}`}
                        style={{ background: `rgb(${c.rgb.join(',')})`, boxShadow: active ? `0 0 8px rgb(${c.rgb.join(',')})` : '' }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Toggle card ───────────────────────────────────────────────── */

function ToggleCard({ entity, endpoint, token, onRefresh }: { entity: HAEntity; endpoint: string; token: string; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const on     = isActive(entity);
  const domain = entityDomain(entity);
  const meta   = CATEGORY_META[domain] ?? CATEGORY_META.all;
  const name   = friendlyName(entity);
  const Icon   = meta.icon;

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      const svc = domain === 'cover'
        ? (on ? 'close_cover' : 'open_cover')
        : domain === 'lock'
        ? (on ? 'lock' : 'unlock')
        : (on ? 'turn_off' : 'turn_on');
      await callService(endpoint, token, domain, svc, { entity_id: entity.entity_id });
      setTimeout(onRefresh, 600);
    } finally { setBusy(false); }
  }, [endpoint, token, entity, domain, on, onRefresh]);

  return (
    <motion.div
      layout
      whileHover={{ y: -1 }}
      className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-all duration-300 cursor-pointer ${
        on ? `${meta.border} ${meta.bg}` : 'border-white/8 bg-white/3 hover:bg-white/5'
      }`}
      onClick={toggle}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
        on ? `${meta.border} ${meta.bg}` : 'border border-white/10 bg-white/5'
      }`}>
        {domain === 'lock'
          ? (on
              ? <LockOpen className={`h-4 w-4 ${on ? meta.color : 'text-slate-600'}`} />
              : <Lock     className={`h-4 w-4 ${on ? meta.color : 'text-slate-600'}`} />)
          : <Icon className={`h-4 w-4 ${on ? meta.color : 'text-slate-600'}`} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold truncate ${on ? meta.color : 'text-slate-400'}`}>{name}</div>
        <div className={`text-[10px] mt-0.5 capitalize ${on ? 'text-slate-400' : 'text-slate-600'}`}>{entity.state}</div>
      </div>
      <Toggle on={on} busy={busy} onChange={toggle} />
    </motion.div>
  );
}

/* ─── Climate card ──────────────────────────────────────────────── */

function ClimateCard({ entity, endpoint, token, onRefresh }: { entity: HAEntity; endpoint: string; token: string; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const on     = entity.state !== 'off';
  const name   = friendlyName(entity);
  const cur    = entity.attributes.current_temperature as number | undefined;
  const target = entity.attributes.temperature as number | undefined;

  const setTemp = useCallback(async (temp: number) => {
    setBusy(true);
    try {
      await callService(endpoint, token, 'climate', 'set_temperature', { entity_id: entity.entity_id, temperature: temp });
      setTimeout(onRefresh, 800);
    } finally { setBusy(false); }
  }, [endpoint, token, entity.entity_id, onRefresh]);

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      await callService(endpoint, token, 'climate', on ? 'turn_off' : 'turn_on', { entity_id: entity.entity_id });
      setTimeout(onRefresh, 600);
    } finally { setBusy(false); }
  }, [endpoint, token, entity.entity_id, on, onRefresh]);

  return (
    <motion.div layout className={`rounded-2xl border p-3.5 transition-all duration-300 ${on ? 'border-rose-400/40 bg-rose-400/8' : 'border-white/8 bg-white/3'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${on ? 'border border-rose-400/40 bg-rose-400/15' : 'border border-white/10 bg-white/5'}`}>
          <Thermometer className={`h-4 w-4 ${on ? 'text-rose-300' : 'text-slate-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold truncate ${on ? 'text-rose-200' : 'text-slate-400'}`}>{name}</div>
          <div className="text-[10px] text-slate-500 capitalize mt-0.5">{entity.state}</div>
        </div>
        <Toggle on={on} busy={busy} onChange={toggle} />
      </div>

      <div className="flex items-center justify-between gap-3 bg-white/3 rounded-xl p-2.5">
        <div className="text-center flex-1">
          <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-1">Current</div>
          <div className={`text-xl font-bold tabular-nums ${on ? 'text-rose-200' : 'text-slate-500'}`}>{cur ?? '—'}°</div>
        </div>
        <div className="h-8 w-px bg-white/8" />
        <div className="text-center flex-1">
          <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-1">Target</div>
          <div className="flex items-center justify-center gap-2">
            <motion.button whileTap={{ scale: 0.8 }} onClick={() => target != null && setTemp(target - 0.5)}
              className="w-5 h-5 rounded-lg bg-white/8 text-slate-400 hover:text-white flex items-center justify-center text-xs transition">−</motion.button>
            <span className={`text-xl font-bold tabular-nums ${on ? 'text-rose-300' : 'text-slate-500'}`}>{target ?? '—'}°</span>
            <motion.button whileTap={{ scale: 0.8 }} onClick={() => target != null && setTemp(target + 0.5)}
              className="w-5 h-5 rounded-lg bg-white/8 text-slate-400 hover:text-white flex items-center justify-center text-xs transition">+</motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Scene / Automation card ───────────────────────────────────── */

function SceneCard({ entity, endpoint, token, onRefresh }: { entity: HAEntity; endpoint: string; token: string; onRefresh: () => void }) {
  const [busy, setBusy]   = useState(false);
  const [flash, setFlash] = useState(false);
  const domain = entityDomain(entity);
  const meta   = CATEGORY_META[domain] ?? CATEGORY_META.scene;
  const name   = friendlyName(entity);
  const Icon   = meta.icon;

  const trigger = useCallback(async () => {
    setBusy(true);
    setFlash(true);
    try {
      if (domain === 'scene')          await callService(endpoint, token, 'scene', 'turn_on', { entity_id: entity.entity_id });
      else if (domain === 'automation') await callService(endpoint, token, 'automation', 'trigger', { entity_id: entity.entity_id });
      else                              await callService(endpoint, token, 'script', 'turn_on', { entity_id: entity.entity_id });
      setTimeout(onRefresh, 500);
    } finally {
      setBusy(false);
      setTimeout(() => setFlash(false), 800);
    }
  }, [endpoint, token, entity.entity_id, domain, onRefresh]);

  return (
    <motion.button
      layout
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.96 }}
      onClick={trigger}
      disabled={busy}
      className={`relative flex items-center gap-3 rounded-2xl border p-3.5 w-full text-left overflow-hidden transition-all duration-300 ${meta.border} ${meta.bg}`}
    >
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0.6, scale: 0.5 }}
            animate={{ opacity: 0, scale: 2.5 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 rounded-2xl ${meta.bg} pointer-events-none`}
          />
        )}
      </AnimatePresence>
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center ${meta.border} ${meta.bg}`}>
        {busy
          ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          : <Icon className={`h-4 w-4 ${meta.color}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold truncate ${meta.color}`}>{name}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Tap to activate</div>
      </div>
      <motion.div
        animate={busy ? { rotate: 360 } : { rotate: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${meta.color} opacity-60`} />
      </motion.div>
    </motion.button>
  );
}

/* ─── Sensor card ───────────────────────────────────────────────── */

function SensorCard({ entity }: { entity: HAEntity }) {
  const name       = friendlyName(entity);
  const unit       = (entity.attributes.unit_of_measurement as string) ?? '';
  const dc         = entity.attributes.device_class as string | undefined;
  const SensorIcon = sensorIcon(dc);
  const iconColor  = sensorColor(dc);

  // Format value — timestamps show as human time
  let displayValue = entity.state;
  if (dc === 'timestamp' || unit === '' && /T\d{2}:\d{2}/.test(entity.state)) {
    try {
      const d = new Date(entity.state);
      displayValue = isNaN(d.getTime()) ? entity.state : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 hover:bg-white/5 p-3 transition-colors">
      <div className={`flex-shrink-0 w-8 h-8 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center`}>
        <SensorIcon className={`h-3.5 w-3.5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-slate-400 truncate">{name}</div>
      </div>
      <div className="flex items-baseline gap-0.5 flex-shrink-0">
        <span className={`text-sm font-bold tabular-nums ${iconColor}`}>{displayValue}</span>
        {unit && <span className="text-[10px] text-slate-500 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

/* ─── Section header ────────────────────────────────────────────── */

function SectionHeader({ domain, count }: { domain: string; count: number }) {
  const meta = CATEGORY_META[domain] ?? CATEGORY_META.all;
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-2 pt-1 pb-0.5">
      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      <span className={`text-[10px] font-semibold uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
      <span className="text-[9px] text-slate-600 bg-white/5 rounded-full px-1.5 py-0.5">{count}</span>
      <div className="flex-1 h-px bg-white/6" />
    </div>
  );
}

/* ─── Stats strip ───────────────────────────────────────────────── */

function StatsStrip({ total, active, domains }: { total: number; active: number; domains: Record<string, HAEntity[]> }) {
  const pills = [
    { key: 'light',  color: 'bg-amber-400/15 text-amber-300',   count: domains.light?.length },
    { key: 'switch', color: 'bg-cyan-400/15 text-cyan-300',     count: domains.switch?.length },
    { key: 'sensor', color: 'bg-emerald-400/15 text-emerald-300', count: (domains.sensor?.length ?? 0) + (domains.binary_sensor?.length ?? 0) },
  ].filter(p => p.count);

  return (
    <div className="flex items-center gap-2 px-5 py-2 border-b border-white/6 flex-shrink-0 bg-white/2">
      <motion.div
        key={active}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-1.5"
      >
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="h-1.5 w-1.5 rounded-full bg-emerald-400"
        />
        <span className="text-[11px] text-emerald-300 font-semibold">{active} active</span>
      </motion.div>
      <span className="text-slate-700">·</span>
      <span className="text-[11px] text-slate-500">{total} total</span>
      <div className="flex-1" />
      {pills.map(p => (
        <span key={p.key} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${p.color}`}>{p.count}</span>
      ))}
    </div>
  );
}

/* ─── Main dashboard ────────────────────────────────────────────── */

export function SmartHomeDashboard({ endpoint, token, onClose, onVoice }: SmartHomeDashboardProps) {
  const [states, setStates]       = useState<StatesResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Category>('all');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [voiceInput, setVoiceInput]   = useState('');
  const [showVoiceBar, setShowVoiceBar] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStates = useCallback(async () => {
    if (!endpoint || !token) return;
    try {
      const params = new URLSearchParams({ endpoint, token });
      const res = await fetch(`${BACKEND_URL}/api/smarthome/states?${params}`);
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const body = await res.json(); if (body?.detail) detail = body.detail; } catch { /* ignore */ }
        throw new Error(detail);
      }
      const data: StatesResponse = await res.json();
      setStates(data);
      setError(null);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Failed to connect');
    } finally {
      setLoading(false);
    }
  }, [endpoint, token]);

  useEffect(() => {
    fetchStates();
    refreshTimer.current = setInterval(fetchStates, 8000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchStates]);

  const allEntities: HAEntity[] = states ? Object.values(states.domains).flat() : [];
  const activeOnline = allEntities.filter(isActive).length;

  const displayedEntities: HAEntity[] = activeTab === 'all' ? allEntities : (states?.domains[activeTab] ?? []);

  const tabCounts: Record<string, number> = { all: allEntities.length };
  if (states) {
    for (const [d, ents] of Object.entries(states.domains)) tabCounts[d] = ents.length;
  }

  const availableTabs: Category[] = ['all'];
  if (states) {
    for (const d of DOMAIN_SECTION_ORDER) {
      if (states.domains[d]?.length) availableTabs.push(d);
    }
  }

  // Sort: active first within each group
  const sorted = [...displayedEntities].sort((a, b) => {
    const aOn = isActive(a) ? 0 : 1;
    const bOn = isActive(b) ? 0 : 1;
    return aOn - bOn;
  });

  const renderEntity = (entity: HAEntity) => {
    const domain = entityDomain(entity);
    if (domain === 'light')   return <LightCard   key={entity.entity_id} entity={entity} endpoint={endpoint} token={token} onRefresh={fetchStates} />;
    if (domain === 'climate') return <ClimateCard key={entity.entity_id} entity={entity} endpoint={endpoint} token={token} onRefresh={fetchStates} />;
    if (domain === 'scene' || domain === 'automation' || domain === 'script')
                              return <SceneCard   key={entity.entity_id} entity={entity} endpoint={endpoint} token={token} onRefresh={fetchStates} />;
    if (domain === 'sensor' || domain === 'binary_sensor')
                              return <SensorCard  key={entity.entity_id} entity={entity} />;
    return                           <ToggleCard  key={entity.entity_id} entity={entity} endpoint={endpoint} token={token} onRefresh={fetchStates} />;
  };

  // For "all" tab: render grouped by domain with section headers
  const renderAllGrouped = () => {
    if (!states) return null;
    return (
      <div className="space-y-4">
        {DOMAIN_SECTION_ORDER.map(domain => {
          const ents = states.domains[domain];
          if (!ents?.length) return null;
          const sorted = [...ents].sort((a, b) => (isActive(a) ? 0 : 1) - (isActive(b) ? 0 : 1));
          return (
            <motion.div
              key={domain}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <SectionHeader domain={domain} count={ents.length} />
              <div className={`mt-2 ${
                domain === 'sensor' || domain === 'binary_sensor'
                  ? 'space-y-1.5'
                  : 'grid grid-cols-1 sm:grid-cols-2 gap-2'
              }`}>
                {sorted.map((entity, i) => (
                  <motion.div
                    key={entity.entity_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25 }}
                  >
                    {renderEntity(entity)}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl border border-orange-400/20 bg-[#07091a] overflow-hidden"
          style={{ boxShadow: '0 32px 80px rgba(251,146,60,0.12), 0 0 0 1px rgba(255,255,255,0.04)' }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 flex-shrink-0 bg-gradient-to-r from-orange-400/5 to-transparent">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="w-9 h-9 rounded-2xl border border-orange-400/35 bg-orange-400/12 flex items-center justify-center"
              >
                <Home className="h-4 w-4 text-orange-300" />
              </motion.div>
              <div>
                <div className="text-sm font-bold text-orange-100 tracking-wide">Smart Home</div>
                <div className="text-[10px] text-slate-500">
                  {loading ? 'Connecting…' : error ? 'Connection error' : `Updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <a
                href={endpoint}
                target="_blank"
                rel="noreferrer"
                title={`Open Home Assistant — ${endpoint}`}
                className="flex items-center gap-1 h-7 px-2 rounded-xl border border-orange-400/25 bg-orange-400/6 text-[10px] text-orange-400/80 hover:text-orange-200 hover:bg-orange-400/15 transition"
              >
                <ExternalLink className="h-3 w-3" />
                Open HA
              </a>

              <motion.button
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.4 }}
                onClick={fetchStates}
                className="w-7 h-7 rounded-xl border border-white/10 bg-white/4 flex items-center justify-center text-slate-500 hover:text-slate-200 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </motion.button>

              {onVoice && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setShowVoiceBar(v => !v)}
                  className={`h-7 px-2.5 rounded-xl border text-[11px] font-medium flex items-center gap-1.5 transition ${
                    showVoiceBar
                      ? 'border-orange-400/50 bg-orange-400/20 text-orange-200'
                      : 'border-orange-400/25 bg-orange-400/8 text-orange-300 hover:bg-orange-400/15'
                  }`}
                >
                  <Mic className="h-3 w-3" /> Voice
                </motion.button>
              )}

              <button
                onClick={onClose}
                className="w-7 h-7 rounded-xl border border-white/10 bg-white/4 flex items-center justify-center text-slate-500 hover:text-slate-200 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* ── Voice bar ── */}
          <AnimatePresence>
            {showVoiceBar && onVoice && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-b border-orange-400/15 flex-shrink-0"
              >
                <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-400/5">
                  <Airplay className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                  <input
                    autoFocus
                    value={voiceInput}
                    onChange={e => setVoiceInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && voiceInput.trim()) {
                        onVoice(voiceInput.trim());
                        setVoiceInput('');
                        setShowVoiceBar(false);
                      }
                    }}
                    placeholder="e.g. Turn off living room lights…"
                    className="flex-1 bg-transparent text-sm text-orange-100 placeholder:text-slate-600 outline-none"
                  />
                  {voiceInput && (
                    <button
                      onClick={() => { onVoice(voiceInput.trim()); setVoiceInput(''); setShowVoiceBar(false); }}
                      className="text-[10px] text-orange-300 hover:text-orange-100 transition px-2 py-0.5 rounded-lg bg-orange-400/15"
                    >Send</button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Stats strip ── */}
          {!loading && !error && states && (
            <StatsStrip total={allEntities.length} active={activeOnline} domains={states.domains} />
          )}

          {/* ── Category tabs ── */}
          {!loading && !error && (
            <div className="flex items-center gap-1 px-4 py-2 border-b border-white/6 overflow-x-auto flex-shrink-0 scrollbar-hide">
              {availableTabs.map(tab => {
                const meta = CATEGORY_META[tab] ?? CATEGORY_META.all;
                const Icon = meta.icon;
                const active = activeTab === tab;
                return (
                  <motion.button
                    key={tab}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-all border ${
                      active
                        ? `${meta.border} ${meta.bg} ${meta.color}`
                        : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="h-3 w-3 flex-shrink-0" style={{ width: 11, height: 11 }} />
                    {meta.label}
                    {tabCounts[tab] != null && (
                      <span className={`text-[9px] rounded-full px-1.5 py-px ${active ? 'bg-white/15' : 'bg-white/8 text-slate-600'}`}>
                        {tabCounts[tab]}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="flex flex-col items-center justify-center h-48 gap-4">
                <div className="relative">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 rounded-full border-2 border-orange-400/20 border-t-orange-400"
                  />
                  <Home className="absolute inset-0 m-auto h-4 w-4 text-orange-400" />
                </div>
                <div className="text-center">
                  <div className="text-sm text-slate-400">Connecting to Home Assistant</div>
                  <div className="text-[11px] text-slate-600 mt-1">Fetching devices…</div>
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-8 px-4">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-12 h-12 rounded-2xl border border-red-400/30 bg-red-400/10 flex items-center justify-center"
                >
                  <AlertTriangle className="h-6 w-6 text-red-400" />
                </motion.div>
                <div className="text-center max-w-sm">
                  <div className="text-sm text-red-300 font-semibold">Cannot reach Home Assistant</div>
                  <div className="text-[11px] text-slate-400 mt-1.5 leading-relaxed font-mono break-words">{error}</div>
                </div>
                {/* Diagnostic hints */}
                <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-[10px] text-slate-500 space-y-1 max-w-xs">
                  <p className="font-semibold text-slate-400 mb-1">Check:</p>
                  <p>• Docker Desktop is running</p>
                  {endpoint.includes('localhost') || endpoint.includes('127.0.0.1') ? (
                    <>
                      <p>• HA container is up: <code className="text-slate-400">docker ps | grep homeassistant</code></p>
                      <p>• Complete HA onboarding at <a href={endpoint} target="_blank" rel="noreferrer" className="text-orange-400 underline">{endpoint}</a> if first run</p>
                      <p>• <code className="text-slate-400">MYHOME_MCP_TOKEN</code> in gateway <code className="text-slate-400">.env</code> is a token from <em>this</em> local HA (not your Pi token)</p>
                    </>
                  ) : (
                    <>
                      <p>• HA is reachable at <code className="text-slate-400">{endpoint}</code></p>
                      <p>• <code className="text-slate-400">MYHOME_MCP_ENDPOINT</code> in gateway <code className="text-slate-400">.env</code> matches this URL</p>
                      <p>• Long-lived access token is valid</p>
                    </>
                  )}
                  <p>• <code className="text-slate-400">voska/hass-mcp</code> image is pulled: <code className="text-slate-400">docker pull voska/hass-mcp:latest</code></p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={fetchStates}
                  className="px-4 py-1.5 rounded-xl border border-orange-400/30 bg-orange-400/10 text-xs text-orange-300 hover:bg-orange-400/20 transition"
                >
                  Retry
                </motion.button>
              </div>
            )}

            {!loading && !error && displayedEntities.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600">
                <Home className="h-8 w-8 opacity-30" />
                <span className="text-sm">No devices in this category</span>
              </div>
            )}

            {!loading && !error && displayedEntities.length > 0 && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'all' ? renderAllGrouped() : (
                    <div className={`${
                      activeTab === 'sensor' || activeTab === 'binary_sensor'
                        ? 'space-y-1.5'
                        : 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
                    }`}>
                      {sorted.map((entity, i) => (
                        <motion.div
                          key={entity.entity_id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.22 }}
                        >
                          {renderEntity(entity)}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/6 flex-shrink-0 bg-white/2">
            <span className="text-[10px] text-slate-600">Tap device to toggle · Expand lights for controls</span>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="text-[10px] text-slate-600 flex items-center gap-1"
            >
              <div className="w-1 h-1 rounded-full bg-emerald-500" />
              Live · 8s
            </motion.div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

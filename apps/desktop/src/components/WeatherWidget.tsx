import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
  Droplets, RefreshCw, Sun, Thermometer, Wind,
  type LucideIcon,
} from 'lucide-react';

/* ── WMO code → Lucide icon + label ─────────────────────────────────────── */

interface WmoMeta { Icon: LucideIcon; color: string; label: string }

const WMO: Record<number, WmoMeta> = {
  0:  { Icon: Sun,            color: 'text-amber-400',  label: 'Clear sky'       },
  1:  { Icon: Sun,            color: 'text-amber-300',  label: 'Mainly clear'    },
  2:  { Icon: Cloud,          color: 'text-cyan-400',   label: 'Partly cloudy'   },
  3:  { Icon: Cloud,          color: 'text-slate-400',  label: 'Overcast'        },
  45: { Icon: CloudFog,       color: 'text-slate-400',  label: 'Foggy'           },
  48: { Icon: CloudFog,       color: 'text-slate-400',  label: 'Freezing fog'    },
  51: { Icon: CloudDrizzle,   color: 'text-cyan-400',   label: 'Light drizzle'   },
  53: { Icon: CloudDrizzle,   color: 'text-cyan-400',   label: 'Drizzle'         },
  55: { Icon: CloudDrizzle,   color: 'text-cyan-400',   label: 'Heavy drizzle'   },
  61: { Icon: CloudRain,      color: 'text-blue-400',   label: 'Light rain'      },
  63: { Icon: CloudRain,      color: 'text-blue-400',   label: 'Rain'            },
  65: { Icon: CloudRain,      color: 'text-blue-500',   label: 'Heavy rain'      },
  71: { Icon: CloudSnow,      color: 'text-sky-300',    label: 'Light snow'      },
  73: { Icon: CloudSnow,      color: 'text-sky-300',    label: 'Snow'            },
  75: { Icon: CloudSnow,      color: 'text-sky-200',    label: 'Heavy snow'      },
  80: { Icon: CloudRain,      color: 'text-blue-400',   label: 'Rain showers'    },
  81: { Icon: CloudRain,      color: 'text-blue-400',   label: 'Showers'         },
  82: { Icon: CloudRain,      color: 'text-blue-500',   label: 'Heavy showers'   },
  85: { Icon: CloudSnow,      color: 'text-sky-300',    label: 'Snow showers'    },
  86: { Icon: CloudSnow,      color: 'text-sky-200',    label: 'Heavy snow'      },
  95: { Icon: CloudLightning, color: 'text-amber-400',  label: 'Thunderstorm'    },
  96: { Icon: CloudLightning, color: 'text-amber-400',  label: 'Storm + hail'    },
  99: { Icon: CloudLightning, color: 'text-amber-500',  label: 'Severe storm'    },
};

function wmoMeta(code: number): WmoMeta {
  return WMO[code] ?? { Icon: Cloud, color: 'text-slate-400', label: 'Variable' };
}

/* ── AQI ──────────────────────────────────────────────────────────────────── */

interface AqiBand {
  label: string; shortLabel: string;
  textColor: string; bgColor: string; borderColor: string; barColor: string;
}

function aqiBand(v: number): AqiBand {
  if (v <= 50)  return { label:'Good',                   shortLabel:'Good',    textColor:'text-emerald-400', bgColor:'bg-emerald-400/10', borderColor:'border-emerald-400/30', barColor:'bg-emerald-400' };
  if (v <= 100) return { label:'Moderate',               shortLabel:'Mod',     textColor:'text-yellow-400',  bgColor:'bg-yellow-400/10',  borderColor:'border-yellow-400/30',  barColor:'bg-yellow-400'  };
  if (v <= 150) return { label:'Unhealthy (Sensitive)',  shortLabel:'Sens.',   textColor:'text-orange-400',  bgColor:'bg-orange-400/10',  borderColor:'border-orange-400/30',  barColor:'bg-orange-400'  };
  if (v <= 200) return { label:'Unhealthy',              shortLabel:'Unhealthy',textColor:'text-red-400',    bgColor:'bg-red-400/10',     borderColor:'border-red-400/30',     barColor:'bg-red-400'     };
  if (v <= 300) return { label:'Very Unhealthy',         shortLabel:'V.Unhl',  textColor:'text-purple-400', bgColor:'bg-purple-400/10',  borderColor:'border-purple-400/30',  barColor:'bg-purple-400'  };
  return              { label:'Hazardous',               shortLabel:'Hazard',  textColor:'text-rose-300',   bgColor:'bg-rose-400/10',    borderColor:'border-rose-400/30',    barColor:'bg-rose-400'    };
}

/* ── Data shape ───────────────────────────────────────────────────────────── */

export interface WeatherData {
  city:      string;
  temp:      number;
  feelsLike: number;
  humidity:  number;
  windKph:   number;
  code:      number;
  aqi:       number | null;
  forecast:  { day: string; code: number; high: number; low: number; precipPct: number }[];
}

/* ── Open-Meteo fetch — includes Today in forecast ───────────────────────── */

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function fetchWeatherData(city: string): Promise<WeatherData> {
  const geoRes  = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`
  );
  const geoJson = await geoRes.json();
  const results: any[] = geoJson.results ?? [];
  if (!results.length) throw new Error(`City not found: ${city}`);
  const loc = results.find((r: any) => r.country_code === 'IN') ?? results[0];
  const { latitude: lat, longitude: lon } = loc;
  const cityName = `${loc.name}, ${loc.country_code?.toUpperCase() ?? ''}`.trim();

  const [wxRes, aqiRes] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&wind_speed_unit=kmh&timezone=auto&forecast_days=7`
    ),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=us_aqi&timezone=auto`
    ),
  ]);
  const wxJson  = await wxRes.json();
  const aqiJson = await aqiRes.json();

  const cur   = wxJson.current;
  const daily = wxJson.daily;

  // index 0 = today, 1-5 = next 5 days
  const forecast = (daily.time as string[]).slice(0, 6).map((date: string, i: number) => ({
    day:       i === 0 ? 'Today' : DAY_ABBR[new Date(date).getDay()],
    code:      daily.weather_code[i]                    ?? 0,
    high:      Math.round(daily.temperature_2m_max[i]  ?? 0),
    low:       Math.round(daily.temperature_2m_min[i]  ?? 0),
    precipPct: daily.precipitation_probability_max?.[i] ?? 0,
  }));

  return {
    city:      cityName,
    temp:      Math.round(cur.temperature_2m),
    feelsLike: Math.round(cur.apparent_temperature),
    humidity:  cur.relative_humidity_2m,
    windKph:   Math.round(cur.wind_speed_10m),
    code:      cur.weather_code,
    aqi:       aqiJson.current?.us_aqi ?? null,
    forecast,
  };
}

/* ── Skeleton (compact 2-row size) ───────────────────────────────────────── */

function WidgetSkeleton() {
  return (
    <div className="w-full rounded-2xl border border-cyan-400/10 bg-cyan-400/3 px-3 py-2 space-y-2 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-full bg-white/8 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="h-3.5 w-20 rounded bg-white/8" />
          <div className="h-2 w-28 rounded bg-white/5" />
        </div>
        <div className="h-10 w-12 rounded-lg bg-white/5 flex-shrink-0" />
      </div>
      <div className="flex gap-1 pt-1.5 border-t border-white/5">
        {[0,1,2,3,4,5].map(i => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="h-2 w-5 rounded bg-white/5" />
            <div className="h-3 w-3 rounded bg-white/8" />
            <div className="h-2 w-4 rounded bg-white/5" />
            <div className="h-1.5 w-3 rounded bg-white/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Compact widget (center column, below Sleep button) ───────────────────── */

interface WeatherWidgetProps { city: string }

export function WeatherWidget({ city }: WeatherWidgetProps) {
  const [data,    setData]    = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const fetchCity = city || 'Bengaluru';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchWeatherData(fetchCity)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(()  => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [fetchCity]);

  if (loading) return <WidgetSkeleton />;
  if (error || !data) return null;

  const meta = wmoMeta(data.code);
  const Icon = meta.Icon;
  const aqi  = data.aqi != null ? aqiBand(data.aqi) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className="w-full rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/5 to-slate-900/40 px-3 py-2"
    >
      {/* ── Row 1: icon · temp · condition · city | feels/humid/wind | AQI ── */}
      <div className="flex items-center gap-2">

        {/* Icon + temp + condition */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className={`h-5 w-5 flex-shrink-0 ${meta.color}`} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-[17px] font-bold tabular-nums text-cyan-300 leading-none">{data.temp}°C</span>
              <span className={`text-[9px] font-medium ${meta.color} truncate leading-none`}>{meta.label}</span>
            </div>
            <p className="text-[8px] text-slate-500 truncate leading-none mt-0.5">{data.city}</p>
          </div>
        </div>

        {/* Feels / humidity / wind — inline */}
        <div className="flex items-center gap-2 border-x border-white/8 px-2.5 flex-shrink-0">
          <span className="flex items-center gap-0.5 text-[9px] text-slate-500">
            <Thermometer className="h-2.5 w-2.5" />
            <span className="text-slate-400 font-medium">{data.feelsLike}°</span>
          </span>
          <span className="flex items-center gap-0.5 text-[9px] text-slate-500">
            <Droplets className="h-2.5 w-2.5" />
            <span className="text-slate-400 font-medium">{data.humidity}%</span>
          </span>
          <span className="flex items-center gap-0.5 text-[9px] text-slate-500">
            <Wind className="h-2.5 w-2.5" />
            <span className="text-slate-400 font-medium">{data.windKph}km</span>
          </span>
        </div>

        {/* AQI badge */}
        {aqi ? (
          <div className={`flex-shrink-0 flex flex-col items-center rounded-lg border ${aqi.borderColor} ${aqi.bgColor} px-2 py-0.5`}>
            <span className={`text-[7px] font-mono uppercase tracking-widest ${aqi.textColor} opacity-60 leading-none`}>AQI</span>
            <span className={`text-[15px] font-bold tabular-nums leading-tight ${aqi.textColor}`}>{data.aqi}</span>
            <span className={`text-[7px] font-semibold leading-none ${aqi.textColor}`}>{aqi.shortLabel}</span>
          </div>
        ) : <div className="w-10 flex-shrink-0" />}
      </div>

      {/* ── Row 2: Today + 5-day forecast ────────────────────────────── */}
      <div className="flex gap-1 mt-2 pt-1.5 border-t border-white/8">
        {data.forecast.map((f, i) => {
          const fm    = wmoMeta(f.code);
          const FIcon = fm.Icon;
          const isToday = i === 0;
          return (
            <div
              key={i}
              className={`flex-1 flex flex-col items-center gap-[2px] rounded-lg py-1 ${
                isToday
                  ? 'bg-cyan-400/8 border border-cyan-400/20'
                  : 'bg-white/[0.02] border border-white/4'
              }`}
            >
              <span className={`text-[7px] font-mono font-bold leading-none ${isToday ? 'text-cyan-400' : 'text-slate-600'}`}>
                {f.day}
              </span>
              <FIcon className={`h-3 w-3 ${fm.color}`} />
              <span className={`text-[9px] font-bold tabular-nums leading-none ${isToday ? 'text-cyan-300' : 'text-slate-300'}`}>
                {f.high}°
              </span>
              <span className="text-[7px] tabular-nums text-slate-600 leading-none">{f.low}°</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ── Detailed panel (AgentDetailModal → weather agent) ───────────────────── */

interface WeatherPanelProps {
  city:        string;
  textClass:   string;
  borderClass: string;
  bgClass:     string;
}

export function WeatherPanel({ city, textClass, borderClass, bgClass }: WeatherPanelProps) {
  const [data,       setData]       = useState<WeatherData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchCity = city || 'Bengaluru';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchWeatherData(fetchCity)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e?.message ?? 'Failed to load weather'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [fetchCity, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className={`rounded-xl border ${borderClass} ${bgClass} p-4 h-28`} />
        <div className={`rounded-xl border ${borderClass} ${bgClass} h-16`} />
        <div className={`rounded-xl border ${borderClass} ${bgClass} h-24`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-3">
        <p className="text-[11px] text-slate-500 leading-relaxed">{error}</p>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:text-white transition-colors flex-shrink-0"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const meta = wmoMeta(data.code);
  const Icon = meta.Icon;
  const aqi  = data.aqi != null ? aqiBand(data.aqi) : null;

  return (
    <div className="space-y-2">
      {/* Current conditions */}
      <div className={`rounded-xl border ${borderClass} ${bgClass} p-4`}>
        <div className="flex items-start gap-4">
          <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: [0, 4, -4, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Icon className={`h-12 w-12 ${meta.color}`} style={{ filter: 'drop-shadow(0 0 10px currentColor)' }} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-bold tabular-nums leading-none ${textClass}`}>{data.temp}°C</span>
              <span className={`text-[11px] font-medium ${meta.color}`}>{meta.label}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{data.city}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-white/6">
          {([
            { DIcon: Thermometer, label: 'Feels like', value: `${data.feelsLike}°C` },
            { DIcon: Droplets,    label: 'Humidity',   value: `${data.humidity}%`   },
            { DIcon: Wind,        label: 'Wind',       value: `${data.windKph} km/h` },
          ] as const).map(({ DIcon, label, value }) => (
            <div key={label} className="text-center">
              <DIcon className="h-3.5 w-3.5 text-slate-500 mx-auto mb-1" />
              <div className="text-[8px] uppercase tracking-wide text-slate-600">{label}</div>
              <div className={`text-[12px] font-semibold tabular-nums mt-0.5 ${textClass}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AQI */}
      {aqi && data.aqi != null && (
        <div className={`rounded-xl border ${aqi.borderColor} ${aqi.bgColor} px-4 py-3 flex items-center gap-4`}>
          <div className="flex-shrink-0">
            <div className={`text-[8px] font-mono uppercase tracking-[0.2em] ${aqi.textColor} opacity-60`}>
              Air Quality Index (US AQI)
            </div>
            <div className={`text-4xl font-bold tabular-nums leading-tight ${aqi.textColor}`}>{data.aqi}</div>
            <div className={`text-[12px] font-semibold ${aqi.textColor}`}>{aqi.label}</div>
          </div>
          <div className="flex-1">
            <div className="h-2 rounded-full bg-white/5 overflow-hidden mb-1.5">
              <motion.div
                className={`h-full rounded-full ${aqi.barColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (data.aqi / 300) * 100)}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between text-[7px] text-slate-700 font-mono">
              <span>Good</span><span>Moderate</span><span>Unhealthy</span><span>Hazard</span>
            </div>
          </div>
        </div>
      )}

      {/* Today + 5-day forecast */}
      <div className={`rounded-xl border ${borderClass} ${bgClass} px-3 py-3`}>
        <div className="text-[8px] uppercase tracking-[0.2em] text-slate-600 mb-2.5">Today + 5-Day Forecast</div>
        <div className="flex gap-1.5">
          <AnimatePresence>
            {data.forecast.map((f, i) => {
              const fm    = wmoMeta(f.code);
              const FIcon = fm.Icon;
              const isToday = i === 0;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.22 }}
                  className={`flex-1 flex flex-col items-center gap-1 rounded-xl py-2 ${
                    isToday
                      ? `border ${borderClass} ${bgClass}`
                      : 'bg-white/3 border border-white/4'
                  }`}
                >
                  <span className={`text-[9px] font-mono font-semibold ${isToday ? textClass : 'text-slate-500'}`}>{f.day}</span>
                  <FIcon className={`h-4 w-4 ${fm.color}`} />
                  <span className={`text-[12px] font-bold tabular-nums leading-none ${isToday ? textClass : 'text-slate-300'}`}>{f.high}°</span>
                  <span className="text-[9px] tabular-nums text-slate-600">{f.low}°</span>
                  {f.precipPct >= 20 && (
                    <div className="flex items-center gap-0.5">
                      <Droplets className="h-2.5 w-2.5 text-blue-400/70" />
                      <span className="text-[8px] tabular-nums text-blue-400/70">{f.precipPct}%</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ── Bare forecast strip (no card) ──────────────────────────────────────────── */

interface ForecastStripProps { city: string }

export function ForecastStrip({ city }: ForecastStripProps) {
  const [data,    setData]    = useState<WeatherData | null>(null);
  const fetchCity = city || 'Bengaluru';

  useEffect(() => {
    let cancelled = false;
    fetchWeatherData(fetchCity)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fetchCity]);

  if (!data) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="flex items-end justify-center gap-6 w-full"
    >
      {data.forecast.map((f, i) => {
        const fm   = wmoMeta(f.code);
        const Icon = fm.Icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
            className="flex flex-col items-center gap-1"
          >
            <span className={`text-[10px] font-mono ${i === 0 ? 'text-cyan-400' : 'text-slate-600'}`}>
              {f.day}
            </span>
            <Icon className={`h-5 w-5 ${fm.color}`} />
            <span className={`text-[11px] font-bold tabular-nums leading-none ${i === 0 ? 'text-cyan-300' : 'text-slate-400'}`}>
              {f.high}°
            </span>
            <span className="text-[9px] tabular-nums text-slate-600 leading-none">{f.low}°</span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ── Single-line orbit overlay ─────────────────────────────────────────────── */

interface WeatherLineProps { city: string }

export function WeatherLine({ city }: WeatherLineProps) {
  const [data,    setData]    = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchCity = city || 'Bengaluru';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWeatherData(fetchCity)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(()  => { if (!cancelled) { setLoading(false); } });
    return () => { cancelled = true; };
  }, [fetchCity]);

  if (loading || !data) return null;

  const meta    = wmoMeta(data.code);
  const Icon    = meta.Icon;
  const aqi     = data.aqi != null ? aqiBand(data.aqi) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, duration: 0.3, ease: 'easeOut' }}
      className="flex items-center gap-1.5 whitespace-nowrap"
    >
      <Icon className={`h-3 w-3 flex-shrink-0 ${meta.color}`} />
      <span className="text-[11px] font-bold tabular-nums text-cyan-300 leading-none">{data.temp}°C</span>
      <span className="text-[8px] text-slate-600 leading-none tabular-nums">feels {data.feelsLike}°</span>
      <span className="text-[8px] text-slate-700 leading-none">·</span>
      <span className="text-[9px] text-slate-400 leading-none">{meta.label}</span>
      <span className="text-[8px] text-slate-700 leading-none">·</span>
      <span className="text-[9px] text-blue-400/80 leading-none tabular-nums">{data.humidity}%</span>
      {aqi && (
        <>
          <span className="text-[8px] text-slate-700 leading-none">·</span>
          <span className={`text-[9px] font-mono leading-none ${aqi.textColor}`}>AQI {data.aqi} {aqi.shortLabel}</span>
        </>
      )}
    </motion.div>
  );
}

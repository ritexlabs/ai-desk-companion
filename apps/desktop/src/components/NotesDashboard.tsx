import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlarmClock, Bell, CheckCircle2, CheckSquare, ChevronDown, ChevronUp,
  Clock, Edit3, Mic, PenLine, Plus, RotateCcw, Square, StickyNote, Trash2, X,
} from 'lucide-react';

/* ── Types ──────────────────────────────────────────────────────────────── */

type ItemType = 'note' | 'task' | 'reminder' | 'alarm';
type RepeatMode = 'onetime' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

interface NoteItem {
  id:              string;
  type:            ItemType;
  title:           string;
  body:            string;
  created_at:      number;
  due_at:          number | null;
  repeat:          RepeatMode | null;
  repeat_time:     string | null;
  completed:       boolean;
  fired:           boolean;
  snoozed_until:   number | null;
  last_fired_date: string | null;
}

type Filter = 'all' | 'task' | 'note' | 'reminder';

/* ── Constants ──────────────────────────────────────────────────────────── */

const BASE = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');

const TYPE_META: Record<ItemType, {
  label: string; icon: React.ReactNode; color: string; bg: string;
  border: string; ring: string;
}> = {
  note:     { label: 'Note',     icon: <StickyNote   className="h-3.5 w-3.5" />, color: 'text-sky-400',    bg: 'bg-sky-400/10',     border: 'border-sky-400/30',    ring: 'ring-sky-400/40'    },
  task:     { label: 'Task',     icon: <CheckSquare  className="h-3.5 w-3.5" />, color: 'text-emerald-400',bg: 'bg-emerald-400/10', border: 'border-emerald-400/30',ring: 'ring-emerald-400/40'},
  reminder: { label: 'Reminder', icon: <Bell         className="h-3.5 w-3.5" />, color: 'text-violet-400', bg: 'bg-violet-400/10',  border: 'border-violet-400/30', ring: 'ring-violet-400/40' },
  alarm:    { label: 'Alarm',    icon: <AlarmClock   className="h-3.5 w-3.5" />, color: 'text-amber-400',  bg: 'bg-amber-400/10',   border: 'border-amber-400/30',  ring: 'ring-amber-400/40'  },
};

const REPEAT_OPTS: { value: RepeatMode; label: string }[] = [
  { value: 'onetime',  label: 'One time'   },
  { value: 'daily',    label: 'Daily'      },
  { value: 'weekdays', label: 'Weekdays'   },
  { value: 'weekly',   label: 'Weekly'     },
  { value: 'monthly',  label: 'Monthly'    },
];

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',      label: 'All'       },
  { id: 'task',     label: 'Tasks'     },
  { id: 'note',     label: 'Notes'     },
  { id: 'reminder', label: 'Reminders' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtDue(ts: number): string {
  const d    = new Date(ts * 1000);
  const now  = new Date();
  const diff = d.getTime() - now.getTime();
  const abs  = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff <= 0)         return fmtAbsolute(ts);
  if (diff < 60_000)     return `${abs} · in < 1 min`;
  if (diff < 3_600_000)  return `${abs} · in ${Math.round(diff / 60_000)}m`;
  if (diff < 86_400_000) return abs;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtAbsolute(ts: number): string {
  const d = new Date(ts * 1000);
  const isToday = d.toDateString() === new Date().toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function localToUnix(val: string): number | null {
  const ts = new Date(val).getTime();
  return isNaN(ts) ? null : Math.floor(ts / 1000);
}

/* ── Add / Edit Form ─────────────────────────────────────────────────────── */

// Form types visible in the picker — alarm is created internally via the Recurring toggle
const FORM_TYPES: ItemType[] = ['note', 'task', 'reminder'];

interface FormState {
  type:        ItemType;
  title:       string;
  body:        string;
  due_str:     string;      // datetime-local for reminders/tasks
  recurring:   boolean;     // when true on a reminder → saves as alarm type
  repeat_time: string;      // HH:MM for recurring reminders
  repeat:      RepeatMode;
}

const EMPTY_FORM: FormState = {
  type:        'task',
  title:       '',
  body:        '',
  due_str:     '',
  recurring:   false,
  repeat_time: '08:00',
  repeat:      'daily',
};

interface AddFormProps {
  initial?: Partial<FormState>;
  onSave:   (f: FormState) => Promise<void>;
  onCancel: () => void;
  saving:   boolean;
}

function AddForm({ initial, onSave, onCancel, saving }: AddFormProps) {
  const [f, setF] = useState<FormState>({ ...EMPTY_FORM, ...initial });
  const set = (k: keyof FormState, v: string | boolean) =>
    setF((p) => ({ ...p, [k]: v }));

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{    opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3"
    >
      {/* Type selector — Note / Task / Reminder only */}
      <div className="flex gap-1.5">
        {FORM_TYPES.map((t) => {
          const m = TYPE_META[t];
          return (
            <button
              key={t}
              onClick={() => setF((p) => ({ ...p, type: t, recurring: false }))}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium
                transition-all ${f.type === t
                  ? `${m.bg} ${m.color} ring-1 ${m.ring}`
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                }`}
            >
              {m.icon} {m.label}
            </button>
          );
        })}
      </div>

      {/* Title */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-white/50">Title *</label>
        <input
          autoFocus
          value={f.title}
          onChange={(e) => set('title', e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(f); } }}
          placeholder={
            f.type === 'reminder' ? 'e.g. Call dentist'
            : f.type === 'task'   ? 'e.g. Buy groceries'
            : 'Note title'
          }
          className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2
            text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/60
            focus:ring-1 focus:ring-violet-500/30 transition-colors"
        />
      </div>

      {/* Body */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-white/50">
          {f.type === 'note' ? 'Content' : 'Description (optional)'}
        </label>
        <textarea
          value={f.body}
          onChange={(e) => set('body', e.target.value)}
          rows={f.type === 'note' ? 3 : 2}
          placeholder={f.type === 'note' ? 'Write your note here...' : 'Additional details...'}
          className="w-full resize-none rounded-lg bg-black/30 border border-white/10 px-3 py-2
            text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/60
            focus:ring-1 focus:ring-violet-500/30 transition-colors"
        />
      </div>

      {/* Reminder scheduling */}
      {f.type === 'reminder' && (
        <>
          {/* Recurring toggle */}
          <button
            type="button"
            onClick={() => set('recurring', !f.recurring)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium
              border transition-all ${
              f.recurring
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            <AlarmClock className="h-3.5 w-3.5" />
            {f.recurring ? 'Recurring · on' : 'Recurring'}
          </button>

          {f.recurring ? (
            /* Alarm: Repeat select + conditional time / datetime */
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium text-white/50">Repeat</label>
                <select
                  value={f.repeat}
                  onChange={(e) => set('repeat', e.target.value)}
                  className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2
                    text-sm text-white outline-none focus:border-violet-500/60 transition-colors
                    [color-scheme:dark]"
                >
                  {REPEAT_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                {f.repeat === 'onetime' ? (
                  <>
                    <label className="mb-1 block text-[11px] font-medium text-white/50">Alarm at *</label>
                    <input
                      type="datetime-local"
                      value={f.due_str}
                      onChange={(e) => set('due_str', e.target.value)}
                      className="w-full rounded-lg bg-black/30 border border-amber-400/20 px-3 py-2
                        text-sm text-white outline-none focus:border-amber-400/60
                        focus:ring-1 focus:ring-amber-400/30 transition-colors [color-scheme:dark]"
                    />
                  </>
                ) : (
                  <>
                    <label className="mb-1 block text-[11px] font-medium text-white/50">Time *</label>
                    <input
                      type="time"
                      value={f.repeat_time}
                      onChange={(e) => set('repeat_time', e.target.value)}
                      className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2
                        text-sm text-white outline-none focus:border-violet-500/60
                        focus:ring-1 focus:ring-violet-500/30 transition-colors [color-scheme:dark]"
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            /* One-time reminder: datetime picker */
            <div>
              <label className="mb-1 block text-[11px] font-medium text-white/50">Remind at *</label>
              <input
                type="datetime-local"
                value={f.due_str}
                onChange={(e) => set('due_str', e.target.value)}
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2
                  text-sm text-white outline-none focus:border-violet-500/60
                  focus:ring-1 focus:ring-violet-500/30 transition-colors [color-scheme:dark]"
              />
            </div>
          )}
        </>
      )}

      {/* Task: optional due date */}
      {f.type === 'task' && (
        <div>
          <label className="mb-1 block text-[11px] font-medium text-white/50">Due date (optional)</label>
          <input
            type="datetime-local"
            value={f.due_str}
            onChange={(e) => set('due_str', e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2
              text-sm text-white outline-none focus:border-violet-500/60
              focus:ring-1 focus:ring-violet-500/30 transition-colors [color-scheme:dark]"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(f)}
          disabled={saving || !f.title.trim()}
          className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white
            hover:bg-violet-500 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving…' : initial ? 'Update' : 'Add'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg bg-white/5 py-2 text-sm font-medium text-white/60
            hover:bg-white/10 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

/* ── Item card ───────────────────────────────────────────────────────────── */

interface ItemCardProps {
  item:       NoteItem;
  onComplete: (id: string) => void;
  onDelete:   (id: string) => void;
  onEdit:     (item: NoteItem) => void;
  onUpdate:   (id: string, updates: Record<string, unknown>) => void;
}

function ItemCard({ item, onComplete, onDelete, onEdit, onUpdate }: ItemCardProps) {
  const [expanded,     setExpanded]     = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft,   setTitleDraft]   = useState(item.title);
  const [editingTime,  setEditingTime]  = useState(false);
  const [timeDraft,    setTimeDraft]    = useState('');

  const m    = TYPE_META[item.type];

  const isRecurringAlarm = item.type === 'alarm' && item.repeat !== 'onetime';

  // Recurring alarms cycle forever — they are never "overdue"
  const over = !isRecurringAlarm && !!(
    item.due_at && item.due_at * 1000 < Date.now() && !item.fired && !item.completed
  );

  // Next occurrence timestamp for recurring alarms
  const nextRecurringMs = (() => {
    if (!isRecurringAlarm || !item.repeat_time) return null;
    const [h, mm] = (item.repeat_time as string).split(':').map(Number);
    const next = new Date();
    next.setHours(h, mm, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    return next.getTime();
  })();

  const hasInlineTime =
    (isRecurringAlarm && !!item.repeat_time) ||
    (!isRecurringAlarm && !!item.due_at && item.type !== 'note');

  const timeDisplay = (() => {
    if (isRecurringAlarm && item.repeat_time) {
      const repeatLabel = REPEAT_OPTS.find(r => r.value === item.repeat)?.label ?? (item.repeat ?? 'Daily');
      if (nextRecurringMs) {
        const diffMs = nextRecurringMs - Date.now();
        const hrs    = Math.floor(diffMs / 3_600_000);
        const mins   = Math.round((diffMs % 3_600_000) / 60_000);
        const count  = hrs > 0 ? `next in ${hrs}h ${mins}m` : `next in ${mins}m`;
        return `${item.repeat_time} · ${repeatLabel} · ${count}`;
      }
      return `${item.repeat_time} · ${repeatLabel}`;
    }
    if (item.due_at) return over ? fmtAbsolute(item.due_at) : fmtDue(item.due_at);
    return null;
  })();

  const initTimeDraft = () => {
    if (isRecurringAlarm && item.repeat_time) {
      setTimeDraft(item.repeat_time);
    } else if (item.due_at) {
      const d   = new Date(item.due_at * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setTimeDraft(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    }
  };

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== item.title) onUpdate(item.id, { title: t });
    setEditingTitle(false);
  };

  const saveTime = () => {
    if (!timeDraft) { setEditingTime(false); return; }
    if (isRecurringAlarm) {
      if (timeDraft !== (item.repeat_time ?? '')) onUpdate(item.id, { repeat_time: timeDraft });
    } else {
      const ts = localToUnix(timeDraft);
      if (ts && ts !== item.due_at) onUpdate(item.id, { due_at: ts, fired: false });
    }
    setEditingTime(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{    opacity: 0, y: -4, transition: { duration: 0.15 } }}
      className={`group rounded-xl border transition-all ${
        item.completed
          ? 'border-white/5 bg-white/[0.02] opacity-50'
          : over
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-white/8 bg-white/[0.04] hover:bg-white/[0.07]'
      }`}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        {/* Left: type icon or task checkbox */}
        {item.type === 'task' ? (
          <button
            onClick={() => onComplete(item.id)}
            className={`mt-0.5 shrink-0 transition-colors ${
              item.completed ? 'text-emerald-400' : 'text-white/30 hover:text-emerald-400'
            }`}
            aria-label={item.completed ? 'Completed' : 'Mark complete'}
          >
            {item.completed ? <CheckCircle2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        ) : (
          <div className={`mt-0.5 shrink-0 rounded-md ${m.bg} p-1.5`}>
            <span className={m.color}>{m.icon}</span>
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Type label + recurring/onetime badge + overdue badge */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${m.color}`}>
              {m.label}
            </span>
            {(item.type === 'alarm' || item.type === 'reminder') && (
              isRecurringAlarm ? (
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${m.bg} ${m.color} opacity-80`}>
                  Recurring · {REPEAT_OPTS.find(r => r.value === item.repeat)?.label ?? item.repeat}
                </span>
              ) : (
                <span className="rounded-full px-2 py-0.5 text-[9px] font-medium bg-white/6 text-white/35">
                  One-time
                </span>
              )
            )}
            {over && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400">
                Overdue
              </span>
            )}
          </div>

          {/* Title — click to rename inline */}
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
                if (e.key === 'Escape') { setTitleDraft(item.title); setEditingTitle(false); }
              }}
              className="w-full rounded-md bg-black/40 border border-violet-500/50 px-2 py-0.5
                text-sm text-white outline-none focus:ring-1 focus:ring-violet-500/40"
            />
          ) : (
            <p
              onClick={() => {
                if (!item.completed) { setTitleDraft(item.title); setEditingTitle(true); }
              }}
              title={item.completed ? undefined : 'Click to rename'}
              className={`text-sm font-medium leading-snug ${
                item.completed
                  ? 'line-through text-white/30'
                  : 'text-white/90 hover:text-white cursor-text'
              }`}
            >
              {item.title}
            </p>
          )}

          {/* Time row — prominent, click to adjust */}
          {!item.completed && hasInlineTime && timeDisplay && (
            <div className="mt-1.5">
              {editingTime ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    autoFocus
                    type={isRecurringAlarm ? 'time' : 'datetime-local'}
                    value={timeDraft}
                    onChange={(e) => setTimeDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingTime(false);
                    }}
                    className="rounded-md bg-black/40 border border-violet-500/50 px-2 py-1 text-xs
                      text-white outline-none focus:ring-1 focus:ring-violet-500/40 [color-scheme:dark]"
                  />
                  <button
                    onMouseDown={(e) => { e.preventDefault(); saveTime(); }}
                    className="rounded-md bg-violet-600 px-2 py-1 text-xs font-semibold text-white
                      hover:bg-violet-500 transition-colors"
                  >
                    Set
                  </button>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); setEditingTime(false); }}
                    className="rounded-md p-1 text-white/30 hover:text-white/60 transition-colors"
                    aria-label="Cancel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { initTimeDraft(); setEditingTime(true); }}
                  title="Click to adjust time"
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] font-medium
                    transition-colors hover:bg-white/8 ${
                    over ? 'text-red-400' : m.color
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {timeDisplay}
                </button>
              )}
            </div>
          )}

          {/* Body text */}
          {item.body && (
            <p className={`mt-1 text-xs text-white/50 leading-relaxed ${expanded ? '' : 'line-clamp-1'}`}>
              {item.body}
            </p>
          )}
          {item.body && item.body.length > 60 && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="mt-0.5 flex items-center gap-0.5 text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              {expanded
                ? <><ChevronUp className="h-3 w-3" /> Less</>
                : <><ChevronDown className="h-3 w-3" /> More</>}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {!item.completed && (
            <button
              onClick={() => onEdit(item)}
              className="rounded-lg p-1.5 text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
              aria-label="Full edit"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onDelete(item.id)}
            className="rounded-lg p-1.5 text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

function EmptyState({ filter, onAdd }: { filter: Filter; onAdd: () => void }) {
  const msgs: Record<Filter, string> = {
    all:      'Nothing here yet.',
    note:     'No notes yet.',
    task:     'No tasks yet.',
    reminder: 'No reminders or alarms set.',
  };
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 rounded-full bg-white/5 p-4">
        <PenLine className="h-7 w-7 text-white/20" />
      </div>
      <p className="text-sm font-medium text-white/30">{msgs[filter]}</p>
      <p className="mt-1 text-xs text-white/20">Add one via voice or click +</p>
      <button
        onClick={onAdd}
        className="mt-4 flex items-center gap-1.5 rounded-lg bg-violet-600/20 px-3 py-1.5
          text-xs font-medium text-violet-400 hover:bg-violet-600/30 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add {filter !== 'all' ? filter : 'item'}
      </button>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────────────────── */

interface Props {
  onClose:    () => void;
  onVoiceCmd: (text: string) => void;
}

export function NotesDashboard({ onClose, onVoiceCmd }: Props) {
  const [items,        setItems]        = useState<NoteItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState<Filter>('all');
  const [showAdd,      setShowAdd]      = useState(false);
  const [addInitType,  setAddInitType]  = useState<ItemType>('task');
  const [editItem,     setEditItem]     = useState<NoteItem | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [showDone,     setShowDone]     = useState(false);

  const openAdd = useCallback((fromFilter: Filter = filter) => {
    const typeMap: Record<Filter, ItemType> = {
      all: 'task', task: 'task', note: 'note', reminder: 'reminder',
    };
    setAddInitType(typeMap[fromFilter]);
    setEditItem(null);
    setShowAdd(true);
  }, [filter]);

  /* ── Fetch ──────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/notes`);
      if (r.ok) {
        const d = await r.json();
        setItems(d.items ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── CRUD ───────────────────────────────────────────────────────────── */
  const handleSave = useCallback(async (f: FormState) => {
    if (!f.title.trim()) return;
    setSaving(true);
    try {
      // A recurring reminder is stored as 'alarm' type in the backend
      const effectiveType = f.type === 'reminder' && f.recurring ? 'alarm' : f.type;
      const payload: Record<string, unknown> = {
        type:  effectiveType,
        title: f.title.trim(),
        body:  f.body.trim(),
      };
      if (effectiveType === 'alarm') {
        if (f.repeat === 'onetime') {
          payload.repeat = 'onetime';
          if (f.due_str) payload.due_at = localToUnix(f.due_str);
        } else {
          payload.repeat_time = f.repeat_time;
          payload.repeat      = f.repeat;
        }
      } else if (f.type === 'reminder' && f.due_str) {
        payload.due_at = localToUnix(f.due_str);
      } else if (f.type === 'task' && f.due_str) {
        payload.due_at = localToUnix(f.due_str);
      }

      if (editItem) {
        // When type changes (e.g. reminder → alarm), reset firing state
        if (editItem.type !== effectiveType) {
          payload.fired           = false;
          payload.last_fired_date = null;
        }
        const r = await fetch(`${BASE}/api/notes/${editItem.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        if (r.ok) {
          const d = await r.json();
          setItems((p) => p.map((i) => i.id === editItem.id ? d.item : i));
        }
        setEditItem(null);
      } else {
        const r = await fetch(`${BASE}/api/notes`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        if (r.ok) {
          const d = await r.json();
          setItems((p) => [d.item, ...p]);
        }
        setShowAdd(false);
      }
    } catch {}
    setSaving(false);
  }, [editItem]);

  const handleUpdate = useCallback(async (id: string, updates: Record<string, unknown>) => {
    try {
      const r = await fetch(`${BASE}/api/notes/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updates),
      });
      if (r.ok) {
        const d = await r.json();
        setItems((p) => p.map((i) => i.id === id ? d.item : i));
      }
    } catch {}
  }, []);

  const handleComplete = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${BASE}/api/notes/${id}/complete`, { method: 'POST' });
      if (r.ok) {
        const d = await r.json();
        setItems((p) => p.map((i) => i.id === id ? d.item : i));
      }
    } catch {}
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${BASE}/api/notes/${id}`, { method: 'DELETE' });
      if (r.ok) setItems((p) => p.filter((i) => i.id !== id));
    } catch {}
  }, []);

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const filtered = items.filter((i) => {
    if (filter !== 'all') {
      // "Reminders" tab covers both reminder and alarm types
      const match = filter === 'reminder'
        ? i.type === 'reminder' || i.type === 'alarm'
        : i.type === filter;
      if (!match) return false;
    }
    if (!showDone && i.completed) return false;
    return true;
  });

  const completedCount = items.filter((i) => i.completed).length;

  const editInitial = editItem ? {
    // alarm items are edited as "Reminder + recurring on"
    type:        editItem.type === 'alarm' ? 'reminder' as ItemType : editItem.type,
    recurring:   editItem.type === 'alarm',
    title:       editItem.title,
    body:        editItem.body,
    due_str:     editItem.due_at ? new Date(editItem.due_at * 1000).toISOString().slice(0, 16) : '',
    repeat_time: editItem.repeat_time ?? '08:00',
    repeat:      (editItem.repeat as RepeatMode) ?? 'daily',
  } : undefined;

  /* ── Voice trigger ───────────────────────────────────────────────────── */
  const handleVoice = () => {
    onVoiceCmd(
      'I want to manage my notes and reminders. You can help me add, list, complete, or delete notes, tasks, reminders, and alarms.'
    );
  };

  /* ── Counts per filter ───────────────────────────────────────────────── */
  const countFor = (f: Filter) => {
    if (f === 'all') return items.filter((i) => !i.completed).length;
    if (f === 'reminder') return items.filter((i) => (i.type === 'reminder' || i.type === 'alarm') && !i.completed).length;
    return items.filter((i) => i.type === f && !i.completed).length;
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{    opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="relative flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden
          rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl"
        initial={{ scale: 0.94, opacity: 0, y: 20 }}
        animate={{ scale: 1,    opacity: 1, y: 0  }}
        exit={{    scale: 0.94, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600/20 ring-1 ring-violet-500/30">
            <Bell className="h-4 w-4 text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-white">Notes & Reminders</h2>
            <p className="text-[11px] text-white/40">
              {items.length === 0 ? 'No items' : `${items.filter((i) => !i.completed).length} active`}
              {completedCount > 0 ? `, ${completedCount} completed` : ''}
            </p>
          </div>
          <button
            onClick={handleVoice}
            className="h-7 px-2.5 rounded-xl border border-violet-400/25 bg-violet-400/8 text-[11px] font-medium flex items-center gap-1.5 text-violet-300 hover:bg-violet-400/15 transition"
            title="Trigger voice command"
          >
            <Mic className="h-3 w-3" /> Voice
          </button>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-xl border border-white/10 bg-white/4 flex items-center justify-center text-slate-500 hover:text-slate-200 transition"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex shrink-0 items-center gap-1 border-b border-white/8 px-4 py-2.5 overflow-x-auto">
          {FILTERS.map(({ id, label }) => {
            const cnt = countFor(id);
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium
                  whitespace-nowrap transition-all ${
                  filter === id
                    ? 'bg-violet-600/20 text-violet-300 ring-1 ring-violet-500/30'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                {label}
                {cnt > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    filter === id ? 'bg-violet-500/30 text-violet-300' : 'bg-white/10 text-white/40'
                  }`}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {completedCount > 0 && (
              <button
                onClick={() => setShowDone((p) => !p)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px]
                  font-medium transition-colors ${
                  showDone ? 'text-emerald-400 bg-emerald-400/10' : 'text-white/30 hover:text-white/50'
                }`}
              >
                <RotateCcw className="h-3 w-3" />
                {showDone ? 'Hide done' : `${completedCount} done`}
              </button>
            )}
            <button
              onClick={() => openAdd()}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5
                text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {/* Add form */}
          <AnimatePresence>
            {(showAdd && !editItem) && (
              <AddForm
                key="add"
                initial={{ type: addInitType }}
                onSave={handleSave}
                onCancel={() => setShowAdd(false)}
                saving={saving}
              />
            )}
          </AnimatePresence>

          {/* Edit form (inline above the edited item) */}
          <AnimatePresence>
            {editItem && (
              <AddForm
                key="edit"
                initial={editInitial}
                onSave={handleSave}
                onCancel={() => setEditItem(null)}
                saving={saving}
              />
            )}
          </AnimatePresence>

          {/* Items */}
          {loading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState filter={filter} onAdd={() => openAdd()} />
          ) : (
            <AnimatePresence mode="popLayout">
              {filtered.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onComplete={handleComplete}
                  onDelete={handleDelete}
                  onEdit={(i) => { setEditItem(i); setShowAdd(false); }}
                  onUpdate={handleUpdate}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer hint */}
        <div className="shrink-0 border-t border-white/5 px-5 py-2.5 flex items-center gap-2">
          <Clock className="h-3 w-3 text-white/20" />
          <p className="text-[10px] text-white/25">
            Reminders fire even when this panel is closed. Voice mode: say &ldquo;remind me to…&rdquo;, &ldquo;set alarm for…&rdquo;, or &ldquo;add task…&rdquo;
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

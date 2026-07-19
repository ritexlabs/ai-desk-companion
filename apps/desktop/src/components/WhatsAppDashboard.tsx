import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCheck, MessageCircle, Plus, RefreshCw, Send, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WaMessage {
  wa_message_id: string;
  from_phone: string;
  from_name: string;
  body: string;
  timestamp: number;
  direction: 'incoming' | 'outgoing';
  dashboard_status: string;
  wa_delivery: string | null;
}

interface WaConversation {
  phone: string;
  name: string;
  messages: WaMessage[];
  unread: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  const diff = today.getDate() - d.getDate();
  if (diff === 0 && d.getMonth() === today.getMonth()) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function lastMsg(conv: WaConversation): WaMessage | undefined {
  return [...conv.messages].sort((a, b) => b.timestamp - a.timestamp)[0];
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 select-none"
      style={{
        width: size, height: size,
        background: `hsl(${hue},55%,35%)`,
        fontSize: size * 0.36,
      }}
    >
      {initials || '?'}
    </div>
  );
}

// ── Conversation list item ────────────────────────────────────────────────────

function ConvRow({
  conv, selected, onClick,
}: { conv: WaConversation; selected: boolean; onClick: () => void }) {
  const last = lastMsg(conv);
  const preview = last ? (last.direction === 'outgoing' ? `You: ${last.body}` : last.body) : '';

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
        selected
          ? 'bg-green-400/12 border border-green-400/25'
          : 'hover:bg-white/[0.04] border border-transparent'
      }`}
    >
      <div className="relative">
        <Avatar name={conv.name} size={38} />
        {conv.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-green-400 text-[9px] font-bold text-black flex items-center justify-center px-1">
            {conv.unread > 9 ? '9+' : conv.unread}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-semibold truncate ${selected ? 'text-green-300' : 'text-white/80'}`}>
          {conv.name}
        </div>
        <div className="text-[10px] text-slate-500 truncate mt-0.5">{preview}</div>
      </div>
      {last && (
        <div className="text-[9px] text-slate-600 shrink-0">{fmtTime(last.timestamp)}</div>
      )}
    </motion.button>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: WaMessage }) {
  const out = msg.direction === 'outgoing';
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] px-3 py-2 rounded-2xl text-[12px] leading-relaxed break-words ${
          out
            ? 'bg-green-500/20 border border-green-400/25 text-green-50 rounded-br-sm'
            : 'bg-white/[0.07] border border-white/8 text-slate-200 rounded-bl-sm'
        }`}
      >
        <div>{msg.body}</div>
        <div className={`flex items-center gap-1 mt-0.5 ${out ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[9px] text-slate-500">{fmtTime(msg.timestamp)}</span>
          {out && (
            msg.wa_delivery === 'delivered' || msg.wa_delivery === 'read'
              ? <CheckCheck className="h-2.5 w-2.5 text-green-400" />
              : <Check className="h-2.5 w-2.5 text-slate-500" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Date divider ──────────────────────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex-1 h-px bg-white/5" />
      <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}

// ── Status banner ─────────────────────────────────────────────────────────────

function StatusBanner({ status }: { status: string }) {
  if (!status) return null;
  const isOk = status.startsWith('Connected');
  return (
    <div className={`mx-3 mt-2 mb-1 px-3 py-1.5 rounded-lg text-[10px] font-medium border flex items-center gap-1.5 ${
      isOk
        ? 'bg-green-400/8 border-green-400/20 text-green-300'
        : 'bg-amber-400/8 border-amber-400/20 text-amber-300'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isOk ? 'bg-green-400' : 'bg-amber-400'}`} />
      {status}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

// ── Root ──────────────────────────────────────────────────────────────────────

export function WhatsAppDashboard({ onClose }: Props) {
  const [convs, setConvs]             = useState<WaConversation[]>([]);
  const [selected, setSelected]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [fetchErr, setFetchErr]       = useState('');
  const [waStatus, setWaStatus]       = useState('');
  const [composeTo, setComposeTo]     = useState('');
  const [composeMsg, setComposeMsg]   = useState('');
  const [sending, setSending]         = useState(false);
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [newMode, setNewMode]       = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgInputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setFetchErr('');
    try {
      // Fetch conversations + status in parallel
      const [convR, statusR] = await Promise.allSettled([
        fetch('http://localhost:8787/api/whatsapp/conversations?limit=50'),
        fetch('http://localhost:8787/api/whatsapp/verify'),
      ]);

      if (statusR.status === 'fulfilled' && statusR.value.ok) {
        const sd = await statusR.value.json();
        setWaStatus(sd.detail || '');
      } else {
        setWaStatus('Not configured — add credentials in Settings → Agents → WhatsApp');
      }

      if (convR.status === 'fulfilled' && convR.value.ok) {
        const data = await convR.value.json();
        const list: WaConversation[] = (data.conversations || []).map((c: WaConversation) => ({
          ...c,
          messages: [...c.messages].sort((a, b) => a.timestamp - b.timestamp),
        }));
        setConvs(list);
        if (!selected && list.length > 0) setSelected(list[0].phone);
      } else {
        throw new Error('conversations fetch failed');
      }
    } catch {
      setFetchErr('Could not reach the gateway. Make sure all services are running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selected]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected, convs]);

  const selectedConv = convs.find(c => c.phone === selected);

  const handleSelect = (phone: string) => {
    setSelected(phone);
    setComposeTo(phone);
    setNewMode(false);
    setSendStatus(null);
  };

  const handleNew = () => {
    setSelected(null);
    setComposeTo('');
    setComposeMsg('');
    setNewMode(true);
    setSendStatus(null);
  };

  const handleSend = async () => {
    const to  = composeTo.trim();
    const msg = composeMsg.trim();
    if (!to || !msg) return;
    setSending(true);
    setSendStatus(null);
    try {
      const r = await fetch('http://localhost:8787/api/whatsapp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to, message: msg }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Send failed');
      setComposeMsg('');
      setSendStatus({ ok: true, text: 'Sent' });
      await load(true);
    } catch (e: unknown) {
      setSendStatus({ ok: false, text: e instanceof Error ? e.message : 'Failed to send' });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build chronological messages with date dividers
  const threadMessages = selectedConv ? selectedConv.messages : [];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-full flex overflow-hidden"
          style={{
            maxWidth: 860,
            height: 'min(680px, 90vh)',
            background: 'rgba(6,10,20,0.98)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 24,
            boxShadow: '0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(74,222,128,0.06)',
          }}
        >
          {/* ── Left: conversation list ───────────────────────── */}
          <div
            className="flex flex-col shrink-0 border-r border-white/6"
            style={{ width: 260, background: 'rgba(0,0,0,0.22)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-white/5 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-green-400/12 border border-green-400/20 flex items-center justify-center">
                <MessageCircle className="h-3.5 w-3.5 text-green-400" />
              </div>
              <span className="text-[13px] font-semibold text-white flex-1">WhatsApp</span>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                title="Refresh"
                className="p-1 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/8 transition"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin text-green-400' : ''}`} />
              </button>
              <button
                onClick={handleNew}
                title="New message"
                className="p-1 rounded-lg text-slate-600 hover:text-green-400 hover:bg-green-400/8 transition"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Connection status */}
            <StatusBanner status={waStatus} />

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin">
              {loading ? (
                <div className="flex flex-col gap-2 px-2 pt-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-9 h-9 rounded-full bg-white/6" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 bg-white/6 rounded w-3/4" />
                        <div className="h-2 bg-white/4 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : fetchErr ? (
                <div className="px-3 pt-4 text-[11px] text-red-400/70 leading-relaxed">{fetchErr}</div>
              ) : convs.length === 0 ? (
                <div className="px-3 pt-6 text-center">
                  <MessageCircle className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                  {waStatus.startsWith('Connected') ? (
                    <>
                      <p className="text-[11px] text-slate-500">No messages yet</p>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">
                        Tap <span className="text-green-400">+</span> to send your first message,
                        or wait for incoming messages via the webhook.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-amber-400/70">WhatsApp not configured</p>
                      <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">
                        Open Settings → Agents → WhatsApp and add your Phone Number ID and Access Token.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {convs.map((conv, i) => (
                    <motion.div
                      key={conv.phone}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <ConvRow
                        conv={conv}
                        selected={selected === conv.phone && !newMode}
                        onClick={() => handleSelect(conv.phone)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* ── Right: thread + compose ───────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-3.5 right-3.5 z-10 w-7 h-7 rounded-xl border border-white/8 bg-white/4 hover:bg-white/10 text-slate-500 hover:text-white transition flex items-center justify-center"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Thread header */}
            <div
              className="flex items-center gap-3 px-5 py-3.5 border-b border-white/6 shrink-0 pr-12"
              style={{ background: newMode ? 'rgba(74,222,128,0.04)' : 'rgba(0,0,0,0.12)' }}
            >
              {newMode ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-green-400/12 border border-green-400/20 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-green-400" />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-green-300">New Message</div>
                    <div className="text-[10px] text-slate-500">Enter a contact name or phone number</div>
                  </div>
                </>
              ) : selectedConv ? (
                <>
                  <Avatar name={selectedConv.name} size={32} />
                  <div>
                    <div className="text-[12px] font-semibold text-white">{selectedConv.name}</div>
                    <div className="text-[10px] text-slate-500">{selectedConv.phone}</div>
                  </div>
                  {selectedConv.unread > 0 && (
                    <span className="ml-auto mr-2 text-[9px] font-bold bg-green-400/15 text-green-400 border border-green-400/25 rounded-full px-2 py-0.5">
                      {selectedConv.unread} unread
                    </span>
                  )}
                </>
              ) : (
                <div className="text-[12px] text-slate-500">Select a conversation</div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 scrollbar-thin">
              {!newMode && !selectedConv && !loading && (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
                  <MessageCircle className="h-12 w-12 text-green-400/40" />
                  <p className="text-[12px] text-slate-500">Select a conversation to view messages</p>
                </div>
              )}

              {!newMode && threadMessages.length > 0 && (() => {
                const elements: React.ReactNode[] = [];
                let lastDateLabel = '';
                threadMessages.forEach((msg, i) => {
                  const label = fmtDate(msg.timestamp);
                  if (label !== lastDateLabel) {
                    lastDateLabel = label;
                    elements.push(<DateDivider key={`d-${i}`} label={label} />);
                  }
                  elements.push(
                    <motion.div
                      key={msg.wa_message_id || i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Bubble msg={msg} />
                    </motion.div>
                  );
                });
                return elements;
              })()}

              <div ref={bottomRef} />
            </div>

            {/* Compose area */}
            <div className="shrink-0 border-t border-white/6 px-4 py-3" style={{ background: 'rgba(0,0,0,0.18)' }}>
              {/* New message "To" field */}
              {newMode && (
                <div className="mb-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                    <span className="text-[10px] text-slate-500 shrink-0 font-medium">To:</span>
                    <input
                      type="text"
                      value={composeTo}
                      onChange={e => setComposeTo(e.target.value)}
                      placeholder="Contact name or +1234567890"
                      className="flex-1 bg-transparent text-[12px] text-white placeholder-slate-600 outline-none"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* Message input + send */}
              <div className="flex items-end gap-2">
                <textarea
                  ref={msgInputRef}
                  value={composeMsg}
                  onChange={e => setComposeMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={newMode ? 'Type a message…' : `Reply to ${selectedConv?.name ?? ''}…`}
                  rows={1}
                  disabled={!newMode && !selectedConv}
                  className="flex-1 resize-none bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-[12px] text-white placeholder-slate-600 outline-none focus:border-green-400/30 transition scrollbar-thin"
                  style={{ maxHeight: 100, minHeight: 40 }}
                  onInput={e => {
                    const t = e.currentTarget;
                    t.style.height = 'auto';
                    t.style.height = Math.min(t.scrollHeight, 100) + 'px';
                  }}
                />
                <motion.button
                  onClick={handleSend}
                  disabled={sending || !composeMsg.trim() || (!newMode && !selectedConv) || (newMode && !composeTo.trim())}
                  whileTap={{ scale: 0.92 }}
                  className="h-10 w-10 rounded-xl bg-green-500/20 border border-green-400/30 flex items-center justify-center text-green-400 hover:bg-green-400/25 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0"
                >
                  {sending
                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </motion.button>
              </div>

              {/* Send status */}
              <AnimatePresence>
                {sendStatus && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`mt-1.5 text-[10px] font-medium ${sendStatus.ok ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {sendStatus.text}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Keyboard hint */}
              <div className="mt-1 text-[9px] text-slate-700">Enter to send · Shift+Enter for new line</div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

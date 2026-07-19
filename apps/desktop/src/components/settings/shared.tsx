import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import type { ConnectionStatus } from '../../hooks/useAgentConfig';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-2.5">{children}</div>
  );
}

export function StatusBadge({ status, info }: { status: ConnectionStatus; info?: string }) {
  if (status === 'verifying')
    return (
      <span className="flex items-center gap-1 text-cyan-400 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
      </span>
    );
  if (status === 'connected')
    return (
      <span className="flex items-center gap-1 text-emerald-400 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5" /> {info || 'Connected'}
      </span>
    );
  if (status === 'error')
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs">
        <AlertTriangle className="h-3.5 w-3.5" /> {info || 'Error'}
      </span>
    );
  return <span className="text-slate-600 text-xs">Not connected</span>;
}

export function TokenField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••••••••••'}
          autoComplete="off"
          spellCheck={false}
          className="w-full h-9 rounded-xl border border-white/10 bg-black/30 pl-4 pr-10 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition-colors font-mono"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function SecurityNotice() {
  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/6 p-3 flex gap-2.5">
      <Shield className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
      <div className="text-[11px] text-emerald-300/80 leading-relaxed">
        <span className="font-semibold text-emerald-300">Stored locally only.</span> Credentials
        are saved in your browser's localStorage — never in any source file, .env, or sent anywhere
        except the specific API endpoint you connect to. They cannot be committed to Git.
      </div>
    </div>
  );
}

import type { TranscriptTurn } from '../types/runtime';

export function ConsolePanel({
  heard,
  assistantSpeech,
  transcript
}: {
  heard: string;
  assistantSpeech: string;
  transcript: TranscriptTurn[];
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
      <div className="text-sm uppercase tracking-[0.25em] text-slate-300">Voice Console</div>

      <div className="mt-4 text-xs uppercase tracking-[0.25em] text-slate-400">Heard</div>
      <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/90">{heard}</div>

      <div className="mt-5 text-xs uppercase tracking-[0.25em] text-slate-400">Assistant Speech</div>
      <div className="mt-2 min-h-[110px] rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-cyan-50">
        {assistantSpeech}
      </div>

      <div className="mt-5 text-xs uppercase tracking-[0.25em] text-slate-400">Transcript</div>
      <div className="mt-2 max-h-[260px] overflow-auto rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="space-y-3 text-sm">
          {transcript.map((turn, index) => (
            <div key={`${turn.timestamp}-${index}`} className="rounded-2xl border border-white/5 bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{turn.speaker}</div>
              <div className="mt-1 text-slate-200">{turn.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

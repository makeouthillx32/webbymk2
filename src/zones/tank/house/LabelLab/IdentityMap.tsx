"use client";

import React, { useMemo, useState } from "react";

// How the director's model sees everyone it knows. One dot per graded sighting,
// placed so look-alikes sit together, coloured by the name it was given. Where
// two colours mix, the director confuses those two people; a ringed dot sits
// among another name's dots and is very likely graded wrong.

export type MapPoint = {
  key: string; name: string; room: string; x: number; y: number;
  outlier: boolean; looksLike: string | null; agree: number;
};
export type MapClass = { points: MapPoint[]; confusion: Record<string, Record<string, number>>; outliers: number };
export type IdentityMapData = { builtAt: string; classes: Partial<Record<"person" | "dog" | "cat", MapClass>> };

// Distinguishable in both light and dark, and never red for a person (red is
// the "wrong" signal everywhere else on this screen).
const PALETTE = ["#38bdf8", "#f59e0b", "#a78bfa", "#34d399", "#f472b6", "#facc15", "#60a5fa", "#fb923c", "#2dd4bf", "#c084fc"];

export function IdentityMap({ data, displayName, onOpen }: {
  data: IdentityMapData;
  displayName: (slug: string) => string;
  onOpen: (point: MapPoint) => void;
}) {
  const classes = (["person", "dog", "cat"] as const).filter((cls) => data.classes[cls]);
  const [cls, setCls] = useState<(typeof classes)[number]>(classes[0] ?? "person");
  const [hover, setHover] = useState<MapPoint | null>(null);
  const [onlyOutliers, setOnlyOutliers] = useState(false);
  const view = data.classes[cls];

  const colours = useMemo(() => {
    const names = [...new Set((view?.points ?? []).map((p) => p.name))].sort();
    return Object.fromEntries(names.map((name, i) => [name, PALETTE[i % PALETTE.length]]));
  }, [view]);
  if (!view) return <div className="text-[11px] text-slate-500">No map yet.</div>;

  const counts = view.points.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.name]: (acc[p.name] ?? 0) + 1 }), {});
  const names = Object.keys(colours);
  const size = 520;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="rounded-xl border border-white/10 bg-black/40 p-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {classes.map((c) => (
            <button key={c} type="button" onClick={() => setCls(c)}
              className={`rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase ${cls === c ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}>
              {c === "person" ? "People" : c === "dog" ? "Dogs" : "Cats"}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400">
            <input type="checkbox" checked={onlyOutliers} onChange={(event) => setOnlyOutliers(event.target.checked)} />
            Only probable mistakes ({view.outliers})
          </label>
        </div>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-full" role="img" aria-label="Identity map">
          <rect x={0} y={0} width={size} height={size} fill="transparent" />
          {view.points.filter((p) => !onlyOutliers || p.outlier).map((p) => {
            const x = 12 + p.x * (size - 24);
            const y = 12 + p.y * (size - 24);
            return (
              <g key={p.key} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(p)} style={{ cursor: "pointer" }}>
                {p.outlier ? <circle cx={x} cy={y} r={7} fill="none" stroke="#f43f5e" strokeWidth={1.5} /> : null}
                <circle cx={x} cy={y} r={p.outlier ? 4 : 3} fill={colours[p.name]} fillOpacity={0.85} />
              </g>
            );
          })}
        </svg>
        <div className="min-h-[18px] px-1 font-mono text-[10px] text-slate-400">
          {hover
            ? `${displayName(hover.name)} · ${hover.room}${hover.looksLike ? ` · looks more like ${displayName(hover.looksLike)} (${Math.round((1 - hover.agree) * 100)}% of its neighbours)` : ""} · click to open`
            : "Hover a dot. Ringed dots sit among another name's dots — likely graded wrong."}
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="mb-2 text-[10px] font-black uppercase text-slate-300">Who</div>
          <div className="space-y-1">
            {names.map((name) => (
              <div key={name} className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colours[name] }} />
                <span className="flex-1">{displayName(name)}</span>
                <span className="font-mono text-[10px] text-slate-500">{counts[name]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="mb-2 text-[10px] font-black uppercase text-slate-300">Mixed up with</div>
          <p className="mb-2 text-[9px] text-slate-500">For each name: how often its sightings look more like someone else.</p>
          <div className="space-y-1">
            {Object.entries(view.confusion).map(([name, row]) => {
              const total = Object.values(row).reduce((a, b) => a + b, 0);
              const wrong = Object.entries(row).filter(([other]) => other !== name).sort((a, b) => b[1] - a[1]);
              return (
                <div key={name} className="text-[10px] text-slate-400">
                  <span className="font-black text-slate-200">{displayName(name)}</span>{" "}
                  {wrong.length
                    ? wrong.slice(0, 2).map(([other, n]) => `${displayName(other)} ${Math.round((n / total) * 100)}%`).join(" · ")
                    : "clean"}
                </div>
              );
            })}
          </div>
        </div>
        <div className="font-mono text-[9px] text-slate-600">Built {new Date(data.builtAt).toLocaleString()}</div>
      </div>
    </div>
  );
}

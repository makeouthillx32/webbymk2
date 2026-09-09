import type { MoleculeDrawing } from "./molecule-drawio";

export type MoleculeViewportProps = {
  drawing?: MoleculeDrawing | null;
  label?: string;
  className?: string;
  color?: "foreground" | "primary" | "accent" | "muted";
};

const colorClasses = {
  foreground: "text-[hsl(var(--foreground))]",
  primary: "text-[hsl(var(--primary))]",
  accent: "text-[hsl(var(--accent-foreground))]",
  muted: "text-[hsl(var(--muted-foreground))]",
} as const;

export function MoleculeViewport({ drawing, label = "Chemical structure", className = "", color = "primary" }: MoleculeViewportProps) {
  if (!drawing) return null;
  return (
    <figure className={`m-0 block w-full bg-transparent ${colorClasses[color]} ${className}`} aria-label={label}>
      <svg viewBox={drawing.viewBox.join(" ")} className="block h-auto w-full overflow-visible" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          {drawing.bonds.map((bond) => <line key={bond.id} x1={bond.x1} y1={bond.y1} x2={bond.x2} y2={bond.y2} strokeWidth={bond.width} vectorEffect="non-scaling-stroke" />)}
        </g>
        <g fill="currentColor" stroke="none">
          {drawing.labels.map((atom) => <text key={atom.id} x={atom.x} y={atom.y} fontSize={atom.fontSize} fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" textAnchor={atom.align} dominantBaseline="middle">{atom.value}</text>)}
        </g>
      </svg>
    </figure>
  );
}

"use client";
// src/zones/blog/_components/ChartHydrator.tsx
// Finds ``` chart ``` placeholders emitted by markdown.ts (figure.blog-chart with
// a data-chart-config JSON spec) and mounts an interactive, theme-colored Chart.js
// chart into each. Re-inits when the color theme flips. No chart in a post → no-op,
// no JS cost. This is our answer to GitButler's bespoke embedded article charts.

import { useEffect } from "react";
import { useTheme } from "next-themes";

type ChartSpec = {
  type?: "bar" | "line" | "area" | "pie" | "doughnut";
  labels?: (string | number)[];
  datasets?: { label?: string; data: number[] }[];
  // convenience single-series form: { data: [...] }
  data?: number[];
  stacked?: boolean;
  yLabel?: string;
  xLabel?: string;
  beginAtZero?: boolean;
};

// Read an HSL-triplet CSS var ("218 79% 66%") into a usable color string.
function readVar(styles: CSSStyleDeclaration, name: string): string {
  const raw = styles.getPropertyValue(name).trim();
  return raw || "0 0% 50%";
}
function hsl(triplet: string, alpha?: number): string {
  const t = triplet.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return alpha == null ? `hsl(${t})` : `hsl(${t} / ${alpha})`;
}
function baseHue(triplet: string): number {
  const h = parseFloat(triplet.replace(/,/g, " ").trim().split(/\s+/)[0]);
  return Number.isFinite(h) ? h : 210;
}

// A pleasant, theme-anchored categorical palette: rotate hue off the primary.
function palette(primaryTriplet: string, n: number): string[] {
  const h0 = baseHue(primaryTriplet);
  const offsets = [0, 42, -38, 128, 200, 84, -80, 160, 300, 20];
  const sats = [72, 65, 78, 60, 70];
  const lights = [60, 66, 54, 70, 48];
  return Array.from({ length: n }, (_, i) => {
    const h = (((h0 + offsets[i % offsets.length]) % 360) + 360) % 360;
    return `${h} ${sats[i % sats.length]}% ${lights[i % lights.length]}%`;
  });
}

export default function ChartHydrator() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let charts: { destroy: () => void }[] = [];
    let cancelled = false;

    (async () => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(".blog-content .blog-chart[data-chart-config]"),
      );
      if (nodes.length === 0) return;

      const { default: Chart } = await import("chart.js/auto");
      if (cancelled) return;

      const rootStyles = getComputedStyle(document.documentElement);
      const fg = hsl(readVar(rootStyles, "--foreground"));
      const muted = hsl(readVar(rootStyles, "--muted-foreground"));
      const border = readVar(rootStyles, "--border");
      const primary = readVar(rootStyles, "--primary");
      const grid = hsl(border, 0.4);
      const gridSoft = hsl(border, 0.18);

      // Canvas can't resolve CSS vars — use a concrete system stack.
      Chart.defaults.font.family =
        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      Chart.defaults.color = muted;

      for (const node of nodes) {
        let spec: ChartSpec;
        try {
          spec = JSON.parse(node.dataset.chartConfig || "{}");
        } catch {
          continue;
        }

        const holder = node.querySelector<HTMLElement>(".blog-chart-canvas");
        if (!holder) continue;
        holder.innerHTML = "";
        const canvas = document.createElement("canvas");
        holder.appendChild(canvas);

        const rawType = spec.type || "bar";
        const isArea = rawType === "area";
        const chartType = isArea ? "line" : rawType;
        const isCircular = chartType === "pie" || chartType === "doughnut";

        const datasets = spec.datasets
          ? spec.datasets
          : [{ label: spec.yLabel || "Value", data: spec.data || [] }];

        const colors = palette(primary, isCircular ? (spec.labels?.length || datasets[0]?.data.length || 1) : datasets.length);

        const chartDatasets = datasets.map((ds, i) => {
          if (isCircular) {
            return {
              label: ds.label,
              data: ds.data,
              backgroundColor: colors.map((c) => hsl(c, 0.85)),
              borderColor: hsl(readVar(rootStyles, "--background")),
              borderWidth: 2,
            };
          }
          const c = colors[i];
          return {
            label: ds.label,
            data: ds.data,
            backgroundColor:
              chartType === "line" ? hsl(c, isArea ? 0.18 : 0) : hsl(c, 0.8),
            borderColor: hsl(c),
            borderWidth: 2,
            borderRadius: chartType === "bar" ? 4 : 0,
            fill: isArea ? true : false,
            tension: 0.35,
            pointRadius: chartType === "line" ? 2.5 : 0,
            pointBackgroundColor: hsl(c),
          };
        });

        const showLegend = isCircular || datasets.length > 1;

        const chart = new Chart(canvas, {
          type: chartType,
          data: { labels: spec.labels ?? [], datasets: chartDatasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: "index" },
            plugins: {
              legend: {
                display: showLegend,
                labels: { color: fg, usePointStyle: true, boxWidth: 8, padding: 16 },
              },
              tooltip: {
                backgroundColor: hsl(readVar(rootStyles, "--background")),
                titleColor: fg,
                bodyColor: fg,
                borderColor: grid,
                borderWidth: 1,
                padding: 10,
                displayColors: true,
              },
            },
            scales: isCircular
              ? {}
              : {
                  x: {
                    stacked: spec.stacked ?? false,
                    grid: { color: gridSoft, drawTicks: false },
                    ticks: { color: muted },
                    title: spec.xLabel
                      ? { display: true, text: spec.xLabel, color: muted }
                      : undefined,
                  },
                  y: {
                    stacked: spec.stacked ?? false,
                    beginAtZero: spec.beginAtZero ?? true,
                    grid: { color: gridSoft, drawTicks: false },
                    ticks: { color: muted },
                    title: spec.yLabel
                      ? { display: true, text: spec.yLabel, color: muted }
                      : undefined,
                  },
                },
          },
        });
        charts.push(chart);
      }
    })();

    return () => {
      cancelled = true;
      charts.forEach((c) => c.destroy());
      charts = [];
    };
  }, [resolvedTheme]);

  return null;
}

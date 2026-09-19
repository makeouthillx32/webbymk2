"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BrainCircuit,
  Cat,
  CheckCircle2,
  Database,
  Dog,
  Eye,
  HardDrive,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { DEFAULT_HOUSE_MEMBERS } from "../../server/houseMembers";
import { DEFAULT_HOUSE_ANIMALS } from "../../server/houseAnimals";
import type { DiscoveredCamera } from "../../contracts";
import { getSubjectRuntimeReadiness } from "./runtimeReadiness";
import {
  describeIdentityCoverage,
  humanizeIdentitySource,
  type IdentityCoverage,
} from "./registryPresentation";
import { LabelLab } from "../LabelLab/LabelLab";

type Enrolment = {
  id: string;
  targetSlug: string;
  displayName: string;
  cameraId: string | null;
  roomScope: string | null;
  note: string | null;
  sourceConfidence: number | null;
  sourceKind: string | null;
  descriptorKind: string | null;
  modelKey: string | null;
  isActive: boolean;
  capturedAt: string;
  signatureLength: number;
};

type IdentityIndexSummary = {
  available: boolean;
  references: number;
  confirmedSamples: number;
  quarantinedSamples: number;
  rejectedSamples: number;
  targets: Array<{
    targetSlug: string;
    displayName: string;
    references: number;
    confirmedSamples: number;
    quarantinedSamples: number;
  }>;
  message?: string;
};

type RuntimeIdentitySummary = {
  workerOnline: boolean;
  appearance: null | {
    receivedAt: number;
    signatures: number;
    classes: string[];
    rejected: string[];
    targets: Record<string, number>;
    seed: null | {
      configured: number;
      existing: number;
      inserted: number;
      ready: boolean;
      byTarget: Record<string, number>;
      error: string | null;
    };
  };
};

export type CameraOption = {
  cameraId: string;
  label: string;
  playbackUrl?: string | null;
  playbackProtocol?: unknown;
  roomScope?: string | null;
};

type AppearanceEnrolmentPanelProps = {
  cameras: (CameraOption | DiscoveredCamera)[];
  initialTargetSlug?: string;
};

type RegistrySubject = {
  slug: string;
  displayName: string;
  kind: "person" | "cat" | "dog";
  role: string;
  detail: string;
  icon: string;
  avatarUrl?: string;
  favoriteRoom?: string;
};

const PEOPLE: RegistrySubject[] = DEFAULT_HOUSE_MEMBERS.map((member) => ({
  slug: member.detectorLabel,
  displayName: member.displayName,
  kind: "person",
  role: member.role ?? "House member",
  detail: member.badge ?? "Resident",
  icon: member.icon ?? "👤",
  avatarUrl: member.avatarUrl,
  favoriteRoom: member.favoriteRoom,
}));

const ANIMALS: RegistrySubject[] = DEFAULT_HOUSE_ANIMALS.map((animal) => ({
  slug: animal.id.replace(/^pet_/, ""),
  displayName: animal.displayName,
  kind: animal.species,
  role: animal.role,
  detail: animal.breed,
  icon: animal.icon,
  avatarUrl: animal.avatarUrl,
  favoriteRoom: animal.favoriteRoom,
}));

const COVERAGE_STYLE: Record<IdentityCoverage["level"], string> = {
  robust: "border-emerald-500/40 bg-emerald-950/35 text-emerald-300",
  growing: "border-cyan-500/40 bg-cyan-950/35 text-cyan-300",
  seeded: "border-blue-500/40 bg-blue-950/35 text-blue-300",
  "reference-only": "border-amber-500/40 bg-amber-950/30 text-amber-300",
  missing: "border-rose-500/40 bg-rose-950/30 text-rose-300",
};

function formatRoom(room: string): string {
  return room
    .replace(/^the-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ResidentIcon({ kind }: { kind: RegistrySubject["kind"] }) {
  if (kind === "dog") return <Dog className="h-4 w-4" />;
  if (kind === "cat") return <Cat className="h-4 w-4" />;
  return <UserRound className="h-4 w-4" />;
}

export function AppearanceEnrolmentPanel(
  _props: AppearanceEnrolmentPanelProps,
) {
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [identityIndex, setIdentityIndex] =
    useState<IdentityIndexSummary | null>(null);
  const [runtimeIdentity, setRuntimeIdentity] =
    useState<RuntimeIdentitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tank/appearance", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      setEnrolments(body.enrolments ?? []);
      setIdentityIndex(body.identityIndex ?? null);
      setRuntimeIdentity(body.runtimeIdentity ?? null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const activeEnrolments = useMemo(
    () => enrolments.filter((entry) => entry.isActive),
    [enrolments],
  );
  const readyCount = useMemo(
    () =>
      [...PEOPLE, ...ANIMALS].filter((subject) => {
        const stored = activeEnrolments.filter(
          (entry) => entry.targetSlug === subject.slug,
        ).length;
        return getSubjectRuntimeReadiness(subject.slug, stored, runtimeIdentity)
          .ready;
      }).length,
    [activeEnrolments, runtimeIdentity],
  );

  const renderSubject = (subject: RegistrySubject) => {
    const records = enrolments.filter(
      (entry) => entry.targetSlug === subject.slug,
    );
    const activeRecords = records.filter((entry) => entry.isActive);
    const indexed = identityIndex?.targets.find(
      (entry) => entry.targetSlug === subject.slug,
    );
    const references = indexed?.references ?? 0;
    const confirmedSamples = indexed?.confirmedSamples ?? 0;
    const reviewSamples = indexed?.quarantinedSamples ?? 0;
    const readiness = getSubjectRuntimeReadiness(
      subject.slug,
      activeRecords.length,
      runtimeIdentity,
    );
    const coverage = describeIdentityCoverage({ references, confirmedSamples });
    const rooms = [
      ...new Set(activeRecords.map((entry) => entry.roomScope).filter(Boolean)),
    ] as string[];
    const sources = [
      ...new Set(
        activeRecords.map((entry) => humanizeIdentitySource(entry.sourceKind)),
      ),
    ];
    const lastUpdated = records
      .map((entry) => Date.parse(entry.capturedAt))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];

    return (
      <article
        key={subject.slug}
        className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0d12] shadow-lg"
      >
        <div className="flex items-start gap-3 border-b border-white/10 p-3.5">
          <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/15 bg-slate-900 text-2xl">
            {subject.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={subject.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              subject.icon
            )}
            <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-tl bg-black/80 text-cyan-300">
              <ResidentIcon kind={subject.kind} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black uppercase tracking-wide text-white">
                {subject.displayName}
              </h4>
              <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[8px] uppercase text-slate-400">
                {subject.kind}
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[8px] font-black ${
                  readiness.ready
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                    : "border-amber-500/40 bg-amber-950/30 text-amber-300"
                }`}
              >
                {readiness.ready ? "LIVE IN AXIS" : readiness.label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-slate-300">
              {subject.detail} · {subject.role}
            </p>
            <p className="mt-1 font-mono text-[9px] text-slate-500">
              Identity key @{subject.slug}
              {subject.favoriteRoom
                ? ` · Usually ${formatRoom(subject.favoriteRoom)}`
                : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-white/10 border-b border-white/10 bg-black/20">
          {[
            [readiness.runtimeLoaded, "Loaded"],
            [references, "References"],
            [confirmedSamples, "Confirmed"],
            [reviewSamples, "To review"],
          ].map(([value, label]) => (
            <div key={label} className="px-2 py-2.5 text-center">
              <div className="font-mono text-base font-black text-white">
                {value}
              </div>
              <div className="text-[7px] font-black uppercase tracking-wider text-slate-500">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                Camera evidence coverage
              </div>
              <p className="mt-0.5 text-[9px] leading-relaxed text-slate-400">
                {coverage.detail}
              </p>
            </div>
            <span
              className={`shrink-0 rounded border px-2 py-1 text-[8px] font-black ${COVERAGE_STYLE[coverage.level]}`}
            >
              {coverage.label}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {sources.map((source) => (
              <span
                key={source}
                className="rounded bg-white/5 px-1.5 py-1 font-mono text-[8px] text-slate-300"
              >
                {source}
              </span>
            ))}
            {rooms.slice(0, 4).map((room) => (
              <span
                key={room}
                className="rounded border border-cyan-500/20 bg-cyan-950/20 px-1.5 py-1 font-mono text-[8px] text-cyan-300"
              >
                {formatRoom(room)}
              </span>
            ))}
            {sources.length === 0 && rooms.length === 0 ? (
              <span className="font-mono text-[8px] text-slate-600">
                No source metadata yet
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-2 font-mono text-[8px] text-slate-500">
            <span>{activeRecords.length} active profile vectors</span>
            <span>
              {lastUpdated
                ? `Updated ${new Date(lastUpdated).toLocaleDateString()}`
                : "No profile date"}
            </span>
          </div>

          {records.length > 0 ? (
            <details className="group rounded border border-white/10 bg-black/25 px-2.5 py-2">
              <summary className="cursor-pointer list-none text-[8px] font-black uppercase tracking-wider text-slate-400 group-open:text-cyan-300">
                View {records.length} stored record
                {records.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto pr-1">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-start justify-between gap-2 rounded bg-white/[0.035] px-2 py-1.5 font-mono text-[8px]"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-300">
                        {humanizeIdentitySource(record.sourceKind)}
                        {record.roomScope
                          ? ` · ${formatRoom(record.roomScope)}`
                          : ""}
                      </div>
                      <div className="mt-0.5 truncate text-slate-600">
                        {record.note ||
                          record.modelKey ||
                          "Compatible appearance descriptor"}
                      </div>
                    </div>
                    <span
                      className={
                        record.isActive ? "text-emerald-400" : "text-slate-600"
                      }
                    >
                      {record.isActive ? "ACTIVE" : "RETIRED"}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-5 rounded-xl border border-black/80 bg-[#14151a] p-4 text-white shadow-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-black shadow-lg shadow-cyan-950/40">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black uppercase tracking-wider text-cyan-300">
                Household Identity Registry
              </h2>
              <span className="rounded border border-white/10 bg-black/40 px-2 py-0.5 text-[9px] font-black uppercase text-slate-300">
                {readyCount}/7 live-ready
              </span>
            </div>
            <p className="mt-0.5 max-w-2xl text-[11px] text-slate-400">
              A readable view of the people and animals Axis knows, the evidence
              behind each profile, and what the running detector has loaded.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded border border-slate-700 bg-black/40 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh data
        </button>
      </header>

      <LabelLab embedded />

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Registry data unavailable.</strong> {error}
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          {
            icon: ShieldCheck,
            value: readyCount,
            label: "Live-ready residents",
            color: "text-emerald-300",
          },
          {
            icon: ServerCog,
            value: runtimeIdentity?.appearance?.signatures ?? 0,
            label: "Profiles loaded",
            color: "text-cyan-300",
          },
          {
            icon: Eye,
            value: identityIndex?.confirmedSamples ?? 0,
            label: "Archive-confirmed",
            color: "text-violet-300",
          },
          {
            icon: Database,
            value: identityIndex?.references ?? 0,
            label: "Reference records",
            color: "text-blue-300",
          },
          {
            icon: HardDrive,
            value: identityIndex?.quarantinedSamples ?? 0,
            label: "Awaiting review",
            color: "text-amber-300",
          },
        ].map(({ icon: Icon, value, label, color }) => (
          <div
            key={label}
            className="rounded-lg border border-white/10 bg-black/35 p-3"
          >
            <div className="flex items-center justify-between">
              <span className={`font-mono text-xl font-black ${color}`}>
                {value}
              </span>
              <Icon className={`h-4 w-4 ${color} opacity-70`} />
            </div>
            <div className="mt-1 text-[8px] font-black uppercase tracking-wider text-slate-500">
              {label}
            </div>
          </div>
        ))}
      </section>

      <section
        className={`rounded-lg border p-3 ${
          runtimeIdentity?.workerOnline && runtimeIdentity.appearance
            ? "border-emerald-500/30 bg-emerald-950/15"
            : "border-amber-500/30 bg-amber-950/15"
        }`}
      >
        <div className="flex items-start gap-2.5">
          {runtimeIdentity?.workerOnline && runtimeIdentity.appearance ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          )}
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-white">
              {runtimeIdentity?.workerOnline && runtimeIdentity.appearance
                ? "Axis is consuming the registry"
                : "Axis has not reported its loaded registry"}
            </div>
            <p className="mt-0.5 text-[9px] leading-relaxed text-slate-400">
              Stored evidence and loaded profiles are shown separately. A
              profile is marked live-ready only when the database contains it
              and the running vision worker confirms that it loaded it.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <UserRound className="h-4 w-4 text-cyan-300" />
          <h3 className="text-xs font-black uppercase tracking-widest text-white">
            House members
          </h3>
          <span className="font-mono text-[9px] text-slate-500">
            {PEOPLE.length} people
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {PEOPLE.map(renderSubject)}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <Cat className="h-4 w-4 text-violet-300" />
          <h3 className="text-xs font-black uppercase tracking-widest text-white">
            House animals
          </h3>
          <span className="font-mono text-[9px] text-slate-500">
            {ANIMALS.length} animals
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ANIMALS.map(renderSubject)}
        </div>
      </section>

      <footer className="grid gap-3 border-t border-white/10 pt-4 md:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-wider text-cyan-300">
              Human-readable, privacy-safe view
            </div>
            <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
              This page receives counts and provenance labels only. Embeddings,
              hashes, footage paths, and private crops stay on the server.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-violet-500/20 bg-violet-950/10 p-3">
          <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-wider text-violet-300">
              Coverage is not a confidence promise
            </div>
            <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
              More confirmed views improve representation, but dark, distant, or
              obstructed footage can still remain unnamed instead of guessing.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AppearanceEnrolmentPanel;

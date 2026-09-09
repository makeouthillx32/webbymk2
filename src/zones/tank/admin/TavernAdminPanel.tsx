"use client";

import { useEffect, useState } from "react";
import { Beer, Plus, Trash2, Volume2 } from "lucide-react";
import {
  getTavernAdminStateAction,
  setTavernEnabledAction,
  updateTavernConfigAction,
  createChitTemplateAction,
  setChitTemplateActiveAction,
  deleteChitTemplateAction,
  setSfxTavernEnabledAction,
  type TavernAdminState,
  type TavernConfig,
} from "../server/tavernAdmin";

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const CONFIG_FIELDS: { key: keyof TavernConfig; label: string; suffix?: string }[] = [
  { key: "shiftMinutes", label: "Shift length", suffix: "min" },
  { key: "chitIntervalMinSec", label: "Chit interval (min)", suffix: "sec" },
  { key: "chitIntervalMaxSec", label: "Chit interval (max)", suffix: "sec" },
  { key: "maxPendingChits", label: "Max pending chits" },
  { key: "chitExpirySec", label: "Chit expiry", suffix: "sec" },
  { key: "mutinyThresholdPct", label: "Mutiny threshold", suffix: "%" },
  { key: "mutinyVoteSec", label: "Mutiny vote window", suffix: "sec" },
  { key: "clickBonusPct", label: "Click bonus", suffix: "%" },
  { key: "sfxAllowancePerShift", label: "SFX allowance / shift" },
  { key: "sfxCooldownSec", label: "SFX cooldown", suffix: "sec" },
  { key: "takeoverShieldSec", label: "Takeover shield", suffix: "sec" },
];

export function TavernAdminPanel() {
  const [state, setState] = useState<TavernAdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<Partial<TavernConfig>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ weight: 3, dialogue: "", troubleType: "", item: "", tipTokens: 5 });
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const refresh = () => {
    setLoading(true);
    void getTavernAdminStateAction()
      .then((res) => {
        if ("error" in res) {
          setError(res.error);
          return;
        }
        setState(res);
        setError(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  if (loading && !state) return <p className="text-sm text-muted-foreground">Loading Tavern config...</p>;
  if (error && !state) return <p className="text-sm font-bold text-red-500">{error}</p>;
  if (!state) return null;

  return (
    <div className="space-y-6">
      <Panel
        title="Tank Tavern"
        description="Global kill switch. Flip on only after the full loop has been verified with staff accounts."
        action={
          <button
            type="button"
            disabled={togglingEnabled}
            onClick={async () => {
              setTogglingEnabled(true);
              try {
                const res = await setTavernEnabledAction(!state.enabled);
                if (res.success) refresh();
                else setError(res.error ?? "Failed to toggle Tavern.");
              } finally {
                setTogglingEnabled(false);
              }
            }}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black uppercase ${
              state.enabled ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
            }`}
          >
            <Beer className="h-3.5 w-3.5" /> {state.enabled ? "Live" : "Off"}
          </button>
        }
      >
        {error && <p className="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500">{error}</p>}
        {state.config && (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {CONFIG_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-bold text-muted-foreground">{field.label}</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={configDraft[field.key] ?? state.config![field.key]}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                    }
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                  />
                  {field.suffix && <span className="text-xs text-muted-foreground">{field.suffix}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={savingConfig || Object.keys(configDraft).length === 0}
          onClick={async () => {
            setSavingConfig(true);
            try {
              const res = await updateTavernConfigAction(configDraft);
              if (res.success) {
                setConfigDraft({});
                refresh();
              } else {
                setError(res.error ?? "Failed to save config.");
              }
            } finally {
              setSavingConfig(false);
            }
          }}
          className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          Save config
        </button>
      </Panel>

      <Panel title="Chit templates" description="The order/trouble pool tick() draws from, weighted random.">
        {state.templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates yet — add one below.</p>
        ) : (
          <div className="space-y-2">
            {state.templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{t.dialogue}</p>
                  <p className="text-xs text-muted-foreground">
                    weight {t.weight} · {t.tipTokens} tokens{t.troubleType ? ` · trouble: ${t.troubleType}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void setChitTemplateActiveAction(t.id, !t.isActive).then(refresh)}
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                      t.isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.isActive ? "Active" : "Paused"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteChitTemplateAction(t.id).then(refresh)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500"
                    aria-label="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={newTemplate.dialogue}
              onChange={(e) => setNewTemplate((p) => ({ ...p, dialogue: e.target.value }))}
              placeholder="Dialogue shown to the Bartender"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={newTemplate.item}
              onChange={(e) => setNewTemplate((p) => ({ ...p, item: e.target.value }))}
              placeholder="Item to serve (blank if this is a trouble chit)"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={newTemplate.troubleType}
              onChange={(e) => setNewTemplate((p) => ({ ...p, troubleType: e.target.value }))}
              placeholder="Trouble type (e.g. spill) — blank for ordinary orders"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={newTemplate.weight}
                onChange={(e) => setNewTemplate((p) => ({ ...p, weight: Number(e.target.value) || 1 }))}
                placeholder="Weight"
                className="w-1/2 rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                min={0}
                value={newTemplate.tipTokens}
                onChange={(e) => setNewTemplate((p) => ({ ...p, tipTokens: Number(e.target.value) || 0 }))}
                placeholder="Tip tokens"
                className="w-1/2 rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={creatingTemplate || !newTemplate.dialogue.trim()}
            onClick={async () => {
              setCreatingTemplate(true);
              try {
                const res = await createChitTemplateAction({
                  weight: newTemplate.weight,
                  dialogue: newTemplate.dialogue,
                  troubleType: newTemplate.troubleType || null,
                  payload: newTemplate.item ? { item: newTemplate.item } : {},
                  tipTokens: newTemplate.tipTokens,
                });
                if (res.success) {
                  setNewTemplate({ weight: 3, dialogue: "", troubleType: "", item: "", tipTokens: 5 });
                  refresh();
                } else {
                  setError(res.error ?? "Failed to create template.");
                }
              } finally {
                setCreatingTemplate(false);
              }
            }}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add template
          </button>
        </div>
      </Panel>

      <Panel title="Safe-Room SFX" description="Sounds the Bartender can trigger. Only tavern_enabled sounds show up in the panel.">
        {state.sfx.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sounds in the library yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state.sfx.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void setSfxTavernEnabledAction(s.id, !s.tavernEnabled).then(refresh)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                  s.tavernEnabled
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-600"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                <Volume2 className="h-3.5 w-3.5" /> {s.name}
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default TavernAdminPanel;

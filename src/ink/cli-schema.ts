export const UNAXIS_CLI_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "UNAXIS CLI",
  description: "Agentic control plane interface for webbymk2 environments.",
  type: "object",
  commands: {
    session: {
      description: "Get the current TUI and project state.",
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    stack: {
      description: "Get the current background operations stack, or `stack clear` to remove finished ops.",
      subcommands: ["clear"],
      arguments: [
        { name: "opId", type: "string", required: false }
      ],
      options: {
        "--json":   { type: "boolean", description: "Output as structured JSON." },
        "--failed": { type: "boolean", description: "With `clear`: remove only failed ops." }
      }
    },
    stacks: {
      description: "Show all background stack ops and a tail of each one's output.",
      options: {
        "--tail": { type: "number", description: "Lines of output to show per op (default 6)." }
      }
    },
    "build-doctor": {
      description: "Diagnose build-time SSG hangs: Docker memory + endpoint reachability from the unenter network.",
      arguments: [
        { name: "zone", type: "string", required: false }
      ]
    },
    "build-mem": {
      description: "Snapshot every container's memory usage + limit (run during a build to watch the builder).",
    },
    "builder-reset": {
      description: "Remove the unaxis-net buildx builder (recreated on next build); unsticks a zombie build.",
    },
    zones: {
      description: "List all zones managed by the control plane, including public footer tag state.",
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    "env list": {
      description: "List environment mappings and domains.",
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    "env health": {
      description: "Deep state detection per environment: online, busy, sleeping (engine off), wedged, restarting, agent-down, or offline.",
      arguments: [
        { name: "envName", type: "string", required: false }
      ],
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    "env containers": {
      description: "List raw Docker containers related to an environment.",
      arguments: [
        { name: "envName", type: "string", required: true }
      ],
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    "env images": {
      description: "List or clean Docker images on an environment.",
      arguments: [
        { name: "envName", type: "string", required: false }
      ],
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." },
        "--prune-stale": { type: "boolean", description: "Find stale UNAXIS image tags." },
        "--dangling-only": { type: "boolean", description: "Limit stale-image pruning to dangling images." },
        "--remove-repo": { type: "string", description: "Remove every local tag for one UNAXIS-owned repository." },
        "--yes": { type: "boolean", description: "Apply an image cleanup instead of showing a dry run." }
      }
    },
    "env security": {
      description: "Inspect container security posture (privileged, capabilities, user, mounts).",
      arguments: [
        { name: "envName", type: "string", required: false }
      ],
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    "env audit-image": {
      description: "Audit image layers for embedded secrets or bloated COPY commands.",
      arguments: [
        { name: "imageName", type: "string", required: true },
        { name: "envName", type: "string", required: false }
      ],
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    "env events": {
      description: "Stream recent Docker events.",
      arguments: [
        { name: "envName", type: "string", required: false }
      ],
      options: {
        "--since": { type: "string", description: "Look back a time window (e.g. 1h, 30m)." },
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    "db core": {
      description: "Interact with the core control plane database.",
      subcommands: ["status", "heal", "restart"],
      options: {
        "--bg": { type: "boolean", description: "Run operation in background." },
        "--json": { type: "boolean", description: "Output output/task status as JSON." }
      }
    },
    "db instances": {
      description: "List all active Supabase tenant databases.",
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    proxy: {
      description: "Manage the local Nginx Proxy Manager instance.",
      subcommands: ["status", "restart", "build", "push", "reset"],
      options: {
        "--bg": { type: "boolean", description: "Run operation in background." },
        "--json": { type: "boolean", description: "Output output/task status as JSON." }
      }
    },
    zone: {
      description: "Manage lifecycle and public footer tags for individual zones.",
      arguments: [
        { name: "zoneName", type: "string", required: true },
        {
          name: "action",
          type: "string",
          enum: [
            "status",
            "tag",
            "untag",
            "pin",
            "unpin",
            "pinned",
            "tagged",
            "logs",
            "build",
            "rebuild",
            "deploy",
            "pull",
            "delete",
            "doctor",
            "dev"
          ],
          required: false,
          default: "status"
        }
      ],
      options: {
        "--bg": { type: "boolean", description: "Run operation in background." },
        "--json": { type: "boolean", description: "Output output/task status as JSON." }
      }
    },
    events: {
      description: "Subscribe to an event stream of TUI actions.",
      options: {
        "--watch": { type: "boolean", description: "Keep connection open and stream JSON events." }
      }
    },
    snap: {
      description: "Capture the current live TUI frame, or record a timed frame sequence.",
      options: {
        "--save": { type: "boolean", description: "Write the single-frame snapshot to .snapshots/." },
        "--json": { type: "boolean", description: "Output the single-frame snapshot as structured JSON." },
        "--label": { type: "string", description: "Label used for saved snapshot or frame-series directories." },
        "--series": { type: "boolean", description: "Record repeated live TUI frames into a frame-series folder." },
        "--every": { type: "number", description: "Frame-series sample interval in milliseconds. Default: 100." },
        "--duration": { type: "number", description: "Frame-series recording duration in milliseconds. Default: 4000." },
        "--arm-startup": { type: "boolean", description: "Arm the next TUI boot to record the startup splash as a frame series." }
      }
    },
    "snap-view": {
      description: "View a recorded frame series: manifest stats, sample timeline, and inline film strip of unique frames. Standalone fast-path — no TUI or IPC required. Defaults to logs/startup-series-latest.json.",
      arguments: [
        { name: "manifestOrDir", type: "string", required: false, default: "logs/startup-series-latest.json" }
      ],
      options: {
        "--summary":     { type: "boolean", description: "Only print manifest stats and frame timeline." },
        "--strip":       { type: "boolean", description: "Print unique frames inline as a compact film strip. Default unless --summary." },
        "--all-samples": { type: "boolean", description: "Include repeat samples as timing rows. Default." },
        "--unique-only": { type: "boolean", description: "Omit repeat samples from the timeline." },
        "--max-frames":  { type: "number",  description: "Limit inline unique frames. Default: all unique frames." }
      }
    },
    "project studio": {
      description: "Toggle public access to core Supabase Studio via the NPM proxy (studio.unenter.live).",
      arguments: [
        { name: "action", type: "string", enum: ["public", "local", "toggle", "status"], required: false, default: "status" }
      ]
    },
    "db migrate-control": {
      description: "One-time import: migrate zones + environments from unenter.db (Supabase) into the local SQLite control-plane DB. Safe to re-run.",
    },
    "db control-info": {
      description: "Show local SQLite control-db path, zone count, environment count, and schema version.",
    },
    notify: {
      description: "Push a notification into the running TUI from outside. Appears immediately in the notifications pane.",
      arguments: [
        { name: "message", type: "string", required: true }
      ],
      options: {
        "--type":     { type: "string",  description: "Notification type: success | error | info  (default: info)" },
        "--priority": { type: "string",  description: "Queue priority: low | medium | high | immediate  (default: medium)" },
        "--timeout":  { type: "number",  description: "Display duration in ms. Defaults to type default (success=5s, error=8s, info=3s)." },
        "--key":      { type: "string",  description: "Dedup key — same-key calls update the existing notification instead of stacking." },
      }
    }
  }
};

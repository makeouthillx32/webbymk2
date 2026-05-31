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
      description: "Get the current background operations stack.",
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
      }
    },
    zones: {
      description: "List all zones managed by the control plane.",
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
    "env containers": {
      description: "List raw Docker containers related to an environment.",
      arguments: [
        { name: "envName", type: "string", required: true }
      ],
      options: {
        "--json": { type: "boolean", description: "Output as structured JSON." }
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
      description: "Manage lifecycle of individual zones.",
      arguments: [
        { name: "action", type: "string", enum: ["build", "rebuild", "deploy", "pull", "restart", "delete"], required: true },
        { name: "zoneName", type: "string", required: true }
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
    }
  }
};

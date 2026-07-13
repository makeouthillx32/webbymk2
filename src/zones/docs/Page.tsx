import type { Metadata } from "next";
import styles from "./Page.module.css";

export const metadata: Metadata = {
  title: { absolute: "UNAXIS Docs | Operator Guide" },
  description:
    "Operator documentation for inspecting, diagnosing, building, deploying, and verifying the UNAXIS control plane.",
};

const navigation = [
  ["Getting Started", "#start"],
  ["CLI", "#cli"],
  ["Zones", "#zones"],
  ["Environments", "#environments"],
  ["Databases", "#databases"],
  ["Operations", "#operations"],
] as const;

const principles = [
  {
    number: "01",
    title: "Inspect first",
    description:
      "Capture project, session, stack, zone, and environment state before changing anything.",
  },
  {
    number: "02",
    title: "Target explicitly",
    description:
      "Choose the project slug and append --dev or --prod to project-scoped commands.",
  },
  {
    number: "03",
    title: "Verify the result",
    description:
      "Check operation output, bounded logs, runtime status, and the public behavior you changed.",
  },
] as const;

const sections = [
  {
    id: "orientation",
    number: "01",
    title: "Getting Started / Orientation",
    description:
      "Choose a project, target a running TUI, and establish the current state before acting.",
    status: "Available here",
    available: true,
  },
  {
    id: "cli",
    number: "02",
    title: "CLI & Targeting",
    description:
      "Learn project-scoped grammar, structured output, exit sentinels, and dev/prod targeting.",
    status: "Available here",
    available: true,
  },
  {
    id: "zones",
    number: "03",
    title: "Zones",
    description:
      "Inspect status and logs, use explicit dev lifecycle actions, and ship existing zones safely.",
    status: "Available here",
    available: true,
  },
  {
    id: "environments",
    number: "04",
    title: "Environments",
    description:
      "Understand execution boundaries, environment agents, containers, events, and security views.",
    status: "Available here",
    available: true,
  },
  {
    id: "databases",
    number: "05",
    title: "Database Instances & Snapshots",
    description:
      "Operate Core and runtime instances with clear backup, snapshot, clone, and restore safeguards.",
    status: "Available here",
    available: true,
  },
  {
    id: "operations",
    number: "06",
    title: "Build, Routing & Troubleshooting",
    description:
      "Follow background work, diagnose builds, inspect proxy state, and verify public behavior.",
    status: "Available here",
    available: true,
  },
  {
    id: "architecture",
    number: "07",
    title: "Architecture & Decisions",
    description:
      "See how the TUI, CLI bridge, operation stack, environments, zones, and derived routes fit together.",
    status: "Planned",
    available: false,
  },
] as const;

const orientationCommands = `unaxis project list
unaxis version --compare
unaxis <project-slug> status --dev
unaxis <project-slug> session --json --dev
unaxis <project-slug> stack --json --dev`;

const gettingStartedSteps = [
  {
    number: "01",
    title: "Resolve the project",
    description:
      "Run project list and choose the registered slug. Use that exact slug in every project-scoped example; confirm session.cwd matches the repository you intend to operate.",
    expected: "The registered root and session cwd agree.",
  },
  {
    number: "02",
    title: "Choose the control plane",
    description:
      "Compare the running TUIs, then keep --dev or --prod explicit on every project-scoped command. The example targets development.",
    expected: "The intended TUI responds to status.",
  },
  {
    number: "03",
    title: "Inspect before acting",
    description:
      "Read session and stack JSON. Stop if the cwd or environment is unexpected, or if active or queued work would conflict.",
    expected: "The session and operation state are understood.",
  },
] as const;

const cliCommandFamilies = [
  {
    family: "Discovery",
    effect: "Read-only",
    commands: [
      "unaxis project list",
      "unaxis --help",
      "unaxis --schema",
      "unaxis version --compare",
    ],
  },
  {
    family: "Control-plane state",
    effect: "Read-only",
    commands: [
      "unaxis <project-slug> status --dev",
      "unaxis <project-slug> session --json --dev",
      "unaxis <project-slug> stack --json --dev",
    ],
  },
  {
    family: "Zones and logs",
    effect: "Mixed",
    commands: [
      "unaxis <project-slug> zones list --json --dev",
      "unaxis <project-slug> zone docs status --dev",
      "unaxis <project-slug> zone docs logs --tail 120 --dev",
    ],
  },
  {
    family: "Environments",
    effect: "Mixed",
    commands: [
      "unaxis <project-slug> env list --json --dev",
      "unaxis <project-slug> env ping <name> --dev",
    ],
  },
  {
    family: "Guard and follow work",
    effect: "Mixed",
    commands: [
      'unaxis <project-slug> preflight edit --zone <key> --watch --label "<intent>" --dev',
      "unaxis <project-slug> stacks --tail 8 --dev",
    ],
  },
  {
    family: "Zone lifecycle",
    effect: "Changes state",
    commands: ["unaxis <project-slug> zone <key> build --bg --json --dev"],
  },
] as const;

const zoneLifecycleSteps = [
  {
    number: "01",
    title: "Inspect the existing zone",
    effect: "Read-only",
    description:
      "Confirm the zone exists, read its production status, and keep log reads bounded before changing runtime state.",
    commands: [
      "unaxis <project-slug> zones list --json --dev",
      "unaxis <project-slug> zone <key> status --dev",
      "unaxis <project-slug> zone <key> logs --tail 120 --dev",
    ],
  },
  {
    number: "02",
    title: "Open and close development",
    effect: "Changes state",
    description:
      "Use preflight for a guarded edit, inspect the explicit dev container, then stop it and end the watch after validation.",
    commands: [
      'unaxis <project-slug> preflight edit --zone <key> --watch --label "edit <key>" --dev',
      "unaxis <project-slug> zone <key> dev logs --tail 120 --dev",
      "unaxis <project-slug> zone <key> dev stop --dev",
      "unaxis <project-slug> watch end --dev",
    ],
  },
  {
    number: "03",
    title: "Ship source once",
    effect: "Changes state",
    description:
      "Queue one build at a time. Build is the complete ship path: build, push, pull, force-recreate, and proxy reload.",
    commands: [
      "unaxis <project-slug> zone <key> build --bg --json --dev",
      "unaxis <project-slug> stacks --tail 8 --dev",
      "unaxis <project-slug> zone <key> status --dev",
    ],
  },
] as const;

const zoneActions = [
  {
    action: "Restart development",
    command: "unaxis <project-slug> zone <key> dev restart --dev",
    effect: "Changes state",
    guidance: "Restart only the explicit zone dev container after an edit requires it.",
  },
  {
    action: "Rebuild without cache",
    command: "unaxis <project-slug> zone <key> rebuild --bg --json --dev",
    effect: "Changes state",
    guidance: "Run the full ship path without build cache; use only when evidence points to stale build layers.",
  },
  {
    action: "Redeploy an image",
    command: "unaxis <project-slug> zone <key> deploy --bg --json --dev",
    effect: "Changes state",
    guidance: "Pull and recreate from an existing image without rebuilding source.",
  },
  {
    action: "Repair zone wiring",
    command: "unaxis <project-slug> zone <key> doctor --dev",
    effect: "Changes config",
    guidance: "Patch Compose when needed, reconcile the proxy route, and verify or register NPM state.",
  },
  {
    action: "Delete a zone",
    command: "unaxis <project-slug> zone <key> delete --confirm --dev",
    effect: "Destructive",
    guidance: "Require explicit approval; this removes runtime, source, registry, route, and proxy-host state.",
  },
] as const;

const environmentInspectionSteps = [
  {
    number: "01",
    title: "Separate the three targets",
    effect: "Read-only",
    description:
      "The project slug resolves the repository, --dev or --prod selects the running TUI, and the environment name selects an infrastructure node behind that control plane.",
    commands: [
      "unaxis <project-slug> session --json --dev",
      "unaxis <project-slug> env list --json --dev",
    ],
  },
  {
    number: "02",
    title: "Inspect one node explicitly",
    effect: "Read-only",
    description:
      "Name the environment even when a command permits an implicit default. Containers shows unt_* workloads unless --all is added; stacks groups every container by its Compose project label.",
    commands: [
      "unaxis <project-slug> env containers <environment> --dev",
      "unaxis <project-slug> env stacks <environment> --dev",
    ],
  },
  {
    number: "03",
    title: "Collect bounded evidence",
    effect: "Read-only",
    description:
      "Tail a named container, inspect a numeric event window, or audit container posture without changing lifecycle state. Keep internal output scoped to the investigation.",
    commands: [
      "unaxis <project-slug> env logs <environment> <container> --tail 120 --dev",
      "unaxis <project-slug> env events <environment> --since 600 --dev",
      "unaxis <project-slug> env security <environment> --json --dev",
    ],
  },
] as const;

const environmentActions = [
  {
    action: "Discover registered nodes",
    command: "unaxis <project-slug> env list --json --dev",
    effect: "Read-only",
    guidance: "Use the returned names for every later environment command.",
  },
  {
    action: "Refresh agent health",
    command: "unaxis <project-slug> env ping <environment> --dev",
    effect: "Writes metadata",
    guidance:
      "Probes the named agent and persists status, version, and last-seen metadata in the control database.",
  },
  {
    action: "Show the full Docker host",
    command: "unaxis <project-slug> env containers <environment> --all --dev",
    effect: "Read-only",
    guidance:
      "Expands beyond the default unt_* filter; treat the wider inventory as sensitive evidence.",
  },
  {
    action: "Audit image history",
    command:
      "unaxis <project-slug> env audit-image <image> <environment> --json --dev",
    effect: "Read-only",
    guidance:
      "Runs a heuristic layer-history scan. Review findings manually; the result is not proof that an image is safe.",
  },
  {
    action: "Update an environment agent",
    command: "unaxis <project-slug> env update <environment> --dev",
    effect: "Changes state",
    guidance:
      "Replaces the agent through its update path. Keep it outside an inspection-only workflow.",
  },
] as const;

const databaseWorkflowSteps = [
  {
    number: "01",
    title: "Identify the protected target",
    effect: "Read-only",
    description:
      "Core is the platform Supabase stack. Runtime instances are separately registered stacks with their own slugs and recovery history. Use the plain list first; JSON registry output contains secrets.",
    commands: [
      "unaxis <project-slug> db instances --dev",
      "unaxis <project-slug> db instance <target> status --dev",
      "unaxis <project-slug> db instance <target> logs --tail 120 --dev",
    ],
  },
  {
    number: "02",
    title: "Choose the recovery artifact",
    effect: "Writes recovery data",
    description:
      "A quick Core backup is a database-only pg_dump on the Core data volume. A full snapshot adds schema, Storage, redacted environment, Compose, metadata, and restore helpers, then attempts an archive beside the raw bundle. Capture is sequential, not an integrity test.",
    commands: [
      'unaxis <project-slug> db backup --reason "before <change>" --dev',
      "unaxis <project-slug> db snapshot --dev",
      "unaxis <project-slug> db instance <target> snapshot --bg --json --dev",
    ],
  },
  {
    number: "03",
    title: "Inspect every result",
    effect: "Mixed",
    description:
      "Follow a queued snapshot to terminal state, then read its full output. Listing is read-only; verify probes Compose health and writes derived health and status metadata, but does not validate recovered data or Storage.",
    commands: [
      "unaxis <project-slug> stacks --tail 8 --dev",
      "unaxis <project-slug> db snapshots --dev",
      "unaxis <project-slug> db instance <target> snapshots --dev",
      "unaxis <project-slug> db instance <target> verify --dev",
    ],
  },
] as const;

const databaseActions = [
  {
    action: "Inspect runtime instances",
    command: "unaxis <project-slug> db instances --dev",
    effect: "Read-only",
    guidance:
      "Lists registered runtime instances. Core is a separate protected target and is not a runtime registry entry.",
  },
  {
    action: "Create a quick Core backup",
    command: 'unaxis <project-slug> db backup --reason "<reason>" --dev',
    effect: "Writes backup",
    guidance:
      "Writes a compressed SQL dump inside the Core database volume. It excludes Storage and metadata and is not a full restore bundle or off-volume protection.",
  },
  {
    action: "Snapshot Core",
    command: "unaxis <project-slug> db snapshot --dev",
    effect: "Writes bundle",
    guidance:
      "Captures the raw full-bundle directory and normally an adjacent archive. Review Storage-copy and archive lines; warnings can coexist with a successful result.",
  },
  {
    action: "Snapshot one instance",
    command:
      "unaxis <project-slug> db instance <target> snapshot --bg --json --dev",
    effect: "Writes bundle",
    guidance:
      "Uses the explicit instance family. A queued response is unfinished; follow the project stack and retain the raw bundle directory.",
  },
  {
    action: "Verify one instance",
    command: "unaxis <project-slug> db instance <target> verify --dev",
    effect: "Writes metadata",
    guidance:
      "Checks container state and health, then synchronizes registry status. It does not verify snapshot integrity, database contents, migrations, Storage, or application behavior.",
  },
  {
    action: "Restore one instance",
    command:
      'unaxis <project-slug> db instance <target> restore --bundle "<bundle-directory>" --dev',
    effect: "Destructive",
    guidance:
      "Stops the target, replaces database and Storage content, and restarts it. Require approval, a fresh full snapshot, and independent data verification.",
  },
  {
    action: "Restore Core",
    command:
      'unaxis <project-slug> db restore --bundle "<core-bundle-directory>" --dev',
    effect: "Destructive",
    guidance:
      "Interrupts the platform stack. Confirm that bundle metadata identifies Core, record the expected outage, and obtain explicit approval before invoking it.",
  },
] as const;

const operationsWorkflowSteps = [
  {
    number: "01",
    title: "Establish the operation lane",
    effect: "Read-only",
    description:
      "Confirm the registered project, intended TUI, current stack, target zone, and logs before queuing work. A running dev TUI is not proof that the public overlay is valid.",
    commands: [
      "unaxis project list",
      "unaxis <project-slug> session --json --dev",
      "unaxis <project-slug> stack --json --dev",
      "unaxis <project-slug> zone <key> status --dev",
      "unaxis <project-slug> zone <key> logs --tail 120 --dev",
    ],
  },
  {
    number: "02",
    title: "Diagnose before rebuilding",
    effect: "Diagnostic",
    description:
      "Build checks should explain the failure mode. Use bounded tails, build reachability probes, and memory snapshots before deciding that source, cache, routing, or capacity is the fix.",
    commands: [
      "unaxis <project-slug> stacks --tail 12 --dev",
      "unaxis <project-slug> build-doctor <key> --dev",
      "unaxis <project-slug> build-mem --dev",
      "unaxis <project-slug> logs proxy --tail 120 --dev",
    ],
  },
  {
    number: "03",
    title: "Ship once and prove it",
    effect: "Changes state",
    description:
      "Queue one build at a time. A build is the full ship path: build, push, pull, force-recreate, and proxy reload. Follow the stack to terminal state before judging the public URL.",
    commands: [
      'unaxis <project-slug> preflight edit --zone <key> --watch --label "update <key>" --dev',
      "unaxis <project-slug> zone <key> build --bg --json --dev",
      "unaxis <project-slug> stacks --tail 12 --dev",
      "unaxis <project-slug> env containers <environment> --json --dev",
      "https://<key>.unenter.live/?cb=<unique-value>",
    ],
  },
] as const;

const operationActions = [
  {
    intent: "Follow visible work",
    command: "unaxis <project-slug> stacks --tail 12 --dev",
    effect: "Read-only",
    guidance:
      "Shows all stack items with bounded output tails. Use it after any queued operation and before starting a competing lifecycle action.",
  },
  {
    intent: "Queue a complete ship",
    command: "unaxis <project-slug> zone <key> build --bg --json --dev",
    effect: "Changes state",
    guidance:
      "Builds, pushes, pulls, force-recreates the container, and reloads the proxy. A queued sentinel is accepted work, not success.",
  },
  {
    intent: "Rebuild without cache",
    command: "unaxis <project-slug> zone <key> rebuild --bg --json --dev",
    effect: "Changes state",
    guidance:
      "Runs the same ship path with a no-cache build. Use only when stale layers are supported by evidence.",
  },
  {
    intent: "Redeploy existing image",
    command: "unaxis <project-slug> zone <key> deploy --bg --json --dev",
    effect: "Changes state",
    guidance:
      "Pulls and recreates from an image that already exists. Do not run it automatically after a successful build.",
  },
  {
    intent: "Probe build reachability",
    command: "unaxis <project-slug> build-doctor <key> --dev",
    effect: "Diagnostic",
    guidance:
      "Checks Docker memory and probes build-time URLs from the build network. TIMEOUT or FAIL lines are the suspects.",
  },
  {
    intent: "Watch memory pressure",
    command: "unaxis <project-slug> build-mem --dev",
    effect: "Diagnostic",
    guidance:
      "Snapshots container memory and the buildx builder. Use during a build to distinguish capacity pressure from app failures.",
  },
  {
    intent: "Repair zone wiring",
    command: "unaxis <project-slug> zone <key> doctor --dev",
    effect: "Changes config",
    guidance:
      "Can patch legacy Compose, rewrite the proxy route, and register or update NPM. Use after the container is alive but wiring is stale.",
  },
  {
    intent: "Reconcile route cache",
    command: "unaxis <project-slug> sync-routes --dev",
    effect: "Changes config",
    guidance:
      "Rebuilds derived routes from live zones and environments. Do not edit proxy-config/routes.json manually.",
  },
  {
    intent: "Verify or repair NPM",
    command: "unaxis <project-slug> audit-npm --dev",
    effect: "Changes config",
    guidance:
      "Despite the name, it can create or update public proxy hosts. Use read-only npm search/logs first.",
  },
  {
    intent: "Restart the proxy",
    command: "unaxis <project-slug> proxy restart --bg --json --dev",
    effect: "Changes state",
    guidance:
      "Broad runtime action. Use only after evidence shows hot reload or route state did not apply.",
  },
] as const;

const routingTriageRows = [
  {
    symptom: "Queued build looks idle",
    evidence:
      "Check stack JSON and bounded stack tails. A final 3:queued means the operation was accepted, not completed.",
    next:
      "Wait for a terminal stack result. Do not start another build for the same zone.",
  },
  {
    symptom: "Build stalls or ends with EOF",
    evidence:
      "Use build-doctor for network reachability and build-mem for Docker memory pressure.",
    next:
      "Free capacity through approved lifecycle actions or fix the failing fetch, then queue one rebuild.",
  },
  {
    symptom: "Public host returns 502",
    evidence:
      "Check zone status, zone logs, proxy status, proxy logs, NPM search, and NPM logs with bounded reads.",
    next:
      "Repair the layer that failed: zone runtime, proxy route cache, NPM host, or proxy runtime.",
  },
  {
    symptom: "Public host serves the wrong app",
    evidence:
      "Compare the public response, route cache, NPM forward target, zone container, and operation tail.",
    next:
      "Use doctor or route reconciliation when wiring is stale. Do not rebuild blindly.",
  },
  {
    symptom: "Old UI after a successful build",
    evidence:
      "Use a cache-busting URL and inspect the pushed source tag, operation tail, zone runtime, and browser behavior.",
    next:
      "Treat cache, wrong image, or wrong route as separate hypotheses before redeploying.",
  },
] as const;

export default function DocsPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#start">
        Skip to documentation content
      </a>
      <section className={styles.hero} aria-labelledby="docs-title">
        <div className={styles.shell}>
          <nav className={styles.localNav} aria-label="Documentation sections">
            <a className={styles.brand} href="#top" aria-label="UNAXIS Docs home">
              <span className={styles.brandMark} aria-hidden="true">
                U
              </span>
              <span>UNAXIS Docs</span>
            </a>
            <ul className={styles.navList}>
              {navigation.map(([label, href]) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.heroGrid} id="top">
            <div>
              <div className={styles.eyebrow}>
                <span className={styles.statusDot} aria-hidden="true" />
                Operator documentation
              </div>
              <h1 id="docs-title">Operate the control plane with current evidence.</h1>
              <p className={styles.lede}>
                Target the intended project and TUI, inspect live state, then
                diagnose, change, and verify through the visible UNAXIS workflow.
              </p>
              <div className={styles.actions}>
                <a className={styles.primaryAction} href="#start">
                  Start with state
                  <span aria-hidden="true">→</span>
                </a>
                <a className={styles.secondaryAction} href="#guide-map">
                  Browse the guide map
                </a>
              </div>
            </div>

            <aside className={styles.operatorCard} aria-label="Operator workflow">
              <p className={styles.cardLabel}>Operator loop</p>
              <ol>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Orient</strong>
                    <p>Resolve the project and intended control plane.</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Inspect</strong>
                    <p>Read current state and active operations.</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Operate</strong>
                    <p>Use bounded, project-scoped UNAXIS commands.</p>
                  </div>
                </li>
                <li>
                  <span>4</span>
                  <div>
                    <strong>Verify</strong>
                    <p>Confirm terminal state, runtime, and public behavior.</p>
                  </div>
                </li>
              </ol>
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.startSection} id="start" aria-labelledby="start-title">
        <div className={`${styles.shell} ${styles.startGrid}`}>
          <div>
            <p className={styles.sectionKicker}>Getting started</p>
            <h2 id="start-title">Start with state, not assumptions.</h2>
            <p className={styles.sectionCopy}>
              Run these commands in order. They identify registered projects,
              compare running control planes, and show the current session and
              operation stack. Replace <code>&lt;project-slug&gt;</code> with the
              exact slug returned by project list; this example explicitly targets
              the development TUI.
            </p>
            <div className={styles.safetyNote}>
              <strong>Safe starting point</strong>
              <span>
                These commands inspect state. Lifecycle, deploy, proxy, and database
                commands can mutate it and require their own safeguards.
              </span>
            </div>
          </div>

          <div className={styles.terminal}>
            <div className={styles.terminalHeader}>
              <div aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span>PowerShell · dev TUI</span>
            </div>
            <pre tabIndex={0} aria-label="Read-only UNAXIS orientation commands">
              <code>{orientationCommands}</code>
            </pre>
          </div>
        </div>

        <div className={styles.shell}>
          <ol className={styles.gettingStartedGrid}>
            {gettingStartedSteps.map((step) => (
              <li key={step.number}>
                <span className={styles.stepNumber}>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <small>{step.expected}</small>
              </li>
            ))}
          </ol>

          <div className={styles.sentinelNote}>
            <strong>Read the final sentinel</strong>
            <p>
              Project-scoped IPC output ends with{" "}
              <code>__UNAXIS_EXIT__:&lt;code&gt;:&lt;label&gt;</code>. A final{" "}
              <code>0:ok</code> is complete. <code>3:queued</code> is accepted but
              unfinished; inspect the project stack until the operation reaches a
              terminal state. On the installed Windows client, the final sentinel
              is authoritative when valid output is followed by a contradictory
              shell exit code.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.cliSection} id="cli" aria-labelledby="cli-title">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>CLI and targeting</p>
              <h2 id="cli-title">Scope the project and control plane explicitly.</h2>
            </div>
            <p>
              The project slug and TUI target answer different questions. Keep
              both visible in every live control-plane command.
            </p>
          </div>

          <div className={styles.cliIntroGrid}>
            <div>
              <h3>Project-scoped grammar</h3>
              <p>
                Registered project commands begin with the slug returned by
                <code> project list</code>. Global discovery commands are the
                exception and do not use a project slug.
              </p>
            </div>
            <pre tabIndex={0} aria-label="UNAXIS project-scoped command grammar">
              <code>
                {"unaxis <project-slug> <command> [arguments] [options] --dev|--prod"}
              </code>
            </pre>
          </div>

          <div className={styles.targetGrid}>
            <article>
              <span>01</span>
              <h3>Select the project</h3>
              <p>
                The slug resolves a registered project. Confirm
                <code> session.cwd</code> matches the repository you intend to
                operate before continuing.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Select the TUI</h3>
              <p>
                Append <code>--dev</code> for the development control plane or
                <code>--prod</code> for the installed production control plane.
                Do not rely on implicit targeting when both may run.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Select the output mode</h3>
              <p>
                Use <code>--json</code> only on commands that support it. A
                <code>--bg</code> operation is queued, not complete; follow the
                project stack to a terminal result.
              </p>
            </article>
          </div>

          <div
            className={styles.commandTableWrap}
            role="region"
            aria-label="Representative UNAXIS command families"
            tabIndex={0}
          >
            <table className={styles.commandTable}>
              <caption>
                Representative commands for orientation. A family marked mixed
                or state-changing requires its relevant guide and safeguards.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Family</th>
                  <th scope="col">Start here</th>
                  <th scope="col">Effect</th>
                </tr>
              </thead>
              <tbody>
                {cliCommandFamilies.map((group) => (
                  <tr key={group.family}>
                    <th scope="row">{group.family}</th>
                    <td>
                      {group.commands.map((command) => (
                        <code key={command}>{command}</code>
                      ))}
                    </td>
                    <td>
                      <span
                        className={
                          group.effect === "Read-only"
                            ? styles.readOnlyBadge
                            : group.effect === "Mixed"
                              ? styles.mixedBadge
                              : styles.mutatingBadge
                        }
                      >
                        {group.effect}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.sourceNote}>
            <strong>Discover, then reconcile</strong>
            <p>
              <code>unaxis --help</code> is the installed human reference and
              <code> unaxis --schema</code> exposes a structured subset. Neither
              is exhaustive today, so verify state-changing grammar against the
              relevant guide and current source before operating.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.zonesSection} id="zones" aria-labelledby="zones-title">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>Zones lifecycle</p>
              <h2 id="zones-title">Inspect, develop, ship, and verify one zone.</h2>
            </div>
            <p>
              This routine loop assumes the target zone already exists. Start with
              session and stack state, keep the TUI target explicit, and stop when
              another operation would conflict.
            </p>
          </div>

          <ol className={styles.zoneStepGrid}>
            {zoneLifecycleSteps.map((step) => (
              <li key={step.number}>
                <div className={styles.zoneStepHeader}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <span
                    className={
                      step.effect === "Read-only"
                        ? styles.readOnlyBadge
                        : styles.mutatingBadge
                    }
                  >
                    {step.effect}
                  </span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <pre tabIndex={0} aria-label={`${step.title} commands`}>
                  <code>{step.commands.join("\n")}</code>
                </pre>
              </li>
            ))}
          </ol>

          <div className={styles.sentinelNote}>
            <strong>Queued is not complete</strong>
            <p>
              A final <code>3:queued</code> means the control plane accepted the
              operation. Follow <code>stacks</code> until the work reaches a terminal
              result, then verify zone status, bounded logs, image provenance, and
              the changed behavior with a cache-busting browser request. Do not run
              <code> deploy</code> automatically after a successful build; build
              already deploys.
            </p>
          </div>

          <div
            className={styles.commandTableWrap}
            role="region"
            aria-label="Zone lifecycle action chooser"
            tabIndex={0}
          >
            <table className={styles.commandTable}>
              <caption>
                Escalation actions for an existing zone. Match the action to the
                evidence; every row below changes state or configuration.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Command</th>
                  <th scope="col">Effect</th>
                  <th scope="col">Use when</th>
                </tr>
              </thead>
              <tbody>
                {zoneActions.map((item) => (
                  <tr key={item.action}>
                    <th scope="row">{item.action}</th>
                    <td>
                      <code>{item.command}</code>
                    </td>
                    <td>
                      <span className={styles.mutatingBadge}>{item.effect}</span>
                    </td>
                    <td>{item.guidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.zoneDangerNote}>
            <strong>Creation and deletion are separate multi-system operations.</strong>
            <p>
              Do not create a replacement zone to work around a broken existing
              target. Deletion requires <code>--confirm</code> and explicit approval.
              Its exact terminal-sentinel behavior is <code>TBD</code> while the
              current IPC handler and delete helper return shapes are reconciled;
              independently verify every removed surface.
            </p>
          </div>
        </div>
      </section>

      <section
        className={styles.environmentsSection}
        id="environments"
        aria-labelledby="environments-title"
      >
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>Environments</p>
              <h2 id="environments-title">
                Target the control plane, then name the infrastructure node.
              </h2>
            </div>
            <p>
              A zone is an application deployment. An environment is the
              infrastructure boundary that exposes agent-backed container,
              stack, log, event, and security evidence.
            </p>
          </div>

          <div className={styles.cliIntroGrid}>
            <div>
              <h3>Keep every boundary visible</h3>
              <p>
                This guide uses a registered project slug, the development TUI,
                and an explicit environment name. Replace each placeholder only
                after reading the live session and environment list.
              </p>
            </div>
            <pre tabIndex={0} aria-label="UNAXIS environment command grammar">
              <code>
                {
                  "unaxis <project-slug> env <subcommand> [arguments] [options] --dev|--prod"
                }
              </code>
            </pre>
          </div>

          <ol className={styles.zoneStepGrid}>
            {environmentInspectionSteps.map((step) => (
              <li key={step.number}>
                <div className={styles.zoneStepHeader}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <span className={styles.readOnlyBadge}>{step.effect}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <pre tabIndex={0} aria-label={`${step.title} commands`}>
                  <code>{step.commands.join("\n")}</code>
                </pre>
              </li>
            ))}
          </ol>

          <div className={styles.sourceNote}>
            <strong>Default does not mean exclusive</strong>
            <p>
              All registered environments can be live at the same time. The
              default target only preselects where the zone wizard deploys; name
              the environment explicitly for operator commands. Also name it on
              <code> env ping</code>: the current parser can otherwise interpret
              a trailing <code>--dev</code> as the optional environment name.
            </p>
          </div>

          <div
            className={styles.commandTableWrap}
            role="region"
            aria-label="Environment command effect guide"
            tabIndex={0}
          >
            <table className={styles.commandTable}>
              <caption>
                Environment inspection and escalation commands. JSON, logs, and
                image history can expose internal coordinates or secret-bearing
                text; keep captured evidence private and bounded.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Intent</th>
                  <th scope="col">Command</th>
                  <th scope="col">Effect</th>
                  <th scope="col">Operator note</th>
                </tr>
              </thead>
              <tbody>
                {environmentActions.map((item) => (
                  <tr key={item.action}>
                    <th scope="row">{item.action}</th>
                    <td>
                      <code>{item.command}</code>
                    </td>
                    <td>
                      <span
                        className={
                          item.effect === "Read-only"
                            ? styles.readOnlyBadge
                            : item.effect === "Writes metadata"
                              ? styles.mixedBadge
                              : styles.mutatingBadge
                        }
                      >
                        {item.effect}
                      </span>
                    </td>
                    <td>{item.guidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        className={styles.databasesSection}
        id="databases"
        aria-labelledby="databases-title"
      >
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>Database instances and snapshots</p>
              <h2 id="databases-title">
                Name the target, create the right recovery point, and verify beyond
                the sentinel.
              </h2>
            </div>
            <p>
              Core holds platform data. Runtime instances are independent stacks.
              Their snapshot format is shared, but their outage and recovery risks
              are not.
            </p>
          </div>

          <div className={styles.cliIntroGrid}>
            <div>
              <h3>Keep Core and instances explicit</h3>
              <p>
                Use unscoped database capture commands for Core and the
                <code> db instance &lt;target&gt;</code> family for runtime instances.
                Confirm the project, TUI, target slug, and empty operation stack
                before any recovery action.
              </p>
            </div>
            <pre tabIndex={0} aria-label="UNAXIS database command grammar">
              <code>
                {
                  "unaxis <project-slug> db <subcommand> [target] [options] --dev"
                }
              </code>
            </pre>
          </div>

          <ol className={styles.zoneStepGrid}>
            {databaseWorkflowSteps.map((step) => (
              <li key={step.number}>
                <div className={styles.zoneStepHeader}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <span
                    className={
                      step.effect === "Read-only"
                        ? styles.readOnlyBadge
                        : styles.mixedBadge
                    }
                  >
                    {step.effect}
                  </span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <pre tabIndex={0} aria-label={`${step.title} commands`}>
                  <code>{step.commands.join("\n")}</code>
                </pre>
              </li>
            ))}
          </ol>

          <div className={styles.sourceNote}>
            <strong>Prefer explicit instance commands</strong>
            <p>
              The current top-level <code>db snapshot --slug</code> and
              <code> db snapshots --slug</code> handlers can fall back to Core when
              a runtime slug does not resolve, so those forms are intentionally
              omitted. The structured schema is also incomplete; use installed help
              and current source together.
            </p>
          </div>

          <div
            className={styles.commandTableWrap}
            role="region"
            aria-label="Database command effect guide"
            tabIndex={0}
          >
            <table className={styles.commandTable}>
              <caption>
                Database inspection, capture, verification, and restore commands.
                Effect labels remain visible because color alone is not a safety
                control.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Intent</th>
                  <th scope="col">Command</th>
                  <th scope="col">Effect</th>
                  <th scope="col">Operator note</th>
                </tr>
              </thead>
              <tbody>
                {databaseActions.map((item) => (
                  <tr key={item.action}>
                    <th scope="row">{item.action}</th>
                    <td>
                      <code>{item.command}</code>
                    </td>
                    <td>
                      <span
                        className={
                          item.effect === "Read-only"
                            ? styles.readOnlyBadge
                            : item.effect === "Destructive"
                              ? styles.mutatingBadge
                              : styles.mixedBadge
                        }
                      >
                        {item.effect}
                      </span>
                    </td>
                    <td>{item.guidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.zoneDangerNote}>
            <strong>Restore has no confirmation gate or automatic safety snapshot.</strong>
            <p>
              Record the exact target and raw bundle directory, create a fresh full
              snapshot, and obtain explicit human approval. Read every restore line:
              database or Storage failures can be warnings before a final success
              result. Then verify containers, bounded logs, expected data, Storage,
              and application behavior while retaining the source bundle. Core
              bundle-path discovery in the CLI is <code>TBD</code>; do not guess it.
              Treat DB JSON, DB views, MCP output, logs, and snapshot bundles as
              confidential even when an environment file is redacted.
            </p>
          </div>
        </div>
      </section>

      <section
        className={styles.operationsSection}
        id="operations"
        aria-labelledby="operations-title"
      >
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>Build, routing, and troubleshooting</p>
              <h2 id="operations-title">
                Build once, trace the route, and treat 502s as evidence.
              </h2>
            </div>
            <p>
              Follow background work to a terminal result, then verify the zone
              runtime, proxy chain, NPM edge, and public response before retrying
              or escalating.
            </p>
          </div>

          <div className={styles.cliIntroGrid}>
            <div>
              <h3>Resolve the slug before copying commands</h3>
              <p>
                Use <code>project list</code> as the source of truth for the
                project slug. A zone build changes runtime state and should run
                through the visible stack with a single target zone and TUI.
              </p>
            </div>
            <pre tabIndex={0} aria-label="UNAXIS operations command grammar">
              <code>
                {
                  "unaxis <project-slug> zone <key> build --bg --json --dev"
                }
              </code>
            </pre>
          </div>

          <ol className={styles.zoneStepGrid}>
            {operationsWorkflowSteps.map((step) => (
              <li key={step.number}>
                <div className={styles.zoneStepHeader}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <span
                    className={
                      step.effect === "Read-only"
                        ? styles.readOnlyBadge
                        : step.effect === "Diagnostic"
                          ? styles.mixedBadge
                          : styles.mutatingBadge
                    }
                  >
                    {step.effect}
                  </span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <pre tabIndex={0} aria-label={`${step.title} commands`}>
                  <code>{step.commands.join("\n")}</code>
                </pre>
              </li>
            ))}
          </ol>

          <div className={styles.sentinelNote}>
            <strong>Build is already the deploy</strong>
            <p>
              <code>zone &lt;key&gt; build</code> runs the complete ship path:
              build, push, pull, force-recreate, and proxy reload. Use
              <code> deploy</code> only when an existing image should be
              redeployed without rebuilding, or when the build/push leg succeeded
              but the deploy leg failed.
            </p>
          </div>

          <div
            className={styles.commandTableWrap}
            role="region"
            aria-label="Operations command effect guide"
            tabIndex={0}
          >
            <table className={styles.commandTable}>
              <caption>
                Build, deploy, diagnostic, and repair commands. Repair commands
                are intentionally labeled as state-changing even when their names
                sound harmless.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Intent</th>
                  <th scope="col">Command</th>
                  <th scope="col">Effect</th>
                  <th scope="col">Operator note</th>
                </tr>
              </thead>
              <tbody>
                {operationActions.map((item) => (
                  <tr key={item.intent}>
                    <th scope="row">{item.intent}</th>
                    <td>
                      <code>{item.command}</code>
                    </td>
                    <td>
                      <span
                        className={
                          item.effect === "Read-only"
                            ? styles.readOnlyBadge
                            : item.effect === "Diagnostic"
                              ? styles.mixedBadge
                              : styles.mutatingBadge
                        }
                      >
                        {item.effect}
                      </span>
                    </td>
                    <td>{item.guidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className={styles.commandTableWrap}
            role="region"
            aria-label="502 and routing triage guide"
            tabIndex={0}
          >
            <table className={styles.commandTable}>
              <caption>
                502 and stale-routing triage. Start with the layer that can prove
                or disprove the failure, then repair only that layer.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Symptom</th>
                  <th scope="col">Evidence to collect</th>
                  <th scope="col">Next action</th>
                </tr>
              </thead>
              <tbody>
                {routingTriageRows.map((row) => (
                  <tr key={row.symptom}>
                    <th scope="row">{row.symptom}</th>
                    <td>{row.evidence}</td>
                    <td>{row.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.sourceNote}>
            <strong>Routes are derived state</strong>
            <p>
              <code>proxy-config/routes.json</code> is a cache rebuilt from zones,
              environments, and live containers. <code>sync-routes</code>,
              <code> audit-npm</code>, and <code>zone &lt;key&gt; doctor</code>
              can write route, NPM, or Compose state; use read-only status and log
              checks first.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.principlesSection} aria-labelledby="principles-title">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>Operating contract</p>
              <h2 id="principles-title">A visible, evidence-first workflow.</h2>
            </div>
            <p>
              UNAXIS keeps long-running work and operational evidence in the same
              control plane used by the human operator.
            </p>
          </div>
          <ol className={styles.principleGrid}>
            {principles.map((principle) => (
              <li key={principle.number}>
                <span>{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.guideSection} id="guide-map" aria-labelledby="guide-title">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>Documentation map</p>
              <h2 id="guide-title">One operating model, seven guide areas.</h2>
            </div>
            <p>
              Orientation, CLI, Zones, Environments, Databases, and Operations
              guidance are available here. Planned areas are named without linking
              to routes that do not exist yet.
            </p>
          </div>

          <ol className={styles.guideGrid}>
            {sections.map((section) => (
              <li
                className={section.available ? styles.availableCard : styles.guideCard}
                id={section.available ? undefined : section.id}
                key={section.id}
              >
                <div className={styles.guideMeta}>
                  <span>{section.number}</span>
                  <span
                    className={
                      section.available ? styles.availableStatus : styles.plannedStatus
                    }
                  >
                    {section.status}
                  </span>
                </div>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
                {section.available && (
                  <a href={section.id === "orientation" ? "#start" : `#${section.id}`}>
                    Open {section.id === "orientation"
                      ? "orientation"
                      : section.id === "cli"
                        ? "CLI guide"
                        : section.id === "zones"
                          ? "Zones guide"
                          : section.id === "environments"
                            ? "Environments guide"
                            : section.id === "databases"
                              ? "Databases guide"
                              : "Operations guide"}{" "}
                    <span aria-hidden="true">↑</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className={styles.pageFooter}>
        <div className={styles.shell}>
          <p>
            Grounded in the installed CLI, current source, live read-only state,
            and durable operator notes.
          </p>
          <span>docs.unenter.live</span>
        </div>
      </footer>
    </div>
  );
}

# UNAXIS Control Plane (`UNAXIS.md`)

Welcome to **UNAXIS**, the Local Infrastructure Control Plane & Terminal Orchestrator. 

UNAXIS acts as a single pane of glass for managing multi-zone applications, background stack operations, Docker containers, Supabase database instances, and environment routing across host nodes.

---

## 1. Installation & Quick Start

### Install via CLI / NPM
```bash
# Clone the public repository
git clone https://github.com/makeouthillx32/unaxis.git
cd unaxis

# Install dependencies and build
bun install
bun run build
```

### Launch the TUI Control Plane
```bash
# Launch interactive terminal UI
unaxis
```

---

## 2. CLI Command Surface

The `unaxis` CLI provides fast-path operational commands and IPC bridge routing:

### Session & Status
```bash
unaxis status          # Check if UNAXIS TUI is running
unaxis session         # Print active TUI session summary & stack state
unaxis zones           # List registered zones and container statuses
```

### Zone Lifecycle Control
```bash
unaxis zone <name> status       # Query container & port status for a zone
unaxis zone <name> dev start    # Start dev container for zone
unaxis zone <name> dev stop     # Stop dev container for zone
unaxis zone <name> dev restart  # Hard restart dev container for zone
```

### Credentials & Settings
```bash
unaxis config get <key>        # Get local setting value
unaxis config set <key> <val>  # Set local setting value
unaxis credentials list        # List stored credential keys
unaxis credentials set <key>   # Securely store API tokens (npm_token, ghcr_token, openai_api_key)
```

---

## 3. UNAXIS SDK (`@unaxis/sdk`)

External subagents, scripts, and node services can import `@unaxis/sdk` to communicate directly with the running Control Plane over local IPC:

```typescript
import { createUnaxisClient } from '@unaxis/sdk'

const client = createUnaxisClient()

// Fetch session status
const status = await client.getStatus()
console.log(status.lines)

// Restart zone dev environment
await client.zoneDevRestart('shop')
```

---

## 4. Architectural Lexicon

| Term | Definition |
| :--- | :--- |
| **Control Plane** | The TUI, CLI, and orchestration brain managing workloads across nodes. |
| **Zone** | A frontend/runtime application boundary (e.g. Next.js Multi-Zone). |
| **Instance** | A stateful backend runtime (e.g. an independent Supabase database). |
| **Gateway** | The routing and proxy layer (Nginx Proxy Manager / NPM). |
| **Stack** | A grouped set of connected services (Docker Compose backed). |

---

## 5. Security & Isolation

- **Localhost IPC**: The Control Plane IPC server binds to `127.0.0.1:50505` (prod) / `50507` (dev).
- **Attribution Stamping**: Containers managed by UNAXIS carry `unaxis.managed=true` and `unaxis.role` labels.
- **Private Data Protection**: Secret credentials, `.env` files, and database volumes remain strictly local and are never committed or published.

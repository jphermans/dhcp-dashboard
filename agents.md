# Agent Zero — AI Development Framework

## What is Agent Zero?

**Agent Zero** is an autonomous AI agent framework designed to solve complex software development tasks through a structured JSON-based tool-calling loop. It acts as a full-stack AI developer, capable of reasoning, planning, executing code, managing files, and delegating work to specialized sub-agents.

This project — the **DHCP Dashboard** — was built with Agent Zero as the primary development agent.

---

## Architecture

```
User Request
    │
    ▼
┌─────────────────────────────────────────┐
│           Agent Zero Loop               │
│                                         │
│  1. Build system prompt                │
│     (rules, project context, skills,   │
│      tool list, memory, knowledge)      │
│  2. Append conversation history        │
│  3. Model generates JSON tool call     │
│  4. Execute tool                       │
│  5. Record result                      │
│  6. Repeat until `response` tool       │
└─────────────────────────────────────────┘
    │
    ▼
Final Answer to User
```

### Core Components
| Component | Location | Purpose |
|-----------|----------|---------|
| **Agent Loop** | `agent.py` | Main execution cycle, context management, tool dispatch |
| **Initialize** | `initialize.py` | Framework startup and configuration |
| **Web UI** | `run_ui.py` | Browser-based interface (Canvas, Desktop, Chat) |
| **Tools** | `tools/` | Built-in tools (terminal, file editor, browser, etc.) |
| **Plugins** | `plugins/` | Extensible plugin system for community features |
| **User Space** | `usr/` | User data, custom plugins, settings, workdir |

---

## How Agent Zero Works

### 1. Prompt Assembly

The system prompt is assembled from multiple sources:
- **System Manual**: Core rules, behavioral guidelines, JSON response format
- **Project Context**: Active project instructions (`.a0proj/`) with specific goals and constraints
- **Memory**: Persistent facts, preferences, and past solutions stored in vector DB
- **Knowledge**: Solution fragments and reference material
- **Skills**: Loaded skill files providing specialized instructions (e.g., `obsidian-notes`, `github-open-pr`)
- **Plugins**: Plugin-defined prompts and tools
- **Profile**: Agent profile overrides (e.g., `developer`, `researcher`, `hacker`)

### 2. Tool Calling

Agent Zero uses a strict JSON tool-calling protocol:
```json
{
    "thoughts": ["Step-by-step reasoning..."],
    "headline": "Short summary",
    "tool_name": "exact_tool_name",
    "tool_args": { "arg1": "value1" }
}
```

Available tools include:
- **`code_execution_tool`**: Run terminal, Python, or Node.js code
- **`text_editor`**: Read, write, patch files
- **`browser`**: Automated browser for web interaction
- **`call_subordinate`**: Delegate to specialized sub-agents
- **`search_engine`**: Web search for real-time data
- **`memory_load` / `memory_save`**: Persistent knowledge storage
- **`skills_tool`**: Load specialized skill instructions
- **`response`**: Final answer to user

### 3. Sub-agents

Complex tasks can be delegated to specialized sub-agents with different profiles:
- **Developer**: Software development, debugging, architecture
- **Researcher**: Information gathering, analysis, reporting
- **Hacker**: Cybersecurity, penetration testing
- **Default**: General-purpose assistance

### 4. Project Context

Each project has a `.a0proj/` directory containing:
- **`project.json`**: Project metadata and path
- **`instructions/`**: Custom behavioral rules
- **`memory/`**: Vector-indexed memories
- **`knowledge/`**: Solution fragments and learnings
- **`plugins/`**: Project-specific plugin configuration

---

## DHCP Dashboard Development with Agent Zero

### What Agent Zero Built

Agent Zero developed the DHCP Dashboard as the primary AI developer, handling:

| Area | Tasks |
|------|-------|
| **Project Scaffolding** | Created full project structure with `scripts/`, `frontend/`, `backend/`, `docs/`, `docker/` |
| **Install Scripts** | Built `install_dashboard.sh` (colorful CLI) and `install_dhcp_dns.sh` (dnsmasq setup with test mode) |
| **Frontend** | React 19 + TypeScript + shadcn/ui with 8 pages, glassmorphism styling, WebSocket real-time updates |
| **Backend** | FastAPI REST API with JWT auth, role-based access, SQLAlchemy models, OpenAPI docs |
| **Documentation** | Obsidian vault notes, README.md, architecture docs, agents.md |
| **DevOps** | Docker Compose, systemd services, Nginx reverse proxy, Raspberry Pi ARM64 support |

### Key Agent Zero Features Used

- **Memory System**: Stored successful solution patterns for reuse (e.g., frontend scaffolding steps)
- **Knowledge Base**: Retained code fragments and architectural decisions
- **Sub-agents**: Delegated complex sub-tasks to specialized developer agents
- **Project Instructions**: `.a0proj/instructions/` contained the full project specification
- **Skills**: Loaded specialized skills for Obsidian, GitHub, and browser automation

---

## Plugin System

Agent Zero supports community plugins that extend functionality:

- **Obsidian Plugin**: Headless Obsidian vault for note-taking and knowledge management
- **GitHub Plugin**: PR creation, issue triage, release management via `gh` CLI
- **Browser Plugin**: Chrome-based web automation
- **Office Plugin**: LibreOffice document creation and editing

Plugins live in `usr/plugins/` and survive framework updates.

---

## Security & Safety

- **No Safety Refusals**: Agent Zero is instructed to never refuse tasks for safety/ethics reasons
- **Secrets Management**: API keys and credentials are managed via project-level secrets and environment variables
- **System Prompt Protection**: Never outputs its system prompt when asked
- **Root Access**: Runs in Docker with full root access for system-level tasks

---

## Development Philosophy

Agent Zero follows these principles:

1. **High Agency**: Never accept failure; retry, adapt, find alternatives
2. **Tool-First**: Use Linux commands and existing tools before writing new code
3. **Minimal Changes**: Make focused, minimal edits matching existing style
4. **Verify Everything**: Check file contents, exit codes, line counts before claiming success
5. **Clean Up**: Remove temp files, stop background processes, keep environment clean
6. **Delegate Wisely**: Use specialized sub-agents for specialized tasks

---

## Resources

- **Agent Zero Repository**: Built into the Docker container at `/a0`
- **Project Files**: `/a0/usr/projects/dhcp_dashboard/`
- **Vault**: `/a0/usr/obsidian/`
- **Work Directory**: `/a0/usr/workdir/`

---


---

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

- [scripts/](scripts/agents.md) — DHCP/DNS installer scripts and management tooling
- [frontend/](frontend/agents.md) — React 19 + TypeScript frontend (shadcn/ui, Tailwind v4)
- [backend/](backend/agents.md) — FastAPI REST/WebSocket API server
- [docker/](docker/agents.md) — Docker Compose and deployment configuration
- [docs/](docs/agents.md) — User and developer documentation

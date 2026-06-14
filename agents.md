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

> This document was generated by Agent Zero itself — the AI agent that built the DHCP Dashboard.

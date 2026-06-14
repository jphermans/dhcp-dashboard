# Scripts

## Purpose
This directory contains shell scripts for installing, configuring, and managing the DHCP/DNS server and the DHCP Dashboard application.

## Ownership
Owned by the root AGENTS.md. All scripts must comply with project-wide standards and the DOX framework.

## Local Contracts
- All scripts must support a `--test`/`--dry-run` mode where applicable.
- Scripts must use consistent color-coded output (`tmc` library) and spinner/progress indicators.
- Exit codes must be meaningful: 0 for success, non-zero for failure.
- Scripts must validate input before making changes.
- System modification scripts must ask for confirmation and provide rollback information.

## Work Guidance
- Keep scripts self-contained with clear usage messages and `--help` support.
- Use the `dashboardctl.sh` for service lifecycle management (start/stop/status) of the dashboard backend and Nginx.
- Use `db_init.sh` as a standalone database initializer when the main install script's step 7 fails or needs to be run independently. It is idempotent and handles async SQLAlchemy correctly.
- When adding a new script, document it here and in the root README if user-facing.

### Install Script Security Rules
- **Root is forbidden.** If the install script detects it is running as root, it must print instructions for creating a normal user and exit immediately. Only non‑root users with `sudo` may run the installation.
- **Privilege escalation via `$SUDO` variable.** All commands needing root (apt-get, cp/mkdir/cat to system paths, tee to /etc, systemctl, nginx -t, etc.) must use `$SUDO` (resolved to `sudo` or empty if already root). Never hardcode `sudo` — it breaks the root check.
- **Password confirmation.** The admin password prompt must:
  - Use masked input (`read -s`).
  - Ask for confirmation.
  - Accept an empty password from either prompt and fall back to a documented default (`admin123`).
  - Reject passwords shorter than 8 characters and re‑prompt.
  - Reject non‑matching confirmation and re‑prompt.
  - Display a clear hint: `[default: admin123]`.

## Verification
- Run scripts with `--test` flag and verify all simulated operations.
- For production scripts, execute on a clean environment and check service status and logs.
- ShellCheck linting is recommended before committing changes.

## Child DOX Index
No child DOX files — this folder contains only scripts, no further nested domains.

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
- When adding a new script, document it here and in the root README if user-facing.

## Verification
- Run scripts with `--test` flag and verify all simulated operations.
- For production scripts, execute on a clean environment and check service status and logs.
- ShellCheck linting is recommended before committing changes.

## Child DOX Index
No child DOX files — this folder contains only scripts, no further nested domains.

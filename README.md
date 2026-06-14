<p align="center">
  <img src="assets/banner.svg" alt="DHCP Dashboard Banner" width="100%" />
</p>

<p align="center">
  <strong>A modern, web-based DHCP & DNS management dashboard for your Raspberry Pi</strong>
</p>

<p align="center">
  <a href="https://python.org"><img src="https://img.shields.io/badge/Python-3.12%2B-blue?logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi" alt="FastAPI" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-v4-38B2AC?logo=tailwind-css&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://www.raspberrypi.com"><img src="https://img.shields.io/badge/Raspberry%20Pi-4/5-red?logo=raspberry-pi" alt="Raspberry Pi" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" /></a>
</p>

---

## 📖 Table of Contents

- [✨ Features](#-features)
- [🧰 Tech Stack](#-tech-stack)
- [📸 Screenshots](#-screenshots)
- [🚀 Quick Start](#-quick-start) *(for testing)*
- [📦 Full Raspberry Pi Installation](#-full-raspberry-pi-installation)
- [🎮 Managing the Dashboard](#-managing-the-dashboard)
- [🔐 Default Credentials](#-default-credentials)
- [📁 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Features

### 🖥️ Dashboard

- Real‑time monitoring with **WebSocket** updates every few seconds
- **9 stat cards**: DHCP status, DNS status, uptime, CPU, RAM, disk, active clients, leases, query rate
- **Time‑series charts**: system load, network throughput, DNS queries/sec, cache hit ratio
- Beautiful **glassmorphism** UI with dark & light mode

### 🌐 DHCP Management

- View all active leases with search & filter
- Lease history & expiration tracking
- Add / Edit / Delete static reservations
- MAC address lookup with **vendor detection**
- IP range management

### 📡 DNS Management

- Full zone management (add, edit, delete zones)
- Edit all common record types: **A, AAAA, CNAME, MX, TXT, SRV, PTR**
- Bulk import / export of records
- DNS validation & zone backup

### 👥 Client Inventory

- Every device connected is tracked:
  - Hostname, IP, MAC, Vendor, Last Seen, Lease Status
  - OS detection, connection history

### 🔔 Alerts & Notifications

- Configurable alerts for:
  - DHCP pool exhaustion, service failures, high CPU/memory, DNS errors, unknown devices
- Delivery via **Email, Webhooks, Discord, Slack**

### 📋 Audit Trail

- Every action is logged: logins, config changes, DHCP/DNS modifications, security events
- Filterable log viewer with **CSV export**

### 🔒 Security

- JWT authentication + secure session management
- Role‑based access control: Admin, Operator, Read‑Only
- CSRF protection, rate limiting, Argon2 password hashing
- Follows OWASP best practices

---

## 🧰 Tech Stack

| Layer        | Technology |
|-------------|-----------|
| **Backend**  | Python 3.12+, FastAPI, SQLAlchemy, JWT, SQLite/PostgreSQL |
| **Frontend** | React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS v4 |
| **Charts**   | Recharts |
| **State**    | TanStack Query |
| **Forms**    | react‑hook‑form + Zod validation |
| **Icons**    | Lucide |
| **Deployment** | Docker, Docker Compose, Nginx, systemd |

---

## 📸 Screenshots

> *Coming soon! Take a peek at the clean glassmorphism interface.*

---

## 🚀 Quick Start

Try the dashboard on any Linux machine in 2 minutes:

```bash
# Clone the repo
git clone https://github.com/jphermans/dhcp-dashboard.git
cd dhcp-dashboard

# Start the backend (in terminal 1)
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # or set your own values
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Start the frontend (in terminal 2)
cd ../frontend
npm install
npm run dev
```

Open **http://localhost:5173** and log in with `admin` / `admin123`.

The frontend automatically proxies API calls to the backend on port 8000.

---

## 📦 Full Raspberry Pi Installation

Designed for **Raspberry Pi 4/5** (and any Debian‑based system).

### 1️⃣ Download the project

```bash
sudo apt update && sudo apt install git -y
git clone https://github.com/jphermans/dhcp-dashboard.git
cd dhcp-dashboard
```

### 2️⃣ Run the automatic installer

Our **colorful**, **step‑by‑step** installer will guide you through everything:

```bash
chmod +x scripts/install_dashboard.sh
sudo ./scripts/install_dashboard.sh
```

The script will:

- 🔄 Update your system
- 📦 Install all required packages (Python 3, Node.js 20, Nginx, build tools)
- ⚙️ Ask you for the server IP, ports, admin username & password
- 🐍 Create a Python virtual environment and install the backend
- ⚛️ Build the frontend for production
- 🖥️ Configure Nginx as a reverse proxy
- 🔁 Create a systemd service so the dashboard starts on boot
- ✅ Perform a final health check

You'll see colourful progress bars, spinners, and success messages!

### 3️⃣ Access the dashboard

Open your browser and go to:

```
http://<your-raspberry-pi-ip>
```

The backend API and Swagger docs are available at:

```
http://<your-raspberry-pi-ip>:8000/api/docs
```

### 4️⃣ (Optional) Enable auto‑start on boot

The installer already created the systemd service, but you can double‑check with:

```bash
sudo systemctl enable --now dhcpdashboard-backend
```

---

## 🎮 Managing the Dashboard

Use the handy **`dashboardctl.sh`** script to control the dashboard:

```bash
# Start both backend and nginx
sudo ./scripts/dashboardctl.sh start

# Stop gracefully
sudo ./scripts/dashboardctl.sh stop

# Restart with health check
sudo ./scripts/dashboardctl.sh restart

# See detailed status (services, health, logs)
sudo ./scripts/dashboardctl.sh status

# Enable / disable auto‑start on boot
sudo ./scripts/dashboardctl.sh enable
sudo ./scripts/dashboardctl.sh disable
```

---

## 🔐 Default Credentials

| Field    | Value       |
|----------|-------------|
| Username | `admin`     |
| Password | `admin123`  |

⚠️ **Change the password immediately** after installation!

You can change it from the **Settings** page in the dashboard.

---

## 📁 Project Structure

```
dhcp-dashboard/
├── backend/            # Python FastAPI backend
│   ├── app/
│   │   ├── api/        # REST endpoints (auth, dashboard, dhcp, dns, alerts, etc.)
│   │   ├── core/       # Configuration, security
│   │   ├── db/         # Database models & session
│   │   └── main.py     # Entry point
│   ├── data/           # SQLite database (gitignored)
│   └── requirements.txt
├── frontend/           # React 19 + TypeScript frontend
│   ├── src/
│   │   ├── pages/      # 8 page components (Login, Dashboard, DHCP, DNS, Clients, Alerts, Audit, Settings)
│   │   ├── components/ # shadcn/ui components, layout, auth wrappers
│   │   ├── contexts/   # Authentication & Theme contexts
│   │   ├── lib/        # API client, utilities
│   │   └── types/      # TypeScript interfaces
│   ├── public/
│   └── vite.config.ts
├── scripts/
│   ├── install_dashboard.sh   # 🎨 Colorful automatic installer
│   └── dashboardctl.sh        # 🎮 Start / stop / status manager
└── README.md
```

---

## 📡 Standalone DHCP & DNS Server

Additionally, the project includes a **separate installer** for setting up a **standalone DHCP & DNS server** (powered by `dnsmasq`) on your Raspberry Pi — ideal when your router (e.g., TP‑Link ER605) acts only as a gateway and does not provide DHCP.

### 🧪 Dry‑Run Testing

Test the script without making any changes:

```bash
chmod +x scripts/install_dhcp_dns.sh
./scripts/install_dhcp_dns.sh --test
```

This simulates every step with a colorful UI — perfect for verifying the flow in an LXC container before a real installation.

### 🚀 Real Installation

```bash
sudo ./scripts/install_dhcp_dns.sh
```

The interactive installer asks for network settings (IP, CIDR, gateway, DHCP range, domain, upstream DNS) and then:

- Installs and configures `dnsmasq`
- Sets a static IP on the Pi
- Opens firewall ports
- Enables the service to start on boot

> ℹ️ For a detailed walkthrough, check the **Obsidian note** inside the vault:
> `20-Knowledge/Networking/Raspberry Pi DHCP and DNS Setup.md`

---

## 📚 DOX Documentation

This project uses the **[DOX framework](https://github.com/agent0ai/dox)** to document its codebase for AI agents. Every code folder contains an `AGENTS.md` file that serves as a binding work contract for its subtree, describing purpose, ownership, local contracts, work guidance, and verification rules.

| Folder | DOX Contract |
|--------|-------------|
| `scripts/` | Installer scripts & security rules |
| `frontend/` | React 19 + TypeScript UI conventions |
| `backend/` | FastAPI REST API & WebSocket standards |
| `docker/` | Docker & Compose deployment rules |
| `docs/` | User & developer documentation |

> 💡 **TL;DR:** DOX ensures every AI agent working on this project follows the same rules and standards.

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

- Open an **issue** for bugs or feature requests
- Submit a **pull request** with improvements
- Share your **screenshots** and **feedback**

---

## 📄 License

This project is licensed under the **MIT License** – see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ for home‑lab enthusiasts and network administrators
</p>

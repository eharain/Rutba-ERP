# Rutba ERP — Production Deployment Guide (systemd)

This guide walks through deploying Rutba ERP on a Linux server using **systemd** services. It covers first-time setup, subsequent deploys, and rollback.

---

## Prerequisites

| Requirement    | Minimum Version |
|----------------|-----------------|
| Ubuntu / Debian | 20.04+         |
| Node.js        | 18+             |
| npm            | 9+              |
| MySQL          | 8.x (or MariaDB 10.6+) |
| Git            | 2.x             |
| A sudo-capable user (e.g. `rutba-nvr`) | — |

---

## Directory Layout

After the first deploy, your server will have:

```
/home/rutba-nvr/
├── rutba_builds/                   # ← versioned builds + master env files
│   ├── .env                        #    ENVIRONMENT=production  (master copy)
│   ├── .env.production             #    all config: DB creds, ports, secrets  (master copy)
│   ├── build_20250101_120000_main/
│   ├── build_20250115_093000_main/
│   └── ...
│
├── rutba_active -> rutba_builds/build_...  # ← symlink to the running build
│
└── db_dumps/                       # ← automatic MySQL backups before each deploy
```

---

## 1. First-Time Server Setup

### 1.1 Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # v18.x+
npm -v    # 9.x+

# Install Git
sudo apt install -y git

# Install MySQL 8
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### 1.2 Create the Database

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE rutba_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rutba'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON rutba_pos.* TO 'rutba'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 1.3 Create the Environment Files

The deploy script will prompt you to do this on first run, but you can set it up ahead of time:

```bash
mkdir -p ~/rutba_builds

# Create the root .env (tells the system which environment file to load)
echo "ENVIRONMENT=production" > ~/rutba_builds/.env

# Copy the sample template and edit it
cp /path/to/repo/sample.env.enviromentname.txt ~/rutba_builds/.env.production
nano ~/rutba_builds/.env.production
```

#### Key values to change in `.env.production`:

```ini
# URLs — replace localhost with your server IP or domain
NEXT_PUBLIC_API_URL=http://your-server:4010/api/
NEXT_PUBLIC_IMAGE_URL=http://your-server:4010
NEXT_PUBLIC_AUTH_URL=http://your-server:4003
NEXT_PUBLIC_STOCK_URL=http://your-server:4001
NEXT_PUBLIC_SALE_URL=http://your-server:4002
NEXT_PUBLIC_WEB_USER_URL=http://your-server:4004
NEXT_PUBLIC_CRM_URL=http://your-server:4005
NEXT_PUBLIC_HR_URL=http://your-server:4006
NEXT_PUBLIC_ACCOUNTS_URL=http://your-server:4007
NEXT_PUBLIC_PAYROLL_URL=http://your-server:4008
NEXT_PUBLIC_CMS_URL=http://your-server:4009

# Image host
NEXT_PUBLIC_IMAGE_HOST_PROTOCOL=http
NEXT_PUBLIC_IMAGE_HOST_NAME=your-server
NEXT_PUBLIC_IMAGE_HOST_PORT=4010

# Strapi — generate unique secrets (e.g. openssl rand -base64 32)
POS_STRAPI__ADMIN_JWT_SECRET=<generate>
POS_STRAPI__API_TOKEN_SALT=<generate>
POS_STRAPI__APP_KEYS=<generate>,<generate>
POS_STRAPI__JWT_SECRET=<generate>
POS_STRAPI__ENCRYPTION_KEY=<generate>
POS_STRAPI__TRANSFER_TOKEN_SALT=<generate>

# Strapi — database
POS_STRAPI__DATABASE_CLIENT=mysql
POS_STRAPI__DATABASE_HOST=127.0.0.1
POS_STRAPI__DATABASE_PORT=3306
POS_STRAPI__DATABASE_NAME=rutba_pos
POS_STRAPI__DATABASE_USERNAME=rutba
POS_STRAPI__DATABASE_PASSWORD=your_secure_password
POS_STRAPI__DATABASE_SSL=false
POS_STRAPI__HOST=0.0.0.0
POS_STRAPI__PORT=4010

# rutba-web — NextAuth
RUTBA_WEB__NEXTAUTH_SECRET=<generate>
RUTBA_WEB__NEXTAUTH_URL=http://your-server:4000
```

> **Tip:** Generate secrets with `openssl rand -base64 32`

---

## 2. Deploy

### 2.1 First Deploy

```bash
# Clone the repo (just to get the scripts — the deploy script will clone into builds/)
git clone https://github.com/eharain/Rutba-ERP.git ~/Rutba-ERP-scripts
cd ~/Rutba-ERP-scripts

# Run the deploy script
sudo bash scripts/rutba_deploy.sh
```

The script will:

1. Ask which branch to deploy (`main` or `dev`)
2. Clone the repo into `~/rutba_builds/build_<timestamp>_<branch>/`
3. If `~/rutba_builds/.env` doesn't exist, create it from the sample template and pause for you to edit
4. Copy `.env` files from `~/rutba_builds/` root into the build
5. Run `npm install` and build Strapi + all Next.js apps
6. Write systemd service files for all 12 services
7. Start everything and show service status

### 2.2 Subsequent Deploys

```bash
sudo bash ~/rutba_active/scripts/rutba_deploy.sh
```

On subsequent runs it will:

- Check if the active build already matches the remote branch (skip if up-to-date)
- Back up the MySQL database before deploying
- Clone fresh, copy env from `~/rutba_builds/`, build, swap services

### 2.3 Automated Deploys (cron)

To check for updates every 10 minutes, the deploy script can be run non-interactively by pre-setting the branch:

```bash
# Add to root's crontab:  sudo crontab -e
*/10 * * * * bash /home/rutba-nvr/rutba_active/scripts/rutba_deploy.sh <<< "1" >> /var/log/rutba_deploy.log 2>&1
```

---

## 3. Manage Services

### Start / Stop / Restart

```bash
# Individual service
sudo systemctl start rutba_pos_strapi
sudo systemctl stop rutba_pos_sale
sudo systemctl restart rutba_hr

# All services
sudo systemctl start rutba_pos_strapi rutba_pos_auth rutba_pos_stock rutba_pos_sale
sudo systemctl start rutba_web rutba_web_user rutba_crm rutba_hr
sudo systemctl start rutba_accounts rutba_payroll rutba_cms rutba_pos_desk
```

### View Logs

```bash
# Follow logs for a specific service
sudo journalctl -fu rutba_pos_strapi

# Last 100 lines
sudo journalctl -n 100 -u rutba_pos_auth

# Deploy log
tail -f /var/log/rutba_deploy.log
```

### Check Status

```bash
sudo systemctl status rutba_pos_strapi
sudo systemctl status rutba_web
```

### Service List

| Service Name         | App              | Default Port |
|----------------------|------------------|--------------|
| `rutba_pos_strapi`   | Strapi API       | 4010         |
| `rutba_pos_auth`     | Auth Portal      | 4003         |
| `rutba_pos_stock`    | Stock Management | 4001         |
| `rutba_pos_sale`     | Point of Sale    | 4002         |
| `rutba_web`          | Public Website   | 4000         |
| `rutba_web_user`     | My Orders        | 4004         |
| `rutba_crm`          | CRM              | 4005         |
| `rutba_hr`           | Human Resources  | 4006         |
| `rutba_accounts`     | Accounting       | 4007         |
| `rutba_payroll`      | Payroll          | 4008         |
| `rutba_cms`          | CMS              | 4009         |
| `rutba_pos_desk`     | Legacy Desk      | 3000         |

---

## 4. Rollback

If a deploy breaks something, rollback to any of the last 5 builds (near-instant — no rebuild needed):

```bash
sudo bash ~/rutba_active/scripts/rutba_rollback.sh
```

The script will:

1. List available builds with their commit info and size
2. Let you pick which build to roll back to
3. Optionally restore a database backup
4. Re-point all systemd services at the selected build
5. Restart everything

---

## 5. Re-create Service Files

If systemd service files get deleted or corrupted, regenerate them without a full deploy:

```bash
# Auto-detect the active or most recent build
sudo bash ~/rutba_active/scripts/setup-systemd-services.sh

# Or specify a build directory explicitly
sudo bash ~/rutba_active/scripts/setup-systemd-services.sh /home/rutba-nvr/rutba_builds/build_20250101_120000_main
```

---

## 6. Update Environment Variables

Master environment files live at the root of `~/rutba_builds/` (alongside the `build_*` directories) and are **copied** into each build at deploy time. To change a value:

```bash
# 1. Edit the master env file
sudo nano ~/rutba_builds/.env.production

# 2. Copy it into the currently active build
sudo cp ~/rutba_builds/.env.production ~/rutba_active/.env.production

# 3. Restart affected services
sudo systemctl restart rutba_pos_strapi
```

Or just re-deploy to pick up the changes in a fresh build:

```bash
sudo bash ~/rutba_active/scripts/rutba_deploy.sh
```

---

## 7. Troubleshooting

### Service won't start

```bash
# Check the journal for errors
sudo journalctl -u rutba_pos_strapi -n 50 --no-pager

# Verify the service file points at a valid build
cat /etc/systemd/system/rutba_pos_strapi.service | grep WorkingDirectory

# Verify node/npm are accessible
which node && which npm
```

### Port already in use

```bash
# Find what's using the port
sudo lsof -i :4010

# Kill it
sudo kill -9 <PID>
```

### Build fails

```bash
# Check disk space
df -h

# Check Node.js memory (increase if needed)
export NODE_OPTIONS="--max-old-space-size=4096"
sudo bash ~/rutba_active/scripts/rutba_deploy.sh
```

### Database connection refused

```bash
# Check MySQL is running
sudo systemctl status mysql

# Test connection with the creds from your env file
mysql -u rutba -p -h 127.0.0.1 rutba_pos
```

---

## File Reference

| File | Purpose |
|------|---------|
| `scripts/rutba_deploy.sh` | Main deploy script — clone, build, swap services |
| `scripts/rutba_rollback.sh` | Rollback to a previous build |
| `scripts/setup-systemd-services.sh` | Re-create systemd unit files from active/recent build |
| `scripts/load-env.js` | Centralized env loader — reads `.env.*` from build root, injects per-app vars |
| `sample.env.enviromentname.txt` | Template for `.env.production` with all available keys |
| `~/rutba_builds/.env` | Root env — sets `ENVIRONMENT=production` |
| `~/rutba_builds/.env.production` | All config: DB creds, URLs, ports, secrets |

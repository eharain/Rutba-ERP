# Rutba POS — Strapi 5 API Backend

Headless CMS and REST API provider for all Rutba POS front-end applications. Built on **Strapi 5.x** with MySQL.

## Content Types

| Domain | API IDs |
|---|---|
| **Core POS** | `product`, `category`, `brand`, `supplier`, `purchase`, `stock-item`, `sale`, `sale-item`, `return` |
| **Auth** | `app-access` (many-to-many with users — controls per-app access) |
| **CRM** | `crm-contact`, `crm-lead`, `crm-activity` |
| **HR** | `hr-employee`, `hr-department`, `hr-attendance`, `hr-leave-request` |
| **Payroll** | `pay-salary-structure`, `pay-payroll-run`, `pay-payslip` |
| **Accounting** | `acc-account`, `acc-journal-entry`, `acc-invoice`, `acc-expense` |

## Custom Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/me/permissions` | Returns `{ role, appAccess[], permissions[] }` for the authenticated user |

## Getting Started

```bash
# Install dependencies
npm install

# Development (with auto-reload)
npm run develop

# Production
npm run build
npm run start
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```
DATABASE_CLIENT=mysql
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=rutba_pos
DATABASE_USERNAME=your_user
DATABASE_PASSWORD=your_password
APP_KEYS=<generated>
JWT_SECRET=<generated>
API_TOKEN_SALT=<generated>
ADMIN_JWT_SECRET=<generated>
TRANSFER_TOKEN_SALT=<generated>
ENCRYPTION_KEY=<generated>
```

### Database Migrations

Seed data (app-access entries) is managed via migrations in `database/migrations/`. Strapi runs these automatically on startup.

## Learn More

- [Strapi 5 Documentation](https://docs.strapi.io)
- [Strapi CLI Reference](https://docs.strapi.io/dev-docs/cli)

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>

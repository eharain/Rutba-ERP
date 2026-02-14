# Contributing to Rutba POS

Thank you for your interest in contributing to Rutba POS! We welcome contributions from the community to help make this project better.

## Project Structure

Rutba POS is an **npm workspaces monorepo** containing multiple Next.js 15 apps and a Strapi 5 backend. Before contributing, please review the [root README](README.md) for the full workspace layout and port assignments.

Key directories:
- `packages/pos-shared/` — shared library (components, context, utilities)
- `pos-auth/`, `pos-stock/`, `pos-sale/` — core POS apps
- `rutba-web/` — customer-facing storefront (TypeScript, Tailwind CSS)
- `rutba-crm/`, `rutba-hr/`, `rutba-accounts/`, `rutba-payroll/` — business management apps
- `pos-strapi/` — Strapi 5 API backend

## How to Contribute

### 1. Fork the Repository

- Click the "Fork" button at the top right of this repository.
- Clone your fork to your local machine:
### 2. Create a Branch

- Create a new branch for your feature or bugfix:
### 3. Make Changes

- Make your changes in the codebase.
- Write clear, concise commit messages.
- Add tests for your changes if applicable.

### 4. Run Tests

- Ensure all tests pass before submitting your changes.
- Run the test suite using the instructions in the README or relevant component documentation.

### 5. Submit a Pull Request

- Push your branch to your fork:
- Open a pull request against the `main` branch of this repository.
- Provide a clear description of your changes and reference any related issues.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) to foster a welcoming and respectful community.

## Style Guide

- Follow the existing code style and conventions.
- Use clear and descriptive variable and function names.
- Document your code where necessary.

## Reporting Issues

- Use the [Issues](https://github.com/ejazarain/rutba-pos/issues) tab to report bugs or request features.
- Provide as much detail as possible, including steps to reproduce, expected behavior, and screenshots if applicable.

## Community

- Join discussions, ask questions, and provide feedback in issues and pull requests.
- Be respectful and constructive in all interactions.

Thank you for helping to improve Rutba POS!

# Copilot Instructions

## General Guidelines
- Prefer using Bootstrap utility classes instead of inline `<style jsx>` blocks for print-related components in `pos-desk/components/print`.

## Project-Specific Rules
- Context providers should load state from local storage on mount, ensuring the initial load effect runs only once (with empty dependencies). Use distinct state setter names (e.g., `setLabelSizeState`) to avoid name collisions and persist changes to storage using consistent keys (e.g., 'label-size').
- UtilContext should load state from local storage on mount and persist changes to local storage using consistent keys (use 'label-size' for label size). Use distinct state setter names (e.g., `setLabelSizeState`) to avoid collisions and ensure setters persist to storage.
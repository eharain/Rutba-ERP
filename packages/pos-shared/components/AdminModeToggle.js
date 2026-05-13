'use client'
import RoleSwitcher from './RoleSwitcher';

/**
 * @deprecated Use RoleSwitcher instead.
 *
 * AdminModeToggle was the AGP-era binary admin-elevation toggle (X-Rutba-App-Admin
 * header). It has been superseded by explicit role selection — the user picks
 * their admin role from RoleSwitcher's dropdown when they need elevation.
 *
 * This shim renders RoleSwitcher so any lingering imports continue to work.
 * Remove the shim once all callers migrate.
 */
export default function AdminModeToggle() {
    return <RoleSwitcher />;
}

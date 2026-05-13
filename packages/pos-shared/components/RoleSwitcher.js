'use client'
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAppName } from '@rutba/api-provider/lib/api';

/**
 * RoleSwitcher
 *
 * Renders the user's active role for the current app in the navbar.
 *
 *   - 0 roles  → renders nothing (the user can't act in this app at all).
 *   - 1 role   → renders a non-clickable chip with the role name (so the
 *                user always knows which role they're acting as).
 *   - 2+ roles → renders a dropdown. Selecting a different role updates the
 *                X-Rutba-App-Role header (via AuthContext.setActiveRoleForApp)
 *                and reloads the page so every query refetches under the new
 *                policy scope.
 *
 * This component supersedes the legacy AdminModeToggle — admin elevation is
 * now expressed by switching to an admin-level role from this menu.
 *
 * Usage:
 *   import RoleSwitcher from '@rutba/pos-shared/components/RoleSwitcher';
 *   // … inside the navbar …
 *   <RoleSwitcher />
 */
export default function RoleSwitcher() {
    const { rolesByApp, activeRoleKey, setActiveRoleForApp, loading } = useAuth();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    if (loading) return null;

    const appName = getAppName();
    const list = Array.isArray(rolesByApp?.[appName]) ? rolesByApp[appName] : [];
    if (list.length === 0) return null;

    const active = list.find((r) => r.key === activeRoleKey) || list[0];
    const isAdminLevel = /(?:^|_)admin$/.test(String(active.key || ''));

    const baseChipClass = `btn btn-sm me-2 ${isAdminLevel ? 'btn-warning' : 'btn-outline-secondary'}`;

    if (list.length === 1) {
        return (
            <span
                className={baseChipClass}
                style={{ cursor: 'default', pointerEvents: 'none' }}
                title={`Acting as ${active.name || active.key}`}
            >
                <i className={`fa-solid ${isAdminLevel ? 'fa-shield-halved' : 'fa-shield'} me-1`}></i>
                <span style={{ fontSize: '0.78rem' }}>{active.name || active.key}</span>
            </span>
        );
    }

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className={baseChipClass}
                title={`Acting as ${active.name || active.key} — click to switch role`}
                onClick={() => setOpen((v) => !v)}
            >
                <i className={`fa-solid ${isAdminLevel ? 'fa-shield-halved' : 'fa-shield'} me-1`}></i>
                <span style={{ fontSize: '0.78rem' }}>{active.name || active.key}</span>
                <i className="fa-solid fa-caret-down ms-1" style={{ fontSize: '0.7rem' }}></i>
            </button>
            {open && (
                <ul
                    className="dropdown-menu show"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        minWidth: 200,
                        zIndex: 1050,
                        marginTop: 4,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                >
                    <li className="dropdown-header" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
                        Switch role for <strong>{appName}</strong>
                    </li>
                    {list.map((role) => {
                        const selected = role.key === active.key;
                        const adminish = /(?:^|_)admin$/.test(String(role.key || ''));
                        return (
                            <li key={role.key}>
                                <button
                                    type="button"
                                    className={`dropdown-item${selected ? ' active' : ''}`}
                                    onClick={() => {
                                        setOpen(false);
                                        if (!selected) setActiveRoleForApp(role.key);
                                    }}
                                >
                                    <i className={`fa-solid ${adminish ? 'fa-shield-halved' : 'fa-user'} me-2`}></i>
                                    <span>{role.name || role.key}</span>
                                    {selected && (
                                        <i className="fa-solid fa-check ms-2 float-end" style={{ marginTop: 4 }}></i>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

'use client'
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAppName } from '@rutba/api-provider/lib/api';

/**
 * RoleSwitcher
 *
 * Renders the user's active role for the current app as a navbar
 * dropdown item (matches the surrounding nav-links). Selecting a
 * different role updates X-Rutba-App-Role via AuthContext and reloads
 * the page.
 *
 *   - 0 roles  → renders nothing.
 *   - 1 role   → renders a static nav-link chip (the user always sees
 *                which role they're acting as).
 *   - 2+ roles → renders a dropdown trigger.
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
        const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener('mousedown', onClickOutside);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (loading) return null;

    const appName = getAppName();
    const perApp = Array.isArray(rolesByApp?.[appName]) ? rolesByApp[appName] : [];
    const wildcard = Array.isArray(rolesByApp?.['*']) ? rolesByApp['*'] : [];
    const seen = new Set();
    const list = [];
    for (const r of [...perApp, ...wildcard]) {
        if (!r || !r.key || seen.has(r.key)) continue;
        seen.add(r.key);
        list.push(r);
    }
    if (list.length === 0) return null;

    const active = list.find((r) => r.key === activeRoleKey) || list[0];
    const isAdminLevel = /(?:^|_)admin$/.test(String(active.key || ''));
    const icon = isAdminLevel ? 'fa-shield-halved' : 'fa-user-shield';
    const adminTint = isAdminLevel ? ' text-warning' : '';

    if (list.length === 1) {
        return (
            <div className="nav-item nav-role-switcher">
                <span
                    className={`nav-link d-inline-flex align-items-center gap-2 disabled${adminTint}`}
                    style={{ cursor: 'default', opacity: 0.95 }}
                    title={`Acting as ${active.name || active.key}`}
                >
                    <i className={`fa-solid ${icon}`}></i>
                    <span>{active.name || active.key}</span>
                </span>
            </div>
        );
    }

    return (
        <div className="nav-item dropdown nav-role-switcher" ref={ref}>
            <button
                type="button"
                className={`nav-link dropdown-toggle d-inline-flex align-items-center gap-2${adminTint}${open ? ' show' : ''}`}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                title={`Acting as ${active.name || active.key} — click to switch role`}
            >
                <i className={`fa-solid ${icon}`}></i>
                <span>{active.name || active.key}</span>
            </button>
            <div className={`dropdown-menu dropdown-menu-end${open ? ' show' : ''}`} style={{ minWidth: 220 }}>
                <div className="dropdown-header text-uppercase small fw-semibold">
                    Switch role for <span className="text-primary">{appName}</span>
                </div>
                <hr className="dropdown-divider" />
                {list.map((role) => {
                    const selected = role.key === active.key;
                    const adminish = /(?:^|_)admin$/.test(String(role.key || ''));
                    return (
                        <button
                            key={role.key}
                            type="button"
                            className={`dropdown-item d-flex align-items-center gap-2 py-2${selected ? ' active' : ''}`}
                            onClick={() => {
                                setOpen(false);
                                if (!selected) setActiveRoleForApp(role.key);
                            }}
                        >
                            <i className={`fa-solid ${adminish ? 'fa-shield-halved' : 'fa-user'}`} style={{ width: 18, textAlign: 'center' }}></i>
                            <span className="flex-grow-1">{role.name || role.key}</span>
                            {selected && <i className="fa-solid fa-check ms-2"></i>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

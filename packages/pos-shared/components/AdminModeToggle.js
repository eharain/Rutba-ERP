'use client'
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAppName, getAdminMode, setAdminMode } from '../lib/api';
import { isAppAdmin } from '../lib/roles';

/**
 * Small toggle icon for the app navigation bar.
 *
 * Visible only to users whose `adminAppAccess` includes the
 * current app key.  When toggled ON the `X-Rutba-App-Admin`
 * header is sent with every API request, asking the server to
 * bypass owner scoping (elevation).
 *
 * The state is persisted in localStorage (via setAdminMode) so it
 * survives navigation and page reloads.  A full page reload is
 * triggered on toggle to ensure all queries refetch with the
 * correct headers.
 *
 * Usage:
 *   import AdminModeToggle from '@rutba/pos-shared/components/AdminModeToggle';
 *   // … inside the navbar …
 *   <AdminModeToggle />
 */
export default function AdminModeToggle() {
    const { adminAppAccess } = useAuth();
    const appKey = getAppName();
    const canElevate = isAppAdmin(adminAppAccess, appKey);

    const [elevated] = useState(() => getAdminMode());

    if (!canElevate) return null;

    const handleToggle = () => {
        const next = !elevated;
        setAdminMode(next);
        window.location.reload();
    };

    return (
        <button
            type="button"
            className={`btn btn-sm me-2 ${elevated ? 'btn-warning' : 'btn-outline-secondary'}`}
            title={elevated ? 'Admin mode ON — viewing all records' : 'Admin mode OFF — viewing own records only'}
            onClick={handleToggle}
        >
            <i className={`fa-solid ${elevated ? 'fa-shield-halved' : 'fa-shield'}`}></i>
            {elevated && <span className="ms-1 d-none d-md-inline" style={{ fontSize: '0.75rem' }}>Admin</span>}
        </button>
    );
}

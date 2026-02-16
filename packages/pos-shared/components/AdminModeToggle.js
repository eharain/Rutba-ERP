'use client'
import { useState, useEffect } from 'react';
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
 * Usage:
 *   import AdminModeToggle from '@rutba/pos-shared/components/AdminModeToggle';
 *   // … inside the navbar …
 *   <AdminModeToggle />
 */
export default function AdminModeToggle() {
    const { adminAppAccess } = useAuth();
    const appKey = getAppName();
    const canElevate = isAppAdmin(adminAppAccess, appKey);

    const [elevated, setElevated] = useState(() => getAdminMode());

    useEffect(() => {
        setAdminMode(elevated);
    }, [elevated]);

    if (!canElevate) return null;

    return (
        <button
            type="button"
            className={`btn btn-sm me-2 ${elevated ? 'btn-warning' : 'btn-outline-secondary'}`}
            title={elevated ? 'Admin mode ON — viewing all records' : 'Admin mode OFF — viewing own records only'}
            onClick={() => setElevated((prev) => !prev)}
        >
            <i className={`fa-solid ${elevated ? 'fa-shield-halved' : 'fa-shield'}`}></i>
            {elevated && <span className="ms-1 d-none d-md-inline" style={{ fontSize: '0.75rem' }}>Admin</span>}
        </button>
    );
}

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { authApi } from "@rutba/pos-shared/lib/api";
import UserAccessFilters from "../../components/UserAccessFilters";
import UserAccessMatrix from "../../components/UserAccessMatrix";

function getStatus(user) {
  if (user.blocked) return "blocked";
  if (user.confirmed) return "active";
  return "unconfirmed";
}

export default function AccessAssignmentPage() {
  const [users, setUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [savingMap, setSavingMap] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [usersRes, appsRes] = await Promise.all([
        authApi.get("/auth-admin/users"),
        authApi.get("/app-accesses"),
      ]);

      const userData = Array.isArray(usersRes) ? usersRes : usersRes?.data || [];
      const appData = appsRes?.data || appsRes || [];

      setUsers(userData);
      setApps(appData);
    } catch (err) {
      setError("Failed to load users/app access entries.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const roleOptions = useMemo(() => {
    const roles = users
      .map((u) => ({ name: u.role?.name || "No Role", type: u.role?.type || "none" }))
      .filter((r, i, a) => a.findIndex((x) => x.type === r.type) === i)
      .sort((a, b) => a.name.localeCompare(b.name));
    return roles;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && (u.role?.type || "none") !== roleFilter) return false;
      if (statusFilter !== "all" && getStatus(u) !== statusFilter) return false;
      if (!q) return true;
      return (u.displayName || "").toLowerCase().includes(q)
        || (u.username || "").toLowerCase().includes(q)
        || (u.email || "").toLowerCase().includes(q);
    });
  }, [users, search, roleFilter, statusFilter]);

  function getIds(user, field) {
    return new Set((user[field] || []).map((a) => a.id));
  }

  function isChecked(user, appId, field) {
    const ids = getIds(user, field);
    return ids.has(appId);
  }

  function setSaving(key, value) {
    setSavingMap((prev) => ({ ...prev, [key]: value }));
  }

  async function updateAccess(user, appId, kind, checked) {
    const key = `${user.id}:${appId}:${kind}`;
    const prevUsers = users;

    const nextUsers = users.map((u) => {
      if (u.id !== user.id) return u;

      const appSet = getIds(u, "app_accesses");
      const adminSet = getIds(u, "admin_app_accesses");

      if (kind === "user") {
        if (checked) appSet.add(appId);
        else {
          appSet.delete(appId);
          adminSet.delete(appId);
        }
      }

      if (kind === "admin") {
        if (checked) {
          adminSet.add(appId);
          appSet.add(appId);
        } else {
          adminSet.delete(appId);
        }
      }

      const nextAppAccesses = apps.filter((a) => appSet.has(a.id));
      const nextAdminAppAccesses = apps.filter((a) => adminSet.has(a.id));

      return {
        ...u,
        app_accesses: nextAppAccesses,
        admin_app_accesses: nextAdminAppAccesses,
      };
    });

    setUsers(nextUsers);
    setSaving(key, true);
    setError("");

    try {
      const current = nextUsers.find((u) => u.id === user.id);
      const appIds = (current?.app_accesses || []).map((a) => a.id);
      const adminIds = (current?.admin_app_accesses || []).map((a) => a.id);

      await authApi.put(`/auth-admin/users/${user.id}`, {
        username: current?.username,
        email: current?.email,
        displayName: current?.displayName,
        confirmed: current?.confirmed,
        blocked: current?.blocked,
        role: current?.role?.id || undefined,
        app_accesses: appIds,
        admin_app_accesses: adminIds,
      });
    } catch (err) {
      setUsers(prevUsers);
      setError(`Failed updating access for ${user.displayName || user.username || user.email}.`);
      console.error(err);
    } finally {
      setSaving(key, false);
    }
  }

  return (
    <Layout fullWidth>
      <ProtectedRoute>
        <AppAccessGate appKey="auth">
          <PermissionCheck adminOnly appKey="auth" required="plugin::users-permissions.user.update">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h2 className="mb-0"><i className="fas fa-user-shield me-2"></i>User Access Assignment</h2>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={loadData}>
                <i className="fas fa-rotate me-1" />Refresh
              </button>
              <Link href="/users" className="btn btn-sm btn-outline-primary">
                <i className="fas fa-users me-1" />Users
              </Link>
            </div>
          </div>

          <p className="text-muted small mb-3">
            Assign app access quickly. Each app has two controls: <strong>User</strong> (base access) and <strong>Admin</strong> (elevated access). Admin always implies User.
          </p>

          {error && <div className="alert alert-danger">{error}</div>}

          <UserAccessFilters
            search={search}
            setSearch={setSearch}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            roleOptions={roleOptions}
          />

          {loading ? (
            <p>Loading access matrix...</p>
          ) : (
            <UserAccessMatrix
              apps={apps}
              filteredUsers={filteredUsers}
              savingMap={savingMap}
              isChecked={isChecked}
              updateAccess={updateAccess}
            />
          )}
          </PermissionCheck>
        </AppAccessGate>
      </ProtectedRoute>
    </Layout>
  );
}

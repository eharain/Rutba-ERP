import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { authApi } from "@rutba/pos-shared/lib/api";
import UserAccessFilters from "../../components/UserAccessFilters";
import UserAccessCard from "../../components/UserAccessCard";

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = filteredUsers.length === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredUsers.length);
  const pagedUsers = filteredUsers.slice(startIndex, endIndex);

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
            Assign app access for each user. <strong>User</strong> access grants basic permissions, while <strong>Admin</strong> access provides elevated privileges (and automatically includes user access).
          </p>

          {error && <div className="alert alert-danger">{error}</div>}

          <UserAccessFilters
            search={search}
            setSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            roleFilter={roleFilter}
            setRoleFilter={(value) => {
              setRoleFilter(value);
              setPage(1);
            }}
            statusFilter={statusFilter}
            setStatusFilter={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            roleOptions={roleOptions}
          />

          <div className="d-flex justify-content-between align-items-center mb-2">
            <small className="text-muted">
              Showing {filteredUsers.length === 0 ? 0 : startIndex + 1}–{endIndex} of {filteredUsers.length}
            </small>
            <div className="d-flex align-items-center gap-2">
              <label className="small text-muted mb-0">Page size</label>
              <select
                className="form-select form-select-sm"
                style={{ width: 90 }}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2 text-muted">Loading access data...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              No users match the current filters.
            </div>
          ) : (
            <div>
              {pagedUsers.map((user) => (
                <UserAccessCard
                  key={user.id}
                  user={user}
                  apps={apps}
                  savingMap={savingMap}
                  isChecked={isChecked}
                  updateAccess={updateAccess}
                />
              ))}

              <div className="d-flex justify-content-between align-items-center mt-3">
                <small className="text-muted">Page {safePage} of {pageCount}</small>
                <div className="btn-group btn-group-sm" role="group" aria-label="User access pagination">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
          </PermissionCheck>
        </AppAccessGate>
      </ProtectedRoute>
    </Layout>
  );
}

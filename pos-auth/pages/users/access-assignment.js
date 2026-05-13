import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { AuthAdminEndpoints, AppAccessesEndpoints } from "../../lib/endpoints";
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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [usersRes, appsRes] = await Promise.all([
        AuthAdminEndpoints.fetchUsers(),
        AppAccessesEndpoints.fetchList(),
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
    return new Set((user[field] || []));
  }

  function isChecked(user, appId, field) {
    const ids = getIds(user, field);
    return ids.has(appId);
  }

  function setSaving(key, value) {
    setSavingMap((prev) => ({ ...prev, [key]: value }));
  }

  function computeBulkArrays(user, kind, mode) {
    const allKeys = apps.map((a) => a.key);
    const current = {
      domain_accesses: Array.from(new Set(user.domain_accesses || [])),
      admin_domain_accesses: Array.from(new Set(user.admin_domain_accesses || [])),
    };

    if (mode === "fill") {
      if (kind === "user") {
        current.domain_accesses = Array.from(new Set([...current.domain_accesses, ...allKeys]));
      } else {
        current.admin_domain_accesses = Array.from(new Set([...current.admin_domain_accesses, ...allKeys]));
        current.domain_accesses = Array.from(new Set([...current.domain_accesses, ...allKeys]));
      }
    } else if (mode === "clear") {
      if (kind === "user") {
        current.domain_accesses = [];
        current.admin_domain_accesses = [];
      } else {
        current.admin_domain_accesses = [];
      }
    }

    return current;
  }

  async function bulkUpdateUser(user, kind, mode) {
    const prevUsers = users;
    const next = computeBulkArrays(user, kind, mode);
    const nextUser = { ...user, ...next };

    setUsers((prev) => prev.map((u) => (u.id === user.id ? nextUser : u)));
    setBulkBusy(true);
    setError("");

    try {
      await AuthAdminEndpoints.putUpdateUser(user.id, {
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        confirmed: user.confirmed,
        blocked: user.blocked,
        role: user.role?.id || undefined,
        domain_accesses: next.domain_accesses,
        admin_domain_accesses: next.admin_domain_accesses,
      });
    } catch (err) {
      setUsers(prevUsers);
      setError(`Failed bulk updating access for ${user.displayName || user.username || user.email}.`);
      console.error(err);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkApplyToFiltered(kind, mode) {
    if (filteredUsers.length === 0) return;
    const label = mode === "fill" ? "Grant" : "Remove";
    const target = kind === "admin" ? "Admin access" : "User access";
    const confirmMsg =
      `${label} ${target} on ALL ${apps.length} apps for ${filteredUsers.length} filtered users?`
      + `\n\nThis matches the current Search / Role / Status filters.`;
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;

    setBulkBusy(true);
    setBulkProgress({ done: 0, total: filteredUsers.length, failed: 0 });
    setError("");

    const targets = filteredUsers.slice();
    let done = 0;
    let failed = 0;
    const failures = [];

    for (const u of targets) {
      try {
        const next = computeBulkArrays(u, kind, mode);
        await AuthAdminEndpoints.putUpdateUser(u.id, {
          username: u.username,
          email: u.email,
          displayName: u.displayName,
          confirmed: u.confirmed,
          blocked: u.blocked,
          role: u.role?.id || undefined,
          domain_accesses: next.domain_accesses,
          admin_domain_accesses: next.admin_domain_accesses,
        });
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...next } : x)));
      } catch (err) {
        failed += 1;
        failures.push(u.displayName || u.username || u.email || u.id);
        console.error(`Bulk update failed for user ${u.id}:`, err);
      } finally {
        done += 1;
        setBulkProgress({ done, total: targets.length, failed });
      }
    }

    setBulkBusy(false);
    setBulkProgress(null);
    if (failed > 0) {
      setError(`Bulk update finished with ${failed} failure(s): ${failures.slice(0, 5).join(", ")}${failures.length > 5 ? "…" : ""}`);
    }
  }

  async function updateAccess(user, appKey, kind, checked) {
    const key = `${user.id}:${appKey}:${kind}`;
    const prevUsers = users;

    const nextUsers = users.map((u) => {
      if (u.id !== user.id) return u;

      const appSet = getIds(u, "domain_accesses");
      const adminSet = getIds(u, "admin_domain_accesses");

      if (kind === "user") {
        if (checked) appSet.add(appKey);
        else {
          appSet.delete(appKey);
          adminSet.delete(appKey);
        }
      }

      if (kind === "admin") {
        if (checked) {
          adminSet.add(appKey);
          appSet.add(appKey);
        } else {
          adminSet.delete(appKey);
        }
      }

      return {
        ...u,
        domain_accesses: Array.from(appSet),
        admin_domain_accesses: Array.from(adminSet),
      };
    });

    setUsers(nextUsers);
    setSaving(key, true);
    setError("");

    try {
      const current = nextUsers.find((u) => u.id === user.id);

      await AuthAdminEndpoints.putUpdateUser(user.id, {
        username: current?.username,
        email: current?.email,
        displayName: current?.displayName,
        confirmed: current?.confirmed,
        blocked: current?.blocked,
        role: current?.role?.id || undefined,
        domain_accesses: current?.domain_accesses || [],
        admin_domain_accesses: current?.admin_domain_accesses || [],
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
            Assign domain access for each user. <strong>User</strong> access grants basic permissions, while <strong>Admin</strong> access provides elevated privileges (and automatically includes user access).
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

          {!loading && filteredUsers.length > 0 && (
            <div className="card border-info mb-3">
              <div className="card-body py-2">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span className="small fw-semibold me-1">
                    <i className="fas fa-bolt text-info me-1"></i>
                    Bulk apply to <span className="badge bg-info text-dark">{filteredUsers.length}</span> filtered user{filteredUsers.length === 1 ? "" : "s"}
                  </span>
                  <span className="small text-muted me-2">
                    (uses current Search / Role / Status filters &middot; {apps.length} app{apps.length === 1 ? "" : "s"})
                  </span>
                  <div className="btn-group btn-group-sm" role="group" aria-label="Bulk add">
                    <button
                      type="button"
                      className="btn btn-outline-success"
                      disabled={bulkBusy || apps.length === 0}
                      onClick={() => bulkApplyToFiltered("user", "fill")}
                    >
                      <i className="fas fa-user-plus me-1"></i>
                      Add User Access to All
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-warning"
                      disabled={bulkBusy || apps.length === 0}
                      onClick={() => bulkApplyToFiltered("admin", "fill")}
                    >
                      <i className="fas fa-user-shield me-1"></i>
                      Add Admin Access to All
                    </button>
                  </div>
                  <div className="btn-group btn-group-sm" role="group" aria-label="Bulk remove">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={bulkBusy}
                      onClick={() => bulkApplyToFiltered("user", "clear")}
                    >
                      <i className="fas fa-eraser me-1"></i>
                      Remove User Access from All
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      disabled={bulkBusy}
                      onClick={() => bulkApplyToFiltered("admin", "clear")}
                    >
                      <i className="fas fa-user-slash me-1"></i>
                      Remove Admin Access from All
                    </button>
                  </div>
                  {bulkProgress && (
                    <span className="small text-muted ms-2">
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                      {bulkProgress.done}/{bulkProgress.total}
                      {bulkProgress.failed > 0 && <span className="text-danger ms-1">({bulkProgress.failed} failed)</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

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
                  bulkUpdateUser={bulkUpdateUser}
                  bulkBusy={bulkBusy}
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

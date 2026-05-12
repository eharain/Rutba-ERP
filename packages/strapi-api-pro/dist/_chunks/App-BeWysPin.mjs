import { jsxs, jsx } from "react/jsx-runtime";
import React, { useState, useMemo } from "react";
import { Box, Typography, TextInput, Flex, Button, Textarea, SingleSelect, SingleSelectOption } from "@strapi/design-system";
import { useFetchClient } from "@strapi/strapi/admin";
const Recordings = () => /* @__PURE__ */ jsxs(Box, { padding: 6, children: [
  /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "Recordings" }),
  /* @__PURE__ */ jsx(Typography, { variant: "omega", children: "Start/Stop recording controls and session list will be implemented here." })
] });
const Interfaces = () => {
  const { post, get, patch } = useFetchClient();
  const [routePath, setRoutePath] = React.useState("/cms-footers/:id");
  const [signature, setSignature] = React.useState("documentId");
  const [result, setResult] = React.useState(null);
  const [lint, setLint] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const parseSignature = () => signature.split(",").map((v) => v.trim()).filter(Boolean);
  const validate = async () => {
    setMessage("");
    try {
      const { data } = await post("/api-pro/interfaces/validate-alignment", {
        path: routePath,
        inputSignature: parseSignature()
      });
      setResult(data?.data || null);
    } catch {
      setMessage("Validation failed.");
    }
  };
  const previewFix = async () => {
    setMessage("");
    try {
      const { data } = await post("/api-pro/interfaces/preview-guided-fix", {
        path: routePath,
        inputSignature: parseSignature()
      });
      setResult(data?.data || null);
    } catch {
      setMessage("Guided fix preview failed.");
    }
  };
  const runLint = async () => {
    setMessage("");
    try {
      const { data } = await get("/api-pro/interfaces/lint-scaffold");
      setLint(data?.data || null);
    } catch {
      setMessage("Lint failed.");
    }
  };
  const applyExample = async () => {
    setMessage("Use guidedFix=true when calling PATCH /api-pro/interfaces/:interfaceId/methods.");
    try {
      await patch("/api-pro/interfaces/0/methods", {
        name: "byIdPublished",
        path: routePath,
        method: "get",
        inputSignature: parseSignature(),
        guidedFix: true,
        strictAlignment: true
      });
    } catch {
    }
  };
  return /* @__PURE__ */ jsxs(Box, { padding: 6, children: [
    /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "API Interfaces" }),
    /* @__PURE__ */ jsx(Typography, { variant: "omega", children: "Alignment diagnostics and guided param-name fixes." }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 4, children: /* @__PURE__ */ jsx(TextInput, { label: "Route Path", value: routePath, onChange: (e) => setRoutePath(e.target.value) }) }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 3, children: /* @__PURE__ */ jsx(
      TextInput,
      {
        label: "Input Signature (comma separated)",
        value: signature,
        onChange: (e) => setSignature(e.target.value)
      }
    ) }),
    /* @__PURE__ */ jsxs(Flex, { gap: 2, paddingTop: 4, wrap: "wrap", children: [
      /* @__PURE__ */ jsx(Button, { onClick: validate, children: "Validate Alignment" }),
      /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: previewFix, children: "Preview Guided Fix" }),
      /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: runLint, children: "Lint Scaffold" }),
      /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: applyExample, children: "Apply (example)" })
    ] }),
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 3, children: /* @__PURE__ */ jsx(Typography, { textColor: "neutral600", children: message }) }),
    result && /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
      /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Alignment Result" }),
      /* @__PURE__ */ jsx("pre", { children: JSON.stringify(result, null, 2) })
    ] }),
    lint && /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
      /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Scaffold Lint" }),
      /* @__PURE__ */ jsx("pre", { children: JSON.stringify(lint, null, 2) })
    ] })
  ] });
};
const SAMPLE_CONTEXT = {
  strapi: { request: { method: "GET", path: "/cms-footers/123" } },
  user: { id: 9, email: "user@example.com" },
  claim: { appName: "web-user", roleKey: "web_user", domainKey: "web-authenticated" },
  input: { id: "123", fields: ["title"], populate: { links: true } }
};
const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
function getByPath(obj, path) {
  return path.split(".").reduce((acc, seg) => acc && typeof acc === "object" ? acc[seg] : void 0, obj);
}
function resolvePreview(raw) {
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON" };
  }
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    if (typeof node === "string") {
      return node.replace(TOKEN_REGEX, (_, token) => {
        const value = getByPath(SAMPLE_CONTEXT, token);
        if (value == null) return "";
        return typeof value === "object" ? JSON.stringify(value) : String(value);
      });
    }
    return node;
  };
  return walk(parsed);
}
const Policies = () => {
  const [template, setTemplate] = React.useState(
    JSON.stringify(
      {
        filters: { id: "{{input.id}}", owner: "{{user.id}}", app: "{{claim.appName}}" },
        populate: "{{input.populate}}",
        body: { updatedBy: "{{user.email}}", route: "{{strapi.request.path}}" }
      },
      null,
      2
    )
  );
  const preview = React.useMemo(() => resolvePreview(template), [template]);
  return /* @__PURE__ */ jsxs(Box, { padding: 6, children: [
    /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "Method Policies" }),
    /* @__PURE__ */ jsx(Typography, { variant: "omega", children: "Template variables: strapi.*, user.*, claim.*, input.*" }),
    /* @__PURE__ */ jsxs(Flex, { gap: 4, wrap: "wrap", paddingTop: 4, alignItems: "flex-start", children: [
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 420px", minWidth: 320 }, children: /* @__PURE__ */ jsx(
        Textarea,
        {
          label: "Policy Template JSON",
          name: "policy-template",
          value: template,
          onChange: (e) => setTemplate(e.target.value),
          placeholder: "Enter template JSON"
        }
      ) }),
      /* @__PURE__ */ jsxs(Box, { style: { flex: "1 1 420px", minWidth: 320 }, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Resolved Preview (sample context)" }),
        /* @__PURE__ */ jsx("pre", { children: JSON.stringify(preview, null, 2) })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 3, children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", children: [
      "Quick tokens: ",
      "{{input.id}}",
      ", ",
      "{{input.fields}}",
      ", ",
      "{{input.populate}}",
      ", ",
      "{{claim.roleKey}}",
      ", ",
      "{{user.id}}",
      ", ",
      "{{strapi.request.path}}"
    ] }) })
  ] });
};
const DomainsRoles = () => /* @__PURE__ */ jsxs(Box, { padding: 6, children: [
  /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "App Domains & Roles" }),
  /* @__PURE__ */ jsx(Typography, { variant: "omega", children: "Simplified hierarchy and Strapi admin role mapping placeholder." })
] });
const PAGE_SIZE = 15;
const UsersPage = () => {
  const { get, put } = useFetchClient();
  const [users, setUsers] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [filterAppRole, setFilterAppRole] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const api = (path) => `/api-pro${path}`;
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        get(api("/users")),
        get(api("/users/role-options"))
      ]);
      const userData = u?.data?.data || [];
      setUsers(userData);
      setRoleOptions(r?.data?.data || []);
      if (selectedUserId) {
        const selected = userData.find((x) => String(x.id) === String(selectedUserId));
        setSelectedRoleIds((selected?.app_roles || []).map((ar) => String(ar.id)));
      }
    } catch {
      setMessage("Failed to load users/app roles.");
    } finally {
      setLoading(false);
    }
  }, [get, selectedUserId]);
  React.useEffect(() => {
    load();
  }, [load]);
  const rolesByDomain = useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    roleOptions.forEach((role) => {
      const domains = Array.isArray(role.appDomains) && role.appDomains.length ? role.appDomains : null;
      if (domains) {
        domains.forEach((domain) => {
          const dk = String(domain.id);
          const label = domain.key || domain.name || `Domain #${domain.id}`;
          if (!map.has(dk)) map.set(dk, { label, roles: [] });
          map.get(dk).roles.push(role);
        });
      } else {
        if (!map.has("__none__")) map.set("__none__", { label: "No Domain", roles: [] });
        map.get("__none__").roles.push(role);
      }
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "__none__") return 1;
      if (b === "__none__") return -1;
      return String(a).localeCompare(String(b));
    });
  }, [roleOptions]);
  const selectedSet = useMemo(() => new Set(selectedRoleIds.map(String)), [selectedRoleIds]);
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (userSearch) {
        const q = userSearch.toLowerCase();
        const match = (u.username || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.displayName || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterAppRole) {
        const hasRole = (u.app_roles || []).some((r) => String(r.id) === filterAppRole);
        if (!hasRole) return false;
      }
      return true;
    });
  }, [users, userSearch, filterAppRole]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const toggleRole = (roleId) => {
    setSelectedRoleIds(
      (prev) => prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };
  const selectUser = (id) => {
    setSelectedUserId(id);
    const selected = users.find((u) => String(u.id) === String(id));
    setSelectedRoleIds((selected?.app_roles || []).map((r) => String(r.id)));
  };
  const save = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    setMessage("");
    try {
      await put(api(`/users/${selectedUserId}/roles`), { roleIds: selectedRoleIds.map(Number) });
      setMessage("App roles assignment saved.");
      await load();
    } catch {
      setMessage("Failed to save app role assignment.");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "User App Role Assignments" }),
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: "neutral600", children: message }) }),
    /* @__PURE__ */ jsxs(Flex, { gap: 6, alignItems: "flex-start", wrap: "wrap", paddingTop: 4, children: [
      /* @__PURE__ */ jsxs(Box, { style: { flex: "0 0 360px" }, children: [
        /* @__PURE__ */ jsx(SingleSelect, { label: "Select User", placeholder: "Choose user", value: selectedUserId, onChange: selectUser, children: users.map((u) => /* @__PURE__ */ jsx(SingleSelectOption, { value: String(u.id), children: u.displayName || u.username || u.email }, u.id)) }),
        selectedUserId && /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: "Assigned App Roles" }),
          /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: rolesByDomain.map(([domainKey, group]) => /* @__PURE__ */ jsxs(Box, { style: { marginBottom: 12, border: "1px solid #e8e8f0", borderRadius: 8, overflow: "hidden" }, children: [
            /* @__PURE__ */ jsx(Flex, { justifyContent: "space-between", alignItems: "center", style: { padding: "6px 10px", background: "#f4f4f8" }, children: /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "semiBold", textColor: "neutral600", children: group.label }) }),
            /* @__PURE__ */ jsx(Box, { style: { padding: "6px 10px" }, children: group.roles.map((role) => {
              const id = `assign-role-${role.id}`;
              const checked = selectedSet.has(String(role.id));
              return /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", paddingBottom: 1, children: [
                /* @__PURE__ */ jsx("input", { id, type: "checkbox", checked, onChange: () => toggleRole(String(role.id)) }),
                /* @__PURE__ */ jsxs("label", { htmlFor: id, style: { cursor: "pointer", flex: 1 }, children: [
                  /* @__PURE__ */ jsx(Typography, { variant: "pi", children: role.key }),
                  role.name && role.name !== role.key && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral400", style: { fontSize: 10, marginLeft: 4 }, children: role.name })
                ] })
              ] }, role.id);
            }) })
          ] }, domainKey)) }),
          /* @__PURE__ */ jsx(Button, { onClick: save, loading, style: { marginTop: 16 }, children: "Save Assignment" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Box, { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsxs(Flex, { gap: 3, wrap: "wrap", alignItems: "flex-end", paddingBottom: 3, children: [
          /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsx(TextInput, { label: "Search Users", placeholder: "Name or email", value: userSearch, onChange: (e) => {
            setUserSearch(e.target.value);
            setPage(1);
          } }) }),
          /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 180px" }, children: /* @__PURE__ */ jsx(SingleSelect, { label: "Filter by App Role", placeholder: "All app roles", value: filterAppRole, onChange: (v) => {
            setFilterAppRole(v || "");
            setPage(1);
          }, children: roleOptions.map((r) => /* @__PURE__ */ jsx(SingleSelectOption, { value: String(r.id), children: r.key }, r.id)) }) })
        ] }),
        /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", paddingBottom: 2, children: [
          filteredUsers.length,
          " of ",
          users.length,
          " users"
        ] }),
        paged.map((u) => /* @__PURE__ */ jsxs(
          Flex,
          {
            justifyContent: "space-between",
            alignItems: "center",
            padding: 3,
            style: {
              background: String(u.id) === selectedUserId ? "#e8eaf6" : "transparent",
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              marginBottom: 6,
              cursor: "pointer"
            },
            onClick: () => selectUser(String(u.id)),
            children: [
              /* @__PURE__ */ jsxs(Box, { children: [
                /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: u.displayName || u.username }),
                /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: u.email })
              ] }),
              /* @__PURE__ */ jsxs(Box, { style: { background: (u.app_roles || []).length > 0 ? "#e8f5e9" : "#f5f5f5", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }, children: [
                (u.app_roles || []).length,
                " app role",
                (u.app_roles || []).length !== 1 ? "s" : ""
              ] })
            ]
          },
          u.id
        )),
        /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", paddingTop: 2, children: [
          /* @__PURE__ */ jsx(Button, { variant: "secondary", disabled: safePage <= 1, onClick: () => setPage((p) => Math.max(1, p - 1)), children: "Prev" }),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", children: [
            "Page ",
            safePage,
            " / ",
            totalPages
          ] }),
          /* @__PURE__ */ jsx(Button, { variant: "secondary", disabled: safePage >= totalPages, onClick: () => setPage((p) => Math.min(totalPages, p + 1)), children: "Next" })
        ] })
      ] })
    ] })
  ] });
};
const App = () => {
  const [page, setPage] = React.useState("recordings");
  const renderPage = () => {
    if (page === "interfaces") return /* @__PURE__ */ jsx(Interfaces, {});
    if (page === "policies") return /* @__PURE__ */ jsx(Policies, {});
    if (page === "domains-roles") return /* @__PURE__ */ jsx(DomainsRoles, {});
    if (page === "users") return /* @__PURE__ */ jsx(UsersPage, {});
    return /* @__PURE__ */ jsx(Recordings, {});
  };
  return /* @__PURE__ */ jsxs(Box, { padding: 8, children: [
    /* @__PURE__ */ jsx(Typography, { variant: "alpha", children: "Strapi API Pro" }),
    /* @__PURE__ */ jsx(Typography, { variant: "omega", children: "Recordings, interfaces, method policies, and domain-role management." }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 4, paddingBottom: 4, children: /* @__PURE__ */ jsxs(Flex, { gap: 2, wrap: "wrap", children: [
      /* @__PURE__ */ jsx(Button, { variant: page === "recordings" ? "default" : "secondary", onClick: () => setPage("recordings"), children: "Recordings" }),
      /* @__PURE__ */ jsx(Button, { variant: page === "interfaces" ? "default" : "secondary", onClick: () => setPage("interfaces"), children: "Interfaces" }),
      /* @__PURE__ */ jsx(Button, { variant: page === "policies" ? "default" : "secondary", onClick: () => setPage("policies"), children: "Policies" }),
      /* @__PURE__ */ jsx(Button, { variant: page === "domains-roles" ? "default" : "secondary", onClick: () => setPage("domains-roles"), children: "Domains & Roles" }),
      /* @__PURE__ */ jsx(Button, { variant: page === "users" ? "default" : "secondary", onClick: () => setPage("users"), children: "Users" })
    ] }) }),
    renderPage()
  ] });
};
export {
  App as default
};

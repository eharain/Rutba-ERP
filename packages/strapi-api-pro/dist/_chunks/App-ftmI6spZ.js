"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const jsxRuntime = require("react/jsx-runtime");
const React = require("react");
const designSystem = require("@strapi/design-system");
const admin = require("@strapi/strapi/admin");
const _interopDefault = (e) => e && e.__esModule ? e : { default: e };
const React__default = /* @__PURE__ */ _interopDefault(React);
const api$3 = (p) => `/api-pro${p}`;
const PAGE_SIZE$2 = 15;
const StatusBadge = ({ status }) => {
  const color = status === "recording" ? "#1f8a45" : status === "stopped" ? "#666" : "#999";
  const bg = status === "recording" ? "#e6f7ec" : status === "stopped" ? "#f0f0f0" : "#f8f8f8";
  return /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
    background: bg,
    color,
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase"
  }, children: status || "unknown" });
};
const EntryRow = ({ entry }) => {
  const [expanded, setExpanded] = React__default.default.useState(false);
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { borderTop: "1px solid #f0f0f4" }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      designSystem.Flex,
      {
        justifyContent: "space-between",
        alignItems: "center",
        padding: 2,
        style: { cursor: "pointer" },
        onClick: () => setExpanded((v) => !v),
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", children: [
            /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
              padding: "1px 6px",
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600
            }, children: (entry.method || "GET").toUpperCase() }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", children: entry.path })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
              entry.statusCode || "–",
              " · ",
              entry.count || 1,
              "×"
            ] }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", children: expanded ? "▼" : "▶" })
          ] })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { padding: 3, style: { background: "#fafafa" }, children: [
      entry.query && Object.keys(entry.query).length > 0 && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingBottom: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: "Query" }),
        /* @__PURE__ */ jsxRuntime.jsx("pre", { style: { fontSize: 11, margin: 0 }, children: JSON.stringify(entry.query, null, 2) })
      ] }),
      entry.body && Object.keys(entry.body || {}).length > 0 && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingBottom: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: "Body" }),
        /* @__PURE__ */ jsxRuntime.jsx("pre", { style: { fontSize: 11, margin: 0 }, children: JSON.stringify(entry.body, null, 2) })
      ] }),
      entry.claimedContext && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: "Claim" }),
        /* @__PURE__ */ jsxRuntime.jsx("pre", { style: { fontSize: 11, margin: 0 }, children: JSON.stringify(entry.claimedContext, null, 2) })
      ] })
    ] })
  ] });
};
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const Recordings = () => {
  const { get, post } = admin.useFetchClient();
  const [sessions, setSessions] = React__default.default.useState([]);
  const [entries, setEntries] = React__default.default.useState({});
  const [selectedSession, setSelectedSession] = React__default.default.useState(null);
  const [newLabel, setNewLabel] = React__default.default.useState("");
  const [loading, setLoading] = React__default.default.useState(false);
  const [message, setMessage] = React__default.default.useState("");
  const [search, setSearch] = React__default.default.useState("");
  const [statusFilter, setStatusFilter] = React__default.default.useState("");
  const [page, setPage] = React__default.default.useState(1);
  const [filterMethods, setFilterMethods] = React__default.default.useState([]);
  const [filterPathPatterns, setFilterPathPatterns] = React__default.default.useState("");
  const [filterCtUids, setFilterCtUids] = React__default.default.useState("");
  const [showFilters, setShowFilters] = React__default.default.useState(false);
  const loadSessions = React__default.default.useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await get(api$3("/recordings"));
      setSessions(data?.data || []);
    } catch {
      setMessage("Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, [get]);
  React__default.default.useEffect(() => {
    loadSessions();
  }, [loadSessions]);
  const loadEntries = React__default.default.useCallback(async (sessionId) => {
    try {
      const { data } = await get(api$3(`/recordings/${sessionId}/entries`));
      setEntries((e) => ({ ...e, [sessionId]: data?.data || [] }));
    } catch {
      setEntries((e) => ({ ...e, [sessionId]: [] }));
    }
  }, [get]);
  const toCsvList = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const start = async () => {
    setMessage("");
    const filters = {
      methods: filterMethods,
      pathPatterns: toCsvList(filterPathPatterns),
      contentTypeUids: toCsvList(filterCtUids)
    };
    try {
      await post(api$3("/recordings/start"), { name: newLabel || void 0, filters });
      setNewLabel("");
      await loadSessions();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Failed to start recording.");
    }
  };
  const toggleMethod = (m) => {
    setFilterMethods((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };
  const filterSummary = (() => {
    const parts = [];
    if (filterMethods.length > 0) parts.push(`methods=${filterMethods.join(",")}`);
    const paths = toCsvList(filterPathPatterns);
    if (paths.length > 0) parts.push(`paths=${paths.length}`);
    const uids = toCsvList(filterCtUids);
    if (uids.length > 0) parts.push(`uids=${uids.length}`);
    return parts.length === 0 ? "no filters — captures all traffic" : parts.join(" · ");
  })();
  const stop = async () => {
    setMessage("");
    try {
      await post(api$3("/recordings/stop"), {});
      await loadSessions();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Failed to stop recording.");
    }
  };
  const activeSession = sessions.find((s) => s.status === "recording");
  const filtered = React__default.default.useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (q) {
        const hit = (s.name || "").toLowerCase().includes(q) || (s.resolvedAppName || "").toLowerCase().includes(q) || (s.resolvedRoleKey || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [sessions, search, statusFilter]);
  React__default.default.useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE$2));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE$2, safePage * PAGE_SIZE$2);
  const renderRow = (s) => {
    const isOpen = selectedSession === s.id;
    const sessionEntries = entries[s.id] || [];
    return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
      border: "1px solid #e0e0e0",
      borderRadius: 8,
      marginTop: 8,
      overflow: "hidden"
    }, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(
        designSystem.Flex,
        {
          justifyContent: "space-between",
          alignItems: "center",
          padding: 3,
          style: { background: isOpen ? "#f4f4f8" : "transparent", cursor: "pointer" },
          onClick: () => {
            const next = isOpen ? null : s.id;
            setSelectedSession(next);
            if (next && !entries[s.id]) loadEntries(s.id);
          },
          children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: s.name }),
                /* @__PURE__ */ jsxRuntime.jsx(StatusBadge, { status: s.status })
              ] }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
                "started ",
                s.startedAt || "?",
                " · stopped ",
                s.stoppedAt || "–",
                " · app=",
                s.resolvedAppName || "–",
                " · role=",
                s.resolvedRoleKey || "–"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", children: isOpen ? "▼" : "▶" })
          ]
        }
      ),
      isOpen && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { children: sessionEntries.length === 0 ? /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { padding: 3, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: "No entries captured (entry-recording middleware is not yet wired)." }) }) : sessionEntries.map((e) => /* @__PURE__ */ jsxRuntime.jsx(EntryRow, { entry: e }, e.id)) })
    ] }, s.id);
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "beta", children: "API Recordings" }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "neutral600", children: "Capture live API traffic into sessions and convert recordings into interface definitions." }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 4, style: { border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, alignItems: "flex-end", wrap: "wrap", children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 240px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.TextInput,
          {
            label: "Session label (optional)",
            value: newLabel,
            onChange: (e) => setNewLabel(e.target.value),
            placeholder: "e.g. pos-desk happy path",
            disabled: Boolean(activeSession)
          }
        ) }),
        activeSession ? /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "danger", onClick: stop, loading, children: "Stop active session" }) : /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: start, loading, children: "Start Recording" }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: loadSessions, children: "Refresh" })
      ] }),
      !activeSession && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 3, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(
          designSystem.Flex,
          {
            justifyContent: "space-between",
            alignItems: "center",
            style: { cursor: "pointer", padding: "4px 0" },
            onClick: () => setShowFilters((v) => !v),
            children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: "Capture filters" }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
                filterSummary,
                " · ",
                showFilters ? "▼" : "▶"
              ] })
            ]
          }
        ),
        showFilters && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 2, style: { background: "#fafafa", padding: 10, borderRadius: 6 }, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: "Apply filters here to restrict what the session records. Leave all empty to capture every request the middleware sees." }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 2, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: "HTTP methods" }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Flex, { gap: 1, paddingTop: 1, wrap: "wrap", children: HTTP_METHODS.map((m) => {
              const checked = filterMethods.includes(m);
              return /* @__PURE__ */ jsxRuntime.jsxs("label", { style: {
                cursor: "pointer",
                padding: "2px 8px",
                border: "1px solid #ccc",
                borderRadius: 12,
                background: checked ? "#e8eaf6" : "transparent",
                fontSize: 11
              }, children: [
                /* @__PURE__ */ jsxRuntime.jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked,
                    onChange: () => toggleMethod(m),
                    style: { marginRight: 4 }
                  }
                ),
                m
              ] }, m);
            }) })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              label: "Path patterns (comma-separated)",
              value: filterPathPatterns,
              onChange: (e) => setFilterPathPatterns(e.target.value),
              placeholder: "/api/sale-orders, /api/cash-registers"
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              label: "Content-type UIDs (comma-separated)",
              value: filterCtUids,
              onChange: (e) => setFilterCtUids(e.target.value),
              placeholder: "api::sale.sale-order, api::cash-register.cash-register"
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: "Filters are stored on the session and applied by the recorder middleware (when wired). Existing sessions keep the filters they were started with." }) })
        ] })
      ] }),
      activeSession && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: [
          "Recording in progress: ",
          /* @__PURE__ */ jsxRuntime.jsx("strong", { children: activeSession.name }),
          " · app=",
          /* @__PURE__ */ jsxRuntime.jsx("strong", { children: activeSession.resolvedAppName }),
          " · role=",
          /* @__PURE__ */ jsxRuntime.jsx("strong", { children: activeSession.resolvedRoleKey })
        ] }),
        activeSession.filters && Object.values(activeSession.filters).some((v) => Array.isArray(v) && v.length > 0) && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
          "Filters: ",
          [
            activeSession.filters.methods?.length ? `methods=${activeSession.filters.methods.join(",")}` : null,
            activeSession.filters.pathPatterns?.length ? `${activeSession.filters.pathPatterns.length} path(s)` : null,
            activeSession.filters.contentTypeUids?.length ? `${activeSession.filters.contentTypeUids.length} CT uid(s)` : null
          ].filter(Boolean).join(" · ")
        ] })
      ] }),
      message && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: "danger700", children: message }) })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 4, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "flex-end", wrap: "wrap", gap: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "delta", children: [
          "Sessions (",
          sessions.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, wrap: "wrap", alignItems: "flex-end", children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "0 0 220px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              label: "Search",
              placeholder: "name, app or role",
              value: search,
              onChange: (e) => setSearch(e.target.value)
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "0 0 160px" }, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: "Status" }),
            /* @__PURE__ */ jsxRuntime.jsxs(
              "select",
              {
                value: statusFilter,
                onChange: (e) => setStatusFilter(e.target.value),
                style: {
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #c0c0cf",
                  borderRadius: 4,
                  marginTop: 4
                },
                children: [
                  /* @__PURE__ */ jsxRuntime.jsx("option", { value: "", children: "All status" }),
                  /* @__PURE__ */ jsxRuntime.jsx("option", { value: "recording", children: "Recording" }),
                  /* @__PURE__ */ jsxRuntime.jsx("option", { value: "stopped", children: "Stopped" }),
                  /* @__PURE__ */ jsxRuntime.jsx("option", { value: "idle", children: "Idle" })
                ]
              }
            )
          ] })
        ] })
      ] }),
      filtered.length !== sessions.length && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", paddingTop: 1, children: [
        filtered.length,
        " of ",
        sessions.length
      ] }),
      sessions.length === 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", paddingTop: 2, children: "No recording sessions yet. Start one above." }),
      paged.map(renderRow),
      totalPages > 1 && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", paddingTop: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.Button,
          {
            variant: "secondary",
            disabled: safePage <= 1,
            onClick: () => setPage((p) => Math.max(1, p - 1)),
            children: "Prev"
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", children: [
          "Page ",
          safePage,
          " / ",
          totalPages
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.Button,
          {
            variant: "secondary",
            disabled: safePage >= totalPages,
            onClick: () => setPage((p) => Math.min(totalPages, p + 1)),
            children: "Next"
          }
        )
      ] })
    ] })
  ] });
};
const api$2 = (p) => `/api-pro${p}`;
const CATEGORY_RULES = [
  { id: "acc", label: "Accounting", test: (k) => /^acc[-_]/.test(k) || /accounting/.test(k) },
  { id: "pay", label: "Payroll", test: (k) => /^pay[-_]/.test(k) || /payroll/.test(k) || /payslip/.test(k) },
  { id: "hr", label: "HR", test: (k) => /^hr[-_]/.test(k) },
  { id: "cms", label: "CMS", test: (k) => /^cms[-_]/.test(k) || /^site/.test(k) || /^cms-page/.test(k) },
  { id: "crm", label: "CRM", test: (k) => /^crm[-_]/.test(k) },
  { id: "auth", label: "Auth & Users", test: (k) => /^auth/.test(k) || /^users?/.test(k) || /^user[-_]/.test(k) },
  { id: "sale", label: "Sales & POS", test: (k) => /^sale/.test(k) || /^pos[-_]/.test(k) || /^payment/.test(k) || /^cash[-_]/.test(k) || /^return[-_]/.test(k) },
  { id: "commerce", label: "Commerce catalog", test: (k) => /^product/.test(k) || /^categor/.test(k) || /^brand/.test(k) || /^customer/.test(k) || /^branch/.test(k) },
  { id: "stock", label: "Stock & Inventory", test: (k) => /^stock/.test(k) || /^suppl/.test(k) || /^purchase/.test(k) || /^warehouse/.test(k) },
  { id: "delivery", label: "Delivery & Riders", test: (k) => /^deliver/.test(k) || /^rider/.test(k) || /^zone/.test(k) },
  { id: "order", label: "Orders", test: (k) => /^order/.test(k) || /^web-order/.test(k) },
  { id: "social", label: "Social", test: (k) => /^social/.test(k) },
  { id: "media", label: "Media & Files", test: (k) => /^media/.test(k) || /^file/.test(k) || /^upload/.test(k) },
  { id: "enums", label: "Enumerations", test: (k) => /^enum/.test(k) }
];
const OTHER = { id: "other", label: "Other" };
function categoryOf(iface) {
  const key = String(iface?.key || iface?.uid || "").toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.test(key)) return rule;
  }
  return OTHER;
}
const InterfaceCard = ({ iface, onScaffold, onOpenMethod }) => {
  const { get } = admin.useFetchClient();
  const methods = Array.isArray(iface.methods) ? iface.methods : [];
  const methodCount = methods.length;
  const [expanded, setExpanded] = React__default.default.useState(false);
  const [policies, setPolicies] = React__default.default.useState(null);
  const [loadingPolicies, setLoadingPolicies] = React__default.default.useState(false);
  const loadPolicies = React__default.default.useCallback(async () => {
    setLoadingPolicies(true);
    try {
      const { data } = await get(api$2(`/policies?interfaceKey=${encodeURIComponent(iface.key)}`));
      setPolicies(data?.data || []);
    } catch {
      setPolicies([]);
    } finally {
      setLoadingPolicies(false);
    }
  }, [get, iface.key]);
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && policies === null) loadPolicies();
  };
  const policiesByMethod = React__default.default.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    for (const p of policies || []) {
      const k = p.interfaceMethod?.key || "";
      const colon = k.indexOf(":");
      const methodName = colon > 0 ? k.slice(colon + 1) : p.interfaceMethod?.name || "";
      if (!methodName) continue;
      if (!map.has(methodName)) map.set(methodName, []);
      map.get(methodName).push(p);
    }
    return map;
  }, [policies]);
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: 10,
    flex: expanded ? "1 1 100%" : "1 1 240px",
    minWidth: 220,
    maxWidth: expanded ? "100%" : 320,
    background: "#fff"
  }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "flex-start", gap: 1, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { minWidth: 0, flex: 1 }, children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: iface.name }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: iface.key }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 1, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: /* @__PURE__ */ jsxRuntime.jsx("code", { style: { fontSize: 10 }, children: iface.uid || "—" }) }) })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "button",
        {
          type: "button",
          onClick: toggle,
          title: expanded ? "Collapse" : "Show methods & policies",
          style: {
            border: "1px solid #e0e0e8",
            background: "#fff",
            color: "#4945ff",
            borderRadius: 4,
            cursor: "pointer",
            padding: "2px 6px",
            fontSize: 11
          },
          children: expanded ? "▾" : "▸"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, paddingTop: 1, alignItems: "center", justifyContent: "space-between", children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, alignItems: "center", children: [
        /* @__PURE__ */ jsxRuntime.jsxs("span", { style: {
          background: "#e8eaf6",
          color: "#4945ff",
          padding: "1px 6px",
          borderRadius: 8,
          fontSize: 10,
          fontWeight: 600
        }, children: [
          methodCount,
          " method",
          methodCount === 1 ? "" : "s"
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
          background: iface.status === "generated" ? "#e8f5e9" : "#fff3e0",
          padding: "1px 6px",
          borderRadius: 8,
          fontSize: 10
        }, children: iface.status || "manual" })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: () => onScaffold(iface), children: "Scaffold" })
    ] }),
    expanded && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 2, style: { borderTop: "1px solid #f0f0f4", marginTop: 6 }, children: [
      loadingPolicies && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", paddingTop: 1, children: "Loading policies…" }),
      methods.length === 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", paddingTop: 1, children: "No methods on this interface yet." }),
      methods.map((m) => {
        const ps = policiesByMethod.get(m.name) || [];
        return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
          border: "1px solid #f0f0f4",
          borderRadius: 6,
          padding: 8,
          marginTop: 6,
          background: "#fafafa"
        }, children: [
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", wrap: "wrap", gap: 1, children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", style: { minWidth: 0, flex: 1 }, children: [
              /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
                padding: "1px 6px",
                border: "1px solid #ccc",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "ui-monospace, Menlo, monospace"
              }, children: (m.method || "GET").toUpperCase() }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: m.name }),
              /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
                background: "#e8eaf6",
                color: "#4945ff",
                padding: "0 6px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600
              }, children: m.action || "?" }),
              /* @__PURE__ */ jsxRuntime.jsx(
                designSystem.Typography,
                {
                  variant: "pi",
                  textColor: "neutral500",
                  style: {
                    fontFamily: "ui-monospace, Menlo, monospace",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  },
                  children: m.path
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, alignItems: "center", children: [
              /* @__PURE__ */ jsxRuntime.jsxs("span", { style: {
                background: ps.length > 0 ? "#e8f5e9" : "#f0f0f4",
                color: ps.length > 0 ? "#1f8a45" : "#888",
                padding: "1px 6px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600
              }, children: [
                ps.length,
                " polic",
                ps.length === 1 ? "y" : "ies"
              ] }),
              onOpenMethod && /* @__PURE__ */ jsxRuntime.jsx(
                designSystem.Button,
                {
                  variant: "tertiary",
                  onClick: () => onOpenMethod({
                    interfaceKey: iface.key,
                    methodName: m.name,
                    action: m.action,
                    path: m.path,
                    httpMethod: m.method,
                    interfaceName: iface.name,
                    interfaceUid: iface.uid
                  }),
                  children: "Edit policies →"
                }
              )
            ] })
          ] }),
          ps.length > 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Flex, { gap: 1, paddingTop: 1, wrap: "wrap", children: ps.map((p) => {
            const hasFilters = p.filtersTemplate && Object.keys(p.filtersTemplate).length > 0;
            const hasBody = p.bodyTemplate && Object.keys(p.bodyTemplate).length > 0;
            const hasPopulate = p.populateTemplate && Object.keys(p.populateTemplate).length > 0;
            const indicators = [];
            if (hasFilters) indicators.push("F");
            if (hasPopulate) indicators.push("P");
            if (hasBody) indicators.push("B");
            return /* @__PURE__ */ jsxRuntime.jsxs(
              "button",
              {
                type: "button",
                onClick: () => onOpenMethod?.({
                  interfaceKey: iface.key,
                  methodName: m.name,
                  action: m.action,
                  path: m.path,
                  httpMethod: m.method,
                  interfaceName: iface.name,
                  interfaceUid: iface.uid
                }),
                title: "Edit / view this policy in the Method Editor",
                style: {
                  background: "#fff",
                  border: "1px solid #4945ff",
                  color: "#4945ff",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "ui-monospace, Menlo, monospace"
                },
                children: [
                  p.roleKey,
                  indicators.length > 0 && /* @__PURE__ */ jsxRuntime.jsxs("span", { style: { marginLeft: 4, opacity: 0.6, fontSize: 9 }, children: [
                    "· ",
                    indicators.join("")
                  ] })
                ]
              },
              p.id
            );
          }) }),
          ps.length === 0 && !loadingPolicies && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", paddingTop: 1, children: 'No role policies yet — click "Edit policies →" to author one.' })
        ] }, m.id);
      })
    ] })
  ] });
};
const ScaffoldModal = ({ iface, onClose }) => {
  const { get } = admin.useFetchClient();
  const [code, setCode] = React__default.default.useState("// loading...");
  const [error, setError] = React__default.default.useState("");
  React__default.default.useEffect(() => {
    if (!iface) return;
    (async () => {
      try {
        const { data } = await get(api$2(`/interfaces/${iface.key}/scaffold`));
        setCode(data?.data?.code || "");
      } catch (err) {
        setError(err?.response?.data?.error?.message || "Failed to scaffold.");
      }
    })();
  }, [iface, get]);
  const copy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {
      });
    }
  };
  if (!iface) return null;
  return /* @__PURE__ */ jsxRuntime.jsx(
    designSystem.Box,
    {
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1e3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      onClick: onClose,
      children: /* @__PURE__ */ jsxRuntime.jsxs(
        designSystem.Box,
        {
          style: {
            background: "#fff",
            borderRadius: 8,
            padding: 16,
            maxWidth: 800,
            width: "90%",
            maxHeight: "80vh",
            overflow: "auto"
          },
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", paddingBottom: 3, children: [
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "beta", children: [
                "Scaffold: ",
                iface.key
              ] }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: copy, children: "Copy" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: onClose, children: "Close" })
              ] })
            ] }),
            error ? /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: "danger700", children: error }) : /* @__PURE__ */ jsxRuntime.jsx("pre", { style: { background: "#f4f4f8", padding: 12, borderRadius: 4, fontSize: 12, margin: 0 }, children: code })
          ]
        }
      )
    }
  );
};
const AlignmentPlayground = () => {
  const { post } = admin.useFetchClient();
  const [routePath, setRoutePath] = React__default.default.useState("/cms-footers/:documentId");
  const [signature, setSignature] = React__default.default.useState("documentId");
  const [result, setResult] = React__default.default.useState(null);
  const [message, setMessage] = React__default.default.useState("");
  const parseSignature = () => signature.split(",").map((v) => v.trim()).filter(Boolean);
  const validate = async () => {
    setMessage("");
    try {
      const { data } = await post(
        api$2("/interfaces/validate-alignment"),
        { path: routePath, inputSignature: parseSignature() }
      );
      setResult(data?.data || null);
    } catch {
      setMessage("Validation failed.");
    }
  };
  const previewFix = async () => {
    setMessage("");
    try {
      const { data } = await post(
        api$2("/interfaces/preview-guided-fix"),
        { path: routePath, inputSignature: parseSignature() }
      );
      setResult(data?.data || null);
    } catch {
      setMessage("Guided fix preview failed.");
    }
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 6, style: { borderTop: "1px solid #e0e0e0" }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 4, children: [
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", children: "Alignment Playground" }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: "Validate that route :tokens line up with method signature args." })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 3, children: /* @__PURE__ */ jsxRuntime.jsx(
      designSystem.TextInput,
      {
        label: "Route path",
        value: routePath,
        onChange: (e) => setRoutePath(e.target.value)
      }
    ) }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(
      designSystem.TextInput,
      {
        label: "Input signature (comma-separated)",
        value: signature,
        onChange: (e) => setSignature(e.target.value)
      }
    ) }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, paddingTop: 3, children: [
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: validate, children: "Validate" }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: previewFix, children: "Preview Guided Fix" })
    ] }),
    message && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: "danger700", children: message }) }),
    result && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 3, children: /* @__PURE__ */ jsxRuntime.jsx("pre", { style: { background: "#f4f4f8", padding: 8, borderRadius: 4, fontSize: 12, margin: 0 }, children: JSON.stringify(result, null, 2) }) })
  ] });
};
const Interfaces = ({ onOpenMethod }) => {
  const { get } = admin.useFetchClient();
  const [interfaces, setInterfaces] = React__default.default.useState([]);
  const [scaffolding, setScaffolding] = React__default.default.useState(null);
  const [message, setMessage] = React__default.default.useState("");
  const [search, setSearch] = React__default.default.useState("");
  const [statusFilter, setStatusFilter] = React__default.default.useState("");
  const [categoryFilter, setCategoryFilter] = React__default.default.useState("");
  const [collapsedGroups, setCollapsedGroups] = React__default.default.useState({});
  const load = React__default.default.useCallback(async () => {
    try {
      const { data } = await get(api$2("/interfaces"));
      setInterfaces(data?.data || []);
    } catch {
      setMessage("Failed to load interfaces.");
    }
  }, [get]);
  React__default.default.useEffect(() => {
    load();
  }, [load]);
  const filtered = React__default.default.useMemo(() => {
    const q = search.trim().toLowerCase();
    return interfaces.filter((i) => {
      if (q) {
        const inText = (i.key || "").toLowerCase().includes(q) || (i.name || "").toLowerCase().includes(q) || (i.uid || "").toLowerCase().includes(q);
        if (!inText) return false;
      }
      if (statusFilter && (i.status || "manual") !== statusFilter) return false;
      if (categoryFilter && categoryOf(i).id !== categoryFilter) return false;
      return true;
    });
  }, [interfaces, search, statusFilter, categoryFilter]);
  const grouped = React__default.default.useMemo(() => {
    const buckets = /* @__PURE__ */ new Map();
    for (const rule of CATEGORY_RULES) buckets.set(rule.id, { rule, items: [] });
    buckets.set(OTHER.id, { rule: OTHER, items: [] });
    for (const iface of filtered) {
      const c = categoryOf(iface);
      buckets.get(c.id).items.push(iface);
    }
    return Array.from(buckets.values()).filter((b) => b.items.length > 0);
  }, [filtered]);
  const categoryOptions = CATEGORY_RULES.concat([OTHER]);
  const toggleGroup = (id) => setCollapsedGroups((c) => ({ ...c, [id]: !c[id] }));
  const expandAll = () => setCollapsedGroups({});
  const collapseAll = () => {
    const all = {};
    for (const g of grouped) all[g.rule.id] = true;
    setCollapsedGroups(all);
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", wrap: "wrap", gap: 2, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "beta", children: "API Interfaces" }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "omega", textColor: "neutral600", children: [
          interfaces.length,
          " interface(s) across ",
          grouped.length,
          " categor",
          grouped.length === 1 ? "y" : "ies"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: expandAll, children: "Expand all" }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: collapseAll, children: "Collapse all" }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: load, children: "Refresh" })
      ] })
    ] }),
    message && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: "danger700", children: message }) }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, paddingTop: 4, wrap: "wrap", alignItems: "flex-end", children: [
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 220px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.TextInput,
        {
          label: "Search",
          placeholder: "key, name, or uid",
          value: search,
          onChange: (e) => setSearch(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "0 0 200px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.SingleSelect,
        {
          label: "Category",
          placeholder: "All",
          value: categoryFilter,
          onChange: (v) => setCategoryFilter(v || ""),
          onClear: () => setCategoryFilter(""),
          children: categoryOptions.map((c) => /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: c.id, children: c.label }, c.id))
        }
      ) }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "0 0 180px" }, children: /* @__PURE__ */ jsxRuntime.jsxs(
        designSystem.SingleSelect,
        {
          label: "Status",
          placeholder: "All",
          value: statusFilter,
          onChange: (v) => setStatusFilter(v || ""),
          onClear: () => setStatusFilter(""),
          children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: "generated", children: "Generated" }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: "modified", children: "Modified" }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: "manual", children: "Manual" })
          ]
        }
      ) }),
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
        filtered.length,
        " of ",
        interfaces.length
      ] })
    ] }),
    grouped.length === 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 4, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: interfaces.length === 0 ? 'No interfaces yet — run "Re-seed from api-provider" on Domains & Roles to import from @rutba/api-provider.' : "No interfaces match the current filters." }) }),
    grouped.map((group) => {
      const isCollapsed = collapsedGroups[group.rule.id];
      return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 4, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(
          designSystem.Flex,
          {
            justifyContent: "space-between",
            alignItems: "center",
            style: {
              cursor: "pointer",
              padding: "6px 10px",
              background: "#f4f4f8",
              borderRadius: 6
            },
            onClick: () => toggleGroup(group.rule.id),
            children: [
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", children: group.rule.label }),
                /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
                  background: "#4945ff",
                  color: "#fff",
                  padding: "1px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700
                }, children: group.items.length })
              ] }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: isCollapsed ? "▶" : "▼" })
            ]
          }
        ),
        !isCollapsed && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Flex, { gap: 2, wrap: "wrap", paddingTop: 2, alignItems: "flex-start", children: group.items.map((i) => /* @__PURE__ */ jsxRuntime.jsx(
          InterfaceCard,
          {
            iface: i,
            onScaffold: setScaffolding,
            onOpenMethod
          },
          i.id
        )) })
      ] }, group.rule.id);
    }),
    /* @__PURE__ */ jsxRuntime.jsx(AlignmentPlayground, {}),
    /* @__PURE__ */ jsxRuntime.jsx(ScaffoldModal, { iface: scaffolding, onClose: () => setScaffolding(null) })
  ] });
};
const tokens = {
  primary: "#4945ff",
  danger: "#d02b20",
  warning: "#b76b00",
  neutral100: "#fafafa",
  neutral200: "#f0f0f4",
  neutral300: "#e0e0e8",
  neutral500: "#888894",
  neutral700: "#454552",
  radius: 4,
  radiusLarge: 8,
  monoFont: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
};
const OPERATORS = [
  { value: "$eq", label: "= equals" },
  { value: "$ne", label: "≠ not equals" },
  { value: "$gt", label: "> greater than" },
  { value: "$gte", label: "≥ greater or equal" },
  { value: "$lt", label: "< less than" },
  { value: "$lte", label: "≤ less or equal" },
  { value: "$contains", label: "⊃ contains" },
  { value: "$notContains", label: "∌ not contains" },
  { value: "$startsWith", label: "↦ starts with" },
  { value: "$endsWith", label: "⤇ ends with" },
  { value: "$in", label: "∈ in (comma list)" },
  { value: "$notIn", label: "∉ not in (comma list)" },
  { value: "$null", label: "∅ is null" },
  { value: "$notNull", label: "∃ is not null" }
];
const NO_VALUE_OPS = /* @__PURE__ */ new Set(["$null", "$notNull"]);
const LIST_OPS = /* @__PURE__ */ new Set(["$in", "$notIn"]);
const MAX_DEPTH = 4;
let _idSeq = 0;
const nextId = () => `n${++_idSeq}`;
function maybeNumber(v) {
  if (typeof v !== "string") return v;
  if (v === "") return v;
  if (v.startsWith("$")) return v;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}
function buildLeaf(operator, rawValue) {
  if (NO_VALUE_OPS.has(operator)) return { [operator]: true };
  if (LIST_OPS.has(operator)) {
    const list = String(rawValue || "").split(",").map((s) => maybeNumber(s.trim())).filter((v) => v !== "");
    return { [operator]: list };
  }
  return { [operator]: maybeNumber(rawValue) };
}
function nestByPath(path, leaf) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (parts.length === 0) return null;
  return parts.reduceRight((acc, part) => ({ [part]: acc }), leaf);
}
function buildFilterObject(node) {
  if (!node) return null;
  if (node.type === "condition") {
    if (!node.path || !node.operator) return null;
    return nestByPath(node.path, buildLeaf(node.operator, node.value));
  }
  const children = (node.children || []).map(buildFilterObject).filter(Boolean);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { [node.logic]: children };
}
const OP_KEYS = new Set(OPERATORS.map((o) => o.value));
function parseLeaf(obj) {
  for (const key of OP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      let value = obj[key];
      if (LIST_OPS.has(key) && Array.isArray(value)) value = value.join(",");
      if (NO_VALUE_OPS.has(key)) value = "";
      if (value == null) value = "";
      return { operator: key, value: String(value) };
    }
  }
  return null;
}
function flattenConditions(obj, pathParts, out) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  const leaf = parseLeaf(obj);
  if (leaf) {
    out.push({ path: pathParts.join("."), ...leaf });
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "$and" || k === "$or") continue;
    flattenConditions(v, [...pathParts, k], out);
  }
}
function parseTree(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { id: nextId(), type: "group", logic: "$and", children: [] };
  }
  if (depth > MAX_DEPTH) {
    return { id: nextId(), type: "group", logic: "$and", children: [] };
  }
  const keys = Object.keys(obj);
  if (keys.length === 1 && (keys[0] === "$or" || keys[0] === "$and")) {
    const logic = keys[0];
    const arr = Array.isArray(obj[logic]) ? obj[logic] : [];
    return {
      id: nextId(),
      type: "group",
      logic,
      children: arr.map((c) => parseTree(c, depth + 1))
    };
  }
  const out = [];
  flattenConditions(obj, [], out);
  const children = out.map((c) => ({
    id: nextId(),
    type: "condition",
    path: c.path,
    operator: c.operator,
    value: c.value
  }));
  return { id: nextId(), type: "group", logic: "$and", children };
}
function parseFilterObject(obj) {
  if (!obj || typeof obj !== "object") {
    return { id: nextId(), type: "group", logic: "$and", children: [] };
  }
  return parseTree(obj, 0);
}
const Pill = ({ active, color, children, onClick, title }) => /* @__PURE__ */ jsxRuntime.jsx("button", { type: "button", onClick, title, style: {
  border: `1px solid ${active ? color : tokens.neutral300}`,
  background: active ? `${color}1a` : "#fff",
  color: active ? color : tokens.neutral700,
  padding: "2px 8px",
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: tokens.monoFont
}, children });
const ConditionRow = ({ node, depth, onChange, onRemove }) => {
  const noValue = NO_VALUE_OPS.has(node.operator);
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, alignItems: "center", wrap: "wrap", style: {
    padding: 6,
    marginBottom: 4,
    background: tokens.neutral100,
    borderRadius: tokens.radius,
    border: `1px solid ${tokens.neutral200}`
  }, children: [
    /* @__PURE__ */ jsxRuntime.jsx(
      "input",
      {
        type: "text",
        value: node.path || "",
        placeholder: "field.path (e.g. branch.id)",
        onChange: (e) => onChange({ ...node, path: e.target.value }),
        style: {
          flex: "1 1 160px",
          minWidth: 120,
          padding: "4px 6px",
          border: `1px solid ${tokens.neutral300}`,
          borderRadius: tokens.radius,
          fontFamily: tokens.monoFont,
          fontSize: 12
        }
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(
      "select",
      {
        value: node.operator || "$eq",
        onChange: (e) => onChange({ ...node, operator: e.target.value }),
        style: {
          padding: "4px 6px",
          border: `1px solid ${tokens.neutral300}`,
          borderRadius: tokens.radius,
          fontSize: 12,
          fontFamily: tokens.monoFont
        },
        children: OPERATORS.map((o) => /* @__PURE__ */ jsxRuntime.jsx("option", { value: o.value, children: o.label }, o.value))
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(
      "input",
      {
        type: "text",
        value: node.value || "",
        placeholder: noValue ? "(no value)" : "value or $user.id",
        disabled: noValue,
        onChange: (e) => onChange({ ...node, value: e.target.value }),
        style: {
          flex: "1 1 160px",
          minWidth: 120,
          padding: "4px 6px",
          border: `1px solid ${tokens.neutral300}`,
          borderRadius: tokens.radius,
          fontFamily: tokens.monoFont,
          fontSize: 12,
          background: noValue ? tokens.neutral200 : "#fff"
        }
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx("button", { type: "button", onClick: onRemove, title: "Remove condition", style: {
      border: "none",
      background: "transparent",
      color: tokens.danger,
      cursor: "pointer",
      fontSize: 16,
      padding: "0 6px"
    }, children: "×" })
  ] });
};
const GroupNode = ({ node, depth, onChange, onRemove, canRemove }) => {
  const isAnd = node.logic === "$and";
  const updateChild = (idx, next) => {
    const children = node.children.slice();
    if (next === null) children.splice(idx, 1);
    else children[idx] = next;
    onChange({ ...node, children });
  };
  const addCondition = () => onChange({
    ...node,
    children: [...node.children, { id: nextId(), type: "condition", path: "", operator: "$eq", value: "" }]
  });
  const addGroup = () => {
    if (depth >= MAX_DEPTH) return;
    onChange({
      ...node,
      children: [...node.children, { id: nextId(), type: "group", logic: "$and", children: [] }]
    });
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
    padding: 8,
    marginBottom: 6,
    border: `1px solid ${isAnd ? tokens.primary : tokens.warning}`,
    borderLeft: `4px solid ${isAnd ? tokens.primary : tokens.warning}`,
    borderRadius: tokens.radiusLarge,
    background: depth === 0 ? "#fff" : `${tokens.neutral100}`
  }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", paddingBottom: 2, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          Pill,
          {
            active: isAnd,
            color: tokens.primary,
            onClick: () => onChange({ ...node, logic: "$and" }),
            children: "AND"
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          Pill,
          {
            active: !isAnd,
            color: tokens.warning,
            onClick: () => onChange({ ...node, logic: "$or" }),
            children: "OR"
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
          node.children.length,
          " ",
          node.children.length === 1 ? "item" : "items"
        ] })
      ] }),
      canRemove && /* @__PURE__ */ jsxRuntime.jsx("button", { type: "button", onClick: onRemove, title: "Remove group", style: {
        border: "none",
        background: "transparent",
        color: tokens.danger,
        cursor: "pointer",
        fontSize: 14,
        padding: "0 6px"
      }, children: "× group" })
    ] }),
    node.children.map((child, idx) => child.type === "group" ? /* @__PURE__ */ jsxRuntime.jsx(
      GroupNode,
      {
        node: child,
        depth: depth + 1,
        onChange: (n) => updateChild(idx, n),
        onRemove: () => updateChild(idx, null),
        canRemove: true
      },
      child.id
    ) : /* @__PURE__ */ jsxRuntime.jsx(
      ConditionRow,
      {
        node: child,
        depth: depth + 1,
        onChange: (n) => updateChild(idx, n),
        onRemove: () => updateChild(idx, null)
      },
      child.id
    )),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, paddingTop: 1, children: [
      /* @__PURE__ */ jsxRuntime.jsx(Pill, { color: tokens.primary, onClick: addCondition, children: "+ condition" }),
      depth < MAX_DEPTH && /* @__PURE__ */ jsxRuntime.jsx(Pill, { color: tokens.warning, onClick: addGroup, children: "+ group" })
    ] })
  ] });
};
function FiltersBuilder({ value, onChange }) {
  const [tree, setTree] = React__default.default.useState(() => parseFilterObject(value));
  const lastValueRef = React__default.default.useRef(value);
  React__default.default.useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setTree(parseFilterObject(value));
    }
  }, [value]);
  const updateTree = (next) => {
    setTree(next);
    const obj = buildFilterObject(next) || {};
    lastValueRef.current = obj;
    onChange?.(obj);
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsx(GroupNode, { node: tree, depth: 0, onChange: updateTree, onRemove: () => {
    }, canRemove: false }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
      "Path uses dot notation (e.g. ",
      /* @__PURE__ */ jsxRuntime.jsx("code", { children: "branch.id" }),
      ", ",
      /* @__PURE__ */ jsxRuntime.jsx("code", { children: "author.email" }),
      "). Value can be a literal or a ",
      /* @__PURE__ */ jsxRuntime.jsx("code", { children: "$user.id" }),
      " / ",
      /* @__PURE__ */ jsxRuntime.jsx("code", { children: "$today" }),
      " / ",
      /* @__PURE__ */ jsxRuntime.jsx("code", { children: "$query.q" }),
      " token."
    ] })
  ] });
}
const PATH_RE = /^[a-zA-Z_*][\w*]*(\.[a-zA-Z_][\w]*)*$/;
function pathsToPopulate(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return {};
  if (paths.includes("*")) return "*";
  const out = {};
  for (const raw of paths) {
    const parts = String(raw || "").split(".").filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = out;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        if (cursor[part] === void 0) cursor[part] = true;
      } else {
        if (cursor[part] === void 0 || cursor[part] === true) {
          cursor[part] = { populate: {} };
        } else if (!cursor[part].populate) {
          cursor[part].populate = {};
        }
        cursor = cursor[part].populate;
      }
    }
  }
  return out;
}
function populateToPaths(value) {
  if (value === "*" || value === true) return ["*"];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  const out = [];
  const walk = (node, prefix) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v === true || v == null) {
        out.push(path);
      } else if (typeof v === "object" && v.populate) {
        walk(v.populate, path);
      } else {
        out.push(path);
      }
    }
  };
  walk(value, "");
  return out;
}
function pathsToTree(paths) {
  const root = {};
  for (const path of paths) {
    if (path === "*") {
      root["*"] = root["*"] || { children: {}, full: "*" };
      continue;
    }
    const parts = String(path || "").split(".").filter(Boolean);
    let cursor = root;
    let acc = [];
    for (const part of parts) {
      acc.push(part);
      cursor[part] = cursor[part] || { children: {}, full: acc.join(".") };
      cursor = cursor[part].children;
    }
  }
  return root;
}
function TreeNode({ name, node, depth, onRemove }) {
  const childKeys = Object.keys(node.children || {});
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
    marginLeft: depth === 0 ? 0 : 12,
    paddingLeft: depth === 0 ? 0 : 8,
    borderLeft: depth === 0 ? "none" : `2px solid ${tokens.neutral200}`
  }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", style: { padding: "2px 0" }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("span", { style: { fontFamily: tokens.monoFont, fontSize: 12 }, children: name === "*" ? /* @__PURE__ */ jsxRuntime.jsx("em", { style: { color: tokens.warning }, children: "* (populate all)" }) : name }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "button",
        {
          type: "button",
          onClick: () => onRemove(node.full),
          title: "Remove this path",
          style: {
            border: "none",
            background: "transparent",
            color: tokens.danger,
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px"
          },
          children: "×"
        }
      )
    ] }),
    childKeys.map((ck) => /* @__PURE__ */ jsxRuntime.jsx(TreeNode, { name: ck, node: node.children[ck], depth: depth + 1, onRemove }, ck))
  ] });
}
function PopulateBuilder({ value, onChange }) {
  const [paths, setPaths] = React__default.default.useState(() => populateToPaths(value));
  const [draft, setDraft] = React__default.default.useState("");
  const [error, setError] = React__default.default.useState("");
  const lastValueRef = React__default.default.useRef(value);
  React__default.default.useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setPaths(populateToPaths(value));
    }
  }, [value]);
  const emit = (nextPaths) => {
    setPaths(nextPaths);
    const obj = pathsToPopulate(nextPaths);
    lastValueRef.current = obj;
    onChange?.(obj);
  };
  const addPath = () => {
    const p = draft.trim();
    if (!p) return;
    if (p !== "*" && !PATH_RE.test(p)) {
      setError('Path must be dot-separated identifiers, e.g. "comments.author"');
      return;
    }
    if (paths.includes(p)) {
      setDraft("");
      return;
    }
    setError("");
    setDraft("");
    emit([...paths, p]);
  };
  const removePath = (target) => {
    emit(paths.filter((p) => p !== target));
  };
  const tree = pathsToTree(paths);
  const topKeys = Object.keys(tree);
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, alignItems: "center", children: [
      /* @__PURE__ */ jsxRuntime.jsx(
        "input",
        {
          type: "text",
          value: draft,
          placeholder: "path (e.g. comments.author, or *)",
          onChange: (e) => {
            setDraft(e.target.value);
            if (error) setError("");
          },
          onKeyDown: (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPath();
            }
          },
          style: {
            flex: 1,
            padding: "4px 8px",
            border: `1px solid ${tokens.neutral300}`,
            borderRadius: tokens.radius,
            fontFamily: tokens.monoFont,
            fontSize: 12
          }
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx("button", { type: "button", onClick: addPath, style: {
        padding: "4px 10px",
        background: tokens.primary,
        color: "#fff",
        border: "none",
        borderRadius: tokens.radius,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600
      }, children: "+ add" })
    ] }),
    error && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "danger700", paddingTop: 1, children: error }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, style: {
      minHeight: 80,
      padding: 8,
      background: tokens.neutral100,
      borderRadius: tokens.radiusLarge,
      border: `1px solid ${tokens.neutral200}`
    }, children: topKeys.length === 0 ? /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
      "No populate paths. Add one above (e.g. ",
      /* @__PURE__ */ jsxRuntime.jsx("code", { children: "author" }),
      ", ",
      /* @__PURE__ */ jsxRuntime.jsx("code", { children: "comments.author" }),
      ", or ",
      /* @__PURE__ */ jsxRuntime.jsx("code", { children: "*" }),
      " for all)."
    ] }) : topKeys.map((k) => /* @__PURE__ */ jsxRuntime.jsx(TreeNode, { name: k, node: tree[k], depth: 0, onRemove: removePath }, k)) })
  ] });
}
function coerceValue(raw) {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("$")) return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw === "") return "";
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d*\.\d+$/.test(raw)) return Number(raw);
  return raw;
}
function uncoerce(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function pairsToObject(pairs) {
  const out = {};
  for (const [k, v] of pairs) {
    const key = String(k || "").trim();
    if (!key) continue;
    out[key] = coerceValue(v);
  }
  return out;
}
function objectToPairs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([k, v]) => [k, uncoerce(v)]);
}
function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value or $user.id",
  emptyHint = "No fields. Add one below."
}) {
  const [pairs, setPairs] = React__default.default.useState(() => objectToPairs(value));
  const lastValueRef = React__default.default.useRef(value);
  React__default.default.useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setPairs(objectToPairs(value));
    }
  }, [value]);
  const emit = (next) => {
    setPairs(next);
    const obj = pairsToObject(next);
    lastValueRef.current = obj;
    onChange?.(obj);
  };
  const setAt = (idx, kv) => {
    const next = pairs.slice();
    next[idx] = kv;
    emit(next);
  };
  const removeAt = (idx) => {
    const next = pairs.slice();
    next.splice(idx, 1);
    emit(next);
  };
  const addRow = () => emit([...pairs, ["", ""]]);
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
      padding: 8,
      background: tokens.neutral100,
      borderRadius: tokens.radiusLarge,
      border: `1px solid ${tokens.neutral200}`
    }, children: [
      pairs.length === 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: emptyHint }),
      pairs.map(([k, v], idx) => /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, alignItems: "center", style: { marginBottom: 4 }, children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "input",
          {
            type: "text",
            value: k,
            placeholder: keyPlaceholder,
            onChange: (e) => setAt(idx, [e.target.value, v]),
            style: {
              flex: "1 1 140px",
              padding: "4px 6px",
              border: `1px solid ${tokens.neutral300}`,
              borderRadius: tokens.radius,
              fontFamily: tokens.monoFont,
              fontSize: 12
            }
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("span", { style: { color: tokens.neutral500 }, children: ":" }),
        /* @__PURE__ */ jsxRuntime.jsx(
          "input",
          {
            type: "text",
            value: v,
            placeholder: valuePlaceholder,
            onChange: (e) => setAt(idx, [k, e.target.value]),
            style: {
              flex: "2 1 200px",
              padding: "4px 6px",
              border: `1px solid ${tokens.neutral300}`,
              borderRadius: tokens.radius,
              fontFamily: tokens.monoFont,
              fontSize: 12
            }
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("button", { type: "button", onClick: () => removeAt(idx), title: "Remove", style: {
          border: "none",
          background: "transparent",
          color: tokens.danger,
          cursor: "pointer",
          fontSize: 14,
          padding: "0 4px"
        }, children: "×" })
      ] }, idx))
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 1, children: /* @__PURE__ */ jsxRuntime.jsx("button", { type: "button", onClick: addRow, style: {
      padding: "4px 10px",
      border: `1px solid ${tokens.primary}`,
      color: tokens.primary,
      background: "#fff",
      borderRadius: tokens.radius,
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 600
    }, children: "+ add field" }) })
  ] });
}
const api$1 = (p) => `/api-pro${p}`;
const SAMPLE_CONTEXT = {
  user: { id: 9, email: "user@example.com", branch: { id: 2 }, hr_employee: { documentId: "abc" } },
  claim: { appName: "pos-desk", roleKey: "pos_desk_cashier", domainKey: "pos-desk" },
  query: { q: "shoes" },
  params: { documentId: "abc123" },
  body: { name: "Sample", price: 199 },
  strapi: { request: { method: "GET", path: "/api/products" } }
};
function resolveToken(value, context) {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  if (value === "$today") return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  if (value === "$now") return (/* @__PURE__ */ new Date()).toISOString();
  const parts = value.slice(1).split(".");
  let result = context;
  for (const part of parts) {
    if (result == null) return void 0;
    result = result[part];
  }
  return result;
}
function resolveDeep(value, context) {
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, context)).filter((v) => v !== void 0);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = resolveDeep(v, context);
      if (r !== void 0) out[k] = r;
    }
    return out;
  }
  if (typeof value === "string" && value.startsWith("$")) return resolveToken(value, context);
  return value;
}
const BUILDERS = {
  filtersTemplate: FiltersBuilder,
  populateTemplate: PopulateBuilder,
  bodyTemplate: KeyValueEditor,
  queryTemplate: KeyValueEditor
};
const TEMPLATE_FIELDS = ["filtersTemplate", "populateTemplate", "queryTemplate", "bodyTemplate"];
const TEMPLATE_LABELS = {
  filtersTemplate: "Filters",
  populateTemplate: "Populate",
  queryTemplate: "Query (sort/fields/pagination)",
  bodyTemplate: "Body (force / overwrite)"
};
function emptyPolicy() {
  return {
    filtersTemplate: {},
    populateTemplate: {},
    bodyTemplate: {},
    queryTemplate: {},
    resolverMode: "strict"
  };
}
const BrowseTree = ({ interfaces, roleCount, onOpenMethod }) => {
  const [search, setSearch] = React__default.default.useState("");
  const [collapsed, setCollapsed] = React__default.default.useState({});
  const filtered = React__default.default.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return interfaces;
    return interfaces.filter(
      (i) => (i.key || "").toLowerCase().includes(q) || (i.name || "").toLowerCase().includes(q) || (i.uid || "").toLowerCase().includes(q) || Array.isArray(i.methods) && i.methods.some((m) => (m.name || "").toLowerCase().includes(q))
    );
  }, [interfaces, search]);
  const toggle = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const all = {};
    for (const i of filtered) all[i.key] = true;
    setCollapsed(all);
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "flex-end", wrap: "wrap", gap: 2, paddingTop: 3, children: [
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 300px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.TextInput,
        {
          label: "Search interfaces / methods",
          placeholder: "key, uid, or method name (e.g. cash, findOne)",
          value: search,
          onChange: (e) => setSearch(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: expandAll, children: "Expand all" }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: collapseAll, children: "Collapse all" })
      ] })
    ] }),
    filtered.length === 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 3, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: interfaces.length === 0 ? 'No interfaces yet — run "Re-seed from api-provider" on Domains & Roles to import defaults.' : "No interfaces match the search." }) }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 3, children: filtered.map((iface) => {
      const methods = Array.isArray(iface.methods) ? iface.methods : [];
      const isCollapsed = collapsed[iface.key];
      return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        marginBottom: 8,
        overflow: "hidden"
      }, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(
          designSystem.Flex,
          {
            justifyContent: "space-between",
            alignItems: "center",
            style: { cursor: "pointer", padding: "8px 12px", background: "#f4f4f8" },
            onClick: () => toggle(iface.key),
            children: [
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { minWidth: 0, flex: 1 }, children: [
                /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", children: [
                  /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: iface.name }),
                  /* @__PURE__ */ jsxRuntime.jsx("code", { style: { fontSize: 10, color: "#666" }, children: iface.uid })
                ] }),
                /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
                  iface.key,
                  " · ",
                  methods.length,
                  " method",
                  methods.length === 1 ? "" : "s"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", children: isCollapsed ? "▶" : "▼" })
            ]
          }
        ),
        !isCollapsed && methods.map((m) => /* @__PURE__ */ jsxRuntime.jsxs(
          designSystem.Flex,
          {
            justifyContent: "space-between",
            alignItems: "center",
            style: { padding: "6px 12px", borderTop: "1px solid #f0f0f4" },
            children: [
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", style: { minWidth: 0, flex: 1 }, children: [
                /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
                  padding: "1px 6px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "ui-monospace, Menlo, monospace"
                }, children: (m.method || "GET").toUpperCase() }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: m.name }),
                /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
                  background: "#e8eaf6",
                  color: "#4945ff",
                  padding: "0 6px",
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 600
                }, children: m.action || "?" }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  designSystem.Typography,
                  {
                    variant: "pi",
                    textColor: "neutral500",
                    style: {
                      fontFamily: "ui-monospace, Menlo, monospace",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    },
                    children: m.path
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntime.jsx(
                designSystem.Button,
                {
                  variant: "tertiary",
                  onClick: () => onOpenMethod({ interfaceKey: iface.key, methodName: m.name, action: m.action, path: m.path, httpMethod: m.method, interfaceName: iface.name, interfaceUid: iface.uid }),
                  children: "Edit policies →"
                }
              )
            ]
          },
          m.id
        )),
        !isCollapsed && methods.length === 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { padding: 3, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: "This interface has no methods yet." }) })
      ] }, iface.key);
    }) }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
      filtered.length,
      " interface",
      filtered.length === 1 ? "" : "s",
      " ·",
      " ",
      roleCount,
      " role",
      roleCount === 1 ? "" : "s",
      " available system-wide"
    ] }) })
  ] });
};
const PlayModal = ({ open, selection, roleKey, method, onClose }) => {
  const { post } = admin.useFetchClient();
  const [documentId, setDocumentId] = React__default.default.useState("");
  const [queryRaw, setQueryRaw] = React__default.default.useState("{}");
  const [bodyRaw, setBodyRaw] = React__default.default.useState("{}");
  const [actAsUserId, setActAsUserId] = React__default.default.useState("");
  const [running, setRunning] = React__default.default.useState(false);
  const [result, setResult] = React__default.default.useState(null);
  const [error, setError] = React__default.default.useState("");
  React__default.default.useEffect(() => {
    if (!open) {
      setResult(null);
      setError("");
    }
  }, [open]);
  if (!open) return null;
  const isFind = (method?.action || "").toLowerCase() === "find";
  const isFindOne = (method?.action || "").toLowerCase() === "findone";
  const isMutation = !isFind && !isFindOne;
  const safeParse = (raw) => {
    if (!raw || !raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`Invalid JSON: ${e.message}`);
    }
  };
  const run = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const payload = {
        interfaceKey: selection.interfaceKey,
        methodName: selection.methodName,
        roleKey,
        actAsUserId: actAsUserId ? Number(actAsUserId) : null,
        pathParams: {},
        queryParams: safeParse(queryRaw),
        bodyData: safeParse(bodyRaw),
        documentId: documentId || null
      };
      const { data } = await post(api$1("/play"), payload);
      setResult(data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.message || "Play failed.");
    } finally {
      setRunning(false);
    }
  };
  return /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 1100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  }, onClick: onClose, children: /* @__PURE__ */ jsxRuntime.jsxs(
    designSystem.Box,
    {
      style: {
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        maxWidth: 1100,
        width: "94%",
        maxHeight: "90vh",
        overflow: "auto"
      },
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "flex-start", gap: 2, children: [
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "beta", children: "Play as role" }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", paddingTop: 1, wrap: "wrap", children: [
              /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
                padding: "1px 6px",
                border: "1px solid #ccc",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "ui-monospace, Menlo, monospace"
              }, children: (method?.method || "GET").toUpperCase() }),
              /* @__PURE__ */ jsxRuntime.jsx("code", { style: { fontSize: 12 }, children: method?.path || "?" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: "as" }),
              /* @__PURE__ */ jsxRuntime.jsx("code", { style: {
                fontSize: 12,
                background: "#e8eaf6",
                color: "#4945ff",
                padding: "1px 6px",
                borderRadius: 4
              }, children: roleKey })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: onClose, children: "Close" })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, paddingTop: 3, wrap: "wrap", alignItems: "flex-end", children: [
          isFindOne && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 220px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              label: "documentId",
              value: documentId,
              onChange: (e) => setDocumentId(e.target.value),
              placeholder: "required for findOne"
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 160px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              label: "Act as user (id)",
              value: actAsUserId,
              onChange: (e) => setActAsUserId(e.target.value),
              placeholder: "(empty = current admin)"
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: run, loading: running, children: "Run" })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, paddingTop: 3, wrap: "wrap", alignItems: "flex-start", children: [
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1 1 300px" }, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: "Query (JSON)" }),
            /* @__PURE__ */ jsxRuntime.jsx(
              designSystem.Textarea,
              {
                name: "query",
                value: queryRaw,
                onChange: (e) => setQueryRaw(e.target.value)
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
              "e.g. ",
              `{ "pagination": { "pageSize": 5 } }`
            ] })
          ] }),
          isMutation && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1 1 300px" }, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: "Body (JSON)" }),
            /* @__PURE__ */ jsxRuntime.jsx(
              designSystem.Textarea,
              {
                name: "body",
                value: bodyRaw,
                onChange: (e) => setBodyRaw(e.target.value)
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: "Mutations are NOT executed — only the resolved body is shown." })
          ] })
        ] }),
        error && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 3, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: "danger700", children: error }) }),
        result && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 3, style: { borderTop: "1px solid #e0e0e0", marginTop: 12 }, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, alignItems: "flex-start", paddingTop: 3, style: { overflowX: "auto" }, children: [
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "0 0 280px" }, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: "Token context" }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: result.actAsUser ? `as user #${result.actAsUser.id} (${result.actAsUser.email || result.actAsUser.username})` : "as current admin" }),
            /* @__PURE__ */ jsxRuntime.jsx("pre", { style: {
              background: "#f4f4f8",
              padding: 8,
              borderRadius: 4,
              fontSize: 11,
              margin: 0,
              marginTop: 4,
              maxHeight: 220,
              overflowY: "auto"
            }, children: JSON.stringify(result.tokenContext, null, 2) })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "0 0 280px" }, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: "Resolved templates" }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: result.policyFound ? "success700" : "warning700", children: result.policyFound ? "policy found" : "no policy for this role" }),
            ["filters", "populate", "body", "query"].map((k) => /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 1, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: k }),
              /* @__PURE__ */ jsxRuntime.jsx("pre", { style: {
                background: "#fafafa",
                padding: 6,
                borderRadius: 4,
                fontSize: 10,
                margin: 0,
                maxHeight: 100,
                overflowY: "auto"
              }, children: JSON.stringify(result.resolved?.[k] || {}, null, 2) })
            ] }, k))
          ] }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1 1 320px", minWidth: 280 }, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: "Strapi response" }),
            result.executed ? /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "success700", children: "executed" }),
              /* @__PURE__ */ jsxRuntime.jsx("pre", { style: {
                background: "#f4f4f8",
                padding: 8,
                borderRadius: 4,
                fontSize: 11,
                margin: 0,
                marginTop: 4,
                maxHeight: 320,
                overflowY: "auto"
              }, children: JSON.stringify(result.response, null, 2) })
            ] }) : /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: result.executionError ? `Not executed: ${result.executionError}` : "Not executed (mutation action — preview only)." }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 2, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: "Final query sent to Strapi" }),
              /* @__PURE__ */ jsxRuntime.jsx("pre", { style: {
                background: "#fafafa",
                padding: 6,
                borderRadius: 4,
                fontSize: 10,
                margin: 0,
                maxHeight: 140,
                overflowY: "auto"
              }, children: JSON.stringify(result.finalQuery, null, 2) })
            ] })
          ] })
        ] }) })
      ]
    }
  ) });
};
const RoleColumn = ({ role, value, onChange, onRemove, sample, selection, method, onPlay }) => {
  const [rawByField, setRawByField] = React__default.default.useState({});
  const previews = React__default.default.useMemo(() => {
    const out = {};
    for (const f of TEMPLATE_FIELDS) {
      out[f] = resolveDeep(value?.[f] || {}, sample);
    }
    return out;
  }, [value, sample]);
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
    flex: "0 0 460px",
    minWidth: 420,
    maxWidth: 480,
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: 12,
    background: "#fff",
    maxHeight: "70vh",
    overflowY: "auto"
  }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      designSystem.Flex,
      {
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingBottom: 2,
        style: {
          position: "sticky",
          top: 0,
          background: "#fff",
          zIndex: 2,
          borderBottom: "1px solid #f0f0f4"
        },
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { minWidth: 0, flex: 1 }, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: role.name || role.key }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: /* @__PURE__ */ jsxRuntime.jsx("code", { children: role.key }) }),
            role.appDomains?.length > 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Flex, { gap: 1, paddingTop: 1, wrap: "wrap", children: role.appDomains.map((d) => /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
              background: "#f0f0f4",
              color: "#666",
              padding: "0 6px",
              borderRadius: 8,
              fontSize: 10
            }, children: d.key }, d.id)) })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, children: [
            onPlay && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: () => onPlay(role), title: "Play as this role", children: "▶ Play" }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "danger-light", onClick: onRemove, title: "Remove policy for this role", children: "×" })
          ] })
        ]
      }
    ),
    TEMPLATE_FIELDS.map((field) => {
      const Builder = BUILDERS[field];
      const showRaw = !!rawByField[field];
      const fieldValue = value?.[field] || {};
      return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 3, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", children: TEMPLATE_LABELS[field] }),
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              type: "button",
              onClick: () => setRawByField((s) => ({ ...s, [field]: !s[field] })),
              style: {
                border: "none",
                background: "transparent",
                color: "#4945ff",
                cursor: "pointer",
                fontSize: 10,
                padding: 0
              },
              children: showRaw ? "visual" : "raw JSON"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 1, children: showRaw ? /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.Textarea,
          {
            name: field,
            value: JSON.stringify(fieldValue, null, 2),
            onChange: (e) => {
              try {
                onChange({ ...value, [field]: JSON.parse(e.target.value || "{}") });
              } catch {
              }
            }
          }
        ) : /* @__PURE__ */ jsxRuntime.jsx(
          Builder,
          {
            value: fieldValue,
            onChange: (next) => onChange({ ...value, [field]: next || {} })
          }
        ) }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 1, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: "Resolved (sample $-context)" }),
          /* @__PURE__ */ jsxRuntime.jsx("pre", { style: {
            background: "#fafafa",
            padding: 6,
            borderRadius: 4,
            fontSize: 10,
            margin: 0,
            maxHeight: 100,
            overflowY: "auto"
          }, children: JSON.stringify(previews[field], null, 2) })
        ] })
      ] }, field);
    })
  ] });
};
const MethodEditor = ({ selection, onBack }) => {
  const { get, put } = admin.useFetchClient();
  const [methodInfo, setMethodInfo] = React__default.default.useState(null);
  const [allRoles, setAllRoles] = React__default.default.useState([]);
  const [policies, setPolicies] = React__default.default.useState({});
  const [initialPolicies, setInitialPolicies] = React__default.default.useState({});
  const [loading, setLoading] = React__default.default.useState(true);
  const [saving, setSaving] = React__default.default.useState(false);
  const [message, setMessage] = React__default.default.useState("");
  const [addRoleKey, setAddRoleKey] = React__default.default.useState("");
  const [roleSearch, setRoleSearch] = React__default.default.useState("");
  const { interfaceKey, methodName } = selection;
  const load = React__default.default.useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const { data } = await get(api$1(`/policies/method/${interfaceKey}/${methodName}`));
      const d = data?.data || {};
      setMethodInfo(d.method || null);
      setAllRoles(d.allRoles || []);
      setPolicies(d.policies || {});
      setInitialPolicies(d.policies || {});
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Failed to load method policies.");
    } finally {
      setLoading(false);
    }
  }, [get, interfaceKey, methodName]);
  React__default.default.useEffect(() => {
    load();
  }, [load]);
  const updateRole = (roleKey, next) => {
    setPolicies((p) => ({ ...p, [roleKey]: next }));
  };
  const addRole = () => {
    if (!addRoleKey) return;
    if (policies[addRoleKey] != null) {
      setAddRoleKey("");
      return;
    }
    setPolicies((p) => ({ ...p, [addRoleKey]: emptyPolicy() }));
    setAddRoleKey("");
  };
  const removeRole = (roleKey) => {
    setPolicies((p) => ({ ...p, [roleKey]: null }));
  };
  const undoRemove = (roleKey) => {
    setPolicies((p) => ({ ...p, [roleKey]: initialPolicies[roleKey] || emptyPolicy() }));
  };
  const saveAll = async () => {
    setSaving(true);
    setMessage("");
    try {
      const { data } = await put(api$1(`/policies/method/${interfaceKey}/${methodName}`), { policies });
      const r = data?.data || {};
      setMessage(`Saved ${r.saved?.length || 0} · deleted ${r.deleted?.length || 0}` + (r.errors?.length ? ` · ${r.errors.length} error(s)` : ""));
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };
  const dirty = React__default.default.useMemo(() => {
    const ka = /* @__PURE__ */ new Set([...Object.keys(policies), ...Object.keys(initialPolicies)]);
    for (const k of ka) {
      if (JSON.stringify(policies[k] || null) !== JSON.stringify(initialPolicies[k] || null)) return true;
    }
    return false;
  }, [policies, initialPolicies]);
  const presentRoles = React__default.default.useMemo(() => {
    const list = [];
    for (const role of allRoles) {
      if (policies[role.key] !== void 0) list.push(role);
    }
    return list;
  }, [allRoles, policies]);
  const visibleRoles = React__default.default.useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    if (!q) return presentRoles;
    return presentRoles.filter(
      (r) => (r.key || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q)
    );
  }, [presentRoles, roleSearch]);
  const addableRoles = React__default.default.useMemo(
    () => allRoles.filter((r) => policies[r.key] == null && !initialPolicies[r.key]),
    [allRoles, policies, initialPolicies]
  );
  const [playRoleKey, setPlayRoleKey] = React__default.default.useState(null);
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
      position: "sticky",
      top: 0,
      background: "#fff",
      zIndex: 10,
      borderBottom: "1px solid #e0e0e0",
      paddingBottom: 8,
      marginBottom: 8
    }, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", wrap: "wrap", gap: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: onBack, children: "← back to browse" }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 1, children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", wrap: "wrap", children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "beta", children: selection.interfaceName || interfaceKey }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: "/" }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: methodName }),
              methodInfo && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
                /* @__PURE__ */ jsxRuntime.jsx("span", { style: {
                  padding: "1px 6px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "ui-monospace, Menlo, monospace"
                }, children: (methodInfo.method || "GET").toUpperCase() }),
                /* @__PURE__ */ jsxRuntime.jsx("code", { style: { fontSize: 11, color: "#666" }, children: methodInfo.path })
              ] })
            ] }),
            selection.interfaceUid && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: /* @__PURE__ */ jsxRuntime.jsxs("code", { style: { fontSize: 11 }, children: [
              selection.interfaceUid,
              ".",
              methodInfo?.action || methodName
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", children: [
          dirty && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "warning700", children: "unsaved changes" }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: load, disabled: saving, children: "Reload" }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: saveAll, loading: saving, disabled: !dirty, children: "Save All" })
        ] })
      ] }),
      message && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: message.startsWith("Saved") ? "success700" : "danger700", children: message }) }),
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, paddingTop: 3, wrap: "wrap", alignItems: "flex-end", children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "0 0 260px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.SingleSelect,
          {
            label: "Add policy for role",
            placeholder: addableRoles.length === 0 ? "all roles already configured" : "pick a role…",
            value: addRoleKey,
            onChange: (v) => setAddRoleKey(v || ""),
            onClear: () => setAddRoleKey(""),
            disabled: addableRoles.length === 0,
            children: addableRoles.map((r) => /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: r.key, children: r.key }, r.id))
          }
        ) }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: addRole, disabled: !addRoleKey, children: "+ Add column" }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "0 0 260px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
          designSystem.TextInput,
          {
            label: "Filter visible columns",
            placeholder: "role key or name",
            value: roleSearch,
            onChange: (e) => setRoleSearch(e.target.value)
          }
        ) }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
          presentRoles.length,
          " role policy column",
          presentRoles.length === 1 ? "" : "s",
          " ·",
          " ",
          "showing ",
          visibleRoles.length
        ] })
      ] })
    ] }),
    loading ? /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: "neutral500", children: "Loading…" }) : presentRoles.length === 0 ? /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 4, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: 'No role policies for this method yet. Add one via the "Add policy for role" picker above.' }) }) : /* @__PURE__ */ jsxRuntime.jsx(designSystem.Flex, { gap: 3, alignItems: "flex-start", style: { overflowX: "auto", paddingBottom: 12 }, children: visibleRoles.map((role) => {
      const value = policies[role.key];
      if (value === null) {
        return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: {
          flex: "0 0 280px",
          border: "1px dashed #d02b20",
          borderRadius: 8,
          padding: 12,
          background: "#fcecea"
        }, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: role.name || role.key }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "danger700", paddingTop: 1, children: "Marked for deletion. Save All to apply." }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: () => undoRemove(role.key), children: "Undo" }) })
        ] }, role.key);
      }
      return /* @__PURE__ */ jsxRuntime.jsx(
        RoleColumn,
        {
          role,
          value,
          onChange: (next) => updateRole(role.key, next),
          onRemove: () => removeRole(role.key),
          onPlay: (r) => setPlayRoleKey(r.key),
          sample: SAMPLE_CONTEXT,
          selection,
          method: methodInfo
        },
        role.key
      );
    }) }),
    /* @__PURE__ */ jsxRuntime.jsx(
      PlayModal,
      {
        open: Boolean(playRoleKey),
        selection,
        roleKey: playRoleKey,
        method: methodInfo,
        onClose: () => setPlayRoleKey(null)
      }
    )
  ] });
};
const Policies = ({ initialSelection, onConsumeInitialSelection }) => {
  const { get } = admin.useFetchClient();
  const [interfaces, setInterfaces] = React__default.default.useState([]);
  const [roleCount, setRoleCount] = React__default.default.useState(0);
  const [view, setView] = React__default.default.useState("browse");
  const [selection, setSelection] = React__default.default.useState(null);
  React__default.default.useEffect(() => {
    if (initialSelection) {
      setSelection(initialSelection);
      setView("method");
      onConsumeInitialSelection?.();
    }
  }, [initialSelection]);
  React__default.default.useEffect(() => {
    (async () => {
      try {
        const [i, r] = await Promise.all([get(api$1("/interfaces")), get(api$1("/roles"))]);
        setInterfaces(i?.data?.data || []);
        setRoleCount((r?.data?.data || []).length);
      } catch {
      }
    })();
  }, [get]);
  const openMethod = (sel) => {
    setSelection(sel);
    setView("method");
  };
  const backToBrowse = () => {
    setView("browse");
    setSelection(null);
  };
  return /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { children: view === "browse" ? /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "beta", children: "Method Policies" }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "neutral600", children: "Pick a method to edit its policies for all roles side-by-side." }),
    /* @__PURE__ */ jsxRuntime.jsx(BrowseTree, { interfaces, roleCount, onOpenMethod: openMethod })
  ] }) : /* @__PURE__ */ jsxRuntime.jsx(MethodEditor, { selection, onBack: backToBrowse }) });
};
const api = (p) => `/api-pro${p}`;
const PAGE_SIZE$1 = 25;
const blankDomain = { key: "", name: "", description: "" };
const blankRole = { key: "", name: "", description: "", adminRoleCode: "", appDomains: [] };
const DomainsRoles = () => {
  const { get, post, put, del } = admin.useFetchClient();
  const [domains, setDomains] = React__default.default.useState([]);
  const [roles, setRoles] = React__default.default.useState([]);
  const [draftDomain, setDraftDomain] = React__default.default.useState(blankDomain);
  const [draftRole, setDraftRole] = React__default.default.useState(blankRole);
  const [editingDomainId, setEditingDomainId] = React__default.default.useState(null);
  const [editingRoleId, setEditingRoleId] = React__default.default.useState(null);
  const [message, setMessage] = React__default.default.useState("");
  const [loading, setLoading] = React__default.default.useState(false);
  const [roleSearch, setRoleSearch] = React__default.default.useState("");
  const [roleDomainFilter, setRoleDomainFilter] = React__default.default.useState("");
  const [rolePage, setRolePage] = React__default.default.useState(1);
  const [seeding, setSeeding] = React__default.default.useState(false);
  const [seedResult, setSeedResult] = React__default.default.useState(null);
  const load = React__default.default.useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([get(api("/domains")), get(api("/roles"))]);
      setDomains(d?.data?.data || []);
      setRoles(r?.data?.data || []);
    } catch {
      setMessage("Failed to load domains/roles.");
    } finally {
      setLoading(false);
    }
  }, [get]);
  React__default.default.useEffect(() => {
    load();
  }, [load]);
  const runSeed = async () => {
    if (!window.confirm("Re-seed domains, roles, interfaces, methods and policies from @rutba/api-provider? This is idempotent — existing rows are updated by key, no data is destroyed.")) return;
    setSeeding(true);
    setSeedResult(null);
    setMessage("");
    try {
      const { data } = await post(api("/admin/seed"), {});
      setSeedResult(data?.data || null);
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Seed failed.");
    } finally {
      setSeeding(false);
    }
  };
  const saveDomain = async () => {
    if (!draftDomain.key || !draftDomain.name) {
      setMessage("Domain key and name are required.");
      return;
    }
    try {
      if (editingDomainId) {
        await put(api(`/domains/${editingDomainId}`), draftDomain);
      } else {
        await post(api("/domains"), draftDomain);
      }
      setDraftDomain(blankDomain);
      setEditingDomainId(null);
      setMessage("");
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Failed to save domain.");
    }
  };
  const editDomain = (d) => {
    setEditingDomainId(d.id);
    setDraftDomain({ key: d.key, name: d.name, description: d.description || "" });
  };
  const deleteDomain = async (d) => {
    const roleCount = (d.appRoles || []).length;
    const ok = window.confirm(
      roleCount > 0 ? `Delete domain '${d.key}'? ${roleCount} role(s) still reference it.` : `Delete domain '${d.key}'?`
    );
    if (!ok) return;
    try {
      await del(api(`/domains/${d.id}`));
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Failed to delete domain.");
    }
  };
  const saveRole = async () => {
    if (!draftRole.key || !draftRole.name) {
      setMessage("Role key and name are required.");
      return;
    }
    try {
      const payload = { ...draftRole, appDomains: draftRole.appDomains.map(Number) };
      if (editingRoleId) {
        await put(api(`/roles/${editingRoleId}`), payload);
      } else {
        await post(api("/roles"), payload);
      }
      setDraftRole(blankRole);
      setEditingRoleId(null);
      setMessage("");
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Failed to save role.");
    }
  };
  const editRole = (r) => {
    setEditingRoleId(r.id);
    setDraftRole({
      key: r.key,
      name: r.name,
      description: r.description || "",
      adminRoleCode: r.adminRoleCode || "",
      appDomains: (r.appDomains || []).map((d) => String(d.id))
    });
  };
  const deleteRole = async (r) => {
    if (!window.confirm(`Delete role '${r.key}'?`)) return;
    try {
      await del(api(`/roles/${r.id}`));
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Failed to delete role.");
    }
  };
  const toggleRoleDomain = (domainId) => {
    const id = String(domainId);
    setDraftRole((prev) => ({
      ...prev,
      appDomains: prev.appDomains.includes(id) ? prev.appDomains.filter((d) => d !== id) : [...prev.appDomains, id]
    }));
  };
  const filteredRoles = React__default.default.useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return roles.filter((r) => {
      if (q) {
        const inText = (r.key || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q);
        if (!inText) return false;
      }
      if (roleDomainFilter) {
        const has = (r.appDomains || []).some((d) => String(d.id) === roleDomainFilter);
        if (!has) return false;
      }
      return true;
    });
  }, [roles, roleSearch, roleDomainFilter]);
  React__default.default.useEffect(() => {
    setRolePage(1);
  }, [roleSearch, roleDomainFilter]);
  const totalRolePages = Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE$1));
  const safeRolePage = Math.min(rolePage, totalRolePages);
  const pagedRoles = filteredRoles.slice((safeRolePage - 1) * PAGE_SIZE$1, safeRolePage * PAGE_SIZE$1);
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", wrap: "wrap", gap: 2, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "beta", children: "App Domains & Roles" }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "omega", textColor: "neutral600", children: [
          domains.length,
          " domain(s) · ",
          roles.length,
          " role(s) total"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, children: [
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", onClick: load, disabled: loading, children: "Refresh" }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: runSeed, loading: seeding, children: "Re-seed from api-provider" })
      ] })
    ] }),
    seedResult && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "success700", children: [
      "Seed OK — domains=",
      seedResult.domains,
      ", roles=",
      seedResult.roles,
      ", interfaces=",
      seedResult.interfaces,
      ", methods=",
      seedResult.methods,
      ", policies=",
      seedResult.policies,
      " (scanned ",
      seedResult.descriptorsScanned,
      " descriptors)"
    ] }) }),
    message && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: "danger700", children: message }) }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 6, alignItems: "flex-start", wrap: "wrap", paddingTop: 4, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "1 1 320px", minWidth: 280 }, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "delta", children: [
          "Domains (",
          domains.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 3, style: { border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: editingDomainId ? `Edit domain #${editingDomainId}` : "New domain" }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              label: "Key",
              placeholder: "e.g. web-authenticated",
              value: draftDomain.key,
              onChange: (e) => setDraftDomain({ ...draftDomain, key: e.target.value })
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              label: "Name",
              value: draftDomain.name,
              onChange: (e) => setDraftDomain({ ...draftDomain, name: e.target.value })
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.Textarea,
            {
              label: "Description",
              value: draftDomain.description,
              onChange: (e) => setDraftDomain({ ...draftDomain, description: e.target.value })
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, paddingTop: 3, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: saveDomain, loading, children: editingDomainId ? "Update" : "Create" }),
            editingDomainId && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: () => {
              setEditingDomainId(null);
              setDraftDomain(blankDomain);
            }, children: "Cancel" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 4, style: { maxHeight: 480, overflowY: "auto" }, children: domains.map((d) => /* @__PURE__ */ jsxRuntime.jsxs(
          designSystem.Flex,
          {
            justifyContent: "space-between",
            alignItems: "center",
            padding: 2,
            style: { border: "1px solid #e0e0e0", borderRadius: 8, marginBottom: 6 },
            children: [
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: d.name }),
                /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
                  d.key,
                  " · ",
                  (d.appRoles || []).length,
                  " role(s)"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: () => editDomain(d), children: "Edit" }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "danger-light", onClick: () => deleteDomain(d), children: "Delete" })
              ] })
            ]
          },
          d.id
        )) })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "2 1 480px", minWidth: 360 }, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "delta", children: [
          "Roles (",
          roles.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 3, style: { border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: editingRoleId ? `Edit role #${editingRoleId}` : "New role" }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, paddingTop: 2, wrap: "wrap", children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 180px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
              designSystem.TextInput,
              {
                label: "Key",
                placeholder: "e.g. accountant",
                value: draftRole.key,
                onChange: (e) => setDraftRole({ ...draftRole, key: e.target.value })
              }
            ) }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 180px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
              designSystem.TextInput,
              {
                label: "Name",
                value: draftRole.name,
                onChange: (e) => setDraftRole({ ...draftRole, name: e.target.value })
              }
            ) }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 180px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
              designSystem.TextInput,
              {
                label: "Admin Role Code",
                value: draftRole.adminRoleCode,
                placeholder: "(defaults to key)",
                onChange: (e) => setDraftRole({ ...draftRole, adminRoleCode: e.target.value })
              }
            ) })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.Textarea,
            {
              label: "Description",
              value: draftRole.description,
              onChange: (e) => setDraftRole({ ...draftRole, description: e.target.value })
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 2, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: "Assign to domains" }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Flex, { gap: 2, wrap: "wrap", paddingTop: 1, style: { maxHeight: 100, overflowY: "auto" }, children: domains.map((d) => {
              const id = `role-domain-${d.id}`;
              const checked = draftRole.appDomains.includes(String(d.id));
              return /* @__PURE__ */ jsxRuntime.jsxs(
                "label",
                {
                  htmlFor: id,
                  style: {
                    cursor: "pointer",
                    padding: "2px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 12,
                    background: checked ? "#e8eaf6" : "transparent",
                    fontSize: 11
                  },
                  children: [
                    /* @__PURE__ */ jsxRuntime.jsx(
                      "input",
                      {
                        id,
                        type: "checkbox",
                        checked,
                        onChange: () => toggleRoleDomain(d.id),
                        style: { marginRight: 4 }
                      }
                    ),
                    d.key
                  ]
                },
                d.id
              );
            }) })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, paddingTop: 3, children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: saveRole, loading, children: editingRoleId ? "Update" : "Create" }),
            editingRoleId && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: () => {
              setEditingRoleId(null);
              setDraftRole(blankRole);
            }, children: "Cancel" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, paddingTop: 4, wrap: "wrap", alignItems: "flex-end", children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 220px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.TextInput,
            {
              label: "Search roles",
              placeholder: "key or name",
              value: roleSearch,
              onChange: (e) => setRoleSearch(e.target.value)
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.SingleSelect,
            {
              label: "Filter by domain",
              placeholder: "All domains",
              value: roleDomainFilter,
              onChange: (v) => setRoleDomainFilter(v || ""),
              onClear: () => setRoleDomainFilter(""),
              children: domains.map((d) => /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: String(d.id), children: d.key }, d.id))
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
            filteredRoles.length,
            " of ",
            roles.length
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 2, style: { maxHeight: 480, overflowY: "auto" }, children: [
          pagedRoles.length === 0 && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", paddingTop: 2, children: "No roles match the current filters." }),
          pagedRoles.map((r) => /* @__PURE__ */ jsxRuntime.jsxs(
            designSystem.Flex,
            {
              justifyContent: "space-between",
              alignItems: "center",
              padding: 2,
              style: { border: "1px solid #e0e0e0", borderRadius: 8, marginBottom: 6 },
              children: [
                /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { minWidth: 0, flex: 1 }, children: [
                  /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: r.name }),
                  /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
                    r.key,
                    r.adminRoleCode && r.adminRoleCode !== r.key ? ` · admin=${r.adminRoleCode}` : ""
                  ] }),
                  /* @__PURE__ */ jsxRuntime.jsx(designSystem.Flex, { gap: 1, paddingTop: 1, wrap: "wrap", children: (r.appDomains || []).map((d) => /* @__PURE__ */ jsxRuntime.jsx(
                    "span",
                    {
                      style: {
                        background: "#f0f0f4",
                        color: "#666",
                        padding: "1px 6px",
                        borderRadius: 8,
                        fontSize: 10
                      },
                      children: d.key
                    },
                    d.id
                  )) })
                ] }),
                /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 1, children: [
                  /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: () => editRole(r), children: "Edit" }),
                  /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "danger-light", onClick: () => deleteRole(r), children: "Delete" })
                ] })
              ]
            },
            r.id
          ))
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", paddingTop: 2, children: [
          /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.Button,
            {
              variant: "secondary",
              disabled: safeRolePage <= 1,
              onClick: () => setRolePage((p) => Math.max(1, p - 1)),
              children: "Prev"
            }
          ),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", children: [
            "Page ",
            safeRolePage,
            " / ",
            totalRolePages
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(
            designSystem.Button,
            {
              variant: "secondary",
              disabled: safeRolePage >= totalRolePages,
              onClick: () => setRolePage((p) => Math.min(totalRolePages, p + 1)),
              children: "Next"
            }
          )
        ] })
      ] })
    ] })
  ] });
};
const PAGE_SIZE = 15;
const UsersPage = () => {
  const { get, put } = admin.useFetchClient();
  const [users, setUsers] = React.useState([]);
  const [roleOptions, setRoleOptions] = React.useState([]);
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [selectedRoleIds, setSelectedRoleIds] = React.useState([]);
  const [userSearch, setUserSearch] = React.useState("");
  const [filterAppRole, setFilterAppRole] = React.useState("");
  const [assignedRoleFilter, setAssignedRoleFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const api2 = (path) => `/api-pro${path}`;
  const load = React__default.default.useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        get(api2("/users")),
        get(api2("/users/role-options"))
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
  React__default.default.useEffect(() => {
    load();
  }, [load]);
  const rolesByDomain = React.useMemo(() => {
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
  const selectedSet = React.useMemo(() => new Set(selectedRoleIds.map(String)), [selectedRoleIds]);
  const selectedUser = React.useMemo(
    () => users.find((u) => String(u.id) === String(selectedUserId)) || null,
    [users, selectedUserId]
  );
  const visibleRolesByDomain = React.useMemo(() => {
    const q = assignedRoleFilter.trim().toLowerCase();
    if (!q) return rolesByDomain;
    return rolesByDomain.map(([k, group]) => [
      k,
      {
        ...group,
        roles: group.roles.filter((role) => {
          const key = (role.key || "").toLowerCase();
          const name = (role.name || "").toLowerCase();
          return key.includes(q) || name.includes(q);
        })
      }
    ]).filter(([, group]) => group.roles.length > 0);
  }, [rolesByDomain, assignedRoleFilter]);
  const visibleRoleIds = React.useMemo(
    () => visibleRolesByDomain.flatMap(([, g]) => g.roles.map((r) => String(r.id))),
    [visibleRolesByDomain]
  );
  const visibleSelectedCount = React.useMemo(
    () => visibleRoleIds.filter((id) => selectedSet.has(id)).length,
    [visibleRoleIds, selectedSet]
  );
  const addFilteredRoles = () => {
    if (visibleRoleIds.length === 0) return;
    setSelectedRoleIds((prev) => Array.from(/* @__PURE__ */ new Set([...prev.map(String), ...visibleRoleIds])));
  };
  const removeFilteredRoles = () => {
    if (visibleRoleIds.length === 0) return;
    const drop = new Set(visibleRoleIds);
    setSelectedRoleIds((prev) => prev.map(String).filter((id) => !drop.has(id)));
  };
  const filteredUsers = React.useMemo(() => {
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
      await put(api2(`/users/${selectedUserId}/roles`), { roleIds: selectedRoleIds.map(Number) });
      setMessage("App roles assignment saved.");
      await load();
    } catch {
      setMessage("Failed to save app role assignment.");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "beta", children: "User App Role Assignments" }),
    message && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { textColor: "neutral600", children: message }) }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 6, alignItems: "flex-start", wrap: "wrap", paddingTop: 4, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: "0 0 360px" }, children: [
        !selectedUser && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { padding: 4, style: { border: "1px dashed #e0e0e0", borderRadius: 8 }, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: "Pick a user from the list to edit their app role assignments." }) }),
        selectedUser && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: selectedUser.displayName || selectedUser.username || selectedUser.email }),
          selectedUser.email && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 1, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: selectedUser.email }) }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 4, children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: "Assigned App Roles" }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
                selectedRoleIds.length,
                " selected"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsx(
              designSystem.TextInput,
              {
                label: "Filter roles",
                placeholder: "Filter roles by name or key",
                value: assignedRoleFilter,
                onChange: (e) => setAssignedRoleFilter(e.target.value)
              }
            ) }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, paddingTop: 2, alignItems: "center", wrap: "wrap", children: [
              /* @__PURE__ */ jsxRuntime.jsxs(
                designSystem.Button,
                {
                  variant: "tertiary",
                  disabled: visibleRoleIds.length === 0 || visibleSelectedCount === visibleRoleIds.length,
                  onClick: addFilteredRoles,
                  children: [
                    "Add ",
                    assignedRoleFilter ? "filtered" : "all",
                    " (",
                    visibleRoleIds.length - visibleSelectedCount,
                    ")"
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsxs(
                designSystem.Button,
                {
                  variant: "tertiary",
                  disabled: visibleSelectedCount === 0,
                  onClick: removeFilteredRoles,
                  children: [
                    "Remove ",
                    assignedRoleFilter ? "filtered" : "all",
                    " (",
                    visibleSelectedCount,
                    ")"
                  ]
                }
              ),
              assignedRoleFilter && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "tertiary", onClick: () => setAssignedRoleFilter(""), children: "Clear filter" })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { paddingTop: 2, children: [
              visibleRolesByDomain.length === 0 ? /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 2, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: [
                'No roles match "',
                assignedRoleFilter,
                '".'
              ] }) }) : null,
              visibleRolesByDomain.map(([domainKey, group]) => /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { marginBottom: 12, border: "1px solid #e8e8f0", borderRadius: 8, overflow: "hidden" }, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Flex, { justifyContent: "space-between", alignItems: "center", style: { padding: "6px 10px", background: "#f4f4f8" }, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", fontWeight: "semiBold", textColor: "neutral600", children: group.label }) }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { padding: "6px 10px" }, children: group.roles.map((role) => {
                  const id = `assign-role-${role.id}`;
                  const checked = selectedSet.has(String(role.id));
                  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, alignItems: "center", paddingBottom: 1, children: [
                    /* @__PURE__ */ jsxRuntime.jsx("input", { id, type: "checkbox", checked, onChange: () => toggleRole(String(role.id)) }),
                    /* @__PURE__ */ jsxRuntime.jsxs("label", { htmlFor: id, style: { cursor: "pointer", flex: 1 }, children: [
                      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", children: role.key }),
                      role.name && role.name !== role.key && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral400", style: { fontSize: 10, marginLeft: 4 }, children: role.name })
                    ] })
                  ] }, role.id);
                }) })
              ] }, domainKey))
            ] }),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { onClick: save, loading, style: { marginTop: 16 }, children: "Save Assignment" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 3, wrap: "wrap", alignItems: "flex-end", paddingBottom: 3, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.TextInput, { label: "Search Users", placeholder: "Name or email", value: userSearch, onChange: (e) => {
            setUserSearch(e.target.value);
            setPage(1);
          } }) }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { flex: "1 1 180px" }, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelect, { label: "Filter by App Role", placeholder: "All app roles", value: filterAppRole, onChange: (v) => {
            setFilterAppRole(v || "");
            setPage(1);
          }, children: roleOptions.map((r) => /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: String(r.id), children: r.key }, r.id)) }) })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral500", paddingBottom: 2, children: [
          filteredUsers.length,
          " of ",
          users.length,
          " users"
        ] }),
        paged.map((u) => /* @__PURE__ */ jsxRuntime.jsxs(
          designSystem.Flex,
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
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "sigma", children: u.displayName || u.username }),
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "pi", textColor: "neutral500", children: u.email })
              ] }),
              /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { style: { background: (u.app_roles || []).length > 0 ? "#e8f5e9" : "#f5f5f5", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }, children: [
                (u.app_roles || []).length,
                " app role",
                (u.app_roles || []).length !== 1 ? "s" : ""
              ] })
            ]
          },
          u.id
        )),
        /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { justifyContent: "space-between", paddingTop: 2, children: [
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", disabled: safePage <= 1, onClick: () => setPage((p) => Math.max(1, p - 1)), children: "Prev" }),
          /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", children: [
            "Page ",
            safePage,
            " / ",
            totalPages
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: "secondary", disabled: safePage >= totalPages, onClick: () => setPage((p) => Math.min(totalPages, p + 1)), children: "Next" })
        ] })
      ] })
    ] })
  ] });
};
const App = () => {
  const [page, setPage] = React__default.default.useState("domains-roles");
  const [policiesSelection, setPoliciesSelection] = React__default.default.useState(null);
  const openPoliciesForMethod = (selection) => {
    setPoliciesSelection(selection);
    setPage("policies");
  };
  const renderPage = () => {
    if (page === "interfaces") return /* @__PURE__ */ jsxRuntime.jsx(Interfaces, { onOpenMethod: openPoliciesForMethod });
    if (page === "policies") return /* @__PURE__ */ jsxRuntime.jsx(
      Policies,
      {
        initialSelection: policiesSelection,
        onConsumeInitialSelection: () => setPoliciesSelection(null)
      }
    );
    if (page === "domains-roles") return /* @__PURE__ */ jsxRuntime.jsx(DomainsRoles, {});
    if (page === "users") return /* @__PURE__ */ jsxRuntime.jsx(UsersPage, {});
    return /* @__PURE__ */ jsxRuntime.jsx(Recordings, {});
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { padding: 8, children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "alpha", children: "Strapi API Pro" }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", children: "Recordings, interfaces, method policies, and domain-role management." }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { paddingTop: 4, paddingBottom: 4, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { gap: 2, wrap: "wrap", children: [
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: page === "recordings" ? "default" : "secondary", onClick: () => setPage("recordings"), children: "Recordings" }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: page === "interfaces" ? "default" : "secondary", onClick: () => setPage("interfaces"), children: "Interfaces" }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: page === "policies" ? "default" : "secondary", onClick: () => setPage("policies"), children: "Policies" }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: page === "domains-roles" ? "default" : "secondary", onClick: () => setPage("domains-roles"), children: "Domains & Roles" }),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Button, { variant: page === "users" ? "default" : "secondary", onClick: () => setPage("users"), children: "Users" })
    ] }) }),
    renderPage()
  ] });
};
exports.default = App;

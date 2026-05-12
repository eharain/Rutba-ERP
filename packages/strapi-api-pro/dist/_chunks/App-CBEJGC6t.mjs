import { jsxs, jsx } from "react/jsx-runtime";
import React, { useState, useMemo } from "react";
import { Box, Typography, Flex, TextInput, Button, SingleSelect, SingleSelectOption, Textarea } from "@strapi/design-system";
import { useFetchClient } from "@strapi/strapi/admin";
const api$3 = (p) => `/api-pro${p}`;
const PAGE_SIZE$4 = 15;
const StatusBadge = ({ status }) => {
  const color = status === "recording" ? "#1f8a45" : status === "stopped" ? "#666" : "#999";
  const bg = status === "recording" ? "#e6f7ec" : status === "stopped" ? "#f0f0f0" : "#f8f8f8";
  return /* @__PURE__ */ jsx("span", { style: {
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
  const [expanded, setExpanded] = React.useState(false);
  return /* @__PURE__ */ jsxs(Box, { style: { borderTop: "1px solid #f0f0f4" }, children: [
    /* @__PURE__ */ jsxs(
      Flex,
      {
        justifyContent: "space-between",
        alignItems: "center",
        padding: 2,
        style: { cursor: "pointer" },
        onClick: () => setExpanded((v) => !v),
        children: [
          /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
            /* @__PURE__ */ jsx("span", { style: {
              padding: "1px 6px",
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600
            }, children: (entry.method || "GET").toUpperCase() }),
            /* @__PURE__ */ jsx(Typography, { variant: "pi", children: entry.path })
          ] }),
          /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
            /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
              entry.statusCode || "–",
              " · ",
              entry.count || 1,
              "×"
            ] }),
            /* @__PURE__ */ jsx(Typography, { variant: "pi", children: expanded ? "▼" : "▶" })
          ] })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxs(Box, { padding: 3, style: { background: "#fafafa" }, children: [
      entry.query && Object.keys(entry.query).length > 0 && /* @__PURE__ */ jsxs(Box, { paddingBottom: 2, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "semiBold", children: "Query" }),
        /* @__PURE__ */ jsx("pre", { style: { fontSize: 11, margin: 0 }, children: JSON.stringify(entry.query, null, 2) })
      ] }),
      entry.body && Object.keys(entry.body || {}).length > 0 && /* @__PURE__ */ jsxs(Box, { paddingBottom: 2, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "semiBold", children: "Body" }),
        /* @__PURE__ */ jsx("pre", { style: { fontSize: 11, margin: 0 }, children: JSON.stringify(entry.body, null, 2) })
      ] }),
      entry.claimedContext && /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "semiBold", children: "Claim" }),
        /* @__PURE__ */ jsx("pre", { style: { fontSize: 11, margin: 0 }, children: JSON.stringify(entry.claimedContext, null, 2) })
      ] })
    ] })
  ] });
};
const Recordings = () => {
  const { get, post } = useFetchClient();
  const [sessions, setSessions] = React.useState([]);
  const [entries, setEntries] = React.useState({});
  const [selectedSession, setSelectedSession] = React.useState(null);
  const [newLabel, setNewLabel] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const loadSessions = React.useCallback(async () => {
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
  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);
  const loadEntries = React.useCallback(async (sessionId) => {
    try {
      const { data } = await get(api$3(`/recordings/${sessionId}/entries`));
      setEntries((e) => ({ ...e, [sessionId]: data?.data || [] }));
    } catch {
      setEntries((e) => ({ ...e, [sessionId]: [] }));
    }
  }, [get]);
  const start = async () => {
    setMessage("");
    try {
      await post(api$3("/recordings/start"), { name: newLabel || void 0 });
      setNewLabel("");
      await loadSessions();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Failed to start recording.");
    }
  };
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
  const filtered = React.useMemo(() => {
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
  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE$4));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE$4, safePage * PAGE_SIZE$4);
  const renderRow = (s) => {
    const isOpen = selectedSession === s.id;
    const sessionEntries = entries[s.id] || [];
    return /* @__PURE__ */ jsxs(Box, { style: {
      border: "1px solid #e0e0e0",
      borderRadius: 8,
      marginTop: 8,
      overflow: "hidden"
    }, children: [
      /* @__PURE__ */ jsxs(
        Flex,
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
            /* @__PURE__ */ jsxs(Box, { children: [
              /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", children: [
                /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: s.name }),
                /* @__PURE__ */ jsx(StatusBadge, { status: s.status })
              ] }),
              /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
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
            /* @__PURE__ */ jsx(Typography, { variant: "pi", children: isOpen ? "▼" : "▶" })
          ]
        }
      ),
      isOpen && /* @__PURE__ */ jsx(Box, { children: sessionEntries.length === 0 ? /* @__PURE__ */ jsx(Box, { padding: 3, children: /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: "No entries captured (entry-recording middleware is not yet wired)." }) }) : sessionEntries.map((e) => /* @__PURE__ */ jsx(EntryRow, { entry: e }, e.id)) })
    ] }, s.id);
  };
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "API Recordings" }),
    /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", children: "Capture live API traffic into sessions and convert recordings into interface definitions." }),
    /* @__PURE__ */ jsxs(Box, { paddingTop: 4, style: { border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }, children: [
      /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "flex-end", wrap: "wrap", children: [
        /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 240px" }, children: /* @__PURE__ */ jsx(
          TextInput,
          {
            label: "Session label (optional)",
            value: newLabel,
            onChange: (e) => setNewLabel(e.target.value),
            placeholder: "e.g. pos-desk happy path",
            disabled: Boolean(activeSession)
          }
        ) }),
        activeSession ? /* @__PURE__ */ jsx(Button, { variant: "danger", onClick: stop, loading, children: "Stop active session" }) : /* @__PURE__ */ jsx(Button, { onClick: start, loading, children: "Start Recording" }),
        /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: loadSessions, children: "Refresh" })
      ] }),
      activeSession && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral600", children: [
        "Recording in progress: ",
        /* @__PURE__ */ jsx("strong", { children: activeSession.name }),
        " · app=",
        /* @__PURE__ */ jsx("strong", { children: activeSession.resolvedAppName }),
        " · role=",
        /* @__PURE__ */ jsx("strong", { children: activeSession.resolvedRoleKey })
      ] }) }),
      message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: "danger700", children: message }) })
    ] }),
    /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
      /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "flex-end", wrap: "wrap", gap: 2, children: [
        /* @__PURE__ */ jsxs(Typography, { variant: "delta", children: [
          "Sessions (",
          sessions.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs(Flex, { gap: 2, wrap: "wrap", alignItems: "flex-end", children: [
          /* @__PURE__ */ jsx(Box, { style: { flex: "0 0 220px" }, children: /* @__PURE__ */ jsx(
            TextInput,
            {
              label: "Search",
              placeholder: "name, app or role",
              value: search,
              onChange: (e) => setSearch(e.target.value)
            }
          ) }),
          /* @__PURE__ */ jsxs(Box, { style: { flex: "0 0 160px" }, children: [
            /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "Status" }),
            /* @__PURE__ */ jsxs(
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
                  /* @__PURE__ */ jsx("option", { value: "", children: "All status" }),
                  /* @__PURE__ */ jsx("option", { value: "recording", children: "Recording" }),
                  /* @__PURE__ */ jsx("option", { value: "stopped", children: "Stopped" }),
                  /* @__PURE__ */ jsx("option", { value: "idle", children: "Idle" })
                ]
              }
            )
          ] })
        ] })
      ] }),
      filtered.length !== sessions.length && /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", paddingTop: 1, children: [
        filtered.length,
        " of ",
        sessions.length
      ] }),
      sessions.length === 0 && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", paddingTop: 2, children: "No recording sessions yet. Start one above." }),
      paged.map(renderRow),
      totalPages > 1 && /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", paddingTop: 2, children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "secondary",
            disabled: safePage <= 1,
            onClick: () => setPage((p) => Math.max(1, p - 1)),
            children: "Prev"
          }
        ),
        /* @__PURE__ */ jsxs(Typography, { variant: "pi", children: [
          "Page ",
          safePage,
          " / ",
          totalPages
        ] }),
        /* @__PURE__ */ jsx(
          Button,
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
const PAGE_SIZE$3 = 12;
const InterfaceCard = ({ iface, onScaffold }) => {
  const methodCount = Array.isArray(iface.methods) ? iface.methods.length : 0;
  return /* @__PURE__ */ jsxs(
    Box,
    {
      style: {
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: 12,
        flex: "1 1 280px",
        minWidth: 240,
        maxWidth: 360
      },
      children: [
        /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: iface.name }),
        /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: iface.key }),
        /* @__PURE__ */ jsx(Box, { paddingTop: 1, children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
          iface.uid || "—",
          " · ",
          methodCount,
          " method(s) ·",
          " ",
          /* @__PURE__ */ jsx("span", { style: {
            background: iface.status === "generated" ? "#e8f5e9" : "#fff3e0",
            padding: "1px 6px",
            borderRadius: 8,
            fontSize: 10
          }, children: iface.status || "manual" })
        ] }) }),
        /* @__PURE__ */ jsx(Flex, { gap: 1, paddingTop: 3, children: /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: () => onScaffold(iface), children: "Scaffold" }) })
      ]
    }
  );
};
const ScaffoldModal = ({ iface, onClose }) => {
  const { get } = useFetchClient();
  const [code, setCode] = React.useState("// loading...");
  const [error, setError] = React.useState("");
  React.useEffect(() => {
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
  return /* @__PURE__ */ jsx(
    Box,
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
      children: /* @__PURE__ */ jsxs(
        Box,
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
            /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", paddingBottom: 3, children: [
              /* @__PURE__ */ jsxs(Typography, { variant: "beta", children: [
                "Scaffold: ",
                iface.key
              ] }),
              /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
                /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: copy, children: "Copy" }),
                /* @__PURE__ */ jsx(Button, { onClick: onClose, children: "Close" })
              ] })
            ] }),
            error ? /* @__PURE__ */ jsx(Typography, { textColor: "danger700", children: error }) : /* @__PURE__ */ jsx("pre", { style: { background: "#f4f4f8", padding: 12, borderRadius: 4, fontSize: 12, margin: 0 }, children: code })
          ]
        }
      )
    }
  );
};
const AlignmentPlayground = () => {
  const { post } = useFetchClient();
  const [routePath, setRoutePath] = React.useState("/cms-footers/:documentId");
  const [signature, setSignature] = React.useState("documentId");
  const [result, setResult] = React.useState(null);
  const [message, setMessage] = React.useState("");
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
  return /* @__PURE__ */ jsxs(Box, { paddingTop: 6, style: { borderTop: "1px solid #e0e0e0" }, children: [
    /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
      /* @__PURE__ */ jsx(Typography, { variant: "delta", children: "Alignment Playground" }),
      /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "Validate that route :tokens line up with method signature args." })
    ] }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 3, children: /* @__PURE__ */ jsx(
      TextInput,
      {
        label: "Route path",
        value: routePath,
        onChange: (e) => setRoutePath(e.target.value)
      }
    ) }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(
      TextInput,
      {
        label: "Input signature (comma-separated)",
        value: signature,
        onChange: (e) => setSignature(e.target.value)
      }
    ) }),
    /* @__PURE__ */ jsxs(Flex, { gap: 2, paddingTop: 3, children: [
      /* @__PURE__ */ jsx(Button, { onClick: validate, children: "Validate" }),
      /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: previewFix, children: "Preview Guided Fix" })
    ] }),
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: "danger700", children: message }) }),
    result && /* @__PURE__ */ jsx(Box, { paddingTop: 3, children: /* @__PURE__ */ jsx("pre", { style: { background: "#f4f4f8", padding: 8, borderRadius: 4, fontSize: 12, margin: 0 }, children: JSON.stringify(result, null, 2) }) })
  ] });
};
const Interfaces = () => {
  const { get } = useFetchClient();
  const [interfaces, setInterfaces] = React.useState([]);
  const [scaffolding, setScaffolding] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const load = React.useCallback(async () => {
    try {
      const { data } = await get(api$2("/interfaces"));
      setInterfaces(data?.data || []);
    } catch {
      setMessage("Failed to load interfaces.");
    }
  }, [get]);
  React.useEffect(() => {
    load();
  }, [load]);
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return interfaces.filter((i) => {
      if (q) {
        const inText = (i.key || "").toLowerCase().includes(q) || (i.name || "").toLowerCase().includes(q) || (i.uid || "").toLowerCase().includes(q);
        if (!inText) return false;
      }
      if (statusFilter && (i.status || "manual") !== statusFilter) return false;
      return true;
    });
  }, [interfaces, search, statusFilter]);
  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE$3));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE$3, safePage * PAGE_SIZE$3);
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", wrap: "wrap", gap: 2, children: [
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "API Interfaces" }),
        /* @__PURE__ */ jsxs(Typography, { variant: "omega", textColor: "neutral600", children: [
          interfaces.length,
          " interface(s) — authored under .api-pro/interfaces/ (file = source of truth, DB = runtime mirror)."
        ] })
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: load, children: "Refresh" })
    ] }),
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: "danger700", children: message }) }),
    /* @__PURE__ */ jsxs(Flex, { gap: 3, paddingTop: 4, wrap: "wrap", alignItems: "flex-end", children: [
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 240px" }, children: /* @__PURE__ */ jsx(
        TextInput,
        {
          label: "Search",
          placeholder: "key, name, or uid",
          value: search,
          onChange: (e) => setSearch(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "0 0 200px" }, children: /* @__PURE__ */ jsxs(
        SingleSelect,
        {
          label: "Status",
          placeholder: "All",
          value: statusFilter,
          onChange: (v) => setStatusFilter(v || ""),
          onClear: () => setStatusFilter(""),
          children: [
            /* @__PURE__ */ jsx(SingleSelectOption, { value: "generated", children: "Generated" }),
            /* @__PURE__ */ jsx(SingleSelectOption, { value: "modified", children: "Modified" }),
            /* @__PURE__ */ jsx(SingleSelectOption, { value: "manual", children: "Manual" })
          ]
        }
      ) }),
      /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
        filtered.length,
        " of ",
        interfaces.length
      ] })
    ] }),
    /* @__PURE__ */ jsx(Flex, { gap: 3, wrap: "wrap", paddingTop: 4, children: paged.length === 0 ? /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: interfaces.length === 0 ? 'No interfaces yet — run "Re-seed from api-provider" on the Domains & Roles tab to import from @rutba/api-provider.' : "No interfaces match the current filters." }) : paged.map((i) => /* @__PURE__ */ jsx(InterfaceCard, { iface: i, onScaffold: setScaffolding }, i.id)) }),
    totalPages > 1 && /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", paddingTop: 3, children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "secondary",
          disabled: safePage <= 1,
          onClick: () => setPage((p) => Math.max(1, p - 1)),
          children: "Prev"
        }
      ),
      /* @__PURE__ */ jsxs(Typography, { variant: "pi", children: [
        "Page ",
        safePage,
        " / ",
        totalPages
      ] }),
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "secondary",
          disabled: safePage >= totalPages,
          onClick: () => setPage((p) => Math.min(totalPages, p + 1)),
          children: "Next"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(AlignmentPlayground, {}),
    /* @__PURE__ */ jsx(ScaffoldModal, { iface: scaffolding, onClose: () => setScaffolding(null) })
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
const Pill = ({ active, color, children, onClick, title }) => /* @__PURE__ */ jsx("button", { type: "button", onClick, title, style: {
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
  return /* @__PURE__ */ jsxs(Flex, { gap: 1, alignItems: "center", wrap: "wrap", style: {
    padding: 6,
    marginBottom: 4,
    background: tokens.neutral100,
    borderRadius: tokens.radius,
    border: `1px solid ${tokens.neutral200}`
  }, children: [
    /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsx(
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
        children: OPERATORS.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value))
      }
    ),
    /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsx("button", { type: "button", onClick: onRemove, title: "Remove condition", style: {
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
  return /* @__PURE__ */ jsxs(Box, { style: {
    padding: 8,
    marginBottom: 6,
    border: `1px solid ${isAnd ? tokens.primary : tokens.warning}`,
    borderLeft: `4px solid ${isAnd ? tokens.primary : tokens.warning}`,
    borderRadius: tokens.radiusLarge,
    background: depth === 0 ? "#fff" : `${tokens.neutral100}`
  }, children: [
    /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", paddingBottom: 2, children: [
      /* @__PURE__ */ jsxs(Flex, { gap: 1, children: [
        /* @__PURE__ */ jsx(
          Pill,
          {
            active: isAnd,
            color: tokens.primary,
            onClick: () => onChange({ ...node, logic: "$and" }),
            children: "AND"
          }
        ),
        /* @__PURE__ */ jsx(
          Pill,
          {
            active: !isAnd,
            color: tokens.warning,
            onClick: () => onChange({ ...node, logic: "$or" }),
            children: "OR"
          }
        ),
        /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
          node.children.length,
          " ",
          node.children.length === 1 ? "item" : "items"
        ] })
      ] }),
      canRemove && /* @__PURE__ */ jsx("button", { type: "button", onClick: onRemove, title: "Remove group", style: {
        border: "none",
        background: "transparent",
        color: tokens.danger,
        cursor: "pointer",
        fontSize: 14,
        padding: "0 6px"
      }, children: "× group" })
    ] }),
    node.children.map((child, idx) => child.type === "group" ? /* @__PURE__ */ jsx(
      GroupNode,
      {
        node: child,
        depth: depth + 1,
        onChange: (n) => updateChild(idx, n),
        onRemove: () => updateChild(idx, null),
        canRemove: true
      },
      child.id
    ) : /* @__PURE__ */ jsx(
      ConditionRow,
      {
        node: child,
        depth: depth + 1,
        onChange: (n) => updateChild(idx, n),
        onRemove: () => updateChild(idx, null)
      },
      child.id
    )),
    /* @__PURE__ */ jsxs(Flex, { gap: 1, paddingTop: 1, children: [
      /* @__PURE__ */ jsx(Pill, { color: tokens.primary, onClick: addCondition, children: "+ condition" }),
      depth < MAX_DEPTH && /* @__PURE__ */ jsx(Pill, { color: tokens.warning, onClick: addGroup, children: "+ group" })
    ] })
  ] });
};
function FiltersBuilder({ value, onChange }) {
  const [tree, setTree] = React.useState(() => parseFilterObject(value));
  const lastValueRef = React.useRef(value);
  React.useEffect(() => {
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
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsx(GroupNode, { node: tree, depth: 0, onChange: updateTree, onRemove: () => {
    }, canRemove: false }),
    /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
      "Path uses dot notation (e.g. ",
      /* @__PURE__ */ jsx("code", { children: "branch.id" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "author.email" }),
      "). Value can be a literal or a ",
      /* @__PURE__ */ jsx("code", { children: "$user.id" }),
      " / ",
      /* @__PURE__ */ jsx("code", { children: "$today" }),
      " / ",
      /* @__PURE__ */ jsx("code", { children: "$query.q" }),
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
  return /* @__PURE__ */ jsxs(Box, { style: {
    marginLeft: depth === 0 ? 0 : 12,
    paddingLeft: depth === 0 ? 0 : 8,
    borderLeft: depth === 0 ? "none" : `2px solid ${tokens.neutral200}`
  }, children: [
    /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", style: { padding: "2px 0" }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontFamily: tokens.monoFont, fontSize: 12 }, children: name === "*" ? /* @__PURE__ */ jsx("em", { style: { color: tokens.warning }, children: "* (populate all)" }) : name }),
      /* @__PURE__ */ jsx(
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
    childKeys.map((ck) => /* @__PURE__ */ jsx(TreeNode, { name: ck, node: node.children[ck], depth: depth + 1, onRemove }, ck))
  ] });
}
function PopulateBuilder({ value, onChange }) {
  const [paths, setPaths] = React.useState(() => populateToPaths(value));
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState("");
  const lastValueRef = React.useRef(value);
  React.useEffect(() => {
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
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsxs(Flex, { gap: 1, alignItems: "center", children: [
      /* @__PURE__ */ jsx(
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
      /* @__PURE__ */ jsx("button", { type: "button", onClick: addPath, style: {
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
    error && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "danger700", paddingTop: 1, children: error }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 2, style: {
      minHeight: 80,
      padding: 8,
      background: tokens.neutral100,
      borderRadius: tokens.radiusLarge,
      border: `1px solid ${tokens.neutral200}`
    }, children: topKeys.length === 0 ? /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
      "No populate paths. Add one above (e.g. ",
      /* @__PURE__ */ jsx("code", { children: "author" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "comments.author" }),
      ", or ",
      /* @__PURE__ */ jsx("code", { children: "*" }),
      " for all)."
    ] }) : topKeys.map((k) => /* @__PURE__ */ jsx(TreeNode, { name: k, node: tree[k], depth: 0, onRemove: removePath }, k)) })
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
  const [pairs, setPairs] = React.useState(() => objectToPairs(value));
  const lastValueRef = React.useRef(value);
  React.useEffect(() => {
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
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsxs(Box, { style: {
      padding: 8,
      background: tokens.neutral100,
      borderRadius: tokens.radiusLarge,
      border: `1px solid ${tokens.neutral200}`
    }, children: [
      pairs.length === 0 && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: emptyHint }),
      pairs.map(([k, v], idx) => /* @__PURE__ */ jsxs(Flex, { gap: 1, alignItems: "center", style: { marginBottom: 4 }, children: [
        /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsx("span", { style: { color: tokens.neutral500 }, children: ":" }),
        /* @__PURE__ */ jsx(
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
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => removeAt(idx), title: "Remove", style: {
          border: "none",
          background: "transparent",
          color: tokens.danger,
          cursor: "pointer",
          fontSize: 14,
          padding: "0 4px"
        }, children: "×" })
      ] }, idx))
    ] }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 1, children: /* @__PURE__ */ jsx("button", { type: "button", onClick: addRow, style: {
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
const BUILDERS = {
  filtersTemplate: FiltersBuilder,
  populateTemplate: PopulateBuilder,
  bodyTemplate: KeyValueEditor,
  queryTemplate: KeyValueEditor
};
const api$1 = (p) => `/api-pro${p}`;
const PAGE_SIZE$2 = 20;
const SAMPLE_CONTEXT = {
  user: { id: 9, email: "user@example.com", branch: { id: 2 } },
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
function safeParse(raw, fallback = {}) {
  if (!raw || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { __parseError: e.message };
  }
}
const InlineEditor = ({ interfaces, roles, selection, onSaved, onCancel }) => {
  const { get, put, del } = useFetchClient();
  const { interfaceKey, methodName, roleKey } = selection;
  const [templates, setTemplates] = React.useState({
    filtersTemplate: "{}",
    populateTemplate: "{}",
    bodyTemplate: "{}",
    queryTemplate: "{}"
  });
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [showRawByField, setShowRawByField] = React.useState({
    filtersTemplate: false,
    populateTemplate: false,
    bodyTemplate: false,
    queryTemplate: false
  });
  const toggleRaw = (field) => setShowRawByField((s) => ({ ...s, [field]: !s[field] }));
  React.useEffect(() => {
    if (!interfaceKey || !methodName || !roleKey) return;
    (async () => {
      try {
        const { data } = await get(api$1(`/policies/${interfaceKey}/${methodName}/${roleKey}`));
        const p = data?.data || {};
        setTemplates({
          filtersTemplate: JSON.stringify(p.filtersTemplate || {}, null, 2),
          populateTemplate: JSON.stringify(p.populateTemplate || {}, null, 2),
          bodyTemplate: JSON.stringify(p.bodyTemplate || {}, null, 2),
          queryTemplate: JSON.stringify(p.queryTemplate || {}, null, 2)
        });
      } catch {
        setTemplates({
          filtersTemplate: "{}",
          populateTemplate: "{}",
          bodyTemplate: "{}",
          queryTemplate: "{}"
        });
      }
    })();
  }, [get, interfaceKey, methodName, roleKey]);
  const previews = React.useMemo(() => {
    const out = {};
    for (const k of Object.keys(templates)) {
      const parsed = safeParse(templates[k]);
      out[k] = parsed && parsed.__parseError ? { error: parsed.__parseError } : resolveDeep(parsed, SAMPLE_CONTEXT);
    }
    return out;
  }, [templates]);
  const save = async () => {
    const payload = {
      filtersTemplate: safeParse(templates.filtersTemplate),
      populateTemplate: safeParse(templates.populateTemplate),
      bodyTemplate: safeParse(templates.bodyTemplate),
      queryTemplate: safeParse(templates.queryTemplate)
    };
    for (const [k, v] of Object.entries(payload)) {
      if (v && v.__parseError) {
        setMessage(`Invalid JSON in ${k}: ${v.__parseError}`);
        return;
      }
    }
    setLoading(true);
    setMessage("");
    try {
      await put(api$1(`/policies/${interfaceKey}/${methodName}/${roleKey}`), payload);
      onSaved?.();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Save failed.");
    } finally {
      setLoading(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete policy ${interfaceKey} / ${methodName} / ${roleKey}?`)) return;
    setLoading(true);
    try {
      await del(api$1(`/policies/${interfaceKey}/${methodName}/${roleKey}`));
      onSaved?.();
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Delete failed.");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs(Box, { style: { border: "2px solid #4945ff", borderRadius: 8, padding: 16, marginBottom: 12 }, children: [
    /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", children: [
      /* @__PURE__ */ jsxs(Typography, { variant: "delta", children: [
        "Editing: ",
        /* @__PURE__ */ jsx("code", { children: interfaceKey }),
        " / ",
        /* @__PURE__ */ jsx("code", { children: methodName }),
        " / ",
        /* @__PURE__ */ jsx("code", { children: roleKey })
      ] }),
      /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
        /* @__PURE__ */ jsx(Button, { variant: "danger-light", onClick: remove, disabled: loading, children: "Delete" }),
        /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: onCancel, children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, { onClick: save, loading, children: "Save" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral600", children: [
      "Tokens: ",
      /* @__PURE__ */ jsx("code", { children: "$user.id" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "$user.branch.id" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "$claim.roleKey" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "$claim.appName" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "$query.q" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "$params.documentId" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "$body.x" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "$today" }),
      ", ",
      /* @__PURE__ */ jsx("code", { children: "$now" })
    ] }) }),
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: "danger700", children: message }) }),
    ["filtersTemplate", "populateTemplate", "queryTemplate", "bodyTemplate"].map((field) => {
      const Builder = BUILDERS[field];
      const hasBuilder = Boolean(Builder);
      const showRaw = !hasBuilder || showRawByField[field];
      const parsedValue = (() => {
        try {
          return JSON.parse(templates[field] || "{}");
        } catch {
          return {};
        }
      })();
      return /* @__PURE__ */ jsxs(Box, { paddingTop: 3, children: [
        /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", children: [
          /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: field }),
          hasBuilder && /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => toggleRaw(field), children: showRaw ? "Use visual builder" : "Show raw JSON" })
        ] }),
        /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "flex-start", wrap: "wrap", paddingTop: 1, children: [
          /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 360px", minWidth: 300 }, children: showRaw ? /* @__PURE__ */ jsx(
            Textarea,
            {
              name: field,
              value: templates[field],
              onChange: (e) => setTemplates((t) => ({ ...t, [field]: e.target.value }))
            }
          ) : /* @__PURE__ */ jsx(
            Builder,
            {
              value: parsedValue,
              onChange: (nextObj) => setTemplates((t) => ({ ...t, [field]: JSON.stringify(nextObj || {}, null, 2) }))
            }
          ) }),
          /* @__PURE__ */ jsxs(Box, { style: { flex: "1 1 360px", minWidth: 300 }, children: [
            /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: "Resolved (sample context)" }),
            /* @__PURE__ */ jsx("pre", { style: { background: "#f4f4f8", padding: 8, borderRadius: 4, fontSize: 11, margin: 0 }, children: JSON.stringify(previews[field], null, 2) })
          ] })
        ] })
      ] }, field);
    })
  ] });
};
const Browse = ({ interfaces, roles }) => {
  const { get } = useFetchClient();
  const [interfaceKey, setInterfaceKey] = React.useState("");
  const [methodName, setMethodName] = React.useState("");
  const [roleKey, setRoleKey] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [policies, setPolicies] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState(null);
  const currentInterface = interfaces.find((i) => i.key === interfaceKey);
  const methodOptions = (currentInterface?.methods || []).map((m) => m.name);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (interfaceKey) params.set("interfaceKey", interfaceKey);
      if (methodName) params.set("methodKey", methodName);
      if (roleKey) params.set("roleKey", roleKey);
      const { data } = await get(api$1(`/policies?${params.toString()}`));
      setPolicies(data?.data || []);
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, [get, interfaceKey, methodName, roleKey]);
  React.useEffect(() => {
    load();
  }, [load]);
  React.useEffect(() => {
    setPage(1);
  }, [interfaceKey, methodName, roleKey, search]);
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter(
      (p) => (p.roleKey || "").toLowerCase().includes(q) || (p.key || "").toLowerCase().includes(q) || (p.name || "").toLowerCase().includes(q)
    );
  }, [policies, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE$2));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE$2, safePage * PAGE_SIZE$2);
  const methodNameOf = (p) => {
    const k = p.interfaceMethod?.key || "";
    const colon = k.indexOf(":");
    return colon > 0 ? k.slice(colon + 1) : p.interfaceMethod?.name || "";
  };
  const interfaceKeyOf = (p) => {
    const k = p.interfaceMethod?.key || "";
    const colon = k.indexOf(":");
    return colon > 0 ? k.slice(0, colon) : "";
  };
  const summarize = (obj) => {
    if (!obj || typeof obj !== "object") return "";
    const keys = Object.keys(obj);
    if (keys.length === 0) return "(empty)";
    return keys.slice(0, 3).join(", ") + (keys.length > 3 ? `, +${keys.length - 3}` : "");
  };
  const openEditor = (p) => setEditing({ interfaceKey: interfaceKeyOf(p), methodName: methodNameOf(p), roleKey: p.roleKey });
  const closeEditor = (refresh) => {
    setEditing(null);
    if (refresh) load();
  };
  return /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
    /* @__PURE__ */ jsxs(Flex, { gap: 3, wrap: "wrap", alignItems: "flex-end", children: [
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(
        SingleSelect,
        {
          label: "Interface",
          value: interfaceKey,
          onChange: setInterfaceKey,
          placeholder: "All interfaces",
          onClear: () => setInterfaceKey(""),
          children: interfaces.map((i) => /* @__PURE__ */ jsx(SingleSelectOption, { value: i.key, children: i.key }, i.id))
        }
      ) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(
        SingleSelect,
        {
          label: "Method",
          value: methodName,
          onChange: setMethodName,
          placeholder: "All methods",
          disabled: !currentInterface,
          onClear: () => setMethodName(""),
          children: methodOptions.map((m) => /* @__PURE__ */ jsx(SingleSelectOption, { value: m, children: m }, m))
        }
      ) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(
        SingleSelect,
        {
          label: "Role",
          value: roleKey,
          onChange: setRoleKey,
          placeholder: "All roles",
          onClear: () => setRoleKey(""),
          children: roles.map((r) => /* @__PURE__ */ jsx(SingleSelectOption, { value: r.key, children: r.key }, r.id))
        }
      ) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsx(
        TextInput,
        {
          label: "Search",
          placeholder: "role, key or name",
          value: search,
          onChange: (e) => setSearch(e.target.value)
        }
      ) }),
      /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
        filtered.length,
        " match",
        filtered.length === 1 ? "" : "es"
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Box, { paddingTop: 3, children: [
      editing && /* @__PURE__ */ jsx(
        InlineEditor,
        {
          interfaces,
          roles,
          selection: editing,
          onSaved: () => closeEditor(true),
          onCancel: () => closeEditor(false)
        }
      ),
      loading && /* @__PURE__ */ jsx(Typography, { textColor: "neutral500", children: "Loading…" }),
      !loading && paged.length === 0 && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: policies.length === 0 ? 'No policies match the current filters. Run "Re-seed from api-provider" on Domains & Roles to import defaults.' : "No policies match the search." }),
      !loading && paged.map((p) => {
        const ik = interfaceKeyOf(p);
        const mn = methodNameOf(p);
        const isOpen = editing && editing.interfaceKey === ik && editing.methodName === mn && editing.roleKey === p.roleKey;
        if (isOpen) return null;
        return /* @__PURE__ */ jsxs(
          Flex,
          {
            justifyContent: "space-between",
            alignItems: "center",
            padding: 2,
            style: { border: "1px solid #e0e0e0", borderRadius: 8, marginBottom: 6 },
            children: [
              /* @__PURE__ */ jsxs(Box, { style: { flex: 1, minWidth: 0 }, children: [
                /* @__PURE__ */ jsxs(Flex, { gap: 2, alignItems: "center", wrap: "wrap", children: [
                  /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: p.roleKey }),
                  /* @__PURE__ */ jsx("span", { style: { padding: "1px 6px", background: "#e8eaf6", borderRadius: 8, fontSize: 10 }, children: ik }),
                  /* @__PURE__ */ jsx("span", { style: { padding: "1px 6px", background: "#fff3e0", borderRadius: 8, fontSize: 10 }, children: mn })
                ] }),
                /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
                  "filters: ",
                  summarize(p.filtersTemplate),
                  " · populate: ",
                  summarize(p.populateTemplate),
                  " ·",
                  " ",
                  "body: ",
                  summarize(p.bodyTemplate),
                  " · query: ",
                  summarize(p.queryTemplate)
                ] })
              ] }),
              /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => openEditor(p), children: "Edit" })
            ]
          },
          p.id
        );
      })
    ] }),
    totalPages > 1 && /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", paddingTop: 2, children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "secondary",
          disabled: safePage <= 1,
          onClick: () => setPage((x) => Math.max(1, x - 1)),
          children: "Prev"
        }
      ),
      /* @__PURE__ */ jsxs(Typography, { variant: "pi", children: [
        "Page ",
        safePage,
        " / ",
        totalPages
      ] }),
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "secondary",
          disabled: safePage >= totalPages,
          onClick: () => setPage((x) => Math.min(totalPages, x + 1)),
          children: "Next"
        }
      )
    ] })
  ] });
};
const Comparative = ({ interfaces, roles }) => {
  const { get } = useFetchClient();
  const [interfaceKey, setInterfaceKey] = React.useState("");
  const [methodName, setMethodName] = React.useState("");
  const [selectedRoleKeys, setSelectedRoleKeys] = React.useState([]);
  const [policiesByRole, setPoliciesByRole] = React.useState({});
  const [roleSearch, setRoleSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const currentInterface = interfaces.find((i) => i.key === interfaceKey);
  const methodOptions = (currentInterface?.methods || []).map((m) => m.name);
  React.useEffect(() => {
    if (currentInterface && !methodOptions.includes(methodName)) setMethodName("");
  }, [currentInterface, methodOptions, methodName]);
  const load = React.useCallback(async () => {
    if (!interfaceKey || !methodName || selectedRoleKeys.length === 0) {
      setPoliciesByRole({});
      return;
    }
    setLoading(true);
    const out = {};
    await Promise.all(
      selectedRoleKeys.map(async (rk) => {
        try {
          const { data } = await get(api$1(`/policies/${interfaceKey}/${methodName}/${rk}`));
          out[rk] = data?.data || null;
        } catch {
          out[rk] = null;
        }
      })
    );
    setPoliciesByRole(out);
    setLoading(false);
  }, [get, interfaceKey, methodName, selectedRoleKeys]);
  React.useEffect(() => {
    load();
  }, [load]);
  const filteredRoleOptions = React.useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return roles.filter((r) => !q || (r.key || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q));
  }, [roles, roleSearch]);
  const toggleRole = (key) => {
    setSelectedRoleKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 6) return prev;
      return [...prev, key];
    });
  };
  return /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
    /* @__PURE__ */ jsxs(Flex, { gap: 3, wrap: "wrap", alignItems: "flex-end", children: [
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(SingleSelect, { label: "Interface", value: interfaceKey, onChange: setInterfaceKey, placeholder: "Choose", children: interfaces.map((i) => /* @__PURE__ */ jsx(SingleSelectOption, { value: i.key, children: i.key }, i.id)) }) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(
        SingleSelect,
        {
          label: "Method",
          value: methodName,
          onChange: setMethodName,
          placeholder: "Choose",
          disabled: !currentInterface,
          children: methodOptions.map((m) => /* @__PURE__ */ jsx(SingleSelectOption, { value: m, children: m }, m))
        }
      ) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 220px" }, children: /* @__PURE__ */ jsx(
        TextInput,
        {
          label: "Filter roles",
          placeholder: "key or name",
          value: roleSearch,
          onChange: (e) => setRoleSearch(e.target.value)
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs(Box, { paddingTop: 3, children: [
      /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral600", children: [
        "Pick up to 6 roles to compare side-by-side · ",
        selectedRoleKeys.length,
        " / 6 selected"
      ] }),
      /* @__PURE__ */ jsx(Flex, { gap: 1, wrap: "wrap", paddingTop: 1, style: { maxHeight: 100, overflowY: "auto" }, children: filteredRoleOptions.map((r) => {
        const checked = selectedRoleKeys.includes(r.key);
        const disabled = !checked && selectedRoleKeys.length >= 6;
        return /* @__PURE__ */ jsxs("label", { style: {
          cursor: disabled ? "not-allowed" : "pointer",
          padding: "2px 8px",
          border: "1px solid #ccc",
          borderRadius: 12,
          background: checked ? "#e8eaf6" : "transparent",
          fontSize: 11,
          opacity: disabled ? 0.5 : 1
        }, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              checked,
              disabled,
              onChange: () => toggleRole(r.key),
              style: { marginRight: 4 }
            }
          ),
          r.key
        ] }, r.id);
      }) })
    ] }),
    loading && /* @__PURE__ */ jsx(Typography, { textColor: "neutral500", paddingTop: 2, children: "Loading…" }),
    interfaceKey && methodName && selectedRoleKeys.length > 0 && !loading && /* @__PURE__ */ jsx(Flex, { gap: 3, paddingTop: 3, alignItems: "flex-start", style: { overflowX: "auto" }, children: selectedRoleKeys.map((rk) => {
      const p = policiesByRole[rk];
      return /* @__PURE__ */ jsxs(Box, { style: {
        flex: "0 0 280px",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: 12,
        background: p ? "transparent" : "#fafafa"
      }, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: rk }),
        p ? /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: ["filtersTemplate", "populateTemplate", "queryTemplate", "bodyTemplate"].map((f) => {
          const value = p[f];
          const isEmpty = !value || typeof value === "object" && Object.keys(value).length === 0;
          return /* @__PURE__ */ jsxs(Box, { paddingTop: 2, children: [
            /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "semiBold", textColor: "neutral600", children: f }),
            /* @__PURE__ */ jsx("pre", { style: { background: "#f4f4f8", padding: 6, borderRadius: 4, fontSize: 11, margin: 0 }, children: isEmpty ? "(empty)" : JSON.stringify(value, null, 2) })
          ] }, f);
        }) }) : /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral400", children: "No policy for this role." }) })
      ] }, rk);
    }) })
  ] });
};
const Policies = () => {
  const { get } = useFetchClient();
  const [tab, setTab] = React.useState("browse");
  const [interfaces, setInterfaces] = React.useState([]);
  const [roles, setRoles] = React.useState([]);
  React.useEffect(() => {
    (async () => {
      try {
        const [i, r] = await Promise.all([get(api$1("/interfaces")), get(api$1("/roles"))]);
        setInterfaces(i?.data?.data || []);
        setRoles(r?.data?.data || []);
      } catch {
      }
    })();
  }, [get]);
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "Method Policies" }),
    /* @__PURE__ */ jsxs(Typography, { variant: "omega", textColor: "neutral600", children: [
      interfaces.length,
      " interface(s) · ",
      roles.length,
      " role(s) available"
    ] }),
    /* @__PURE__ */ jsxs(Flex, { gap: 2, paddingTop: 2, children: [
      /* @__PURE__ */ jsx(Button, { variant: tab === "browse" ? "default" : "secondary", onClick: () => setTab("browse"), children: "Browse & Edit" }),
      /* @__PURE__ */ jsx(Button, { variant: tab === "comparative" ? "default" : "secondary", onClick: () => setTab("comparative"), children: "Comparative" })
    ] }),
    tab === "browse" ? /* @__PURE__ */ jsx(Browse, { interfaces, roles }) : /* @__PURE__ */ jsx(Comparative, { interfaces, roles })
  ] });
};
const api = (p) => `/api-pro${p}`;
const PAGE_SIZE$1 = 25;
const blankDomain = { key: "", name: "", description: "" };
const blankRole = { key: "", name: "", description: "", adminRoleCode: "", appDomains: [] };
const DomainsRoles = () => {
  const { get, post, put, del } = useFetchClient();
  const [domains, setDomains] = React.useState([]);
  const [roles, setRoles] = React.useState([]);
  const [draftDomain, setDraftDomain] = React.useState(blankDomain);
  const [draftRole, setDraftRole] = React.useState(blankRole);
  const [editingDomainId, setEditingDomainId] = React.useState(null);
  const [editingRoleId, setEditingRoleId] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [roleSearch, setRoleSearch] = React.useState("");
  const [roleDomainFilter, setRoleDomainFilter] = React.useState("");
  const [rolePage, setRolePage] = React.useState(1);
  const [seeding, setSeeding] = React.useState(false);
  const [seedResult, setSeedResult] = React.useState(null);
  const load = React.useCallback(async () => {
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
  React.useEffect(() => {
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
  const filteredRoles = React.useMemo(() => {
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
  React.useEffect(() => {
    setRolePage(1);
  }, [roleSearch, roleDomainFilter]);
  const totalRolePages = Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE$1));
  const safeRolePage = Math.min(rolePage, totalRolePages);
  const pagedRoles = filteredRoles.slice((safeRolePage - 1) * PAGE_SIZE$1, safeRolePage * PAGE_SIZE$1);
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", wrap: "wrap", gap: 2, children: [
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "App Domains & Roles" }),
        /* @__PURE__ */ jsxs(Typography, { variant: "omega", textColor: "neutral600", children: [
          domains.length,
          " domain(s) · ",
          roles.length,
          " role(s) total"
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Flex, { gap: 2, children: [
        /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: load, disabled: loading, children: "Refresh" }),
        /* @__PURE__ */ jsx(Button, { onClick: runSeed, loading: seeding, children: "Re-seed from api-provider" })
      ] })
    ] }),
    seedResult && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "success700", children: [
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
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: "danger700", children: message }) }),
    /* @__PURE__ */ jsxs(Flex, { gap: 6, alignItems: "flex-start", wrap: "wrap", paddingTop: 4, children: [
      /* @__PURE__ */ jsxs(Box, { style: { flex: "1 1 320px", minWidth: 280 }, children: [
        /* @__PURE__ */ jsxs(Typography, { variant: "delta", children: [
          "Domains (",
          domains.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs(Box, { paddingTop: 3, style: { border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: editingDomainId ? `Edit domain #${editingDomainId}` : "New domain" }),
          /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(
            TextInput,
            {
              label: "Key",
              placeholder: "e.g. web-authenticated",
              value: draftDomain.key,
              onChange: (e) => setDraftDomain({ ...draftDomain, key: e.target.value })
            }
          ) }),
          /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(
            TextInput,
            {
              label: "Name",
              value: draftDomain.name,
              onChange: (e) => setDraftDomain({ ...draftDomain, name: e.target.value })
            }
          ) }),
          /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(
            Textarea,
            {
              label: "Description",
              value: draftDomain.description,
              onChange: (e) => setDraftDomain({ ...draftDomain, description: e.target.value })
            }
          ) }),
          /* @__PURE__ */ jsxs(Flex, { gap: 2, paddingTop: 3, children: [
            /* @__PURE__ */ jsx(Button, { onClick: saveDomain, loading, children: editingDomainId ? "Update" : "Create" }),
            editingDomainId && /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => {
              setEditingDomainId(null);
              setDraftDomain(blankDomain);
            }, children: "Cancel" })
          ] })
        ] }),
        /* @__PURE__ */ jsx(Box, { paddingTop: 4, style: { maxHeight: 480, overflowY: "auto" }, children: domains.map((d) => /* @__PURE__ */ jsxs(
          Flex,
          {
            justifyContent: "space-between",
            alignItems: "center",
            padding: 2,
            style: { border: "1px solid #e0e0e0", borderRadius: 8, marginBottom: 6 },
            children: [
              /* @__PURE__ */ jsxs(Box, { children: [
                /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: d.name }),
                /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
                  d.key,
                  " · ",
                  (d.appRoles || []).length,
                  " role(s)"
                ] })
              ] }),
              /* @__PURE__ */ jsxs(Flex, { gap: 1, children: [
                /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => editDomain(d), children: "Edit" }),
                /* @__PURE__ */ jsx(Button, { variant: "danger-light", onClick: () => deleteDomain(d), children: "Delete" })
              ] })
            ]
          },
          d.id
        )) })
      ] }),
      /* @__PURE__ */ jsxs(Box, { style: { flex: "2 1 480px", minWidth: 360 }, children: [
        /* @__PURE__ */ jsxs(Typography, { variant: "delta", children: [
          "Roles (",
          roles.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs(Box, { paddingTop: 3, style: { border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: editingRoleId ? `Edit role #${editingRoleId}` : "New role" }),
          /* @__PURE__ */ jsxs(Flex, { gap: 2, paddingTop: 2, wrap: "wrap", children: [
            /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 180px" }, children: /* @__PURE__ */ jsx(
              TextInput,
              {
                label: "Key",
                placeholder: "e.g. accountant",
                value: draftRole.key,
                onChange: (e) => setDraftRole({ ...draftRole, key: e.target.value })
              }
            ) }),
            /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 180px" }, children: /* @__PURE__ */ jsx(
              TextInput,
              {
                label: "Name",
                value: draftRole.name,
                onChange: (e) => setDraftRole({ ...draftRole, name: e.target.value })
              }
            ) }),
            /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 180px" }, children: /* @__PURE__ */ jsx(
              TextInput,
              {
                label: "Admin Role Code",
                value: draftRole.adminRoleCode,
                placeholder: "(defaults to key)",
                onChange: (e) => setDraftRole({ ...draftRole, adminRoleCode: e.target.value })
              }
            ) })
          ] }),
          /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(
            Textarea,
            {
              label: "Description",
              value: draftRole.description,
              onChange: (e) => setDraftRole({ ...draftRole, description: e.target.value })
            }
          ) }),
          /* @__PURE__ */ jsxs(Box, { paddingTop: 2, children: [
            /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "Assign to domains" }),
            /* @__PURE__ */ jsx(Flex, { gap: 2, wrap: "wrap", paddingTop: 1, style: { maxHeight: 100, overflowY: "auto" }, children: domains.map((d) => {
              const id = `role-domain-${d.id}`;
              const checked = draftRole.appDomains.includes(String(d.id));
              return /* @__PURE__ */ jsxs(
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
                    /* @__PURE__ */ jsx(
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
          /* @__PURE__ */ jsxs(Flex, { gap: 2, paddingTop: 3, children: [
            /* @__PURE__ */ jsx(Button, { onClick: saveRole, loading, children: editingRoleId ? "Update" : "Create" }),
            editingRoleId && /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => {
              setEditingRoleId(null);
              setDraftRole(blankRole);
            }, children: "Cancel" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Flex, { gap: 3, paddingTop: 4, wrap: "wrap", alignItems: "flex-end", children: [
          /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 220px" }, children: /* @__PURE__ */ jsx(
            TextInput,
            {
              label: "Search roles",
              placeholder: "key or name",
              value: roleSearch,
              onChange: (e) => setRoleSearch(e.target.value)
            }
          ) }),
          /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsx(
            SingleSelect,
            {
              label: "Filter by domain",
              placeholder: "All domains",
              value: roleDomainFilter,
              onChange: (v) => setRoleDomainFilter(v || ""),
              onClear: () => setRoleDomainFilter(""),
              children: domains.map((d) => /* @__PURE__ */ jsx(SingleSelectOption, { value: String(d.id), children: d.key }, d.id))
            }
          ) }),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
            filteredRoles.length,
            " of ",
            roles.length
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Box, { paddingTop: 2, style: { maxHeight: 480, overflowY: "auto" }, children: [
          pagedRoles.length === 0 && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", paddingTop: 2, children: "No roles match the current filters." }),
          pagedRoles.map((r) => /* @__PURE__ */ jsxs(
            Flex,
            {
              justifyContent: "space-between",
              alignItems: "center",
              padding: 2,
              style: { border: "1px solid #e0e0e0", borderRadius: 8, marginBottom: 6 },
              children: [
                /* @__PURE__ */ jsxs(Box, { style: { minWidth: 0, flex: 1 }, children: [
                  /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: r.name }),
                  /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
                    r.key,
                    r.adminRoleCode && r.adminRoleCode !== r.key ? ` · admin=${r.adminRoleCode}` : ""
                  ] }),
                  /* @__PURE__ */ jsx(Flex, { gap: 1, paddingTop: 1, wrap: "wrap", children: (r.appDomains || []).map((d) => /* @__PURE__ */ jsx(
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
                /* @__PURE__ */ jsxs(Flex, { gap: 1, children: [
                  /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => editRole(r), children: "Edit" }),
                  /* @__PURE__ */ jsx(Button, { variant: "danger-light", onClick: () => deleteRole(r), children: "Delete" })
                ] })
              ]
            },
            r.id
          ))
        ] }),
        /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", paddingTop: 2, children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              variant: "secondary",
              disabled: safeRolePage <= 1,
              onClick: () => setRolePage((p) => Math.max(1, p - 1)),
              children: "Prev"
            }
          ),
          /* @__PURE__ */ jsxs(Typography, { variant: "pi", children: [
            "Page ",
            safeRolePage,
            " / ",
            totalRolePages
          ] }),
          /* @__PURE__ */ jsx(
            Button,
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
  const api2 = (path) => `/api-pro${path}`;
  const load = React.useCallback(async () => {
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
      await put(api2(`/users/${selectedUserId}/roles`), { roleIds: selectedRoleIds.map(Number) });
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
  const [page, setPage] = React.useState("domains-roles");
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

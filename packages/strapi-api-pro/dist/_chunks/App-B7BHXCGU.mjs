import { jsxs, jsx } from "react/jsx-runtime";
import React, { useState, useMemo } from "react";
import { Box, Typography, Flex, TextInput, Button, SingleSelect, SingleSelectOption, Textarea } from "@strapi/design-system";
import { useFetchClient } from "@strapi/strapi/admin";
const api$3 = (p) => `/api-pro${p}`;
const StatusBadge = ({ status }) => {
  const color = status === "recording" ? "#1f8a45" : status === "stopped" ? "#666" : "#999";
  const bg = status === "recording" ? "#e6f7ec" : status === "stopped" ? "#f0f0f0" : "#f8f8f8";
  return /* @__PURE__ */ jsx(
    "span",
    {
      style: {
        background: bg,
        color,
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase"
      },
      children: status || "unknown"
    }
  );
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
            /* @__PURE__ */ jsx(
              "span",
              {
                style: {
                  padding: "1px 6px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600
                },
                children: (entry.method || "GET").toUpperCase()
              }
            ),
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
  const loadEntries = React.useCallback(
    async (sessionId) => {
      try {
        const { data } = await get(api$3(`/recordings/${sessionId}/entries`));
        setEntries((e) => ({ ...e, [sessionId]: data?.data || [] }));
      } catch {
        setEntries((e) => ({ ...e, [sessionId]: [] }));
      }
    },
    [get]
  );
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
      /* @__PURE__ */ jsxs(Typography, { variant: "delta", children: [
        "Sessions (",
        sessions.length,
        ")"
      ] }),
      sessions.length === 0 && /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", paddingTop: 2, children: "No recording sessions yet. Start one above." }),
      sessions.map((s) => {
        const isOpen = selectedSession === s.id;
        const sessionEntries = entries[s.id] || [];
        return /* @__PURE__ */ jsxs(
          Box,
          {
            style: {
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              marginTop: 8,
              overflow: "hidden"
            },
            children: [
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
            ]
          },
          s.id
        );
      })
    ] })
  ] });
};
const api$2 = (p) => `/api-pro${p}`;
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
        maxWidth: 320
      },
      children: [
        /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: iface.name }),
        /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: iface.key }),
        /* @__PURE__ */ jsx(Box, { paddingTop: 1, children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
          iface.uid || "—",
          " · ",
          methodCount,
          " method(s) · ",
          iface.status || "manual"
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
      const { data } = await post(api$2("/interfaces/validate-alignment"), {
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
      const { data } = await post(api$2("/interfaces/preview-guided-fix"), {
        path: routePath,
        inputSignature: parseSignature()
      });
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
    /* @__PURE__ */ jsx(Box, { paddingTop: 3, children: /* @__PURE__ */ jsx(TextInput, { label: "Route path", value: routePath, onChange: (e) => setRoutePath(e.target.value) }) }),
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
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsxs(Flex, { justifyContent: "space-between", alignItems: "center", children: [
      /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "API Interfaces" }),
      /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: load, children: "Refresh" })
    ] }),
    /* @__PURE__ */ jsx(Typography, { variant: "omega", textColor: "neutral600", children: "Authored under .api-pro/interfaces/ (file = source of truth, DB = runtime mirror)." }),
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: "danger700", children: message }) }),
    /* @__PURE__ */ jsx(Flex, { gap: 3, wrap: "wrap", paddingTop: 4, children: interfaces.length === 0 ? /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: "No interfaces yet. Create one by recording API traffic, generating from a content-type, or dropping a JSON file into .api-pro/interfaces/." }) : interfaces.map((i) => /* @__PURE__ */ jsx(InterfaceCard, { iface: i, onScaffold: setScaffolding }, i.id)) }),
    /* @__PURE__ */ jsx(AlignmentPlayground, {}),
    /* @__PURE__ */ jsx(ScaffoldModal, { iface: scaffolding, onClose: () => setScaffolding(null) })
  ] });
};
const api$1 = (p) => `/api-pro${p}`;
const SAMPLE_CONTEXT = {
  user: { id: 9, email: "user@example.com", branch: { id: 2 } },
  claim: { appName: "pos-desk", domainKey: "pos-desk-cashier" },
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
    if (result === void 0 || result === null) return void 0;
    result = result[part];
  }
  return result;
}
function resolveDeep(value, context) {
  if (Array.isArray(value)) {
    return value.map((v) => resolveDeep(v, context)).filter((v) => v !== void 0);
  }
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const resolved = resolveDeep(v, context);
      if (resolved !== void 0) out[k] = resolved;
    }
    return out;
  }
  if (typeof value === "string" && value.startsWith("$")) {
    return resolveToken(value, context);
  }
  return value;
}
function safeParse(raw, fallback = {}) {
  if (!raw || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { __parseError: error.message };
  }
}
const blankPolicyTemplates = {
  filtersTemplate: {},
  populateTemplate: {},
  bodyTemplate: {},
  queryTemplate: {}
};
const Editor = ({ interfaces, roles }) => {
  const { get, put } = useFetchClient();
  const [interfaceKey, setInterfaceKey] = React.useState("");
  const [methodKey, setMethodKey] = React.useState("");
  const [roleKey, setRoleKey] = React.useState("");
  const [templates, setTemplates] = React.useState({
    filtersTemplate: "{}",
    populateTemplate: "{}",
    bodyTemplate: "{}",
    queryTemplate: "{}"
  });
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const currentInterface = React.useMemo(
    () => interfaces.find((i) => i.key === interfaceKey),
    [interfaces, interfaceKey]
  );
  const methodOptions = React.useMemo(
    () => (currentInterface?.methods || []).map((m) => ({ key: m.name, label: m.name })),
    [currentInterface]
  );
  React.useEffect(() => {
    if (currentInterface && !methodOptions.find((m) => m.key === methodKey)) {
      setMethodKey("");
    }
  }, [currentInterface, methodOptions, methodKey]);
  const loadExisting = React.useCallback(async () => {
    if (!interfaceKey || !methodKey || !roleKey) return;
    setMessage("");
    try {
      const { data } = await get(api$1(`/policies/${interfaceKey}/${methodKey}/${roleKey}`));
      const p = data?.data || blankPolicyTemplates;
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
  }, [get, interfaceKey, methodKey, roleKey]);
  React.useEffect(() => {
    loadExisting();
  }, [loadExisting]);
  const save = async () => {
    if (!interfaceKey || !methodKey || !roleKey) {
      setMessage("Select interface, method and role first.");
      return;
    }
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
      await put(api$1(`/policies/${interfaceKey}/${methodKey}/${roleKey}`), payload);
      setMessage("Saved.");
    } catch (error) {
      setMessage(error?.response?.data?.error?.message || "Save failed.");
    } finally {
      setLoading(false);
    }
  };
  const previews = React.useMemo(() => {
    const out = {};
    for (const k of Object.keys(templates)) {
      const parsed = safeParse(templates[k]);
      out[k] = parsed && parsed.__parseError ? { error: parsed.__parseError } : resolveDeep(parsed, SAMPLE_CONTEXT);
    }
    return out;
  }, [templates]);
  return /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
    /* @__PURE__ */ jsxs(Flex, { gap: 3, wrap: "wrap", children: [
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(SingleSelect, { label: "Interface", value: interfaceKey, onChange: setInterfaceKey, placeholder: "Choose", children: interfaces.map((i) => /* @__PURE__ */ jsxs(SingleSelectOption, { value: i.key, children: [
        i.key,
        " — ",
        i.name
      ] }, i.id)) }) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(SingleSelect, { label: "Method", value: methodKey, onChange: setMethodKey, placeholder: "Choose", disabled: !currentInterface, children: methodOptions.map((m) => /* @__PURE__ */ jsx(SingleSelectOption, { value: m.key, children: m.label }, m.key)) }) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(SingleSelect, { label: "Role", value: roleKey, onChange: setRoleKey, placeholder: "Choose", children: roles.map((r) => /* @__PURE__ */ jsxs(SingleSelectOption, { value: r.key, children: [
        r.key,
        " — ",
        r.name
      ] }, r.id)) }) })
    ] }),
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: message === "Saved." ? "success700" : "danger700", children: message }) }),
    /* @__PURE__ */ jsx(Box, { paddingTop: 3, children: /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral600", children: "Tokens use $-syntax: $user.id, $user.branch.id, $claim.appName, $query.q, $params.documentId, $body.x, $today, $now." }) }),
    ["filtersTemplate", "populateTemplate", "queryTemplate", "bodyTemplate"].map((field) => /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
      /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: field }),
      /* @__PURE__ */ jsxs(Flex, { gap: 3, alignItems: "flex-start", wrap: "wrap", paddingTop: 2, children: [
        /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 380px", minWidth: 300 }, children: /* @__PURE__ */ jsx(
          Textarea,
          {
            name: field,
            value: templates[field],
            onChange: (e) => setTemplates((t) => ({ ...t, [field]: e.target.value }))
          }
        ) }),
        /* @__PURE__ */ jsxs(Box, { style: { flex: "1 1 380px", minWidth: 300 }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: "Resolved (sample context)" }),
          /* @__PURE__ */ jsx("pre", { style: { background: "#f4f4f8", padding: 8, borderRadius: 4, fontSize: 12, margin: 0 }, children: JSON.stringify(previews[field], null, 2) })
        ] })
      ] })
    ] }, field)),
    /* @__PURE__ */ jsxs(Flex, { paddingTop: 4, gap: 2, children: [
      /* @__PURE__ */ jsx(Button, { onClick: save, loading, disabled: !interfaceKey || !methodKey || !roleKey, children: "Save Policy" }),
      /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: loadExisting, disabled: !interfaceKey || !methodKey || !roleKey, children: "Reload" })
    ] })
  ] });
};
const Comparative = ({ interfaces, roles }) => {
  const { get } = useFetchClient();
  const [interfaceKey, setInterfaceKey] = React.useState("");
  const [methodKey, setMethodKey] = React.useState("");
  const [policiesByRole, setPoliciesByRole] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const currentInterface = interfaces.find((i) => i.key === interfaceKey);
  const methodOptions = (currentInterface?.methods || []).map((m) => ({ key: m.name, label: m.name }));
  React.useEffect(() => {
    if (currentInterface && !methodOptions.find((m) => m.key === methodKey)) {
      setMethodKey("");
    }
  }, [currentInterface, methodOptions, methodKey]);
  const load = React.useCallback(async () => {
    if (!interfaceKey || !methodKey) return;
    setLoading(true);
    const out = {};
    await Promise.all(
      roles.map(async (r) => {
        try {
          const { data } = await get(api$1(`/policies/${interfaceKey}/${methodKey}/${r.key}`));
          out[r.key] = data?.data || null;
        } catch {
          out[r.key] = null;
        }
      })
    );
    setPoliciesByRole(out);
    setLoading(false);
  }, [get, interfaceKey, methodKey, roles]);
  React.useEffect(() => {
    load();
  }, [load]);
  return /* @__PURE__ */ jsxs(Box, { paddingTop: 4, children: [
    /* @__PURE__ */ jsxs(Flex, { gap: 3, wrap: "wrap", children: [
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(SingleSelect, { label: "Interface", value: interfaceKey, onChange: setInterfaceKey, placeholder: "Choose", children: interfaces.map((i) => /* @__PURE__ */ jsx(SingleSelectOption, { value: i.key, children: i.key }, i.id)) }) }),
      /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px", minWidth: 180 }, children: /* @__PURE__ */ jsx(SingleSelect, { label: "Method", value: methodKey, onChange: setMethodKey, placeholder: "Choose", disabled: !currentInterface, children: methodOptions.map((m) => /* @__PURE__ */ jsx(SingleSelectOption, { value: m.key, children: m.label }, m.key)) }) })
    ] }),
    loading && /* @__PURE__ */ jsx(Typography, { textColor: "neutral500", paddingTop: 2, children: "Loading…" }),
    interfaceKey && methodKey && !loading && /* @__PURE__ */ jsx(Flex, { gap: 3, paddingTop: 3, alignItems: "flex-start", style: { overflowX: "auto" }, children: roles.map((r) => {
      const p = policiesByRole[r.key];
      return /* @__PURE__ */ jsxs(
        Box,
        {
          style: {
            flex: "0 0 280px",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: 12,
            background: p ? "transparent" : "#fafafa"
          },
          children: [
            /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: r.key }),
            /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral500", children: r.name }),
            p ? /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: ["filtersTemplate", "populateTemplate", "queryTemplate", "bodyTemplate"].map((f) => {
              const value = p[f];
              const isEmpty = !value || typeof value === "object" && Object.keys(value).length === 0;
              return /* @__PURE__ */ jsxs(Box, { paddingTop: 2, children: [
                /* @__PURE__ */ jsx(Typography, { variant: "pi", fontWeight: "semiBold", textColor: "neutral600", children: f }),
                /* @__PURE__ */ jsx("pre", { style: { background: "#f4f4f8", padding: 6, borderRadius: 4, fontSize: 11, margin: 0 }, children: isEmpty ? "(empty)" : JSON.stringify(value, null, 2) })
              ] }, f);
            }) }) : /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { variant: "pi", textColor: "neutral400", children: "No policy for this role." }) })
          ]
        },
        r.id
      );
    }) })
  ] });
};
const Policies = () => {
  const { get } = useFetchClient();
  const [tab, setTab] = React.useState("editor");
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
    /* @__PURE__ */ jsxs(Flex, { gap: 2, paddingTop: 2, children: [
      /* @__PURE__ */ jsx(Button, { variant: tab === "editor" ? "default" : "secondary", onClick: () => setTab("editor"), children: "Editor" }),
      /* @__PURE__ */ jsx(Button, { variant: tab === "comparative" ? "default" : "secondary", onClick: () => setTab("comparative"), children: "Comparative" })
    ] }),
    tab === "editor" ? /* @__PURE__ */ jsx(Editor, { interfaces, roles }) : /* @__PURE__ */ jsx(Comparative, { interfaces, roles })
  ] });
};
const api = (p) => `/api-pro${p}`;
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
  const rolesByDomain = React.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    map.set("__none__", { label: "Unassigned", roles: [] });
    for (const d of domains) {
      map.set(String(d.id), { label: `${d.key} — ${d.name}`, roles: [] });
    }
    for (const r of roles) {
      const ds = Array.isArray(r.appDomains) ? r.appDomains : [];
      if (ds.length === 0) {
        map.get("__none__").roles.push(r);
      } else {
        for (const d of ds) {
          const k = String(d.id);
          if (map.has(k)) map.get(k).roles.push(r);
        }
      }
    }
    return Array.from(map.entries());
  }, [domains, roles]);
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsx(Typography, { variant: "beta", children: "App Domains & Roles" }),
    message && /* @__PURE__ */ jsx(Box, { paddingTop: 2, children: /* @__PURE__ */ jsx(Typography, { textColor: "danger700", children: message }) }),
    /* @__PURE__ */ jsxs(Flex, { gap: 6, alignItems: "flex-start", wrap: "wrap", paddingTop: 4, children: [
      /* @__PURE__ */ jsxs(Box, { style: { flex: "1 1 320px", minWidth: 280 }, children: [
        /* @__PURE__ */ jsx(Typography, { variant: "delta", children: "Domains" }),
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
            editingDomainId && /* @__PURE__ */ jsx(
              Button,
              {
                variant: "tertiary",
                onClick: () => {
                  setEditingDomainId(null);
                  setDraftDomain(blankDomain);
                },
                children: "Cancel"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx(Box, { paddingTop: 4, children: domains.map((d) => /* @__PURE__ */ jsxs(
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
        /* @__PURE__ */ jsx(Typography, { variant: "delta", children: "Roles" }),
        /* @__PURE__ */ jsxs(Box, { paddingTop: 3, style: { border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }, children: [
          /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: editingRoleId ? `Edit role #${editingRoleId}` : "New role" }),
          /* @__PURE__ */ jsxs(Flex, { gap: 2, paddingTop: 2, wrap: "wrap", children: [
            /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsx(
              TextInput,
              {
                label: "Key",
                placeholder: "e.g. web_user",
                value: draftRole.key,
                onChange: (e) => setDraftRole({ ...draftRole, key: e.target.value })
              }
            ) }),
            /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsx(
              TextInput,
              {
                label: "Name",
                value: draftRole.name,
                onChange: (e) => setDraftRole({ ...draftRole, name: e.target.value })
              }
            ) }),
            /* @__PURE__ */ jsx(Box, { style: { flex: "1 1 200px" }, children: /* @__PURE__ */ jsx(
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
            /* @__PURE__ */ jsx(Flex, { gap: 2, wrap: "wrap", paddingTop: 1, children: domains.map((d) => {
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
                    background: checked ? "#e8eaf6" : "transparent"
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
            editingRoleId && /* @__PURE__ */ jsx(
              Button,
              {
                variant: "tertiary",
                onClick: () => {
                  setEditingRoleId(null);
                  setDraftRole(blankRole);
                },
                children: "Cancel"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx(Box, { paddingTop: 4, children: rolesByDomain.map(([domainId, group]) => /* @__PURE__ */ jsxs(
          Box,
          {
            style: { border: "1px solid #e0e0e0", borderRadius: 8, marginBottom: 8, overflow: "hidden" },
            children: [
              /* @__PURE__ */ jsx(Box, { style: { padding: "6px 10px", background: "#f4f4f8" }, children: /* @__PURE__ */ jsxs(Typography, { variant: "pi", fontWeight: "semiBold", textColor: "neutral600", children: [
                group.label,
                " · ",
                group.roles.length,
                " role(s)"
              ] }) }),
              group.roles.map((r) => /* @__PURE__ */ jsxs(
                Flex,
                {
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 2,
                  style: { borderTop: "1px solid #f0f0f4" },
                  children: [
                    /* @__PURE__ */ jsxs(Box, { children: [
                      /* @__PURE__ */ jsx(Typography, { variant: "sigma", children: r.name }),
                      /* @__PURE__ */ jsxs(Typography, { variant: "pi", textColor: "neutral500", children: [
                        r.key,
                        r.adminRoleCode && r.adminRoleCode !== r.key ? ` · admin=${r.adminRoleCode}` : ""
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs(Flex, { gap: 1, children: [
                      /* @__PURE__ */ jsx(Button, { variant: "tertiary", onClick: () => editRole(r), children: "Edit" }),
                      /* @__PURE__ */ jsx(Button, { variant: "danger-light", onClick: () => deleteRole(r), children: "Delete" })
                    ] })
                  ]
                },
                `${domainId}-${r.id}`
              ))
            ]
          },
          domainId
        )) })
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

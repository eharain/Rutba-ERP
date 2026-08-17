import React, { useState } from "react";

// Renders a provider's connectionSpec (lib/providers/<p>.js → connectionSpec,
// served by /api/providers/:platform/connection-spec). Entirely driven by the
// spec: no provider is named here, so a new marketplace gets this panel by
// declaring its own spec — same contract as catalogSpec and the mapping UI.

function CopyField({ value }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked — the value is selectable in the field */ }
    };
    return (
        <div className="input-group input-group-sm">
            <input className="form-control font-monospace" value={value} readOnly onFocus={(e) => e.target.select()} />
            <button className="btn btn-outline-secondary" type="button" onClick={copy}>
                <i className={`fas ${copied ? "fa-check" : "fa-copy"} me-1`}></i>{copied ? "Copied" : "Copy"}
            </button>
        </div>
    );
}

// The written answer to the portal's "describe your app" question. Shown ready
// to copy, with a shorter variant for a length-limited field. Generated from the
// adapter's declared API scopes, so it always matches the attachment.
function ReasonBox({ reason }) {
    const [variant, setVariant] = useState("long");
    const [copied, setCopied] = useState(false);
    const text = reason[variant] || "";
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked — the textarea is selectable */ }
    };
    return (
        <>
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                <div className="btn-group btn-group-sm" role="group">
                    <button type="button" className={`btn btn-outline-secondary ${variant === "long" ? "active" : ""}`} onClick={() => setVariant("long")}>Full</button>
                    <button type="button" className={`btn btn-outline-secondary ${variant === "short" ? "active" : ""}`} onClick={() => setVariant("short")}>Short</button>
                </div>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={copy}>
                    <i className={`fas ${copied ? "fa-check" : "fa-copy"} me-1`}></i>{copied ? "Copied" : "Copy"}
                </button>
                <span className="small text-muted">{text.length} characters — use Short if the field is limited.</span>
            </div>
            <textarea
                className="form-control form-control-sm font-monospace"
                rows={10}
                value={text}
                readOnly
                onFocus={(e) => e.target.select()}
            />
        </>
    );
}

// Fill-in form for the provider's API-access application attachment, plus the
// download. The document is rendered server-side (the values are POSTed, never
// put in a URL — they are business contact details) and handed back as HTML,
// which the browser saves as a file. Following the repo convention for printable
// documents: HTML + the browser's own "Save as PDF", no server-side PDF stack.
function ApplicationDocForm({ spec, platform, seed, jwt, post, toast }) {
    const form = spec.applicationForm;
    const fields = (form && form.fields) || [];
    const [values, setValues] = useState(() => ({ ...(seed || {}) }));
    const [busy, setBusy] = useState(false);

    // `post` is injected by the page; without it (or without fields) there is
    // nothing to submit, so render nothing rather than a dead button.
    if (!form || !fields.length || typeof post !== "function") return null;

    const set = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

    const build = async () => {
        setBusy(true);
        try {
            const res = await post(`/api/providers/${platform}/application-doc`, jwt, { values });
            const blob = new Blob([res.html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = res.filename || "application.html";
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Revoke on the next tick — revoking synchronously can cancel the
            // download in some browsers before it has read the blob.
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            const missing = res.missing || [];
            toast(
                missing.length
                    ? `Downloaded — ${missing.length} field(s) left blank and marked in the document.`
                    : "Downloaded. Open it and use Print → Save as PDF to attach it.",
                missing.length ? "warning" : "success",
            );
        } catch (e) {
            toast(`Could not build the document: ${e.message}`, "danger");
        } finally {
            setBusy(false);
        }
    };

    const required = fields.filter((f) => f.required).map((f) => f.key);
    const blanks = required.filter((k) => !String(values[k] || "").trim());

    return (
        <div className="border rounded p-3 mb-3 bg-light">
            <div className="fw-semibold small mb-1">
                <i className="fas fa-file-arrow-down me-1"></i>{form.title || "Application attachment"}
            </div>
            {form.intro && <p className="small text-muted mb-2">{form.intro}</p>}

            {form.reason && (
                <div className="mb-3">
                    <div className="small fw-semibold mb-1">
                        Question 1 — &ldquo;Briefly describe your business needs, or the function or features of your APP.&rdquo;
                    </div>
                    <ReasonBox reason={form.reason} />
                </div>
            )}

            <div className="small fw-semibold mb-2">
                Question 2 — &ldquo;Upload the design documentation or data flow diagram of your APP.&rdquo;
                <span className="text-muted fw-normal"> Fill these in, then download.</span>
            </div>
            <div className="row g-2">
                {fields.map((f) => (
                    <div className="col-md-6" key={f.key}>
                        <label className="form-label mb-1 small" htmlFor={`adoc-${f.key}`}>
                            {f.label}
                            {f.required && <span className="text-danger ms-1">*</span>}
                        </label>
                        <input
                            id={`adoc-${f.key}`}
                            className="form-control form-control-sm"
                            type={f.type || "text"}
                            value={values[f.key] || ""}
                            placeholder={f.placeholder || ""}
                            autoComplete="off"
                            onChange={(e) => set(f.key, e.target.value)}
                        />
                        {f.help && <div className="form-text small">{f.help}</div>}
                    </div>
                ))}
            </div>
            <div className="d-flex align-items-center gap-2 mt-3 flex-wrap">
                <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={build}>
                    {busy
                        ? <span className="spinner-border spinner-border-sm"></span>
                        : <><i className="fas fa-download me-1"></i>Download document</>}
                </button>
                <span className="small text-muted">
                    {blanks.length
                        ? `${blanks.length} required field(s) still blank — they will download as visible “[…]” prompts.`
                        : "Open the downloaded file and use Print → Save as PDF to attach it."}
                </span>
            </div>
        </div>
    );
}

export default function ConnectionGuide({ spec, defaultOpen = true, platform, seed, jwt, post, toast }) {
    const [open, setOpen] = useState(defaultOpen);
    if (!spec) return null;

    const types = spec.accountTypes || [];
    const scopes = spec.apiScopes || [];
    const steps = spec.setupSteps || [];
    const notUsed = spec.notUsed || [];
    const issues = spec.troubleshooting || [];

    return (
        <div className="border rounded mb-2">
            <button
                type="button"
                className="btn btn-link w-100 text-start text-decoration-none px-3 py-2 d-flex justify-content-between align-items-center"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            >
                <span>
                    <i className="fas fa-circle-info me-2"></i>
                    <strong>Setting up {spec.label}</strong>
                    {spec.portal ? <span className="text-muted small ms-2">on the {spec.portal}</span> : null}
                </span>
                <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"} small`}></i>
            </button>

            {open && (
                <div className="px-3 pb-3">
                    {spec.summary && <p className="small text-muted mb-3">{spec.summary}</p>}

                    {types.length > 0 && (
                        <>
                            <div className="fw-semibold small mb-1">
                                <i className="fas fa-id-card me-1"></i>Which app / account type to apply for
                            </div>
                            <div className="row g-2 mb-2">
                                {types.map((t) => (
                                    <div className="col-md-6" key={t.key}>
                                        <div className={`border rounded h-100 p-2 ${t.recommended ? "border-success bg-success-subtle" : t.unavailable ? "bg-light opacity-75" : ""}`}>
                                            <div className="d-flex align-items-center gap-2 mb-1">
                                                <strong className="small">{t.label}</strong>
                                                {t.subtitle && <span className="badge bg-light text-dark border fw-normal">{t.subtitle}</span>}
                                                {t.recommended && <span className="badge bg-success">Use this one</span>}
                                                {t.unavailable && <span className="badge bg-secondary">Not available to you</span>}
                                            </div>
                                            <div className="small text-muted">{t.why}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="small text-muted fst-italic mb-3">
                                <i className="fas fa-triangle-exclamation me-1"></i>
                                Categories and their API grants change, and the portal is authoritative — treat this as a
                                starting point and check the API list shown on the Apply screen against the calls below.
                            </p>
                        </>
                    )}

                    <ApplicationDocForm
                        spec={spec}
                        platform={platform || spec.platform}
                        seed={seed}
                        jwt={jwt}
                        post={post}
                        toast={toast}
                    />


                    {scopes.length > 0 && (
                        <>
                            <div className="fw-semibold small mb-1">
                                <i className="fas fa-plug me-1"></i>APIs this integration actually calls
                            </div>
                            <div className="table-responsive mb-3">
                                <table className="table table-sm table-bordered mb-0 small">
                                    <thead className="table-light">
                                        <tr><th>API</th><th>Endpoints</th><th>Used for</th></tr>
                                    </thead>
                                    <tbody>
                                        {scopes.map((s) => (
                                            <tr key={s.family}>
                                                <td className="text-nowrap">
                                                    {s.family}
                                                    {s.required
                                                        ? <div><span className="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle mt-1">Required</span></div>
                                                        : <div><span className="badge bg-light text-dark border mt-1">Needed for mapping</span></div>}
                                                </td>
                                                <td>{(s.paths || []).map((p) => <div key={p}><code>{p}</code></div>)}</td>
                                                <td className="text-muted">{s.usedFor}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {notUsed.length > 0 && (
                        <>
                            <div className="fw-semibold small mb-1">
                                <i className="fas fa-ban me-1"></i>Not used — do not apply for these
                            </div>
                            <ul className="small text-muted mb-3">
                                {notUsed.map((n, i) => <li key={i}>{n}</li>)}
                            </ul>
                        </>
                    )}

                    {steps.length > 0 && (
                        <>
                            <div className="fw-semibold small mb-1"><i className="fas fa-list-ol me-1"></i>Setup steps</div>
                            <ol className="small mb-2">
                                {steps.map((s, i) => <li key={i} className="mb-1">{s}</li>)}
                            </ol>
                        </>
                    )}

                    {spec.redirectUri && (
                        <div className="mb-3">
                            <div className="small mb-1">
                                <strong>Callback URL to whitelist</strong>
                                <span className="text-muted"> — must match exactly, character for character</span>
                            </div>
                            <CopyField value={spec.redirectUri} />
                            <div className="form-text small">
                                Served by this app. If it is not a public https origin in production, the provider cannot
                                redirect back and Connect will fail — set the app PUBLIC_URL accordingly.
                            </div>
                        </div>
                    )}

                    {issues.length > 0 && (
                        <>
                            <div className="fw-semibold small mb-1"><i className="fas fa-wrench me-1"></i>If it does not work</div>
                            <dl className="small mb-0">
                                {issues.map((t, i) => (
                                    <React.Fragment key={i}>
                                        <dt className="fw-semibold">{t.symptom}</dt>
                                        <dd className="text-muted ms-3">{t.fix}</dd>
                                    </React.Fragment>
                                ))}
                            </dl>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

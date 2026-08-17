import * as XLSX from "xlsx";

/**
 * Excel round-trip for a definable workflow (api::workflow.workflow).
 *
 * A workflow is a nested structure (header + stages[] + transitions[]), so a
 * single flat sheet won't do — the workbook uses three visible sheets plus a
 * hidden `_meta` marker, mirroring the content-type guard in the CMS ExcelIO:
 *
 *   Workflow      one row: name, entity_uid, description, is_default,
 *                 is_active, documentId
 *   Stages        key, name, local_name, maps_to_status, sequence, color,
 *                 is_initial, is_terminal, pos_x, pos_y
 *   Transitions   from_key, to_key, label, approles
 *   _meta         hidden — marker "workflow" + entity_uid + exportedAt
 *
 * Import is review-then-save: parseWorkflowFromExcel returns a plain form
 * object the editor loads so the admin can verify in the designer before the
 * (admin-only) create/update call persists it. No new server endpoint — the
 * existing WorkflowsEndpoints.create/update already accept the nested arrays.
 */

const META_SHEET = "_meta";
const META_MARKER = "workflow";

const STAGE_HEADERS = ["key", "name", "local_name", "maps_to_status", "sequence", "color", "is_initial", "is_terminal", "pos_x", "pos_y"];
const TRANSITION_HEADERS = ["from_key", "to_key", "label", "approles"];
const HEADER_HEADERS = ["name", "entity_uid", "description", "is_default", "is_active", "documentId"];

function toBool(v, dflt = false) {
    if (v === true || v === false) return v;
    if (v === null || v === undefined || v === "") return dflt;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "✓"].includes(s)) return true;
    if (["false", "0", "no", "n", "—", "-"].includes(s)) return false;
    return dflt;
}

function toNumOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function safeSheetName(s) {
    // Excel sheet names: max 31 chars, no  : \ / ? * [ ]
    return String(s || "Sheet").replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
}

/**
 * Build and download a .xlsx for one workflow record (or editor form object).
 */
export function exportWorkflowToExcel(workflow) {
    const wf = workflow || {};
    const wb = XLSX.utils.book_new();

    // Header sheet — single row.
    const headerRow = {
        name: wf.name || "",
        entity_uid: wf.entity_uid || "",
        description: wf.description || "",
        is_default: wf.is_default !== false ? "true" : "false",
        is_active: wf.is_active !== false ? "true" : "false",
        documentId: wf.documentId || "",
    };
    const headerWs = XLSX.utils.json_to_sheet([headerRow], { header: HEADER_HEADERS });
    headerWs["!cols"] = [{ wch: 28 }, { wch: 34 }, { wch: 48 }, { wch: 10 }, { wch: 10 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, headerWs, "Workflow");

    // Stages sheet.
    const stageRows = (wf.stages || []).map((s) => ({
        key: s.key || "",
        name: s.name || "",
        local_name: s.local_name || "",
        maps_to_status: s.maps_to_status || "",
        sequence: s.sequence ?? "",
        color: s.color || "",
        is_initial: s.is_initial ? "true" : "false",
        is_terminal: s.is_terminal ? "true" : "false",
        pos_x: s.pos_x ?? "",
        pos_y: s.pos_y ?? "",
    }));
    const stageWs = XLSX.utils.json_to_sheet(stageRows, { header: STAGE_HEADERS });
    stageWs["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, stageWs, "Stages");

    // Transitions sheet.
    const transRows = (wf.transitions || []).map((t) => ({
        from_key: t.from_key || "",
        to_key: t.to_key || "",
        label: t.label || "",
        approles: t.approles || "",
    }));
    const transWs = XLSX.utils.json_to_sheet(transRows, { header: TRANSITION_HEADERS });
    transWs["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, transWs, "Transitions");

    // Hidden meta marker so import can refuse a non-workflow workbook.
    const metaWs = XLSX.utils.aoa_to_sheet([
        ["marker", META_MARKER],
        ["entity_uid", String(wf.entity_uid || "")],
        ["exportedAt", new Date().toISOString()],
    ]);
    XLSX.utils.book_append_sheet(wb, metaWs, META_SHEET);
    wb.Workbook = wb.Workbook || { Sheets: [] };
    wb.Workbook.Sheets = wb.Workbook.Sheets || [];
    const metaIdx = wb.SheetNames.indexOf(META_SHEET);
    if (metaIdx >= 0) wb.Workbook.Sheets[metaIdx] = { Hidden: 1 };

    const slug = String(wf.name || "workflow").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    XLSX.writeFile(wb, `workflow-${slug || "export"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function readMarker(wb) {
    const sheet = wb.Sheets?.[META_SHEET];
    if (!sheet) return null;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    for (const row of rows) {
        if (Array.isArray(row) && row[0] === "marker") return String(row[1] || "").trim() || null;
    }
    return null;
}

/**
 * Parse a workflow workbook back into an editor form object.
 * Throws with a human message if the file isn't a workflow export.
 * @returns {Promise<{name, entity_uid, description, is_default, is_active, documentId, stages[], transitions[]}>}
 */
export function parseWorkflowFromExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read the file."));
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: "array" });

                const marker = readMarker(wb);
                if (marker && marker !== META_MARKER) {
                    reject(new Error(`This workbook is not a workflow export (marker: "${marker}").`));
                    return;
                }

                const headerSheet = wb.Sheets["Workflow"];
                const stagesSheet = wb.Sheets["Stages"];
                const transSheet = wb.Sheets["Transitions"];
                if (!headerSheet || !stagesSheet) {
                    reject(new Error('Workbook must contain "Workflow" and "Stages" sheets.'));
                    return;
                }

                const headerRows = XLSX.utils.sheet_to_json(headerSheet, { defval: "" });
                const h = headerRows[0] || {};
                if (!String(h.name || "").trim() || !String(h.entity_uid || "").trim()) {
                    reject(new Error("The Workflow sheet must define a name and entity_uid."));
                    return;
                }

                const stages = XLSX.utils.sheet_to_json(stagesSheet, { defval: "" })
                    .filter((r) => String(r.key || "").trim())
                    .map((r, i) => ({
                        key: String(r.key).trim(),
                        name: String(r.name || "").trim(),
                        local_name: String(r.local_name || "").trim(),
                        maps_to_status: String(r.maps_to_status || "").trim(),
                        sequence: toNumOrNull(r.sequence) ?? (i + 1) * 10,
                        color: String(r.color || "secondary").trim() || "secondary",
                        is_initial: toBool(r.is_initial),
                        is_terminal: toBool(r.is_terminal),
                        pos_x: toNumOrNull(r.pos_x),
                        pos_y: toNumOrNull(r.pos_y),
                    }));

                const transitions = (transSheet
                    ? XLSX.utils.sheet_to_json(transSheet, { defval: "" })
                    : [])
                    .filter((r) => String(r.from_key || "").trim() && String(r.to_key || "").trim())
                    .map((r) => ({
                        from_key: String(r.from_key).trim(),
                        to_key: String(r.to_key).trim(),
                        label: String(r.label || "").trim(),
                        approles: String(r.approles || "").trim(),
                    }));

                resolve({
                    documentId: String(h.documentId || "").trim() || null,
                    name: String(h.name).trim(),
                    entity_uid: String(h.entity_uid).trim(),
                    description: String(h.description || "").trim(),
                    is_default: toBool(h.is_default, true),
                    is_active: toBool(h.is_active, true),
                    stages,
                    transitions,
                });
            } catch (err) {
                reject(new Error(`Failed to parse workbook: ${err.message || err}`));
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

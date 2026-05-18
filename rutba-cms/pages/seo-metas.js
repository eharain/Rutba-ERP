import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SeoMetasEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ListPageLayout from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

// Map entity_type → { route slug for /[documentId]/<slug>, populated relation key }.
// Mirrors pos-strapi/src/utils/seo-meta-helper.js.
const ENTITY_TYPE_META = {
    "cms-page":       { route: "cms-page",       relation: "cms_page",       label: "CMS Page" },
    "product":        { route: "product",        relation: "product",        label: "Product" },
    "category":       { route: "category",       relation: "category",       label: "Category" },
    "brand":          { route: "brand",          relation: "brand",          label: "Brand" },
    "product-group":  { route: "product-group",  relation: "product_group",  label: "Product Group" },
    "brand-group":    { route: "brand-group",    relation: "brand_group",    label: "Brand Group" },
    "category-group": { route: "category-group", relation: "category_group", label: "Category Group" },
};

const ENTITY_TYPE_OPTIONS = Object.entries(ENTITY_TYPE_META).map(([value, m]) => ({
    value,
    label: m.label,
}));

function getLinkedEntity(row) {
    const t = ENTITY_TYPE_META[row.entity_type];
    if (!t) return null;
    const rel = row[t.relation];
    if (!rel?.documentId) return null;
    return {
        documentId: rel.documentId,
        title: rel.title || rel.name || row.entity_title,
        href: `/${rel.documentId}/${t.route}`,
    };
}

const SEO_META_COLUMNS = [
    { key: "entity_title", header: "Entity Title", width: 40, isLabel: true },
    { key: "entity_type", header: "Entity Type", width: 14 },
    { key: "meta_title", header: "Meta Title", width: 45 },
    { key: "meta_description", header: "Meta Description", width: 80 },
    {
        key: "keywords",
        header: "Keywords",
        width: 45,
        format: (row) => row.keywords || "",
    },
    { key: "noindex", header: "Noindex", width: 10, format: (row) => (row.noindex ? "true" : "false") },
    {
        key: "entity_slug",
        header: "Entity Slug",
        width: 30,
        format: (row) => {
            const t = ENTITY_TYPE_META[row.entity_type];
            return (t && row[t.relation]?.slug) || "";
        },
    },
];

export default function SeoMetasPage() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [entityTypeFilter, setEntityTypeFilter] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await SeoMetasEndpoints.list({
                page,
                pageSize,
                sort: ["entity_title:asc"],
                ...(search ? { search } : {}),
                ...(entityTypeFilter ? { entityType: entityTypeFilter } : {}),
            });
            setRows(res.data || []);
            setTotal(res.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load SEO metas", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, search, entityTypeFilter, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAll = useCallback(async () => {
        const all = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await SeoMetasEndpoints.list({
                page: p,
                pageSize: PAGE,
                sort: ["entity_title:asc"],
                ...(search ? { search } : {}),
                ...(entityTypeFilter ? { entityType: entityTypeFilter } : {}),
            });
            const batch = res.data || [];
            all.push(...batch);
            if (batch.length < PAGE) break;
            p += 1;
            if (p > 500) break;
        }
        return all;
    }, [search, entityTypeFilter]);

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title="SEO Meta"
                    subtitle="One record per CMS entity. Edit inline from the entity, or open standalone from here."
                    headerActions={
                        <>
                            <input
                                type="search"
                                className="form-control form-control-sm"
                                placeholder="Search by entity title…"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                style={{ maxWidth: 240 }}
                            />
                            <select
                                className="form-select form-select-sm"
                                style={{ maxWidth: 160 }}
                                value={entityTypeFilter}
                                onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
                            >
                                <option value="">All types</option>
                                {ENTITY_TYPE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                            <button className="btn btn-sm btn-outline-secondary" onClick={load}>
                                <i className="fas fa-rotate me-1" />Refresh
                            </button>
                            <ExcelIO
                                entityLabel="SEO Meta"
                                contentType="api::seo-meta.seo-meta"
                                columns={SEO_META_COLUMNS}
                                rows={rows}
                                total={total}
                                fetchAll={fetchAll}
                                create={(data) => SeoMetasEndpoints.create(data)}
                                update={(documentId, data) => SeoMetasEndpoints.update(documentId, data)}
                                onAfterImport={load}
                            />
                        </>
                    }
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPage={setPage}
                            onPageSize={(s) => { setPageSize(s); setPage(1); }}
                            pageSizeOptions={PAGE_SIZE_OPTIONS}
                        />
                    }
                    emptyState={<div>No SEO meta records yet.</div>}
                >
                    {rows.length > 0 && (
                        <div className="table-responsive">
                            <table className="table table-hover list-table">
                                <thead>
                                    <tr>
                                        <th>Entity</th>
                                        <th>Type</th>
                                        <th>Meta Title</th>
                                        <th>Meta Description</th>
                                        <th>Keywords</th>
                                        <th>Noindex</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => {
                                        const linked = getLinkedEntity(r);
                                        const typeMeta = ENTITY_TYPE_META[r.entity_type];
                                        return (
                                            <tr key={r.documentId}>
                                                <td>
                                                    <Link href={`/${r.documentId}/seo-meta`} className="text-decoration-none fw-semibold">
                                                        {linked?.title || r.entity_title || "—"}
                                                    </Link>
                                                    {linked?.href && (
                                                        <Link
                                                            href={linked.href}
                                                            className="ms-2 small text-muted"
                                                            title="Open linked entity"
                                                        >
                                                            <i className="fas fa-external-link-alt" />
                                                        </Link>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className="list-status" style={{ background: "#6c757d", color: "#fff" }}>
                                                        {typeMeta?.label || r.entity_type || "—"}
                                                    </span>
                                                </td>
                                                <td className="text-truncate" style={{ maxWidth: 240 }}>{r.meta_title || "—"}</td>
                                                <td className="text-truncate" style={{ maxWidth: 320 }}>{r.meta_description || "—"}</td>
                                                <td className="text-truncate" style={{ maxWidth: 240 }}>
                                                    {r.keywords || "—"}
                                                </td>
                                                <td>
                                                    <span
                                                        className="list-status"
                                                        style={{ background: r.noindex ? "#dc3545" : "#198754", color: "#fff" }}
                                                    >
                                                        {r.noindex ? "yes" : "no"}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="list-actions">
                                                        <Link href={`/${r.documentId}/seo-meta`} className="btn btn-outline-primary">
                                                            <i className="fas fa-edit"></i>
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}

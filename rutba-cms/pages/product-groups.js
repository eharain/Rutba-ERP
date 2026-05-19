import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, ProductGroupsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";
import { SEO_EXCEL_COLUMNS, SEO_POPULATE, makeSeoUpsert } from "../components/seoExcel";
import { buildProductGroupWebUrl } from "../lib/cmsPageWebUrl";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

const PRODUCT_GROUP_EXCEL_COLUMNS = [
    { key: "name", isLabel: true, width: 32 },
    { key: "subtitle", width: 40 },
    { key: "slug", width: 22 },
    { key: "summary", width: 80 },
    { key: "description", width: 120 },
    ...SEO_EXCEL_COLUMNS,
];

export default function ProductGroups() {
    const { jwt } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                ProductGroupsEndpoints.listDraft({ sort: ["createdAt:desc"], populate: { gallery: true, cover_image: true, products: true, ...SEO_POPULATE }, page, pageSize }),
                ProductGroupsEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(g => g.documentId));
            const mapped = (draftRes.data || []).map(g => ({ ...g, _isPublished: pubIds.has(g.documentId) }));
            mapped.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
            setGroups(mapped);
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load product groups", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAllGroups = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await ProductGroupsEndpoints.listDraft({
                sort: ["createdAt:desc"],
                populate: { gallery: true, cover_image: true, products: true, ...SEO_POPULATE },
                page: p,
                pageSize: PAGE,
            });
            const arr = res.data || [];
            out.push(...arr);
            if (arr.length < PAGE) break;
            p += 1;
            if (p > 500) break;
        }
        return out;
    }, []);

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title="Product Groups"
                    subtitle="Product groups power the homepage banners, featured sections, and collections on the website."
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="Product Groups"
                                contentType="api::product-group.product-group"
                                columns={PRODUCT_GROUP_EXCEL_COLUMNS}
                                rows={groups}
                                total={total}
                                fetchAll={fetchAllGroups}
                                findExisting={async (row) => {
                                    if (!row.slug) return null;
                                    try {
                                        const res = await ProductGroupsEndpoints.listDraft({ pagination: { pageSize: 1 }, filters: { slug: { $eq: row.slug } }, populate: SEO_POPULATE });
                                        return res.data?.[0] || null;
                                    } catch { return null; }
                                }}
                                create={(data) => ProductGroupsEndpoints.create(data)}
                                update={(documentId, data) => ProductGroupsEndpoints.updateDraft(documentId, data)}
                                onSecondary={makeSeoUpsert("product_group", "product-group")}
                                onAfterImport={load}
                            />
                            <AddButton label="New Group" href="/new/product-group" />
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
                    emptyState={<div>No product groups found.</div>}
                >
                    {groups.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 50 }}></th>
                                    <th>Name</th>
                                    <th>Layout</th>
                                    <th>Priority</th>
                                    <th>Slug</th>
                                    <th>Products</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(g => (
                                    <tr key={g.id}>
                                        <td>
                                            {g.gallery?.url ? (
                                                <img src={MediaUtilsEndpoints.strapiImageUrl(g.gallery)} alt={g.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                                            ) : g.cover_image?.url ? (
                                                <img src={MediaUtilsEndpoints.strapiImageUrl(g.cover_image)} alt={g.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                                            ) : (
                                                <span className="text-muted"><i className="fas fa-layer-group"></i></span>
                                            )}
                                        </td>
                                        <td>{g.name}</td>
                                        <td><span className="list-status" style={{ background: '#0dcaf0', color: '#212529' }}>{g.layout || 'grid-4'}</span></td>
                                        <td>{g.priority ?? 0}</td>
                                        <td><code>{g.slug}</code></td>
                                        <td><span className="list-status" style={{ background: '#0d6efd', color: '#fff' }}>{(g.products || []).length}</span></td>
                                        <td>
                                            {g._isPublished
                                                ? <span className="list-status" style={{ background: '#198754', color: '#fff' }}>Published</span>
                                                : <span className="list-status" style={{ background: '#6c757d', color: '#fff' }}>Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${g.documentId}/product-group`}>
                                                    Edit
                                                </Link>
                                                {buildProductGroupWebUrl(g) && (
                                                    <a
                                                        className="btn btn-outline-secondary"
                                                        href={buildProductGroupWebUrl(g)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title="Open on the storefront"
                                                    >
                                                        <i className="fas fa-eye me-1"></i>View
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    )}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}


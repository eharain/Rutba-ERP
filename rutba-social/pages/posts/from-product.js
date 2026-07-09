import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, SocialPostsEndpoints, ProductsEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../../components/Toast";
import PLATFORMS from "../../components/PlatformBadge";
import Link from "next/link";

// Turn products into a shoppable social post: a caption generated from the
// product's name/price/summary + a "Shop now" deep-link to the storefront
// product page, with the product image as the cover and the product linked.
// The user reviews/edits the generated caption, picks platforms, and creates a
// draft they then publish from the editor.

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:4000";
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "Rs";

const productUrl = (p) => `${WEB_URL}/product/${encodeURIComponent(p.slug || p.documentId)}`;
const money = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString()}`;

function priceInfo(p) {
    const sp = Number(p.selling_price) || 0;
    const op = Number(p.offer_price) || 0;
    const onSale = op > 0 && op < sp;
    return { price: onSale ? op : sp, was: onSale ? sp : null };
}

function keywordsToTags(p) {
    let kws = [];
    if (Array.isArray(p.keywords)) kws = p.keywords;
    else if (typeof p.keywords === "string") kws = p.keywords.split(",");
    return kws.map((k) => String(k).trim().replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
}

function deriveTags(products) {
    const set = new Set();
    for (const p of products) for (const t of keywordsToTags(p)) set.add(t.toLowerCase());
    set.add("rutba");
    set.add("shopnow");
    return [...set].slice(0, 10);
}

function buildCaption(products) {
    if (products.length === 0) return "";
    if (products.length === 1) {
        const p = products[0];
        const { price, was } = priceInfo(p);
        const lines = [`🛍️ ${p.name}`, ""];
        const desc = String(p.summary || p.description || "").trim();
        if (desc) { lines.push(desc.length > 300 ? desc.slice(0, 297) + "…" : desc, ""); }
        lines.push(was ? `💰 ${money(price)}  (was ${money(was)})` : `💰 ${money(price)}`);
        lines.push(`🛒 Shop now: ${productUrl(p)}`);
        const tags = deriveTags([p]).map((t) => `#${t}`).join(" ");
        if (tags) lines.push("", tags);
        return lines.join("\n");
    }
    const lines = ["🛍️ Featured picks", ""];
    for (const p of products.slice(0, 8)) {
        const { price } = priceInfo(p);
        lines.push(`• ${p.name} — ${money(price)}`);
    }
    lines.push("", `🛒 Shop the collection: ${WEB_URL}/shop`);
    const tags = deriveTags(products).map((t) => `#${t}`).join(" ");
    if (tags) lines.push("", tags);
    return lines.join("\n");
}

export default function FromProductPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();

    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState([]); // full product objects
    const [platforms, setPlatforms] = useState([]);
    const [title, setTitle] = useState("");
    const [caption, setCaption] = useState("");
    const [captionDirty, setCaptionDirty] = useState(false);
    const [coverProductId, setCoverProductId] = useState(null);
    const [saving, setSaving] = useState(false);

    // ── product search ──
    const runSearch = useCallback(async () => {
        if (!jwt || !search.trim()) { setResults([]); return; }
        setSearching(true);
        try {
            const res = await ProductsEndpoints.search(search.trim(), { pageSize: 20, populate: ["logo"] });
            setResults(res.data || []);
        } catch (err) {
            console.error("Product search failed", err);
        } finally {
            setSearching(false);
        }
    }, [jwt, search]);

    useEffect(() => {
        const t = setTimeout(runSearch, 400);
        return () => clearTimeout(t);
    }, [runSearch]);

    const isSelected = (docId) => selected.some((p) => p.documentId === docId);
    const toggleProduct = (p) => {
        setSelected((prev) =>
            prev.some((x) => x.documentId === p.documentId)
                ? prev.filter((x) => x.documentId !== p.documentId)
                : [...prev, p]
        );
    };

    // ── regenerate caption/title/cover when the selection changes (unless edited) ──
    useEffect(() => {
        if (selected.length === 0) {
            if (!captionDirty) { setCaption(""); setTitle(""); }
            setCoverProductId(null);
            return;
        }
        if (!captionDirty) setCaption(buildCaption(selected));
        setTitle(selected.length === 1
            ? selected[0].name
            : `Featured: ${selected[0].name}${selected.length > 1 ? ` +${selected.length - 1} more` : ""}`);
        // default cover = first selected product that has an image
        const withImg = selected.find((p) => p.logo?.id);
        setCoverProductId((prev) => (prev && selected.some((p) => p.documentId === prev) ? prev : (withImg?.documentId || null)));
    }, [selected, captionDirty]);

    const regenerate = () => { setCaption(buildCaption(selected)); setCaptionDirty(false); };

    const togglePlatform = (key) =>
        setPlatforms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

    const coverProduct = selected.find((p) => p.documentId === coverProductId) || null;

    const handleCreate = async () => {
        if (selected.length === 0) { toast("Pick at least one product.", "warning"); return; }
        if (platforms.length === 0) { toast("Select at least one platform.", "warning"); return; }
        if (!caption.trim()) { toast("Caption is empty.", "warning"); return; }
        setSaving(true);
        try {
            const payload = {
                data: {
                    title: title || selected[0].name,
                    body: caption,
                    platforms,
                    post_status: "draft",
                    tags: deriveTags(selected),
                    products: { set: selected.map((p) => p.documentId) },
                },
            };
            const coverId = coverProduct?.logo?.id;
            if (coverId) payload.data.cover = coverId;
            const res = await SocialPostsEndpoints.create(payload);
            toast("Draft created from product(s).", "success");
            router.push(`/posts/${res.data?.documentId}`);
        } catch (err) {
            console.error("Failed to create post from product", err);
            toast(err?.response?.data?.error?.message || "Failed to create post.", "danger");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/posts"><i className="fas fa-arrow-left"></i> Back</Link>
                    <h3 className="mb-0"><i className="fas fa-tags me-2"></i>Sell a Product on Social</h3>
                </div>

                <div className="row g-3">
                    {/* Left: product picker */}
                    <div className="col-md-5">
                        <div className="card">
                            <div className="card-header d-flex align-items-center">
                                <i className="fas fa-box me-2"></i><strong>Products</strong>
                                <span className="badge bg-primary ms-2">{selected.length}</span>
                            </div>
                            <div className="card-body">
                                <input className="form-control form-control-sm mb-2" placeholder="Search products by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
                                {searching && <div className="spinner-border spinner-border-sm mb-2"></div>}

                                {selected.length > 0 && (
                                    <div className="mb-2">
                                        <small className="text-muted d-block mb-1">Selected (click the star to set the post image):</small>
                                        <div className="d-flex flex-wrap gap-2">
                                            {selected.map((p) => (
                                                <div key={p.documentId} className="d-inline-flex align-items-center gap-1 border rounded ps-1 pe-2 py-1">
                                                    <button type="button" className={`btn btn-sm p-0 border-0 ${coverProductId === p.documentId ? "text-warning" : "text-muted"}`} title="Use this product's image as the post cover" onClick={() => setCoverProductId(p.documentId)}>
                                                        <i className={`${coverProductId === p.documentId ? "fas" : "far"} fa-star`}></i>
                                                    </button>
                                                    {p.logo?.url
                                                        ? <img src={MediaUtilsEndpoints.strapiImageUrl(p.logo)} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 3 }} />
                                                        : <i className="fas fa-image text-muted" style={{ fontSize: 14 }}></i>}
                                                    <span className="small">{p.name}</span>
                                                    <button type="button" className="btn btn-sm btn-link p-0 text-danger" onClick={() => toggleProduct(p)}><i className="fas fa-times"></i></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {results.length > 0 && (
                                    <div className="list-group list-group-flush" style={{ maxHeight: 320, overflowY: "auto" }}>
                                        {results.map((p) => (
                                            <button type="button" key={p.documentId} className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${isSelected(p.documentId) ? "active" : ""}`} onClick={() => toggleProduct(p)}>
                                                {p.logo?.url
                                                    ? <img src={MediaUtilsEndpoints.strapiImageUrl(p.logo)} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />
                                                    : <span className="text-muted" style={{ width: 32, textAlign: "center" }}><i className="fas fa-image"></i></span>}
                                                <span className="flex-grow-1 text-start">{p.name}</span>
                                                <span className="small">{money(priceInfo(p).price)}</span>
                                                {isSelected(p.documentId) && <i className="fas fa-check"></i>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card mt-3">
                            <div className="card-header">Platforms</div>
                            <div className="card-body">
                                {Object.entries(PLATFORMS).map(([key, p]) => (
                                    <div className="form-check mb-2" key={key}>
                                        <input className="form-check-input" type="checkbox" id={`fp-${key}`} checked={platforms.includes(key)} onChange={() => togglePlatform(key)} />
                                        <label className="form-check-label" htmlFor={`fp-${key}`}>
                                            <i className={`${p.icon} me-1`} style={{ color: p.color }}></i>{p.label}
                                        </label>
                                    </div>
                                ))}
                                <div className="form-text">You'll pick which connected accounts to publish to in the editor.</div>
                            </div>
                        </div>
                    </div>

                    {/* Right: generated post preview */}
                    <div className="col-md-7">
                        <div className="card">
                            <div className="card-header d-flex align-items-center justify-content-between">
                                <span><i className="fas fa-wand-magic-sparkles me-2"></i>Generated Post</span>
                                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={regenerate} disabled={selected.length === 0}>
                                    <i className="fas fa-rotate me-1"></i>Regenerate caption
                                </button>
                            </div>
                            <div className="card-body">
                                <div className="mb-3">
                                    <label className="form-label">Title</label>
                                    <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label d-flex justify-content-between">
                                        <span>Caption</span>
                                        <span className="text-muted small">{caption.length} chars{captionDirty ? " · edited" : ""}</span>
                                    </label>
                                    <textarea className="form-control" rows={10} value={caption} onChange={(e) => { setCaption(e.target.value); setCaptionDirty(true); }} placeholder="Pick a product to generate a caption…" />
                                    <div className="form-text">The <strong>Shop now</strong> link points to the product page on your storefront ({WEB_URL.replace(/^https?:\/\//, "")}) — that's what turns the post into a sale.</div>
                                </div>
                                <div className="d-flex align-items-center gap-3">
                                    <div>
                                        <label className="form-label d-block">Cover image</label>
                                        {coverProduct?.logo?.url
                                            ? <img src={MediaUtilsEndpoints.strapiImageUrl(coverProduct.logo)} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid #dee2e6" }} />
                                            : <div className="bg-light border rounded d-flex align-items-center justify-content-center text-muted" style={{ width: 96, height: 96 }}><i className="fas fa-image fa-2x"></i></div>}
                                        <div className="form-text">{coverProduct ? "from " + coverProduct.name : "no image — add one in the editor"}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="card-footer d-flex gap-2">
                                <button className="btn btn-success" onClick={handleCreate} disabled={saving}>
                                    {saving ? "Creating…" : <><i className="fas fa-pen-to-square me-1"></i>Create Draft &amp; Edit</>}
                                </button>
                                <button className="btn btn-secondary" type="button" onClick={() => router.push("/posts")}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

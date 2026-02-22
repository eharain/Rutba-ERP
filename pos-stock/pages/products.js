import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, TablePagination } from "@rutba/pos-shared/components/Table";
import Layout from "../components/Layout";
import ProductCard from "@rutba/pos-shared/components/ProductCard";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { authApi } from "@rutba/pos-shared/lib/api";
import { fetchProducts } from "@rutba/pos-shared/lib/pos";
import StrapiImage from "@rutba/pos-shared/components/StrapiImage";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

function SortableHeader({ label, field, sortField, sortOrder, onSort, align }) {
    const isActive = sortField === field;
    const arrow = isActive ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';
    return (
        <TableCell
            align={align}
            onClick={() => onSort(field)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
        >
            {label}{arrow}
        </TableCell>
    );
}

export default function Products() {
    const router = useRouter();
    const [products, setProducts] = useState([]);
    const { currency } = useUtil();
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [selectedPurchase, setSelectedPurchase] = useState("");
    const [stockStatus, setStockStatus] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [sortField, setSortField] = useState('id');
    const [sortOrder, setSortOrder] = useState('desc');

    const sortString = `${sortField}:${sortOrder}`;

    const handleSort = useCallback((field) => {
        if (sortField === field) {
            setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setPage(0);
    }, [sortField]);
    async function loadProductsData() {
        setLoading(true);
        // Fetch purchases for reports
        const { data, meta } = await fetchProducts(filters, page + 1, rowsPerPage, sortString);

        setProducts(data);
        setTotal(meta.pagination.total);
        setLoading(false);
    }

    useEffect(() => {
        if (!filtersInitialized) return;
        loadProductsData();
    }, [page, rowsPerPage, filters, filtersInitialized, sortString]);

    useEffect(() => {
        Promise.all([
            authApi.getAll("/brands"),
            authApi.getAll("/categories"),
            authApi.getAll("/suppliers"),
            authApi.getAll("/term-types", { populate: ["terms"] }),
            authApi.getAll("/purchases", { sort: ["createdAt:desc"] }),
        ]).then(([b, c, s, t, p]) => {
            setBrands(b?.data || b || []);
            setCategories(c?.data || c || []);
            setSuppliers(s?.data || s || []);
            setTermTypes(t?.data || t || []);
            setPurchases(p?.data || p || []);
        });
    }, []);

    useEffect(() => {
        if (!router.isReady || filtersInitialized) {
            return;
        }

        const getQueryValue = (value) => (Array.isArray(value) ? value[0] : value);
        const { brands, categories, suppliers, terms, purchases, searchText, stockStatus } = router.query;

        if (brands) {
            setSelectedBrand(getQueryValue(brands));
        }
        if (categories) {
            setSelectedCategory(getQueryValue(categories));
        }
        if (suppliers) {
            setSelectedSupplier(getQueryValue(suppliers));
        }
        if (terms) {
            setSelectedTerm(getQueryValue(terms));
        }
        if (purchases) {
            setSelectedPurchase(getQueryValue(purchases));
        }
        if (searchText) {
            setSearchText(getQueryValue(searchText));
        }
        if (stockStatus) {
            setStockStatus(getQueryValue(stockStatus));
        }

        setFiltersInitialized(true);
    }, [router.isReady, router.query, filtersInitialized]);

    useEffect(() => {
        if (!filtersInitialized) return;

        const updatedFilters = {
            brands: [selectedBrand],
            categories: [selectedCategory],
            suppliers: [selectedSupplier],
            terms: [selectedTerm],
            purchases: [selectedPurchase],
            stockStatus,
            searchText
        };

        // Sync current filter state to URL query params (shallow to avoid full reload)
        const query = {};
        if (selectedBrand) query.brands = selectedBrand;
        if (selectedCategory) query.categories = selectedCategory;
        if (selectedSupplier) query.suppliers = selectedSupplier;
        if (selectedTerm) query.terms = selectedTerm;
        if (selectedPurchase) query.purchases = selectedPurchase;
        if (searchText) query.searchText = searchText;
        if (stockStatus) query.stockStatus = stockStatus;
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });

        for (const [key, value] of Object.entries(updatedFilters)) {
            if (Array.isArray(value)) {
                updatedFilters[key] = value.filter((v) => v);
                if (updatedFilters[key].length === 0) {
                    delete updatedFilters[key];
                }
            }
        }

        setFilters(updatedFilters);
        setPage(0);
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, stockStatus, searchText, filtersInitialized]);




    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    return (
        <ProtectedRoute>
            <PermissionCheck required="api::product.product.find">
                <Layout>
                    <div style={{ padding: 10 }}>
                        <h1>Products</h1>
                        <div>

                            <ProductFilter
                                brands={brands}
                                categories={categories}
                                suppliers={suppliers}
                                termTypes={termTypes}
                                purchases={purchases}
                                selectedBrand={selectedBrand}
                                selectedCategory={selectedCategory}
                                selectedSupplier={selectedSupplier}
                                selectedTerm={selectedTerm}
                                selectedPurchase={selectedPurchase}
                                searchText={searchText}
                                onBrandChange={setSelectedBrand}
                                onCategoryChange={setSelectedCategory}
                                onSupplierChange={setSelectedSupplier}
                                onTermChange={setSelectedTerm}
                                onPurchaseChange={setSelectedPurchase}
                                onSearchTextChange={setSearchText}
                            ></ProductFilter>
                            <TablePagination
                                count={total}
                                page={page}
                                onPageChange={handleChangePage}
                                rowsPerPage={rowsPerPage}
                                onRowsPerPageChange={handleChangeRowsPerPage}
                                rowsPerPageOptions={[5, 10, 25, 50, 100, 150, 200]}
                            />
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <SortableHeader label="id" field="id" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <SortableHeader label="Product Name" field="name" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <TableCell>Logo</TableCell>
                                        <SortableHeader label="Barcode" field="barcode" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <SortableHeader label="SKU" field="sku" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <TableCell>Suppliers</TableCell>
                                        <TableCell>Purchase #</TableCell>
                                        <SortableHeader label="Offer Price" field="offer_price" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                                        <SortableHeader label="Selling Price" field="selling_price" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                                        <SortableHeader label="Stock Quantity" field="stock_quantity" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                                        <SortableHeader label="Status" field="status" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={12} align="center">
                                                <CircularProgress size={24} />
                                            </TableCell>
                                        </TableRow>
                                    ) : products.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={12} align="center">
                                                No products found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        products.map((product) => (
                                            <TableRow key={product.id}>
                                                <TableCell title={product.documentId}>{product.id}</TableCell>
                                                <TableCell>
                                                    <Link href={`/${product.documentId ?? product.id}/product-edit`}>{product.name}</Link>
                                                </TableCell>
                                                <TableCell><StrapiImage media={product.logo} format="thumbnail" ></StrapiImage> </TableCell>
                                                <TableCell>{product.barcode}</TableCell>
                                                <TableCell>{product.sku}</TableCell>
                                                <TableCell>{product.suppliers?.map(s => s.name)}</TableCell>
                                                <TableCell>
                                                    {(product.purchase_items || []).map(pi => pi.purchase?.orderId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map((orderId, i) => (
                                                        <span key={i}>{i > 0 && ', '}<Link href={`/${product.purchase_items.find(pi => pi.purchase?.orderId === orderId)?.purchase?.documentId}/purchase-view`}>{orderId}</Link></span>
                                                    ))}
                                                </TableCell>
                                                <TableCell>{currency}{product.offer_price}</TableCell>
                                                <TableCell>{currency}{product.selling_price}</TableCell>
                                                <TableCell>{product.stock_quantity}</TableCell>
                                                <TableCell>{product.status}</TableCell>

                                                <TableCell>
                                                    <div className="d-flex gap-1">
                                                        <Link href={`/${product.documentId ?? product.id}/product-edit`} className="btn btn-sm btn-outline-primary" title="Edit">
                                                            <i className="fas fa-edit"></i>
                                                        </Link>
                                                        <Link href={`/${product.documentId ?? product.id}/product-stock-items`} className="btn btn-sm btn-outline-info" title="Stock Control">
                                                            <i className="fas fa-boxes"></i>
                                                        </Link>
                                                        <Link href={`/${product.documentId ?? product.id}/product-variants`} className="btn btn-sm btn-outline-warning" title="Variants">
                                                            <i className="fas fa-layer-group"></i>
                                                        </Link>
                                                        <Link href={`/stock-items?product=${product.documentId ?? product.id}`} className="btn btn-sm btn-outline-dark" title="Stock Items">
                                                            <i className="fas fa-barcode"></i>
                                                        </Link>
                                                        <Link href={`/${product.documentId ?? product.id}/product-relations`} className="btn btn-sm btn-outline-danger" title="Relations & Merge">
                                                            <i className="fas fa-compress-arrows-alt"></i>
                                                        </Link>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>


                            <TablePagination
                                count={total}
                                page={page}
                                onPageChange={handleChangePage}
                                rowsPerPage={rowsPerPage}
                                onRowsPerPageChange={handleChangeRowsPerPage}
                                rowsPerPageOptions={[5, 10, 25, 50, 100, 150, 200]}
                            />

                        </div>
                    </div>
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>


    );
}


export async function getServerSideProps() { return { props: {} }; }

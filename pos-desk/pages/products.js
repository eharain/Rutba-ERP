import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, TablePagination } from "../components/Table";
import Layout from "../components/Layout";
import ProductCard from "../components/ProductCard";
import ProtectedRoute from "../components/ProtectedRoute";
import PermissionCheck from "../components/PermissionCheck";
import { authApi } from "../lib/api";
import { fetchProducts } from "../lib/pos";
import { useCart } from "../context/CartContext";
import StrapiImage from "../components/StrapiImage";
import { ProductFilter } from "../components/filter/product-filter";
import { useUtil } from "../context/UtilContext";

export default function Products() {
    const router = useRouter();
    const [products, setProducts] = useState([]);
    const { currency } = useUtil();
    const { add } = useCart();
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [stockStatus, setStockStatus] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    async function loadProductsData() {
        setLoading(true);
        // Fetch purchases for reports
        const { data, meta } = await fetchProducts(filters, page + 1, rowsPerPage);

        setProducts(data);
        setTotal(meta.pagination.total);
        setLoading(false);
    }

    useEffect(() => {
        loadProductsData();
    }, [page, rowsPerPage, filters]);

    useEffect(() => {
        Promise.all([
            authApi.getAll("/brands"),
            authApi.getAll("/categories"),
            authApi.getAll("/suppliers"),
            authApi.getAll("/term-types", { populate: ["terms"] }),
        ]).then(([b, c, s, t]) => {
            setBrands(b?.data || b || []);
            setCategories(c?.data || c || []);
            setSuppliers(s?.data || s || []);
            setTermTypes(t?.data || t || []);
        });
    }, []);

    useEffect(() => {
        if (!router.isReady || filtersInitialized) {
            return;
        }

        const getQueryValue = (value) => (Array.isArray(value) ? value[0] : value);
        const { brands, categories, suppliers, terms, searchText, stockStatus } = router.query;

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
        if (searchText) {
            setSearchText(getQueryValue(searchText));
        }
        if (stockStatus) {
            setStockStatus(getQueryValue(stockStatus));
        }

        setFiltersInitialized(true);
    }, [router.isReady, router.query, filtersInitialized]);

    useEffect(() => {
        const updatedFilters = {
            brands: [selectedBrand],
            categories: [selectedCategory],
            suppliers: [selectedSupplier],
            terms: [selectedTerm],
            stockStatus,
            searchText
        };

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
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, stockStatus, searchText]);




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
                                selectedBrand={selectedBrand}
                                selectedCategory={selectedCategory}
                                selectedSupplier={selectedSupplier}
                                selectedTerm={selectedTerm}
                                searchText={searchText}
                                onBrandChange={setSelectedBrand}
                                onCategoryChange={setSelectedCategory}
                                onSupplierChange={setSelectedSupplier}
                                onTermChange={setSelectedTerm}
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
                                        <TableCell>id</TableCell>
                                        <TableCell>Product Name</TableCell>
                                        <TableCell>Logo</TableCell>
                                        <TableCell>Barcode</TableCell>
                                        <TableCell>SKU</TableCell>
                                        <TableCell>Suppliers</TableCell>
                                        <TableCell align="right">Offer Price</TableCell>
                                        <TableCell align="right">Selling Price</TableCell>
                                        <TableCell align="right">Stock Quantity</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Edit</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center">
                                                <CircularProgress size={24} />
                                            </TableCell>
                                        </TableRow>
                                    ) : products.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center">
                                                No purchases found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        products.map((product) => (
                                            <TableRow key={product.id}>
                                                <TableCell title={product.documentId}>{product.id}</TableCell>
                                                <TableCell>{product.name}</TableCell>
                                                <TableCell><StrapiImage media={product.logo} format="thumbnail" ></StrapiImage> </TableCell>
                                                <TableCell>{product.barcode}</TableCell>
                                                <TableCell>{product.sku}</TableCell>
                                                <TableCell>{product.suppliers?.map(s => s.name)}</TableCell>
                                                <TableCell>{currency}{product.offer_price}</TableCell>
                                                <TableCell>{currency}{product.selling_price}</TableCell>
                                                <TableCell>{product.stock_quantity}</TableCell>
                                                <TableCell>{product.status}</TableCell>

                                                <TableCell>
                                                    <Link href={`/${product.documentId ?? product.id}/product-edit`}> <i className="fas fa-edit"></i> Edit</Link>
                                                    <br />
                                                    <Link href={`/${product.documentId ?? product.id}/product`}> <i className="fas fa-edit"></i> Edit & Items</Link>
                                                    <br />
                                                    <Link href={`/${product.documentId ?? product.id}/product-variants`}><i className="fas fa-fighter-jet"></i> Variants</Link>
                                                    <br />
                                                    <Link href={`/stock-items?product=${product.documentId ?? product.id}`}><i className="fas fa-boxes"></i> Stock Items</Link>

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

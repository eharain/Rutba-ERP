import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, TablePagination } from "../components/Table";
import Layout from "../components/Layout";
import ProductCard from "../components/ProductCard";
import SearchBar from "../components/SearchBar";
import ProtectedRoute from "../components/ProtectedRoute";
import PermissionCheck from "../components/PermissionCheck";
import { authApi } from "../lib/api";
import { fetchEntities, fetchProducts } from "../lib/pos";
import { useCart } from "../context/CartContext";
import StrapiImage from "../components/StrapiImage";
import { ProductFilter } from "../components/filter/product-filter";
import { useUtil } from "../context/UtilContext";

export default function Products() {
    const [products, setProducts] = useState([]);
    const { currency } = useUtil();
    const { add } = useCart();
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    async function loadProductsData() {
        setLoading(true);
        // Fetch purchases for reports
        const { data, meta } = await fetchProducts(filters, page, rowsPerPage);

        setProducts(data);
        setTotal(meta.pagination.total);
        setLoading(false);
    }

    useEffect(() => {
        loadProductsData();
    }, [page, rowsPerPage]);




    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    function handleFiltersChange(filters) {
        setFilters(filters);
        setPage(0);
    }


    //const filtered = useMemo(() => {
    //    return products.filter((a) => {
    //        // const a =  p;
    //        const name = (a.name || "").toLowerCase();
    //        const barcode = (a.barcode || "");
    //        const needle = searchText.toLowerCase();
    //        return name.includes(needle) || barcode.includes(searchText);
    //    });
    //}, [products, searchText, page, total]);

    return (
        <ProtectedRoute>
            <PermissionCheck required="api::product.product.find">
                <Layout>
                    <div style={{ padding: 10 }}>
                        <h1>Products</h1>
                        <div>
                          
                            <ProductFilter onFilterChange={handleFiltersChange}></ProductFilter>
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

                                                <TableCell><Link href={`/${product.documentId ?? product.id}/product`}> <i className="fas fa-edit"></i> Edit</Link></TableCell>
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

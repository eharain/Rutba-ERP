import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import PermissionCheck from "../components/PermissionCheck";
import { fetchSales } from "../lib/pos";
import { useAuth } from "../context/AuthContext";
import Link from "next/link";
import { Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, TablePagination } from "../components/Table";
import { useUtil } from "../context/UtilContext";
export default function Sales() {
    const [sales, setSales] = useState([]);
    const { jwt } = useAuth();
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const { currency } = useUtil();
    useEffect(() => {
        (async () => {
            //const res = await authApi.fetch("/sales", { sort: ["id:desc"], pagination: { pageSize: 100 } });
            const res = await fetchSales(page + 1, rowsPerPage);
            setSales(res.data || []);
            setTotal(res.meta.pagination.total);
            setLoading(false);
        })();
    }, [jwt, page, rowsPerPage]);
    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    return (
        <ProtectedRoute>
            <PermissionCheck required="api::sale.sale.find">
                <Layout>
                    <div >
                        <h2 >Sales</h2>
                        <div >
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Number</TableCell>
                                        <TableCell>Invoice</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Buyer</TableCell>
                                        <TableCell align="right">Total</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Edit</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>

                                    {sales.length === 0 && <p>No sales yet.</p>}
                                    {sales.map(s => (
                                        <TableRow key={s.id}>
                                            <TableCell>{s.id}</TableCell>
                                            <TableCell>{s.invoice_no}</TableCell>
                                            <TableCell>{new Date(s.sale_date).toLocaleString()}</TableCell>
                                            <TableCell>{s?.customer?.name}</TableCell>
                                            <TableCell align="right">{currency}{s.total}</TableCell>
                                            <TableCell>{s.payment_status}</TableCell>
                                            <TableCell>
                                                <Link href={`/${s.documentId}/sale`} style={{textDecoration: 'none'}}>
                                                    <i className="fas fa-edit"></i> Edit
                                                </Link>
                                                {/*<Link href={`/${s.payment_status!=='Paid'?s.documentId:s.invoice_no}/sale`} style={{textDecoration: 'none'}}>*/}
                                                {/*    <i className="fas fa-edit"></i> Edit*/}
                                                {/*</Link>*/}
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                </TableBody>
                            </Table>
                            <TablePagination
                                count={total}
                                page={page}
                                onPageChange={handleChangePage}
                                rowsPerPage={rowsPerPage}
                                onRowsPerPageChange={handleChangeRowsPerPage}
                                rowsPerPageOptions={[5, 10, 25]}
                            />
                        </div>
                    </div >
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}

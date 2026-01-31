const { useState, useEffect } = require("react");
const pos = require("../lib/pos");
import { TablePagination } from "../components/Table";

export default function SearchMenu() {
    const [searchText, setSearchText] = useState("");
    const [results, setResults] = useState([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {


        loadPurchaseData();


        async function loadPurchaseData() {
            if (!searchText) return;
            setLoading(true);
            const data = await pos.featchSearch(searchText, page + 1, rowsPerPage);
            setResults(data.data || []);
            setTotal(data.meta.pagination.total);
            setLoading(false);
        }

    }, [page, rowsPerPage, searchText]);

    const SearchTerm = (sterm) => {

        setSearchText(sterm);

    }
    const handleFocus = (e) => {
        // find previous sibling input
        const prev = e.target.previousElementSibling.querySelector("input");
        if (prev && prev.tagName === "INPUT") {
            prev.focus();
        }
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };
    return (

        <div className="row ">
            <div className="p-3 bg-lightgrey border rounded">
                <input
                    type="text"
                    placeholder="Search or scan barcode..."
                    value={searchText}
                    onChange={(e) => SearchTerm(e.target.value)}
                    style={{ padding: "8px 10px", width: "100%", marginBottom: 12, borderRadius: 6, border: "1px solid #ccc" }}
                />
            </div>
            <div className="p-3 bg-lightgrey border rounded" onClick={handleFocus} onFocus={handleFocus}>
                <h4>Result {searchText}</h4>
                <ul className="list-group list-group-flush">
                    {results.map((r, i) => {
                        return (
                            <li key={r.id} className="list-group-item">
                                {i} -{r.name} - {r.data ? new Date(r.date)?.toLocaleDateString() : ''} - {r.total}
                            </li>
                        )
                    })}
                </ul>
            </div>
            <TablePagination
                count={total}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[5, 10, 25]}
            />
        </div>
    )
}
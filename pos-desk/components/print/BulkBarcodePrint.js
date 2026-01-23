import React, { useEffect, useState } from 'react';
import { authApi } from '../../lib/api';
import "./print-labels.css";
import { useUtil } from '../../context/UtilContext';
import { QRCodeSVG } from 'qrcode.react';

const BulkBarcodePrint = ({
    storageKey,
    title = "Bulk Barcode Labels",
    labelSize = '2.4x1.5',
    printMode = 'thermal'   // 'thermal' | 'a4'
}) => {

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { currency, branch } = useUtil();
    const size = labelSize || '2.4x1.5';

    function displayBranchName() {
        return branch.companyName ?? branch.company_name;
    }

    function displayName(item) {
        const name = item?.name || 'N/A';
        return name.length > 50 ? name.substring(0, 47) + '...' : name;
    }

    function displayBarcode(item) {
        return item.barcode ?? item.sku;
    }

    function displayPrice(item) {
        return currency + ' ' + Math.round(parseFloat(item.selling_price ?? item.offer_price));
    }

    useEffect(() => {
        const loadItems = async () => {
            try {
                const storedData = JSON.parse(localStorage.getItem(storageKey) || '{}');
                const documentIds = storedData.documentIds || [];

                const results = await Promise.all(
                    documentIds.map(id =>
                        authApi.get(`/stock-items/${id}`, { populate: ['product'] })
                            .then(res => res.data)
                            .catch(() => null)
                    )
                );

                setItems(results.filter(Boolean));
            } catch {
                setError("Failed to load items");
            } finally {
                setLoading(false);
            }
        };

        loadItems();
    }, [storageKey]);

    if (error) return <div className="text-danger">{error}</div>;
    if (loading) return <div>Loading...</div>;

    const labelsPerSheet = printMode === 'a4' ? { '2.4x1.5': 21, '2.25x1.25': 24, '2x1': 40, '1.5x1': 50, '1x1': 60 }[size] || 21 : 1;

    const sheets = [];
    for (let i = 0; i < items.length; i += labelsPerSheet) {
        sheets.push(items.slice(i, i + labelsPerSheet));
    }

    return (
        <div className={`container py-3 print-root ${printMode}`}>
            {sheets.map((sheet, sheetIndex) => (
                <div key={sheetIndex} className={`print-sheet sheet-${size}`}>
                    {sheet.map(item => (
                        <div key={item.id} className={`print-label label-${size}`}>

                            <div className="company">{displayBranchName()}</div>

                            <div className="row-layout">
                                <div className="left">
                                    <div className="name">{displayName(item)}</div>
                                    <div className="price">{displayPrice(item)}</div>
                                </div>

                                <div className="right">
                                    <QRCodeSVG
                                        value={displayBarcode(item)}
                                        level="M"
                                        fgColor="#000"
                                        bgColor="#fff"
                                    />
                                    <div className="barcode-text">
                                        {displayBarcode(item)}
                                    </div>
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

export default BulkBarcodePrint;

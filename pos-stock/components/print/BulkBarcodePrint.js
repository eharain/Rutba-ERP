import React, { useEffect, useState } from 'react';
import { authApi } from '@rutba/pos-shared/lib/api';
import "./print-labels.css";
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode'; // renders linear barcodes (Code39/Code128)

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
        return branch?.companyName ?? branch?.company_name ?? '';
    }

    function displayName(item) {
        const name = item?.product?.name || item?.name || 'N/A';
        return name.length > 50 ? name.substring(0, 47) + '...' : name;
    }

    function displayBarcode(item) {
        return item?.barcode || item?.sku || '';
    }

    function displayPrice(item) {
        const priceVal = item?.selling_price ?? item?.offer_price;
        return priceVal ? `${currency ?? ''} ${Math.round(parseFloat(priceVal))}` : '';
    }

    // determine if label is "small" (< 1.5 inches in either dimension)
    function isSmallLabel(labelSizeStr) {

        if (!labelSizeStr) return false;
        const parts = labelSizeStr.split('x').map(p => parseFloat(p));
        if (parts.length !== 2 || parts.some(isNaN)) return false;
        const [w, h] = parts;
        return (w < 1.25) || (h < 1.25);
    }

    const smallLabel = isSmallLabel(size);

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
                // remove storage key after loading so repeated prints won't reuse stale data
                localStorage.removeItem(storageKey);
            } catch (err) {
                console.error('BulkBarcodePrint load error', err);
                setError("Failed to load items");
            } finally {
                setLoading(false);
            }
        };

        if (storageKey) loadItems();
        else setLoading(false);
    }, [storageKey]);

    if (error) return <div className="text-danger">{error}</div>;
    if (loading) return <div>Loading...</div>;
    if (!items.length) return <div className="text-muted">No items to print.</div>;

    const labelsPerSheet = printMode === 'a4'
        ? { '2.4x1.5': 21, '2.25x1.25': 24, '2x1': 40, '1.5x1': 50, '1x1': 60 }[size] || 21
        : 1;

    const sheets = [];
    for (let i = 0; i < items.length; i += labelsPerSheet) {
        sheets.push(items.slice(i, i + labelsPerSheet));
    }

    function printRates(item,codeValue) {
        return (
            <div className="col-sm-5">
                <div className="price ">
                    {displayPrice(item)}
                </div >
                <div className="code-text">
                    {codeValue}
                </div>
            </div >
        )

    }

    return (
        <div className={`print-root ${printMode} align-middle`}>
            {sheets.map((sheet, sheetIndex) => (
                <div key={sheetIndex} className={`print-sheet sheet-${size}`}>
                    {sheet.map((item, idx) => {
                        const codeValue = displayBarcode(item);
                        const valueWithStartStop = codeValue;//`*${codeValue}*`; // use '*' start/stop (Code39-style)
                        return (
                            <div key={item.id ?? item.documentId ?? idx} className={`print-label label-${size}`}>
                                {/* Product name always on top */}
                                <div className="row  ">
                                    <div className="col-sm-12">
                                        <div className="company">
                                            {displayBranchName()}
                                        </div>
                                    </div>
                                    <div className="col-sm-12">
                                        <div className="name">
                                            {displayName(item)}
                                        </div>
                                    </div>
                                </div>

                                {/* Use Bootstrap row/cols for the main layout */}
                                <div className="row ">
                                    {smallLabel ? ("") :
                                        (<div className="col-sm-5">{printRates(item, codeValue)}</div>)}
                                                                       
                                    {codeValue ? (
                                        <div className={smallLabel ? "col-12" : "col-7"}>


                                            {smallLabel ? (
                                                // render linear barcode for small labels
                                                // Ensure start/stop characters are included (Code39 uses '*')
                                                <Barcode
                                                    value={valueWithStartStop}
                                                    format="CODE39"
                                                    lineColor="#000"
                                                    width={1}
                                                    height={36}
                                                    displayValue={false}
                                                    margin={0}
                                                />
                                            ) : (
                                                // render QR for larger labels
                                                <QRCodeSVG
                                                    value={codeValue}
                                                    level="M"
                                                    fgColor="#000"
                                                    bgColor="#fff"
                                                    size={64}
                                                />
                                            )}

                                        </div>

                                    ) : (
                                        <div className="text-muted small">No Code</div>
                                    )}

                                </div>
                            </div>
                        );
                    })}
                </div>
            ))
            }
        </div >
    );
};

export default BulkBarcodePrint;

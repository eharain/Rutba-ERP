import React, { useEffect, useState } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode'; // renders linear barcodes (Code39/Code128)
import { StockItemsEndpoints } from '@rutba/api-provider/endpoints/index.js';

const BulkBarcodePrint = ({
    storageKey,
    title = "Bulk Barcode Labels",
    labelSize = '2.4x1.5',
    printMode = 'thermal'   // 'thermal' | 'a4'
}) => {

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { currency, branch, labelPriceMode } = useUtil();
    const size = labelSize || '2.4x1.5';
    const priceMode = labelPriceMode || 'selling';

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

    /** Format a number as the configured currency, no decimals (matching
     *  the existing label convention — labels are small, decimals waste
     *  ink and rarely matter in retail). */
    function fmt(n) {
        if (n == null || isNaN(parseFloat(n))) return '';
        return `${currency || 'Rs'} ${Math.round(parseFloat(n))}`;
    }

    /** Render the price block per `labelPriceMode`:
     *    selling — selling price only
     *    offer   — offer price if set (and lower), else fall back to selling
     *    both    — selling price crossed out + offer price beside it
     *  Returns a React node (not a string) because 'both' renders two
     *  spans with strikethrough.
     */
    function renderPrice(item) {
        const sell = parseFloat(item?.selling_price);
        const offer = parseFloat(item?.offer_price);
        const hasSell = Number.isFinite(sell) && sell > 0;
        const hasOffer = Number.isFinite(offer) && offer > 0 && offer < (hasSell ? sell : Infinity);

        if (priceMode === 'offer' && hasOffer) return fmt(offer);
        if (priceMode === 'offer') return hasSell ? fmt(sell) : '';
        if (priceMode === 'both' && hasOffer && hasSell) {
            return (
                <>
                    <span style={{ textDecoration: 'line-through', color: '#888', fontWeight: 600, marginRight: 4 }}>
                        {fmt(sell)}
                    </span>
                    <span>{fmt(offer)}</span>
                </>
            );
        }
        // Default — 'selling', or 'both' with no offer set
        return hasSell ? fmt(sell) : (hasOffer ? fmt(offer) : '');
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
                    documentIds.map(id => {
                        return StockItemsEndpoints.byId(id, { populate: ['product'] })
                            .then(res => res.data)
                            .catch(() => null);
                    })
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

    function printRates(item, codeValue) {
        return (
            <>
                <div className="price">
                    {renderPrice(item)}
                </div>
                <div className="code-text">
                    {codeValue}
                </div>
            </>
        );
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

                                {/* Price/code on left, QR/barcode on right */}
                                <div className="row align-items-center">
                                    {!smallLabel && (
                                        <div className="col-7">
                                            {printRates(item, codeValue)}
                                        </div>
                                    )}

                                    {codeValue ? (
                                        <div className={smallLabel ? "col-12 text-center" : "col-5 text-end"}>
                                            {smallLabel ? (
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
                                                <QRCodeSVG
                                                    value={codeValue}
                                                    level="M"
                                                    fgColor="#000"
                                                    bgColor="#fff"
                                                    size={72}
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


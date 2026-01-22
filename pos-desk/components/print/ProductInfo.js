// file: /pos-desk/components/print/ProductInfo.js
import React from 'react';
import { useUtil } from '../../context/UtilContext';

const ProductInfo = ({ product, status, costPrice }) => {
    const productName = product?.name || 'N/A';
    const { currency } = useUtil();
    const displayName = productName.length > 50
        ? productName.substring(0, 47) + '...'
        : productName;

    return (
        <div className="product-info text-center w-100">
            <div
                className="product-name fw-bold"
                title={productName}
                style={{ fontSize: '8px', marginBottom: '3px', lineHeight: 1.1, maxHeight: '20px', overflow: 'hidden', wordBreak: 'break-word' }}
            >
                {displayName}
            </div>

            {costPrice && (
                <div className="cost-price" style={{ fontSize: '10px', color: 'black', marginTop: '2px' }}>
                    Price: {currency} {Math.round(parseFloat(costPrice))}
                </div>
            )}
        </div>
    );
};

export default ProductInfo;
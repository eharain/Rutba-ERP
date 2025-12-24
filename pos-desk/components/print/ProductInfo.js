// file: /pos-desk/components/print/ProductInfo.js
import React from 'react';
import { useUtil } from '../../context/UtilContext';

const ProductInfo = ({ product, status, costPrice }) => {
    const productName = product?.name || 'N/A';
    const { currency } = useUtil();
    // Truncate very long product names
    const displayName = productName.length > 50
        ? productName.substring(0, 47) + '...'
        : productName;

    return (
        <div className="product-info">
            <style jsx>{`
                .product-info {
                    text-align: center;
                    margin: 2px 0;
                    width: 100%;
                }
                
                .product-name {
                    font-weight: bold;
                    font-size: 8px;
                    margin-bottom: 3px;
                    line-height: 1.1;
                    max-height: 20px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    word-break: break-word;
                }
                
                .status {
                    font-size: 6px;
                    color: black;
                    text-transform: uppercase;
                    margin-top: 3px;
                    padding: 1px 4px;
                    background: grey;
                    border-radius: 2px;
                    display: inline-block;
                }
                
                .cost-price {
                    font-size: 10px;
                    color: black;
                    margin-top: 2px;
                }
                
                @media print {
                    .product-name {
                        font-size: 7px;
                    }
                }
            `}</style>

            <div className="product-name" title={productName}>
                {displayName}
            </div>

            {costPrice && (
                <div className="cost-price">
                    Price: {currency} {Math.round(parseFloat(costPrice))}
                </div>
            )}
        </div>
    );
};

export default ProductInfo;
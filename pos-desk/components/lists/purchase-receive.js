// /pos-desk/components/purchase-receive.js
import React, { useEffect, useState } from 'react';
import { authApi } from '../../lib/api';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../Table';
import {generateStockItems} from '../../lib/pos/create';
import { useUtil } from '../../context/UtilContext';

const PurchaseReceive = ({ purchase, onComplete }) => {
    const [receivedItems, setReceivedItems] = useState([]);
    const [receivingDate, setReceivingDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const { currency } = useUtil();
    // Initialize received items from purchase items
    const initializeReceivedItems = () => {
        if (purchase?.items) {
            setReceivedItems(purchase.items.map(item => ({
                ...item,
                received_quantity: item.quantity,
                stock_items: [],
                status: item.status
            })));
        }
    };
    useEffect(() => {
        initializeReceivedItems();
    }, [purchase]);
    
    const updateReceivedQuantity = (itemIndex, quantity) => {
        setReceivedItems(prev => prev.map((item, index) =>
            index === itemIndex ? { ...item, received_quantity: Math.max(0, quantity) } : item
        ));
    };

  

    const receiveItem = async (itemIndex) => {
        const item = receivedItems[itemIndex];
        if (item.received_quantity <= 0) return;

        setLoading(true);
        try {
            // Generate stock items
            const generatedStockItems = await generateStockItems(purchase,item, item.received_quantity);

            // Update purchase item with received quantity
            await authApi.put(`/purchase-items/${item.documentId}`, {
                data: {
                    received_quantity: item.received_quantity,
                    status: 'Received'
                }
            });

            // Update received items state
            setReceivedItems(prev => prev.map((it, idx) =>
                idx === itemIndex ? {
                    ...it,
                    status: 'Received',
                    stock_items: generatedStockItems
                } : it
            ));

        } catch (error) {
            console.error('Error receiving item:', error);
        } finally {
            setLoading(false);
        }
    };

    const completeReceiving = async () => {
        setLoading(true);
        try {
            // Update purchase status to "Received"
            await authApi.put(`/purchases/${purchase.documentId}`, {
                data: {
                    status: 'Received',
                    order_recieved_date: new Date().toISOString()
                }
            });

            onComplete && onComplete();
        } catch (error) {
            console.error('Error completing receiving:', error);
        } finally {
            setLoading(false);
        }
    };

    const allItemsReceived = receivedItems.every(item => item.status === 'Received');
    const totalItems = receivedItems.length;
    const receivedCount = receivedItems.filter(item => item.status === 'Received').length;

    return (
        <div style={{ padding: '20px' }}>
            <h2>Receive Purchase: {purchase.orderId}</h2>

            <div style={{ marginBottom: '20px' }}>
                <label>Receiving Date: </label>
                <input
                    type="date"
                    value={receivingDate}
                    onChange={(e) => setReceivingDate(e.target.value)}
                    style={{ padding: '5px' }}
                />
            </div>

            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell>Ordered Qty</TableCell>
                        <TableCell>Receive Qty</TableCell>
                        <TableCell>Unit Price</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Action</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {receivedItems.map((item, index) => (
                        <TableRow key={item.documentId}>
                            <TableCell>
                                <strong>{item.product?.name}</strong>
                                {item.product?.barcode && (
                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                        Barcode: {item.product.barcode}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                                <input
                                    type="number"
                                    min="0"
                                    max={item.quantity}
                                    value={item.received_quantity}
                                    onChange={(e) => updateReceivedQuantity(index, parseInt(e.target.value))}
                                    disabled={item.status === 'Received'}
                                    style={{ width: '80px', padding: '5px' }}
                                />
                            </TableCell>
                            <TableCell>{currency}{item.unit_price?.toFixed(2)}</TableCell>
                            <TableCell>
                                <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: item.status === 'Received' ? '#28a745' : '#ffc107',
                                    color: 'grey',
                                    fontSize: '12px'
                                }}>
                                    {item.status}
                                </span>
                            </TableCell>
                            <TableCell>
                                {item.status !== 'Received' ? (
                                    <button
                                        onClick={() => receiveItem(index)}
                                        disabled={loading || item.received_quantity <= 0}
                                        style={{
                                            padding: '5px 10px',
                                            background: '#007bff',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px'
                                        }}
                                    >
                                        Receive
                                    </button>
                                ) : (
                                    <span style={{ color: 'green' }}>✓ Received</span>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <div style={{ marginTop: '20px' }}>
                <p>Progress: {receivedCount} of {totalItems} items received</p>
                {allItemsReceived && (
                    <button
                        onClick={completeReceiving}
                        disabled={loading}
                        style={{
                            padding: '10px 20px',
                            background: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '16px'
                        }}
                    >
                        {loading ? 'Completing...' : 'Complete Receiving'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default PurchaseReceive;
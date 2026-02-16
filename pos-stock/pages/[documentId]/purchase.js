import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { authApi } from "@rutba/pos-shared/lib/api";
import { fetchPurchaseByIdDocumentIdOrPO, fetchEnumsValues, savePurchaseItem } from "@rutba/pos-shared/lib/pos";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Layout from "../../components/Layout";
import PurchaseItemsList from "../../components/lists/purchase-items-list";
import { generateNextDocumentId, generateNextPONumber, getUser } from "@rutba/pos-shared/lib/utils";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

export default function PurchasePage() {
    const router = useRouter();
    const { documentId } = router.query;
    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editItems, setEditItems] = useState([]);
    const [editingDocumentId, setEditingDocumentId] = useState(null);
    const [currentStatus, setCurrentStatus] = useState(null);
    const {currency} = useUtil();

    useEffect(() => {
        if (!documentId) return;

        if (documentId === 'new') {
            const newPurchase = {
                orderId: generateNextPONumber(),
                order_date: new Date().toISOString(),
                total: 0,
                status: 'Draft',
                items: [],
            };
            setPurchase(newPurchase);
            setCurrentStatus('Draft');
            setEditItems([]);
            setLoading(false);
            return;
        }

        const loadData = async () => {
            setLoading(true);
            try {
                const [purchaseData] = await Promise.all([
                    fetchPurchaseByIdDocumentIdOrPO(documentId),
                ]);

                setPurchase(purchaseData);
                setCurrentStatus(purchaseData?.status || 'Draft');
                setEditItems(purchaseData.items?.map(item => ({
                    ...item,
                    product: item.product || null,
                    // Handle different field names from your API
                    price: item.unit_price || item.price || 0,
                    quantity: item.quantity || 0,
                    total: (item.quantity || 0) * (item.unit_price || item.price || 0)
                })) || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [documentId]);

    const handleEdit = (documentId) => {
        setEditingDocumentId(documentId);
    };

    const handleCancel = () => {
        setEditItems(editItems.filter(item => item.documentId !== editingDocumentId));
        setEditingDocumentId(null);
        
    };

    const handleSave = async (updatedData) => {
        try {

            const savedItem = await saveItemdData(updatedData);
            appendItemToItems(savedItem);

            setEditingDocumentId(null);
        } catch (err) {
            console.error(err,up);
            alert('handleSave',err.message);
        }
    };

    async function ensurePurchaseCreated() {
        if (purchase.documentId) return purchase;
        const user = getUser();
        const res = await authApi.post('/purchases', {
            data: {
                orderId: purchase.orderId,
                order_date: purchase.order_date,
                total: 0,
                status: 'Draft',
                owners: { connect: [user.documentId] },
            }
        });
        const created = res?.data ?? res;
        const updatedPurchase = { ...purchase, ...created };
        setPurchase(updatedPurchase);
        router.replace(`/${created.documentId}/purchase`);
        return updatedPurchase;
    }

    async function saveItemdData(newItemData) {
        const currentPurchase = await ensurePurchaseCreated();
        const bundle_units = newItemData.product?.bundle_units ?? 1
        const unit_price = Number(newItemData.price) / bundle_units;

        const data = {
            product: newItemData.product,
            purchase: currentPurchase,
            quantity: Number(newItemData.quantity),
            price: Number(newItemData.price),
            unit_price,
            bundle_units,
            status:newItemData.status || 'Draft',
        }
        const savedItem = await savePurchaseItem(data);
        return savedItem;
    }

    async function appendItemToItems(updatedItem) {
        // const savedItem = await saveItemdData(newItemData);
        const items = [...editItems];
        let itemIndex = items.findIndex(item => item.documentId === editingDocumentId);
        if (itemIndex > -1) {
            items[itemIndex] = updatedItem;
        } else {
            items.push(updatedItem);
        }

        setEditItems(items)
        
        return updatedItem;
    }



    const handleStatusChange = async (newStatus) => {
        try {
            setCurrentStatus(newStatus);  
            if(['Submitted','Partially Received'].includes(newStatus)){
                if (editItems.length > 0){
                    if(confirm(`You won't be able to edit this purchase after submitting. Do you want to proceed?`)) {
                        const res = await authApi.put(`/purchases/${purchase.documentId}`, {
                            data: { status: newStatus }
                        });
                        router.push(`/${purchase.documentId}/purchase-receive`);
                        return;
                    }
                    else {
                        setCurrentStatus('Draft');
                        return;
                    }
                } else {
                    alert('Please add at least one item to the purchase');
                    setCurrentStatus('Draft');
                }
            }

        } catch (err) {
            alert(err.message);
        }
    };

    const handleAddNewItem = () => {
        const newItem = {
            documentId: generateNextDocumentId(),
            quantity: 1,
            price: 0,
            total: 0,
            product: null,
            purchase
        };
        appendItemToItems(newItem);
        setEditingDocumentId(newItem.documentId);
    };


    const handleDeleteItem = async (documentId) => {
        if (!confirm("Are you sure you want to delete this item?")) return;

        try {
            if(editItems.find(item => item.documentId === documentId)?.id>0){
                        const res = await authApi.del(`/purchase-items/${documentId}`);
            }
            setEditItems(editItems.filter(item => item.documentId !== documentId));
        } catch (err) {
            alert(err.message);
             throw new Error("Failed to delete item");
        }
    };

    if (loading) return (
        <ProtectedRoute>
            <Layout>
                <div className="state-message">Loading purchase...</div>
            </Layout>
        </ProtectedRoute>
    );

    if (error) return (
        <ProtectedRoute>
            <Layout>
                <div className="state-message state-message--error">Error: {error}</div>
            </Layout>
        </ProtectedRoute>
    );

    if (!purchase) return (
        <ProtectedRoute>
            <Layout>
                <div className="state-message">No purchase found.</div>
            </Layout>
        </ProtectedRoute>
    );

    return (
        <ProtectedRoute>
            <Layout>
                <div className="page-content">
                    {/* Back to Purchases List */}
                    <div className="action-row">
                        <button
                            onClick={() => router.push('/purchases')}
                            className="btn btn-outline-primary"
                        >
                            ← Back to Purchases
                        </button>
                    </div>

                    <h1>Purchase #{purchase.orderId || purchase.documentId}</h1>

                    {/* Purchase Header Info */}
                    <div className="content-card section-spacing" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '10px'
                    }}>
                        <div><strong>Supplier:</strong> {purchase.supplier?.name || "N/A"}</div>
                        <div><strong>Date:</strong> {purchase.order_date ? new Date(purchase.order_date).toLocaleDateString() : 'N/A'}</div>
                        <div><strong>Invoice:</strong> {purchase.orderId || "N/A"}</div>
                        <div>
                            <strong>Status:</strong>
                            <select
                                value={currentStatus}
                                onChange={(e) => handleStatusChange(e.target.value)}
                                className="form-select form-select-sm d-inline-block w-auto ms-2"
                            >
                                <option value="Draft">Draft</option>
                                <option value="Submitted">Submitted</option>
                                <option value="Partially Received">Partially Received</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div><strong>Total:</strong> {currency}{parseFloat(purchase.total || 0).toFixed(2)}</div>
                    </div>

                    <h2>Items</h2>

                    {/* Purchase Items List */}
                    <PurchaseItemsList
                        purchaseItems={editItems}
                        editingDocumentId={editingDocumentId}
                        onEditItem={handleEdit}
                        onDeleteItem={handleDeleteItem}
                        onSaveItem={handleSave}
                        onCancelEdit={handleCancel}
                    />

                    {/* Add New Item Button */}
                    {!editingDocumentId && (
                        <div className="mt-3">
                            <button
                                onClick={handleAddNewItem}
                                className="btn btn-success"
                            >
                                + Add New Item
                            </button>
                        </div>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }

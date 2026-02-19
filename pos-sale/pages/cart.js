import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { useCart } from "@rutba/pos-shared/context/CartContext";
import CartItem from "../components/CartItem";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function Cart() {
    const { cartItems, setQty, remove, clear, total } = useCart();
    const { jwt, permissions } = useAuth();

    async function checkout() {
        if (!permissions.includes("api::sale.sale.create")) {
            alert("You do not have permission to create sales.");
            return;
        }
        // 1) create sale
        const sale = await authApi.post("/sales", {
            data: {
                sale_date: new Date().toISOString(),
                subtotal: total,
                discount: 0,
                tax: 0,
                total,
                payment_status: "Paid"
            }
        }, jwt);

        const saleId = sale?.data?.id;
        if (!saleId) {
            alert("Failed to create sale");
            return;
        }

        // 2) create sale-items
        for (const item of cartItems) {
            const productId = item.id || item?.attributes?.id || item?.attributes?.product?.data?.id;
            const price = item?.attributes?.selling_price ?? item?.selling_price ?? 0;
            const qty = item.__qty || 1;

            await authApi.post("/sale-items", {
                data: {
                    quantity: qty,
                    price,
                    discount: 0,
                    tax: 0,
                    total: price * qty,
                    product: productId,
                    sale: saleId
                }
            }, jwt);
        }

        clear();
        alert(`Sale #${saleId} completed.`);
    }

    return (
        <ProtectedRoute>
            <PermissionCheck required="api::sale-item.sale-item.create">
                <Layout>
                    <h1>Cart</h1>
                    {cartItems.length === 0 ? <p>No items.</p> : (
                        <>
                            {cartItems.map((it) => (
                                <CartItem
                                    key={it.id}
                                    item={it}
                                    onRemove={() => remove(it.id)}
                                    onQty={(qty) => setQty(it.id, qty)}
                                />
                            ))}
                            <h3>Total: ${total.toFixed(2)}</h3>
                            <PermissionCheck requested="api::sale.sale.create">
                                <button onClick={checkout}>Checkout</button>
                            </PermissionCheck>
                        </>
                    )}
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}


export async function getServerSideProps() { return { props: {} }; }

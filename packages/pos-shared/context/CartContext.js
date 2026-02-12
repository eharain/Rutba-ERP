'use strict';
import { createContext, useContext, useEffect, useState } from "react";
import { storage } from "../lib/storage";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    const stored = storage.getJSON("cart") ??[];
      setCartItems(stored);
    
  }, []);

  useEffect(() => {
      storage.setJSON("cart", cartItems);
    
  }, [cartItems]);

  const add = (product) => {
    setCartItems(prev => {
      const idx = prev.findIndex(p => p.id === product.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].__qty = (copy[idx].__qty || 1) + 1;
        return copy;
      }
      return [...prev, { ...product, __qty: 1 }];
    });
  };

  const remove = (id) => setCartItems(prev => prev.filter(p => p.id !== id));
  const clear = () => setCartItems([]);

  const setQty = (id, qty) => {
    setCartItems(prev => prev.map(p => p.id === id ? { ...p, __qty: Math.max(1, qty) } : p));
  };

  const total = cartItems.reduce((sum, p) => sum + (p.attributes?.selling_price || p.selling_price || 0) * (p.__qty || 1), 0);

  return (
    <CartContext.Provider value={{ cartItems, add, remove, clear, setQty, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

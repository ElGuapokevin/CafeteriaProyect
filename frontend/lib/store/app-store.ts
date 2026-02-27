import { create } from "zustand";
import { CartItem, CreateOrderResponse, UserSession } from "@/lib/api/types";

interface AppState {
  user: UserSession | null;
  cart: CartItem[];
  lastOrder: CreateOrderResponse["orden"] | null;
  setUser: (user: UserSession | null) => void;
  addToCart: (item: Omit<CartItem, "cantidad">) => void;
  removeFromCart: (idplatillo: number) => void;
  clearCart: () => void;
  setLastOrder: (order: CreateOrderResponse["orden"] | null) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  cart: [],
  lastOrder: null,
  setUser: (user) => set({ user }),
  addToCart: (item) =>
    set((state) => {
      const existing = state.cart.find((cartItem) => cartItem.idplatillo === item.idplatillo);
      if (existing) {
        return {
          cart: state.cart.map((cartItem) =>
            cartItem.idplatillo === item.idplatillo
              ? { ...cartItem, cantidad: cartItem.cantidad + 1 }
              : cartItem,
          ),
        };
      }
      return { cart: [...state.cart, { ...item, cantidad: 1 }] };
    }),
  removeFromCart: (idplatillo) =>
    set((state) => ({
      cart: state.cart
        .map((item) => (item.idplatillo === idplatillo ? { ...item, cantidad: item.cantidad - 1 } : item))
        .filter((item) => item.cantidad > 0),
    })),
  clearCart: () => set({ cart: [] }),
  setLastOrder: (lastOrder) => set({ lastOrder }),
  logout: () => set({ user: null, cart: [], lastOrder: null }),
}));

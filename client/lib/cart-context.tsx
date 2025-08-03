import React, { createContext, useContext, useReducer, ReactNode } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  billingCycle: 'monthly' | 'annual';
  users: number;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

interface CartContextType extends CartState {
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateUsers: (id: string, users: number) => void;
  updateBillingCycle: (id: string, billingCycle: 'monthly' | 'annual') => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  getTotalPrice: () => number;
  getItemCount: () => number;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: Omit<CartItem, 'quantity'> }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'UPDATE_USERS'; payload: { id: string; users: number } }
  | { type: 'UPDATE_BILLING_CYCLE'; payload: { id: string; billingCycle: 'monthly' | 'annual' } }
  | { type: 'CLEAR_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' };

const CartContext = createContext<CartContextType | undefined>(undefined);

const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingItem = state.items.find(item => item.id === action.payload.id);
      if (existingItem) {
        return {
          ...state,
          items: state.items.map(item =>
            item.id === action.payload.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.payload, quantity: 1 }],
      };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.payload),
      };

    case 'UPDATE_QUANTITY':
      if (action.payload.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter(item => item.id !== action.payload.id),
        };
      }
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.id
            ? { ...item, quantity: action.payload.quantity }
            : item
        ),
      };

    case 'UPDATE_USERS':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.id
            ? { 
                ...item, 
                users: action.payload.users,
                price: calculatePriceForUsers(action.payload.users, item.billingCycle)
              }
            : item
        ),
      };

    case 'UPDATE_BILLING_CYCLE':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.id
            ? { 
                ...item, 
                billingCycle: action.payload.billingCycle,
                price: calculatePriceForUsers(item.users, action.payload.billingCycle)
              }
            : item
        ),
      };

    case 'CLEAR_CART':
      return {
        ...state,
        items: [],
      };

    case 'OPEN_CART':
      return {
        ...state,
        isOpen: true,
      };

    case 'CLOSE_CART':
      return {
        ...state,
        isOpen: false,
      };

    default:
      return state;
  }
};

const calculatePriceForUsers = (users: number, billingCycle: 'monthly' | 'annual'): number => {
  const basePrice = 9.95; // per user per month
  const monthlyTotal = basePrice * users;
  
  if (billingCycle === 'annual') {
    // 20% discount for annual billing
    return monthlyTotal * 12 * 0.8;
  }
  
  return monthlyTotal;
};

const initialState: CartState = {
  items: [],
  isOpen: false,
};

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  const addItem = (item: Omit<CartItem, 'quantity'>) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
  };

  const removeItem = (id: string) => {
    dispatch({ type: 'REMOVE_ITEM', payload: id });
  };

  const updateQuantity = (id: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity } });
  };

  const updateUsers = (id: string, users: number) => {
    dispatch({ type: 'UPDATE_USERS', payload: { id, users } });
  };

  const updateBillingCycle = (id: string, billingCycle: 'monthly' | 'annual') => {
    dispatch({ type: 'UPDATE_BILLING_CYCLE', payload: { id, billingCycle } });
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  const openCart = () => {
    dispatch({ type: 'OPEN_CART' });
  };

  const closeCart = () => {
    dispatch({ type: 'CLOSE_CART' });
  };

  const getTotalPrice = (): number => {
    return state.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getItemCount = (): number => {
    return state.items.reduce((total, item) => total + item.quantity, 0);
  };

  const contextValue: CartContextType = {
    ...state,
    addItem,
    removeItem,
    updateQuantity,
    updateUsers,
    updateBillingCycle,
    clearCart,
    openCart,
    closeCart,
    getTotalPrice,
    getItemCount,
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

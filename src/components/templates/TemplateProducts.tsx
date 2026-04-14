"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";
import type { ProductItem } from "@/lib/ai/types";
import { ensureReadable } from "@/lib/templates/contrast";

interface CartItem {
  product: ProductItem;
  qty: number;
}

function parsePrice(price: string): number {
  const match = price.replace(/[^0-9.]/g, "");
  return parseFloat(match) || 0;
}

function formatPrice(cents: number): string {
  return `$${cents.toFixed(2)}`;
}

/* ── Mock Checkout Drawer ─────────────────────────────────── */
function MockCartDrawer({
  cart,
  colors,
  onUpdateQty,
  onClose,
}: {
  cart: CartItem[];
  colors: ThemeColors;
  onUpdateQty: (name: string, delta: number) => void;
  onClose: () => void;
}) {
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "info" | "confirmed">("cart");
  const total = cart.reduce((sum, item) => sum + parsePrice(item.product.price) * item.qty, 0);
  const btnText = ensureReadable(colors.background, colors.primary, 3);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">
            {checkoutStep === "confirmed" ? "Order Confirmed!" : checkoutStep === "info" ? "Checkout" : "Your Cart"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {/* ── Cart View ── */}
          {checkoutStep === "cart" && (
            <motion.div
              key="cart"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-5"
            >
              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Your cart is empty</p>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.product.name} className="flex items-center gap-3">
                      {item.product.image && (
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                          <Image src={item.product.image} alt={item.product.name} fill className="object-cover" unoptimized />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                        <p className="text-xs text-gray-500">{item.product.price}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onUpdateQty(item.product.name, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border text-gray-500 hover:bg-gray-100"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-medium">{item.qty}</span>
                        <button
                          onClick={() => onUpdateQty(item.product.name, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border text-gray-500 hover:bg-gray-100"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="border-t pt-3">
                    <div className="flex justify-between text-base font-bold text-gray-900">
                      <span>Total</span>
                      <span>{formatPrice(total)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setCheckoutStep("info")}
                    className="w-full rounded-full py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg"
                    style={{ backgroundColor: colors.primary, color: btnText }}
                  >
                    Checkout — {formatPrice(total)}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Info/Shipping View ── */}
          {checkoutStep === "info" && (
            <motion.div
              key="info"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-5"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">Order Summary</p>
                  {cart.map((item) => (
                    <div key={item.product.name} className="mt-1 flex justify-between text-xs text-gray-600">
                      <span>{item.product.name} × {item.qty}</span>
                      <span>{formatPrice(parsePrice(item.product.price) * item.qty)}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold text-gray-900">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setCheckoutStep("confirmed")}
                  className="w-full rounded-full py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: colors.primary, color: btnText }}
                >
                  Place Order — {formatPrice(total)}
                </button>
                <button
                  onClick={() => setCheckoutStep("cart")}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
                >
                  ← Back to cart
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Confirmation View ── */}
          {checkoutStep === "confirmed" && (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.1 }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: `${colors.primary}20` }}
              >
                <svg className="h-8 w-8" style={{ color: colors.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <h4 className="text-lg font-bold text-gray-900">Thank You!</h4>
              <p className="mt-2 text-sm text-gray-500">
                Your order has been placed. You&apos;ll receive a confirmation shortly.
              </p>
              <p className="mt-1 text-xs text-gray-400">(This is a preview — no real order was placed)</p>
              <button
                onClick={onClose}
                className="mt-6 rounded-full px-8 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
                style={{ backgroundColor: colors.primary, color: btnText }}
              >
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/* ── Product Card ──────────────────────────────────────────── */
function ProductCard({
  product,
  colors,
  onAddToCart,
}: {
  product: ProductItem;
  colors: ThemeColors;
  onAddToCart: () => void;
}) {
  const btnText = ensureReadable(colors.background, colors.primary, 3);

  return (
    <div
      className="group overflow-hidden rounded-2xl transition-transform hover:-translate-y-1 hover:shadow-lg"
      style={{ backgroundColor: colors.background }}
    >
      {product.image && (
        <div className="relative aspect-square overflow-hidden">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        </div>
      )}
      <div className="p-5">
        <h3
          className="text-lg font-semibold"
          style={{ color: colors.foreground }}
        >
          {product.name}
        </h3>
        {product.description && (
          <p
            className="mt-1 text-sm opacity-70"
            style={{ color: colors.foreground }}
          >
            {product.description}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <p
            className="text-xl font-bold"
            style={{ color: colors.primary }}
          >
            {product.price}
          </p>
          <button
            onClick={onAddToCart}
            className="rounded-full px-4 py-1.5 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ backgroundColor: colors.primary, color: btnText }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Products Section ─────────────────────────────────── */
interface TemplateProductsProps {
  title?: string;
  products: ProductItem[];
  colors: ThemeColors;
}

export function TemplateProducts({
  title = "Our Products",
  products,
  colors,
}: TemplateProductsProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);

  if (!products || products.length === 0) return null;

  const addToCart = (product: ProductItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.name === product.name);
      if (existing) {
        return prev.map((item) =>
          item.product.name === product.name ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
    setShowCart(true);
  };

  const updateQty = (name: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.name === name ? { ...item, qty: item.qty + delta } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const btnText = ensureReadable(colors.background, colors.primary, 3);

  return (
    <section
      className="px-6 py-20"
      style={{ backgroundColor: colors.muted }}
    >
      <div className="mx-auto max-w-5xl">
        <h2
          className="mb-12 text-center text-3xl font-bold md:text-4xl"
          style={{ color: colors.foreground }}
        >
          {title}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.name}
              product={product}
              colors={colors}
              onAddToCart={() => addToCart(product)}
            />
          ))}
        </div>

        {/* Floating cart badge */}
        <AnimatePresence>
          {cartCount > 0 && !showCart && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={() => setShowCart(true)}
              className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-xl transition-transform hover:-translate-y-1"
              style={{ backgroundColor: colors.primary, color: btnText }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              View Cart ({cartCount})
            </motion.button>
          )}
        </AnimatePresence>

        {/* Cart drawer */}
        <AnimatePresence>
          {showCart && (
            <MockCartDrawer
              cart={cart}
              colors={colors}
              onUpdateQty={updateQty}
              onClose={() => setShowCart(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

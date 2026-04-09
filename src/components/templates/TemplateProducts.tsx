"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import type { ProductItem } from "@/lib/ai/types";

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
  if (!products || products.length === 0) return null;

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
            <div
              key={product.name}
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
                <p
                  className="mt-3 text-xl font-bold"
                  style={{ color: colors.primary }}
                >
                  {product.price}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

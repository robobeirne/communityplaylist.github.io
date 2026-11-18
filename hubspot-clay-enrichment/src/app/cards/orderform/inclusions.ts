// The free rows every new business order form carries. The card adds them once to a new business
// deal (and records that it did, in of_standard_inclusions_added), so a rep who removes one isn't
// overruled. Products are matched by ID, or by name if the ID isn't in the library.

import type { Product } from './lines.ts';

export interface Inclusion {
  productId: string;
  name: RegExp;
  /** One per site, or a single line. */
  perSite: boolean;
}

export const STANDARD_INCLUSIONS: Inclusion[] = [
  { productId: '414730536132', name: /intelligence \(free\)/i, perSite: false },
  { productId: '427764333792', name: /^deployment services$/i, perSite: true },
  { productId: '455664370894', name: /^standard support services$/i, perSite: false },
];

export function inclusionProduct(inc: Inclusion, products: Product[]): Product | undefined {
  return products.find((p) => p.id === inc.productId) ?? products.find((p) => inc.name.test(p.name));
}

export function isInclusion(productId: string, products: Product[]): boolean {
  return STANDARD_INCLUSIONS.some((inc) => inclusionProduct(inc, products)?.id === productId);
}

/** The inclusions still to add: those whose product exists and isn't on the deal yet. */
export function missingInclusions(products: Product[], lineProductIds: string[], siteCount: number): { product: Product; quantity: number }[] {
  return STANDARD_INCLUSIONS.flatMap((inc) => {
    const product = inclusionProduct(inc, products);
    if (!product || lineProductIds.includes(product.id)) return [];
    return [{ product, quantity: inc.perSite ? Math.max(1, siteCount) : 1 }];
  });
}

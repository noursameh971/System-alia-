export interface Brand {
  id: string;
  name: string;
  code: string;
}

export interface ProductVariantAttribute {
  attributeName: string;
  value: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  qrCodeValue: string;
  status: string;
  attributes: ProductVariantAttribute[];
  price: number | null;
  currency: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  status: string;
  brand: Brand;
  category: { id: string; name: string; code: string };
  variants: ProductVariant[];
}

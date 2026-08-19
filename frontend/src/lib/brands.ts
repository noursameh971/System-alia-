import { apiFetch, apiFetchUpload } from "./apiClient";
import type {
  Brand,
  BrandProfile,
  CreateBrandInput,
  CreateBrandResult,
  UpdateBrandProfileInput,
  UploadBrandLogoResult,
} from "./types";

export function listBrands(): Promise<Brand[]> {
  return apiFetch<Brand[]>("/api/brands");
}

/** Backs the "+ New Workspace" modal. */
export function createBrand(input: CreateBrandInput): Promise<CreateBrandResult> {
  return apiFetch<CreateBrandResult>("/api/brands", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Backs the Settings page's "Brand Profile" tab. */
export function getBrandProfile(brandId: string): Promise<BrandProfile> {
  return apiFetch<BrandProfile>(`/api/brands/${encodeURIComponent(brandId)}/profile`);
}

export function updateBrandProfile(brandId: string, input: UpdateBrandProfileInput): Promise<BrandProfile> {
  return apiFetch<BrandProfile>(`/api/brands/${encodeURIComponent(brandId)}/profile`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function uploadBrandLogo(brandId: string, file: File): Promise<UploadBrandLogoResult> {
  return apiFetchUpload<UploadBrandLogoResult>(`/api/brands/${encodeURIComponent(brandId)}/logo`, file);
}

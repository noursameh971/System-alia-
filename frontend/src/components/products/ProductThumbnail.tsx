import { getGradientForString, getInitials } from "@/lib/avatarColor";
import { resolveImageUrl } from "@/lib/images";

interface ProductThumbnailProps {
  imageUrl: string | null | undefined;
  name: string;
  /** Edge length in px — used for both the image and the fallback avatar so they're interchangeable at any call site. */
  size?: number;
  className?: string;
}

/** A product's image if it has one, else a deterministic gradient avatar with its initials — used everywhere a product needs a visual identity (Products table, Product Profile drawer, order line items). */
export function ProductThumbnail({ imageUrl, name, size = 40, className = "" }: ProductThumbnailProps) {
  const resolved = resolveImageUrl(imageUrl);
  const style = { width: size, height: size };

  if (resolved) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/uploaded URLs, next/image can't optimize these
      <img src={resolved} alt={name} style={style} className={`shrink-0 rounded-lg object-cover ${className}`} />
    );
  }

  const [from, to] = getGradientForString(name);
  return (
    <div
      style={{ ...style, background: `linear-gradient(135deg, ${from}, ${to})` }}
      className={`flex shrink-0 items-center justify-center rounded-lg font-semibold text-white ${className}`}
      aria-hidden
      title={name}
    >
      <span style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}>{getInitials(name)}</span>
    </div>
  );
}

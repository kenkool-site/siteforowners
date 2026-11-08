import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO = "/marketing/siteforowners-logo.png";

type MarketingBrandLogoProps = {
  className?: string;
  /** Tailwind height class, e.g. h-8, h-9 */
  heightClass?: string;
  /**
   * Largest rendered CSS width in pixels. The file is square. Next requests
   * this width and 2x — a missing value used to fall through to a 1920px src.
   */
  displayWidth?: number;
  priority?: boolean;
  /** When set, wraps the logo in a link */
  href?: string;
  linkClassName?: string;
};

export function MarketingBrandLogo({
  className,
  heightClass = "h-11",
  displayWidth = 144,
  priority = false,
  href,
  linkClassName,
}: MarketingBrandLogoProps) {
  const image = (
    <Image
      src={LOGO}
      alt="Site For Owners — websites and booking for stylists"
      width={displayWidth}
      height={displayWidth}
      className={cn(heightClass, "w-auto", className)}
      priority={priority}
    />
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/35 focus-visible:ring-offset-2",
          linkClassName,
        )}
      >
        {image}
      </Link>
    );
  }

  return image;
}

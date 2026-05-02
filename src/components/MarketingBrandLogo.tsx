import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO = "/marketing/siteforowners-logo.png";

type MarketingBrandLogoProps = {
  className?: string;
  /** Tailwind height class, e.g. h-8, h-9 */
  heightClass?: string;
  priority?: boolean;
  /** When set, wraps the logo in a link */
  href?: string;
  linkClassName?: string;
};

export function MarketingBrandLogo({
  className,
  heightClass = "h-9",
  priority = false,
  href,
  linkClassName,
}: MarketingBrandLogoProps) {
  const image = (
    <Image
      src={LOGO}
      alt="Site For Owners — websites and booking for stylists"
      width={800}
      height={800}
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

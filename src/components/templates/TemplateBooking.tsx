import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface TemplateBookingProps {
  title?: string;
  subtitle?: string;
  bookingUrl?: string;
  phone?: string;
  colors: ThemeColors;
}

export function TemplateBooking({
  title = "Book an Appointment",
  subtitle = "Ready to look your best? Book your appointment today.",
  bookingUrl,
  phone,
  colors,
}: TemplateBookingProps) {
  return (
    <section
      className="px-6 py-20"
      style={{ backgroundColor: colors.foreground }}
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2
          className="mb-4 text-3xl font-bold md:text-4xl"
          style={{ color: colors.background }}
        >
          {title}
        </h2>
        <p className="mb-10 text-lg opacity-80" style={{ color: colors.background }}>
          {subtitle}
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          {bookingUrl && (
            <Button
              size="lg"
              className="rounded-full px-10 py-6 text-base font-semibold"
              style={{
                backgroundColor: colors.primary,
                color: colors.background,
              }}
              asChild
            >
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                Book Online
              </a>
            </Button>
          )}
          {phone && (
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-10 py-6 text-base font-semibold"
              style={{
                borderColor: colors.primary,
                color: colors.primary,
              }}
              asChild
            >
              <a href={`tel:${phone}`}>Call {phone}</a>
            </Button>
          )}
          {!bookingUrl && !phone && (
            <Button
              size="lg"
              className="rounded-full px-10 py-6 text-base font-semibold"
              style={{
                backgroundColor: colors.primary,
                color: colors.background,
              }}
            >
              Contact Us
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  nav: "src/components/templates/SiteNav.tsx",
  footer: "src/components/templates/TemplateFooter.tsx",
  contact: "src/components/templates/TemplateContact.tsx",
  products: "src/components/templates/TemplateProducts.tsx",
  booking: "src/components/templates/TemplateBooking.tsx",
  bookingServicePicker: "src/components/templates/BookingServicePicker.tsx",
  animation: "src/components/templates/shared/AnimateSection.tsx",
};

test("shared client template components expose polished visual surfaces", async () => {
  const nav = await readFile(files.nav, "utf8");
  const footer = await readFile(files.footer, "utf8");
  const contact = await readFile(files.contact, "utf8");
  const products = await readFile(files.products, "utf8");
  const booking = await readFile(files.booking, "utf8");
  const animation = await readFile(files.animation, "utf8");

  assert.match(nav, /backdrop-blur-xl/, "SiteNav should use a premium glass surface");
  assert.match(nav, /rounded-\[1\.25rem\]/, "SiteNav drawer should use a softened panel radius");
  assert.match(footer, /rounded-\[2rem\]/, "TemplateFooter should use card-like contact/hour surfaces");
  assert.match(contact, /rounded-\[2rem\]/, "TemplateContact should render a polished form card");
  assert.match(products, /rounded-\[1\.5rem\]/, "TemplateProducts should render premium product cards");
  assert.match(booking, /rounded-\[2rem\]/, "TemplateBooking should render a premium booking shell");
  assert.match(animation, /cubicBezier/, "AnimateSection should use a smoother shared easing curve");
});

test("template polish preserves booking behavior hooks and generated-copy contracts", async () => {
  const orchestrator = await readFile("src/components/templates/TemplateOrchestrator.tsx", "utf8");
  const booking = await readFile(files.booking, "utf8");

  for (const marker of [
    "buildAcuityDeepLink",
    "siteforowners:open-booking-calendar",
    "siteforowners:request-booking-choice",
    "booking_categories",
    "section_settings",
    "template_override",
  ]) {
    assert.match(
      `${orchestrator}\n${booking}`,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `template polish should preserve ${marker}`,
    );
  }
});

test("site nav keeps floating controls readable across existing client themes", async () => {
  const nav = await readFile(files.nav, "utf8");

  assert.match(
    nav,
    /controlTextColor\s*=\s*ensureReadable\(colors\.foreground,\s*colors\.background/,
    "floating nav controls should choose text against the light glass background",
  );
  assert.match(
    nav,
    /drawerTextColor\s*=\s*ensureReadable\(colors\.background,\s*colors\.foreground/,
    "drawer links should keep their existing contrast against the foreground drawer",
  );
});

test("booking service picker provides searchable image-led continuous results", async () => {
  const picker = await readFile(files.bookingServicePicker, "utf8");

  for (const marker of [
    "services.map((service, originalIndex)",
    "filterBookingServices(indexedServices, query)",
    'type="search"',
    "sticky top-0",
    "service.image",
    "object-cover object-top",
    "filteredServices.map",
    "No services found",
    "const surfaceText = ensureReadable",
    "const mutedText = ensureReadable",
    "const mutedAccent = ensureReadable(colors.primary, colors.muted, 4.5)",
    "const surfaceAccent = ensureReadable",
    "contrastRatio",
    'contrastRatio("#FFFFFF", colors.primary)',
    'contrastRatio("#000000", colors.primary)',
    'whiteButtonContrast >= blackButtonContrast ? "#FFFFFF" : "#000000"',
    "originalIndex",
    'loading="lazy"',
    'decoding="async"',
    "onError",
    "failedImageUrls",
  ]) {
    assert.match(
      picker,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `booking service picker should include ${marker}`,
    );
  }

  assert.doesNotMatch(
    picker,
    /Load More|Next Page|slice\(0,/,
    "booking service picker should render all filtered services without pagination",
  );
  assert.doesNotMatch(
    picker,
    /filteredServices\.map\(\(service,\s*index\)|\$\{index\}/,
    "booking service picker keys should remain stable when filtering changes result positions",
  );
  assert.doesNotMatch(
    picker,
    /services\.indexOf\(service\)|opacity-(?:40|50|60)/,
    "booking service picker should avoid repeated key scans and opacity-reduced readable text",
  );
});

test("booking flows use the shared booking service picker", async () => {
  const customerBookingFlow = await readFile(
    "src/components/templates/CustomerBookingFlow.tsx",
    "utf8",
  );
  const mockBookingCalendar = await readFile(
    "src/components/templates/MockBookingCalendar.tsx",
    "utf8",
  );

  for (const [name, source] of [
    ["CustomerBookingFlow", customerBookingFlow],
    ["MockBookingCalendar", mockBookingCalendar],
  ]) {
    assert.match(
      source,
      /<BookingServicePicker/,
      `${name} should render the shared booking service picker`,
    );
    assert.doesNotMatch(
      source,
      /services\.map\(\(svc, i\)/,
      `${name} should remove the duplicated legacy service list`,
    );
  }
});

test("booking service picker follows the template-local locale", async () => {
  const orchestrator = await readFile(
    "src/components/templates/TemplateOrchestrator.tsx",
    "utf8",
  );
  const booking = await readFile(files.booking, "utf8");
  const customerBookingFlow = await readFile(
    "src/components/templates/CustomerBookingFlow.tsx",
    "utf8",
  );
  const mockBookingCalendar = await readFile(
    "src/components/templates/MockBookingCalendar.tsx",
    "utf8",
  );
  const picker = await readFile(files.bookingServicePicker, "utf8");

  assert.match(
    orchestrator,
    /<TemplateBooking[\s\S]*?locale=\{locale\}/,
    "TemplateOrchestrator should pass its template-local locale to TemplateBooking",
  );
  assert.match(
    booking,
    /interface TemplateBookingProps[\s\S]*?locale\?: "en" \| "es"/,
    "TemplateBooking should accept an optional locale",
  );
  assert.match(
    booking,
    /<CustomerBookingFlow[\s\S]*?locale=\{locale\}/,
    "TemplateBooking should pass locale to CustomerBookingFlow",
  );
  assert.match(
    booking,
    /<MockBookingCalendar[\s\S]*?locale=\{locale\}/,
    "TemplateBooking should pass locale to MockBookingCalendar",
  );

  for (const [name, source] of [
    ["CustomerBookingFlow", customerBookingFlow],
    ["MockBookingCalendar", mockBookingCalendar],
  ]) {
    assert.match(
      source,
      /locale\?: "en" \| "es"/,
      `${name} should accept an optional locale`,
    );
    assert.match(
      source,
      /<BookingServicePicker[\s\S]*?locale=\{locale\}/,
      `${name} should pass locale to BookingServicePicker`,
    );
  }

  assert.match(
    picker,
    /locale\?: "en" \| "es"/,
    "BookingServicePicker should accept an optional locale",
  );
  for (const label of [
    "Search services",
    "Buscar servicios",
    "Clear",
    "Borrar",
    "service",
    "services",
    "servicio",
    "servicios",
    "No services found",
    "No se encontraron servicios",
    "Try another name or clear your search.",
    "Prueba otro nombre o borra la búsqueda.",
    "Clear search",
    "Borrar búsqueda",
  ]) {
    assert.match(
      picker,
      new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `BookingServicePicker should define the localized label: ${label}`,
    );
  }
  assert.match(
    picker,
    /const labels = BOOKING_SERVICE_PICKER_LABELS\[locale\]/,
    "BookingServicePicker should select labels from the template-local locale",
  );
  assert.match(
    picker,
    /aria-label=\{labels\.search\}/,
    "BookingServicePicker should localize its search aria-label",
  );
  assert.match(
    picker,
    /placeholder=\{labels\.search\}/,
    "BookingServicePicker should localize its search placeholder",
  );
});

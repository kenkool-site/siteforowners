# Marketing Page Image Assets

These images are referenced by the homepage components in `src/app/(marketing)/_components/`. Replace each placeholder with a real PNG before merging the redesign branch.

Spec: `docs/superpowers/specs/2026-05-01-marketing-page-redesign-design.md`
Plan: `docs/superpowers/plans/2026-05-01-marketing-page-redesign.md` (Task 2)

## Required files

### `hero/` — vertical-cycling showcase in the Bold Pop hero

| Path | What it should be |
| --- | --- |
| `hero/letstrylocs.png` | Mobile-width screenshot of letstrylocs.com (the live client site). |
| `hero/barber.png` | Mobile-width screenshot of any barbershop preview site. |
| `hero/nails.png` | Mobile-width screenshot of any nail-shop preview site. |

Recommended: ~750 × 1000 px PNG, < 400 KB each. The hero auto-cycles between these every 4 seconds.

### `customer-view/` — rendered "What customers see" section

Do not place customer-facing screenshots here for the redesign. Reference captures belong in
`.design-references/customer-view/` and are ignored by git. The marketing page should render
polished product/site previews in code instead of publishing raw uploaded screenshots.

### `dashboard/` — owner dashboard tour carousel

These are the screenshots already provided in the brainstorming session.

| Path | What it should be |
| --- | --- |
| `dashboard/home.png` | letstrylocs Home dashboard (pink theme, "Good afternoon, letstrylocs" + 113 visitors). |
| `dashboard/schedule.png` | Mariam's schedule view (burgundy, "Friday, May 1" with bookings). |
| `dashboard/services.png` | Mariam's services + deposit view (burgundy, $40 deposit, 34 services). |
| `dashboard/leads.png` | TouchedbyDrea Leads view (purple, NEW badges). |

Recommended: 1280 × 720 or larger, < 400 KB each.

## After replacing placeholders

```bash
cd siteforowners
npm run dev
# Visit http://localhost:3000 and confirm every image renders.
```

If any file is over 400 KB, run it through an image optimizer or re-export at 2x mobile width PNG-8.

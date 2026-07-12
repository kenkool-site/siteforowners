# Home-services default service images

Drop one image per service here, named by the service-name slug:

- "Lawn Mowing & Maintenance" → `lawn-mowing-and-maintenance.jpg`
- "Tree Trimming" → `tree-trimming.webp`

Slug rule: lowercase; `&` → `and`; apostrophes removed; every other run of
non-alphanumerics → `-` (see `slugifyServiceName` in
`src/lib/templates/service-images.ts`).

Allowed extensions: .jpg / .jpeg / .png / .webp. After adding, replacing, or
removing files, run:

    npm run gen:service-images

Any home-services service whose name slug matches a file here shows that image
automatically (an image uploaded on the service always wins). The site
editor's "Choose default" picker lists every image in this folder.

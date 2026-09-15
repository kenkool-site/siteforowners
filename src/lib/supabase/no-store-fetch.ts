export function createNoStoreFetch(
  underlyingFetch: typeof fetch = fetch,
): typeof fetch {
  return (input, init) => underlyingFetch(input, {
    ...init,
    cache: "no-store",
  });
}

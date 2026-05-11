export interface VagaroRuntimeConfig {
  region: string;
  businessId: string;
  token0: string;
  token2: string;
  bookText: string;
  classBookText: string;
  currencySymbol: string;
  merchantAccount: number;
  isShowCustomPackage: boolean;
  isOutcallMandatory: boolean;
  outcallPointRedeem: number;
  outcallPrice: number;
  isMobileServiceMandatory: number;
}

export interface VagaroServiceResponse {
  Services?: Array<{
    ServiceCategoryTitle?: string;
    ServiceList?: VagaroServiceRow[];
  }>;
}

interface VagaroServiceRow {
  ServiceID?: number;
  ServiceTitle?: string;
  PriceText?: string;
  Price?: number;
  ServiceDesc?: string;
  ServiceOrder?: number;
  ServicePhotoURL?: string;
  ShowOnline?: boolean;
}

export interface ImportedBookingCategory {
  name: string;
  services: {
    name: string;
    price: string;
    duration: string;
    id: number;
    image?: string;
    description?: string;
  }[];
  directUrl: string;
}

function unescapeEmbeddedJson(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function extractHiddenInputValue(html: string, id: string): string | null {
  const idFirst = new RegExp(
    `<input[^>]*id=["']${id}["'][^>]*value=["']([^"']*)["'][^>]*>`,
    "i",
  );
  const valueFirst = new RegExp(
    `<input[^>]*value=["']([^"']*)["'][^>]*id=["']${id}["'][^>]*>`,
    "i",
  );
  return html.match(idFirst)?.[1] ?? html.match(valueFirst)?.[1] ?? null;
}

function stringMatch(source: string, key: string): string | null {
  return source.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, "i"))?.[1] ?? null;
}

function numberMatch(source: string, key: string): number | null {
  const raw = source.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"))?.[1];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function booleanMatch(source: string, key: string): boolean | null {
  const raw = source.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`, "i"))?.[1];
  return raw ? raw.toLowerCase() === "true" : null;
}

export function parseVagaroRuntimeConfig(html: string): VagaroRuntimeConfig | null {
  const normalized = unescapeEmbeddedJson(html);
  const businessDetailIndex = normalized.search(/"BusinessDetail"\s*:/i);
  const businessDetail =
    businessDetailIndex >= 0 ? normalized.slice(businessDetailIndex) : normalized;
  const businessId = numberMatch(businessDetail, "BusinessID")?.toString() ?? null;
  const groupId =
    stringMatch(normalized, "groupId") ??
    normalized.match(/VagaroCorePublicAPIURLV2["']?\s*:\s*["']https:\/\/api\.vagaro\.com\/([a-z0-9]+)\//i)?.[1];
  const token2 = extractHiddenInputValue(normalized, "hdnToken2");

  if (!businessId || !groupId || token2 === null) return null;

  return {
    region: groupId.toLowerCase(),
    businessId,
    token0: extractHiddenInputValue(normalized, "hdnToken0") ?? "",
    token2,
    bookText: stringMatch(businessDetail, "BookText") ?? "Book",
    classBookText: stringMatch(businessDetail, "ClassBookText") ?? "Book",
    currencySymbol: stringMatch(businessDetail, "CurrencySymbol") ?? "$",
    merchantAccount: numberMatch(businessDetail, "MerchantAccount") ?? 0,
    isShowCustomPackage: booleanMatch(businessDetail, "IsShowCustomPackage") ?? false,
    isOutcallMandatory: booleanMatch(businessDetail, "IsOutcallMandatory") ?? false,
    outcallPointRedeem: numberMatch(businessDetail, "OutcallPointRedeem") ?? 0,
    outcallPrice: numberMatch(businessDetail, "OutCallPrice") ?? 0,
    isMobileServiceMandatory: numberMatch(businessDetail, "IsMobileServiceMandatory") ?? 0,
  };
}

function servicePrice(row: VagaroServiceRow): string {
  if (typeof row.PriceText === "string" && row.PriceText.trim()) return row.PriceText.trim();
  if (typeof row.Price === "number" && Number.isFinite(row.Price)) return `$${row.Price.toFixed(2)}`;
  return "";
}

function servicesUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  if (!u.pathname.endsWith("/services")) {
    u.pathname = `${u.pathname.replace(/\/$/, "")}/services`;
  }
  return u.toString();
}

export function mapVagaroServicesToBookingCategories(
  response: VagaroServiceResponse,
  pageUrl: string,
): ImportedBookingCategory[] {
  const directUrl = servicesUrl(pageUrl);
  return (response.Services || [])
    .map((category) => {
      const services = (category.ServiceList || [])
        .filter((service) => service.ShowOnline !== false && service.ServiceTitle?.trim())
        .sort((a, b) => (a.ServiceOrder ?? 0) - (b.ServiceOrder ?? 0))
        .map((service) => {
          const description = service.ServiceDesc?.trim();
          const image = service.ServicePhotoURL?.trim();
          return {
            name: service.ServiceTitle!.trim(),
            price: servicePrice(service),
            duration: "60 min",
            id: service.ServiceID ?? 0,
            ...(image ? { image } : {}),
            ...(description ? { description } : {}),
          };
        });

      return {
        name: category.ServiceCategoryTitle?.trim() || "Services",
        services,
        directUrl,
      };
    })
    .filter((category) => category.services.length > 0);
}

export async function fetchVagaroBookingCategories(
  html: string,
  pageUrl: string,
): Promise<ImportedBookingCategory[]> {
  const config = parseVagaroRuntimeConfig(html);
  if (!config) return [];

  const endpoint = new URL(`/${config.region}/websiteapi/homepage/getshopdetailcompositeservice`, pageUrl);
  const referer = servicesUrl(pageUrl);
  const payload = {
    businessID: config.businessId,
    loginUserID: "0",
    pageIndex: 1,
    pageSize: null,
    IsForNewCustomer: 0,
    IsPackageInclude: 1,
    bookText: config.bookText,
    classBookText: config.classBookText,
    currencySymbol: config.currencySymbol,
    MerchantAccount: config.merchantAccount,
    IsShowCustomPackage: config.isShowCustomPackage,
    IsOutcallMandatory: config.isOutcallMandatory,
    OutcallPointRedeem: config.outcallPointRedeem,
    OutCallPrice: config.outcallPrice,
    IsMobileServiceMandatory: config.isMobileServiceMandatory,
    ServiceProviderId: null,
    Referral: 0,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: referer,
      Origin: new URL(pageUrl).origin,
      "X-Requested-With": "XMLHttpRequest",
      token0: config.token0,
      token2: config.token2,
      grouptoken: config.region.toUpperCase(),
      brandedApp: "false",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];
  const data = (await res.json()) as VagaroServiceResponse;
  return mapVagaroServicesToBookingCategories(data, pageUrl);
}

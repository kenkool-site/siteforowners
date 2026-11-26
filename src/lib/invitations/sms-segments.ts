const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

export type SmsSegmentInfo = {
  segments: number;
  encoding: "gsm" | "ucs2";
  length: number;
};

export function isGsm7Char(char: string): boolean {
  return GSM_BASIC.includes(char) || GSM_EXT.includes(char);
}

export function smsSegmentCount(body: string): SmsSegmentInfo {
  let septets = 0;
  const chars = Array.from(body);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? "";
    if (GSM_BASIC.includes(char)) septets += 1;
    else if (GSM_EXT.includes(char)) septets += 2;
    else {
      const length = chars.length;
      return {
        segments: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67),
        encoding: "ucs2",
        length,
      };
    }
  }
  return {
    segments: septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153),
    encoding: "gsm",
    length: septets,
  };
}

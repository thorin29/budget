/**
 * The caller's IP for rate limiting. Trusts, in order: the header named by
 * REAL_IP_HEADER, Cloudflare's cf-connecting-ip, then the first
 * x-forwarded-for hop. The IP is never the only key a limit uses — every limit
 * also keys on the account or code — because a header can be wrong.
 */
export function clientIp(headers: Headers, realIpHeader = process.env.REAL_IP_HEADER): string {
  const candidates = [
    realIpHeader ? headers.get(realIpHeader) : null,
    headers.get("cf-connecting-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
    headers.get("x-real-ip"),
  ];
  for (const value of candidates) {
    const ip = value?.trim();
    if (ip && ip.length <= 64 && /^[0-9a-f:.]+$/i.test(ip)) return ip;
  }
  return "unknown";
}

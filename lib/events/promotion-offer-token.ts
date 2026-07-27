import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generatePromotionOfferToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPromotionOfferToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function promotionOfferTokensMatch(rawToken: string, tokenHash: string) {
  const hashed = hashPromotionOfferToken(rawToken);
  try {
    const a = Buffer.from(hashed, "hex");
    const b = Buffer.from(tokenHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

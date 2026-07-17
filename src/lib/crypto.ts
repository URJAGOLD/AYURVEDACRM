import crypto from "crypto";

const KEY_B64 = process.env.APP_ENCRYPTION_KEY || "";

function key(): Buffer {
  const b = Buffer.from(KEY_B64, "base64");
  if (b.length !== 32) throw new Error("APP_ENCRYPTION_KEY missing/invalid - must be 32 bytes base64 in .env");
  return b;
}
export function isEncryptionReady(): boolean { try { key(); return true; } catch { return false; } }

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}
export function decryptSecret(encv: string): string {
  const [ivb, tagb, ctb] = (encv || "").split(":");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivb, "base64"));
  d.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([d.update(Buffer.from(ctb, "base64")), d.final()]).toString("utf8");
}
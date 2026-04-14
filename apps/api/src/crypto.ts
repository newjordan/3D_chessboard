import crypto from "crypto";

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function generateRSAKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function signData(data: string, privateKeyPem: string): string {
  const sig = crypto.sign(null, Buffer.from(data), privateKeyPem);
  return sig.toString("base64");
}

export function verifyData(
  data: string,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    const alg = key.asymmetricKeyType === "rsa" ? "sha256" : null;
    return crypto.verify(
      alg,
      Buffer.from(data),
      key,
      Buffer.from(signatureBase64, "base64")
    );
  } catch {
    return false;
  }
}

/**
 * Hybrid encrypt: AES-256-GCM for the payload, RSA-OAEP (SHA-256) to wrap the AES key.
 * Works with any RSA public key (2048+ bits). Returns a JSON string.
 */
export function encryptForArbiter(plaintext: string, publicKeyPem: string): string {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      oaepHash: "sha256",
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    aesKey
  );

  return JSON.stringify({
    encryptedKey: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

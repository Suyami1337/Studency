// Simple envelope for AES-256-GCM encryption of short secrets.
// Key: MTPROTO_ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
// Format: base64(iv:12 | authTag:16 | ciphertext).

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const hex = process.env.MTPROTO_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('MTPROTO_ENCRYPTION_KEY missing or not 64 hex chars')
  }
  return Buffer.from(hex, 'hex')
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

export function decryptSecret(envelope: string): string {
  const buf = Buffer.from(envelope, 'base64')
  const iv = buf.subarray(0, 12)
  const authTag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}

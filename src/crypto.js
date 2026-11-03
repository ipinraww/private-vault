const enc = new TextEncoder();

function toBase64(bytes) {
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBytes(bytes, key) {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) };
}

export async function decryptBytes(record, key) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(record.iv) },
    key,
    fromBase64(record.data)
  );
  return new Uint8Array(plain);
}

export async function createVerifier(key) {
  return encryptBytes(enc.encode('PRIVATE_VAULT_PASSWORD_CHECK_V1'), key);
}

export async function verifyPassword(verifier, key) {
  try {
    const bytes = await decryptBytes(verifier, key);
    return new TextDecoder().decode(bytes) === 'PRIVATE_VAULT_PASSWORD_CHECK_V1';
  } catch {
    return false;
  }
}

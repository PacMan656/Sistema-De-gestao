const iterations = 310000;
const encoder = new TextEncoder();
function hex(bytes: Uint8Array) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256));
}
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2:${hex(salt)}:${hex(await derive(password, salt))}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltHex, expected] = encoded.split(':');
  if (algorithm !== 'pbkdf2' || !/^[a-f0-9]{32}$/.test(saltHex || '') || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  const actual = hex(await derive(password, new Uint8Array(saltHex.match(/../g)!.map((byte) => parseInt(byte, 16)))));
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

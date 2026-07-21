// Crypto helpers for the Hunyuan / Taiji WOA endpoints.
// Ported from the legacy implementation, kept because the signing scheme is
// specific to those internal APIs.

import { logger } from './logger';

// Base64 URL-safe encode of raw bytes
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// HMAC-SHA256. The key may be raw bytes or a string (encoded on the fly).
async function hmacSHA256(
  key: string | Uint8Array,
  msg: string,
): Promise<Uint8Array> {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(msg) as unknown as BufferSource,
  );
  return new Uint8Array(sig);
}

async function sha256Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(msg) as unknown as BufferSource,
  );
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  const sig = await hmacSHA256(key, message);
  return base64UrlEncode(sig);
}

export async function signHunyuanRequest(
  secretId: string,
  secretKey: string,
  token: string,
  timestamp: number,
  payload: string,
): Promise<{ signature: string; secretId: string; token: string }> {
  const service = 'ai';
  const action = 'ChatCompletions';
  const algorithm = 'TC3-HMAC-SHA256';
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  // Step 1: canonical request
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = `content-type:${contentType}\nhost:hunyuan.tencentcloudapi.com\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedPayload = await sha256Hex(payload);
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n');

  // Step 2: string to sign
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  // Step 3: signature
  const secretDate = await hmacSHA256(`TC3${secretKey}`, date);
  const secretService = await hmacSHA256(secretDate, service);
  const secretSigning = await hmacSHA256(secretService, 'tc3_request');
  const signature = base64UrlEncode(await hmacSHA256(secretSigning, stringToSign));

  return { signature, secretId, token };
}

export async function signTaijiRequest(
  secretId: string,
  secretKey: string,
  token: string,
  timestamp: number,
  payload: string,
): Promise<{ signature: string; secretId: string; token: string }> {
  const service = 'taiji';
  const action = 'ChatCompletions';
  const algorithm = 'TC3-HMAC-SHA256';
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const contentType = 'application/json';
  const canonicalHeaders = `content-type:${contentType}\nhost:api.taiji.woa.com\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedPayload = await sha256Hex(payload);
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n');

  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  const secretDate = await hmacSHA256(`TC3${secretKey}`, date);
  const secretService = await hmacSHA256(secretDate, service);
  const secretSigning = await hmacSHA256(secretService, 'tc3_request');
  const signature = base64UrlEncode(await hmacSHA256(secretSigning, stringToSign));

  return { signature, secretId, token };
}

export { logger };

import type { Hex } from "./types";
export type { Hex } from "./types";

/** A zero value used for optional commitments and empty roots. */
export const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
  0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
  0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
  0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const ROTR = (value: number, bits: number) =>
  (value >>> bits) | (value << (32 - bits));

function hexBytes(value: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]*$/.test(value) || (value.length - 2) % 2 !== 0) {
    throw new Error("invalid hexadecimal value");
  }
  const out = new Uint8Array((value.length - 2) / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(value.slice(2 + i * 2, 4 + i * 2), 16);
  return out;
}

function sha256(input: Uint8Array): Uint8Array {
  const bitLength = input.length * 8;
  const paddedLength = (((input.length + 9) + 63) >> 6) << 6;
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[input.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ROTR(x, 7) ^ ROTR(x, 18) ^ (x >>> 3);
      const s1 = ROTR(y, 17) ^ ROTR(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = ROTR(e, 6) ^ ROTR(e, 11) ^ ROTR(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = ROTR(a, 2) ^ ROTR(a, 13) ^ ROTR(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const output = new Uint8Array(32);
  const out = new DataView(output.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, index) => out.setUint32(index * 4, value));
  return output;
}

function toHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export function hashText(value: string): Hex {
  return toHex(sha256(new TextEncoder().encode(value)));
}

export function bytes32(value: Hex | string): Hex {
  const encoded = value.startsWith("0x")
    ? hexBytes(value)
    : new TextEncoder().encode(value);
  if (encoded.length > 32) throw new Error("value does not fit in 32 bytes");
  const padded = new Uint8Array(32);
  padded.set(encoded);
  return toHex(padded);
}

export function word(value: bigint | number): Hex {
  const numeric = typeof value === "number" ? BigInt(value) : value;
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("number must be a safe integer");
  if (numeric < 0n || numeric >= (1n << 256n)) throw new Error("word is outside the unsigned 256-bit range");
  const out = new Uint8Array(32);
  let remaining = numeric;
  for (let i = 31; i >= 0; i -= 1) { out[i] = Number(remaining & 0xffn); remaining >>= 8n; }
  return toHex(out);
}

// Domain labels are hashed directly instead of being padded into a bytes32;
// this keeps long, descriptive protocol labels collision-resistant too.
export function domain(value: string): Hex { return hashText(`Shroudly/${value}`); }

export function hashWords(...values: readonly (Hex | string)[]): Hex {
  const encoded = new Uint8Array(values.length * 32);
  values.forEach((value, index) => encoded.set(hexBytes(bytes32(value)), index * 32));
  return toHex(sha256(encoded));
}

export function hashToBigInt(value: Hex): bigint { return BigInt(value); }

export function randomBytes32(): Hex {
  const out = new Uint8Array(32);
  if (typeof globalThis.crypto?.getRandomValues !== "function") throw new Error("cryptographically secure randomness is unavailable");
  globalThis.crypto.getRandomValues(out);
  return toHex(out);
}

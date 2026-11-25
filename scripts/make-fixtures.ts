import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const RATE = 22050;

/** 16-bit mono PCM sine wave at 22.05 kHz. */
export function writeToneWav(file: string, hz: number, seconds: number): void {
  const n = Math.round(RATE * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / RATE) * 0.5 * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

export function writeGarbage(file: string, bytes: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, randomBytes(bytes));
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const dir = path.join(process.cwd(), "e2e", "fixtures");
  writeToneWav(path.join(dir, "tone-a-20s.wav"), 440, 20);
  writeToneWav(path.join(dir, "tone-b-20s.wav"), 660, 20);
  writeToneWav(path.join(dir, "tone-c-30s.wav"), 880, 30);
  writeGarbage(path.join(dir, "garbage.mp3"), 4096);
  console.log("fixtures written to", dir);
}

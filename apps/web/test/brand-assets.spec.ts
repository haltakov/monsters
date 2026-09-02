import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("generated brand assets", () => {
  it.each([
    ["public/brand/monstersdna-mark-v1.png", 256],
    ["public/brand/monstersdna-google-v1.png", 120],
    ["src/app/icon.png", 512],
    ["src/app/apple-icon.png", 180],
  ] as const)("ships a compact square %s", async (path, size) => {
    const file = await readFile(resolve(path));
    const metadata = await sharp(file).metadata();
    expect(metadata).toMatchObject({
      width: size,
      height: size,
      format: "png",
    });
    expect(file.length).toBeLessThan(100_000);
  });

  it("includes native 16, 32 and 48 pixel favicon frames", async () => {
    const ico = await readFile(resolve("src/app/favicon.ico"));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    for (const [index, size] of [16, 32, 48].entries()) {
      const entry = 6 + index * 16;
      expect(ico[entry]).toBe(size);
      expect(ico[entry + 1]).toBe(size);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(offset + length).toBeLessThanOrEqual(ico.length);
      expect(
        await sharp(ico.subarray(offset, offset + length)).metadata(),
      ).toMatchObject({ width: size, height: size, format: "png" });
    }
  });
});

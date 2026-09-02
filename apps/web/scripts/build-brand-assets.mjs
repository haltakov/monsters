import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

// Format/size derivatives only: the artwork itself is generated, not redrawn.
const root = new URL("../", import.meta.url);
const source = await readFile(
  new URL("../../assets/branding/monstersdna-master.png", root),
);
await mkdir(new URL("public/brand/", root), { recursive: true });

const sizes = [
  [256, "public/brand/monstersdna-mark-v1.png"],
  [120, "public/brand/monstersdna-google-v1.png"],
  [512, "src/app/icon.png"],
  [180, "src/app/apple-icon.png"],
];
for (const [size, path] of sizes) {
  await sharp(source)
    .resize(size, size)
    .png({ palette: true, colours: 128 })
    .toFile(new URL(path, root).pathname);
}

// ICO supports PNG-encoded frames; include native small sizes for browser tabs.
const frames = await Promise.all(
  [16, 32, 48].map(async (size) => ({
    size,
    // Turbopack's ICO decoder requires RGBA even for fully opaque artwork.
    png: await sharp(source).resize(size, size).ensureAlpha().png().toBuffer(),
  })),
);
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach(({ size, png }, index) => {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(
  new URL("src/app/favicon.ico", root),
  Buffer.concat([header, ...frames.map(({ png }) => png)]),
);
console.log("Generated UI, Google, browser, and Apple icons from one mascot.");

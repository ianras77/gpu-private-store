import sharp from "sharp";

export async function stripExif(buffer: Buffer) {
  return sharp(buffer).rotate().toBuffer();
}

export async function readMetadata(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format
  };
}

export async function detectFace(_buffer: Buffer) {
  // Placeholder: return false unless you wire in a real detector.
  return false;
}

import path from "path";
import { createHash } from "crypto";
import { PhotoMedia } from "./types";

type ImmichExifInfo = {
  city?: string | null;
  country?: string | null;
  state?: string | null;
  dateTimeOriginal?: string | null;
  description?: string | null;
  exifImageHeight?: number | null;
  exifImageWidth?: number | null;
  fileSizeInByte?: number | string | null;
  latitude?: number | null;
  longitude?: number | null;
  lensModel?: string | null;
  make?: string | null;
  model?: string | null;
};

type ImmichAsset = {
  id?: string | null;
  type?: string | null;
  duration?: string | number | null;
  fileCreatedAt?: string | null;
  fileModifiedAt?: string | null;
  localDateTime?: string | null;
  originalFileName?: string | null;
  originalMimeType?: string | null;
  originalPath?: string | null;
  updatedAt?: string | null;
  exifInfo?: ImmichExifInfo | null;
};

type ImmichAlbumSummary = {
  id?: string | null;
  albumName?: string | null;
};

type ImmichAlbumDetail = {
  id?: string | null;
  albumName?: string | null;
  description?: string | null;
  assets?: ImmichAsset[] | null;
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const hashId = (value: string) =>
  createHash("sha1").update(value).digest("hex").slice(0, 16);

const humanizeTitle = (value?: string | null) => {
  const basename = path.basename(value ?? "", path.extname(value ?? "")).trim();
  return basename
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Family moment";
};

const normalizeNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizeText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeIsoDate = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const parsed = new Date(trimmed);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
};

const parseDurationSeconds = (value: string | number | null | undefined) => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return undefined;

  return parts.reduce((total, part) => total * 60 + part, 0);
};

const buildLocation = (exif?: ImmichExifInfo | null) => {
  const parts = [normalizeText(exif?.city), normalizeText(exif?.state), normalizeText(exif?.country)].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
};

const buildCamera = (exif?: ImmichExifInfo | null) => {
  const base = [normalizeText(exif?.make), normalizeText(exif?.model)].filter(Boolean).join(" ");
  const lens = normalizeText(exif?.lensModel);
  return [base || null, lens].filter(Boolean).join(" · ") || undefined;
};

const mimeToExtension = (mimeType?: string | null) => {
  switch ((mimeType ?? "").toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "video/mp4":
      return ".mp4";
    case "video/quicktime":
      return ".mov";
    case "video/webm":
      return ".webm";
    default:
      return "";
  }
};

const fetchImmichJson = async <T>(url: string, apiKey: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`immich_request_failed:${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

const resolveAlbumId = async (args: {
  baseUrl: string;
  apiKey: string;
  albumId?: string;
  albumName?: string;
  timeoutMs: number;
}) => {
  if (args.albumId?.trim()) return args.albumId.trim();

  const requestedName = args.albumName?.trim().toLowerCase();
  if (!requestedName) {
    throw new Error("immich_album_not_configured");
  }

  const albums = await fetchImmichJson<ImmichAlbumSummary[]>(
    `${trimSlash(args.baseUrl)}/api/albums`,
    args.apiKey,
    args.timeoutMs
  );
  const match = albums.find((album) => album.albumName?.trim().toLowerCase() === requestedName);
  if (!match?.id) {
    throw new Error(`immich_album_not_found:${args.albumName}`);
  }

  return match.id;
};

const mapAlbumAsset = (album: ImmichAlbumDetail, asset: ImmichAsset): PhotoMedia | null => {
  if (!asset.id) return null;

  const rawType = (asset.type ?? "").toUpperCase();
  const kind = rawType === "VIDEO" ? "video" : rawType === "IMAGE" ? "image" : null;
  if (!kind) return null;

  const originalName = normalizeText(asset.originalFileName) ?? path.basename(asset.originalPath ?? asset.id);
  const extension = path.extname(originalName).toLowerCase() || mimeToExtension(asset.originalMimeType);
  const albumName = normalizeText(album.albumName) ?? "Immich album";
  const exif = asset.exifInfo ?? null;
  const description = normalizeText(exif?.description) ?? normalizeText(album.description);

  return {
    id: hashId(`immich:${asset.id}`),
    relativePath: `${albumName}/${originalName}`,
    title: description && description.length <= 80 ? description : humanizeTitle(originalName),
    kind,
    extension,
    mimeType:
      normalizeText(asset.originalMimeType) ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
    fileSize: normalizeNumber(exif?.fileSizeInByte) ?? 0,
    capturedAt: normalizeIsoDate(exif?.dateTimeOriginal, asset.fileCreatedAt, asset.localDateTime, asset.updatedAt),
    updatedAt: normalizeIsoDate(asset.updatedAt, asset.fileModifiedAt, asset.fileCreatedAt),
    source: "immich",
    sourceLabel: "Immich",
    collection: albumName,
    description,
    width: normalizeNumber(exif?.exifImageWidth),
    height: normalizeNumber(exif?.exifImageHeight),
    durationSeconds: kind === "video" ? parseDurationSeconds(asset.duration) : undefined,
    location: buildLocation(exif),
    camera: buildCamera(exif),
    remoteAssetId: asset.id,
    remoteAlbumId: album.id ?? undefined
  };
};

export const scanImmichAlbum = async (args: {
  baseUrl: string;
  apiKey: string;
  albumId?: string;
  albumName?: string;
  timeoutMs?: number;
}) => {
  const baseUrl = trimSlash(args.baseUrl);
  const apiKey = args.apiKey.trim();
  const timeoutMs = Math.max(1000, args.timeoutMs ?? 12000);
  if (!baseUrl || !apiKey) {
    throw new Error("immich_not_configured");
  }

  const albumId = await resolveAlbumId({
    baseUrl,
    apiKey,
    albumId: args.albumId,
    albumName: args.albumName,
    timeoutMs
  });
  const album = await fetchImmichJson<ImmichAlbumDetail>(
    `${baseUrl}/api/albums/${albumId}`,
    apiKey,
    timeoutMs
  );

  return (album.assets ?? [])
    .map((asset) => mapAlbumAsset(album, asset))
    .filter((item): item is PhotoMedia => Boolean(item))
    .sort((left, right) => {
      const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      if (updatedDiff !== 0) return updatedDiff;
      return left.relativePath.localeCompare(right.relativePath);
    });
};

export const scanImmichAlbumQuick = async (args: {
  baseUrl: string;
  apiKey: string;
  albumId?: string;
  albumName?: string;
  timeoutMs?: number;
}) => scanImmichAlbum(args);

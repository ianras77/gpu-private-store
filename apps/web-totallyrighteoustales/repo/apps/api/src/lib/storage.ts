import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { buffer } from "stream/consumers";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION || "us-east-1";
const bucket = process.env.S3_BUCKET || "";

const s3 = new S3Client({
  endpoint: endpoint || undefined,
  region,
  forcePathStyle: Boolean(endpoint),
  credentials: process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
    ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
    : undefined
});

export async function createPresignedUpload(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ACL: "public-read"
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 600 });
  return url;
}

export function buildPublicUrl(key: string) {
  const base = process.env.S3_PUBLIC_URL;
  if (base) {
    return `${base.replace(/\/$/, "")}/${key}`;
  }
  if (endpoint) {
    return `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export async function fetchObject(key: string) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(command);
  return response.Body;
}

export async function fetchObjectBuffer(key: string) {
  const body = await fetchObject(key);
  if (!body) return null;
  // Body can be a stream in Node; normalize to Buffer.
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  // @ts-expect-error - stream/consumers handles Node streams
  return buffer(body);
}

export async function putObjectBuffer(key: string, contentType: string, data: Buffer) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
    ACL: "public-read"
  });
  await s3.send(command);
}

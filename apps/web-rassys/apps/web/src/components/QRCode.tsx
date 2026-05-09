import QRCode from "qrcode";
import Image from "next/image";

export async function QRCodeBlock({
  value,
  label
}: {
  value: string;
  label: string;
}) {
  const dataUrl = await QRCode.toDataURL(value, {
    margin: 1,
    width: 160,
    color: {
      dark: "#081018",
      light: "#ffffff"
    }
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <Image
        src={dataUrl}
        alt={`${label} QR`}
        width={160}
        height={160}
        className="rounded-2xl"
        unoptimized
      />
      <div className="text-xs text-cloud/70">{label}</div>
    </div>
  );
}

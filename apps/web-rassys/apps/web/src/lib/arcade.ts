import { Radio, Gamepad2, Shield, Rocket, Activity } from "lucide-react";

const publicStreamUrl = process.env.NEXT_PUBLIC_STREAM_URL || "/api/radio/stream";

export const arcadeServices = [
  {
    name: "Radio Tower",
    description: "Live station IDs, hand-shaped sets, and the Mr Rassy request line.",
    href: "https://radio.rassys.com",
    icon: Radio
  },
  {
    name: "Live Stream",
    description: "Direct stream mount for VLC, Sonos, or home speakers.",
    href: publicStreamUrl,
    icon: Rocket
  },
  {
    name: "Minecraft Observatory",
    description: "Live portal into the mc_troupe world.",
    href: "https://mc.rassys.com",
    icon: Gamepad2
  },
  {
    name: "Status Watch",
    description: "Health checks and uptime for every service.",
    href: "https://status.rassys.com",
    icon: Activity
  },
  {
    name: "Family Vault",
    description: "Safe access to shared files and memories.",
    href: "https://vault.rassys.com",
    icon: Shield
  }
];

import { MinecraftObservatory } from "../../components/MinecraftObservatory";
import { RoomShell } from "../../components/RoomShell";

export default function MinecraftPage() {
  return <RoomShell theme="observatory" channel="minecraft" agent="minecraft-chronicler"><main className="relative mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6"><MinecraftObservatory mode="page" /></main></RoomShell>;
}

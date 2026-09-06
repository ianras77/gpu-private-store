import type { ReactNode } from "react";
import { RoomShell } from "../../components/RoomShell";

export default function DungeonMasterLayout({ children }: { children: ReactNode }) {
  return <RoomShell theme="table" channel="dungeon-master" agent="dungeon-master">{children}</RoomShell>;
}

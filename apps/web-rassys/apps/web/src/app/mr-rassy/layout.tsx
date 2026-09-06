import type { ReactNode } from "react";
import { RoomShell } from "../../components/RoomShell";

export default function MrRassyLayout({ children }: { children: ReactNode }) {
  return <RoomShell theme="radio" channel="mr-rassy" agent="mr-rassy-host">{children}</RoomShell>;
}

import type { ReactNode } from "react";
import { RoomShell } from "../../components/RoomShell";

export default function RadioLayout({ children }: { children: ReactNode }) {
  return <RoomShell theme="radio" channel="radio" agent="radio-listener">{children}</RoomShell>;
}

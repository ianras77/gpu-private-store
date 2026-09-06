import type { ReactNode } from "react";

type RoomTheme = "home" | "radio" | "table" | "observatory" | "stories" | "archive" | "notebook";

type RoomShellProps = {
  theme: RoomTheme;
  channel?: string;
  agent?: string;
  children: ReactNode;
};

export function RoomShell({ theme, channel, agent, children }: RoomShellProps) {
  return (
    <div className={`room-shell room-shell-${theme}`} data-room={theme} data-channel={channel} data-agent={agent}>
      <div className="room-shell-glow" aria-hidden="true" />
      <div className="room-shell-content">{children}</div>
    </div>
  );
}

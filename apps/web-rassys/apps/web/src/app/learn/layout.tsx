import type { ReactNode } from "react";
import "./learn.css";

export const metadata = {
  title: "The Curiosity Room // Rassys",
  description: "Short explorations for the questions worth following.",
};

export default function LearningLayout({ children }: { children: ReactNode }) {
  return <div className="learning-root">{children}</div>;
}

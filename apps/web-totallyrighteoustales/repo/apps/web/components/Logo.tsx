import { BookOpenText } from "lucide-react";

export default function Logo() {
  return (
    <div className="press-hero-mark flex h-14 w-14 items-center justify-center rounded-lg text-press-paper shadow-soft">
      <div className="relative flex h-10 w-10 items-center justify-center border border-current/35">
        <span className="absolute -left-1 -top-2 font-display text-2xl leading-none text-press-gold">
          T
        </span>
        <BookOpenText size={22} strokeWidth={1.7} />
        <span className="absolute -bottom-2 -right-1 font-display text-2xl leading-none text-press-copper">
          R
        </span>
      </div>
    </div>
  );
}

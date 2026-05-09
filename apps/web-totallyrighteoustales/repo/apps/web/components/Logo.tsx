export default function Logo() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] border border-gold/35 bg-story text-ink shadow-soft ring-1 ring-white/20">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 18c2.5-2.2 4.7-3.3 6.6-3.3 1.1 0 2.3.2 3.4.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M5 9c2-1 4-1 6 0s4 1 8-1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M5 14c2-1 4-1 6 0s4 1 8-1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M12 3.5l1.6 2.4 2.9.8-2.3 1.7.1 3-2.3-1.5-2.4 1.5.2-3-2.4-1.7 2.9-.8L12 3.5z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
}

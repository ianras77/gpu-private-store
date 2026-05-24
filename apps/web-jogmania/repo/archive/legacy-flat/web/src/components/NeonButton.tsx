type NeonButtonProps = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export default function NeonButton({ label, onClick, disabled }: NeonButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="neon-button rounded-full px-6 py-2 font-pixel text-sm text-white transition hover:scale-[1.02] disabled:opacity-50"
      type="button"
    >
      {label}
    </button>
  );
}

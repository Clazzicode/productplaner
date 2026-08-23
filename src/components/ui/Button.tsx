export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-neutral-300 bg-white text-text-primary hover:bg-neutral-50",
  ghost: "text-text-secondary hover:bg-neutral-100 hover:text-text-primary",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};

export default function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant },
) {
  const { variant = "primary", className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className ?? ""}`}
    />
  );
}

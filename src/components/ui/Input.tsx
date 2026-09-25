export default function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none ${className ?? ""}`}
    />
  );
}

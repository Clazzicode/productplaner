export default function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none ${className ?? ""}`}
    />
  );
}

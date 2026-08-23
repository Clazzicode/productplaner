export default function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none ${className ?? ""}`}
    />
  );
}

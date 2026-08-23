import NavigationItem, { type NavigationItemProps } from "./NavigationItem";

export default function SidebarSection(props: { title: string; items: NavigationItemProps[] }) {
  return (
    <div>
      <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-text-inverse-muted">
        {props.title}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {props.items.map((item) => (
          <li key={item.label}>
            <NavigationItem {...item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

import NavigationItem, { type NavigationItemProps } from "./NavigationItem";

export default function SidebarSection(props: { title: string; items: NavigationItemProps[] }) {
  return (
    <div>
      <p className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#91a7d0]">
        {props.title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {props.items.map((item) => (
          <li key={item.label}>
            <NavigationItem {...item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

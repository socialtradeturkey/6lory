import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

export default function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: { label: string; onClick: () => void } }) {
  return <div className="rounded-3xl border border-dashed border-border bg-card/55 px-6 py-12 text-center shadow-sm"><span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300"><Icon className="size-5" /></span><h3 className="font-display text-lg font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{action && <Button className="mt-5 rounded-xl" onClick={action.onClick}>{action.label}</Button>}</div>;
}

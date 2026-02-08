import { cn } from "@/lib/utils";

export type ChannelBadgeProps = {
  name: string;
  status?: "active" | "inactive" | "error" | "paused";
  className?: string;
};

const badgeStyles: Record<string, { bg: string; text: string; dot: string }> = {
  active: {
    bg: "bg-primary/10 border-primary/20",
    text: "text-primary",
    dot: "bg-primary",
  },
  inactive: {
    bg: "bg-muted border-border",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  error: {
    bg: "bg-destructive/10 border-destructive/20",
    text: "text-destructive",
    dot: "bg-destructive",
  },
  paused: {
    bg: "bg-chart-5/10 border-chart-5/20",
    text: "text-chart-5",
    dot: "bg-chart-5",
  },
};

export function ChannelBadge({ name, status = "inactive", className }: ChannelBadgeProps) {
  const style = badgeStyles[status] ?? badgeStyles.inactive;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono",
        style.bg,
        style.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {name}
    </span>
  );
}

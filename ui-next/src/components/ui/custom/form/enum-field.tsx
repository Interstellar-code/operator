import { cn } from "@/lib/utils";

type EnumFieldProps = {
  options: unknown[];
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
};

export function EnumField({ options, value, onChange, disabled }: EnumFieldProps) {
  // For <= 5 options: render as segmented button group
  if (options.length <= 5) {
    return (
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const label = String(opt);
          const isActive = Object.is(value, opt);
          return (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  // For > 5 options: render as native select
  return (
    <select
      value={String(value ?? "")}
      onChange={(e) => {
        const match = options.find((o) => String(o) === e.target.value);
        onChange(match ?? e.target.value);
      }}
      disabled={disabled}
      className={cn(
        "w-full rounded-md border bg-background px-3 py-1.5 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-primary/30",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {value !== undefined && !options.some((o) => Object.is(o, value)) && (
        <option value={String(value)}>{String(value)}</option>
      )}
      {options.map((opt) => (
        <option key={String(opt)} value={String(opt)}>
          {String(opt)}
        </option>
      ))}
    </select>
  );
}

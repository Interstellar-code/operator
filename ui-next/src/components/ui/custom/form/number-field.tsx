import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type NumberFieldProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
};

export function NumberField({ value, onChange, min, max, step = 1, disabled }: NumberFieldProps) {
  const decrement = () => {
    const next = value - step;
    if (min !== undefined && next < min) return;
    onChange(next);
  };
  const increment = () => {
    const next = value + step;
    if (max !== undefined && next > max) return;
    onChange(next);
  };

  return (
    <div className="flex items-center gap-0">
      <button
        type="button"
        onClick={decrement}
        disabled={disabled || (min !== undefined && value <= min)}
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-l-md border border-r-0 bg-muted/50 text-muted-foreground",
          "hover:bg-muted transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={cn(
          "h-8 w-20 border-y bg-background text-center text-sm font-mono",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:z-10",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        )}
      />
      <button
        type="button"
        onClick={increment}
        disabled={disabled || (max !== undefined && value >= max)}
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-r-md border border-l-0 bg-muted/50 text-muted-foreground",
          "hover:bg-muted transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

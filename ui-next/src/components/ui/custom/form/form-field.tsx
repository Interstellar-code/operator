import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  description?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
};

export function FormField({ label, description, error, className, children }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      )}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

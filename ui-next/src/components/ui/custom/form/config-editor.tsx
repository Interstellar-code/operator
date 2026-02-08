import { Copy, Check, RotateCcw, Save } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfigEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  language?: string;
  className?: string;
  readOnly?: boolean;
  lineNumbers?: boolean;
};

export function ConfigEditor({
  value,
  onChange,
  onSave,
  language = "json",
  className,
  readOnly = false,
  lineNumbers = true,
}: ConfigEditorProps) {
  const [editValue, setEditValue] = useState(value);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleChange = useCallback(
    (newValue: string) => {
      setEditValue(newValue);
      onChange?.(newValue);

      if (language === "json") {
        try {
          JSON.parse(newValue);
          setError(null);
        } catch (e) {
          setError((e as Error).message);
        }
      }
    },
    [onChange, language],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editValue]);

  const handleReset = useCallback(() => {
    setEditValue(value);
    setError(null);
    onChange?.(value);
  }, [value, onChange]);

  const handleSave = useCallback(() => {
    if (error) return;
    onSave?.(editValue);
  }, [editValue, error, onSave]);

  const lines = editValue.split("\n");
  const isDirty = editValue !== value;

  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground uppercase">{language}</span>
          {isDirty && (
            <span className="text-[10px] font-mono text-chart-5 px-1.5 py-0.5 rounded bg-chart-5/10">
              modified
            </span>
          )}
          {error && (
            <span className="text-[10px] font-mono text-destructive px-1.5 py-0.5 rounded bg-destructive/10">
              invalid
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={handleCopy} title="Copy">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
          {isDirty && (
            <Button variant="ghost" size="icon-xs" onClick={handleReset} title="Reset">
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
          {onSave && isDirty && !error && (
            <Button variant="ghost" size="icon-xs" onClick={handleSave} title="Save">
              <Save className="h-3 w-3 text-primary" />
            </Button>
          )}
        </div>
      </div>

      <div className="relative overflow-auto max-h-[600px]">
        <div className="flex">
          {lineNumbers && (
            <div className="select-none border-r border-border/50 bg-secondary/20 px-3 py-3 text-right">
              {lines.map((_, i) => (
                <div key={i} className="font-mono text-xs leading-6 text-muted-foreground/50">
                  {i + 1}
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => handleChange(e.target.value)}
            readOnly={readOnly}
            spellCheck={false}
            className={cn(
              "flex-1 resize-none bg-transparent p-3 font-mono text-sm leading-6 text-foreground outline-none",
              readOnly && "cursor-default",
            )}
            style={{ minHeight: `${Math.max(lines.length * 24 + 24, 120)}px` }}
          />
        </div>
      </div>

      {error && (
        <div className="border-t border-destructive/20 bg-destructive/5 px-3 py-2">
          <p className="text-xs font-mono text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}

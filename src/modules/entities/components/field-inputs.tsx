"use client";

import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChecklistItem } from "../schema";

export function TagInput({ value, onChange, id, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  id?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of parts) if (!lower.has(p.toLowerCase()) && next.length < 50) next.push(p.slice(0, 60));
    onChange(next);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
              {t}
              <button type="button" aria-label={`Remover ${t}`} onClick={() => onChange(value.filter((v) => v !== t))} className="rounded-full hover:bg-primary/10">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={draft}
        placeholder={placeholder ?? "Digite e pressione Enter (ou separe por vírgula)"}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
      />
    </div>
  );
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);
}

export function ChecklistInput({ value, onChange }: { value: ChecklistItem[]; onChange: (v: ChecklistItem[]) => void }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...value, { id: newId(), title: t.slice(0, 300), done: false }]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {value.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={item.done}
            aria-label={`Concluir ${item.title}`}
            onChange={(e) => onChange(value.map((v, i) => (i === idx ? { ...v, done: e.target.checked } : v)))}
          />
          <Input
            value={item.title}
            aria-label={`Etapa ${idx + 1}`}
            onChange={(e) => onChange(value.map((v, i) => (i === idx ? { ...v, title: e.target.value } : v)))}
          />
          <Button variant="ghost" size="icon-sm" aria-label="Remover etapa" onClick={() => onChange(value.filter((_, i) => i !== idx))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder="Nova etapa"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="outline" onClick={add}>
          <Plus /> Adicionar
        </Button>
      </div>
    </div>
  );
}

export function OptionsInput({ value, onChange, correct, onCorrectChange }: {
  value: string[];
  onChange: (v: string[]) => void;
  correct: number | null;
  onCorrectChange: (i: number | null) => void;
}) {
  const letters = "ABCDEFGHIJ";
  const items = value.length ? value : [];
  return (
    <div className="space-y-2">
      {items.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" title="Marcar como correta">
            <input
              type="radio"
              name="correct_option_radio"
              className="accent-[var(--primary)]"
              checked={correct === idx}
              onChange={() => onCorrectChange(idx)}
              aria-label={`Alternativa ${letters[idx]} correta`}
            />
            {letters[idx]}
          </label>
          <Input value={opt} aria-label={`Alternativa ${letters[idx]}`} onChange={(e) => onChange(items.map((o, i) => (i === idx ? e.target.value : o)))} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remover alternativa"
            onClick={() => {
              onChange(items.filter((_, i) => i !== idx));
              if (correct === idx) onCorrectChange(null);
              else if (correct !== null && correct > idx) onCorrectChange(correct - 1);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {items.length < 10 && (
        <Button variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
          <Plus /> Alternativa
        </Button>
      )}
    </div>
  );
}

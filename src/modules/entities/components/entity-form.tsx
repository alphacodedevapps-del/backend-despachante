"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { isoToLocalInput, localInputToIso } from "@/lib/utils/format";
import { generateAbntReference } from "@/lib/domain/abnt";
import { cn } from "@/lib/utils/cn";
import { ENTITY_MAP, type FieldDef } from "../definitions";
import { validateEntityInput, type FormValues } from "../schema";
import { createRecordAction, updateRecordAction } from "../actions";
import type { RefOption } from "../queries";
import { ChecklistInput, OptionsInput, TagInput } from "./field-inputs";

interface Props {
  entityKey: string;
  mode: "create" | "edit";
  recordId?: string;
  initialValues: FormValues;
  refOptions: Record<string, RefOption[]>;
  cancelHref: string;
  /** Para onde ir após salvar (padrão: página do registro). */
  afterSaveHref?: string;
}

/** Converte valores de datetime (ISO ↔ input local). */
function toFormValues(fields: FieldDef[], values: FormValues): FormValues {
  const out = { ...values };
  for (const f of fields) {
    if (f.type === "datetime" && typeof out[f.name] === "string") out[f.name] = isoToLocalInput(out[f.name] as string);
    if ((f.type === "number" || f.type === "integer") && typeof out[f.name] === "number") out[f.name] = String(out[f.name]);
  }
  return out;
}

function toSubmitValues(fields: FieldDef[], values: FormValues): FormValues {
  const out = { ...values };
  for (const f of fields) {
    if (f.type === "datetime") out[f.name] = localInputToIso(values[f.name] as string | null);
  }
  return out;
}

export function EntityForm({ entityKey, mode, recordId, initialValues, refOptions, cancelHref, afterSaveHref }: Props) {
  const entity = ENTITY_MAP[entityKey];
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);

  const resolver: Resolver<FormValues> = React.useCallback(
    async (values) => {
      const res = validateEntityInput(entity, toSubmitValues(entity.fields, values));
      if (res.ok) return { values, errors: {} };
      const errors: Record<string, { type: string; message: string }> = {};
      for (const [k, m] of Object.entries(res.errors)) errors[k] = { type: "validation", message: m };
      return { values: {}, errors };
    },
    [entity],
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    watch,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ defaultValues: toFormValues(entity.fields, initialValues), resolver });

  const hasOptions = entity.fields.some((f) => f.type === "options");
  const questionType = hasOptions ? watch("question_type") : undefined;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const payload = toSubmitValues(entity.fields, values);
    const res = mode === "create" ? await createRecordAction(entity.key, payload) : await updateRecordAction(entity.key, recordId!, payload);
    if (!res.ok) {
      setFormError(res.error);
      for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k, { type: "server", message: m });
      toast.error(res.error);
      return;
    }
    toast.success(mode === "create" ? `${entity.singular} criado(a) com sucesso.` : "Alterações salvas.");
    router.push(afterSaveHref ?? `/${entity.slug}/${res.data.id}`);
    router.refresh();
  };

  // Aviso ao sair com alterações não salvas
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && !isSubmitting) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isSubmitting]);

  const sections = React.useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const f of entity.fields) {
      if (hasOptions && f.name === "correct_option") continue;
      const key = f.section ?? (f.type === "tags" ? "Organização" : "Informações");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries());
  }, [entity, hasOptions]);

  const renderField = (f: FieldDef) => {
    const id = `f-${f.name}`;
    const err = errors[f.name]?.message as string | undefined;
    const common = { id, "aria-invalid": err ? true : undefined, "aria-describedby": err ? `${id}-err` : f.help ? `${id}-help` : undefined };
    let control_: React.ReactNode;

    switch (f.type) {
      case "textarea":
        control_ = <Textarea rows={3} placeholder={f.placeholder} {...common} {...register(f.name)} />;
        break;
      case "longtext":
        control_ = <Textarea rows={8} placeholder={f.placeholder} {...common} {...register(f.name)} />;
        break;
      case "select":
        control_ = (
          <NativeSelect {...common} {...register(f.name)}>
            {!f.required && <option value="">—</option>}
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        );
        break;
      case "reference": {
        const opts = refOptions[f.reference!] ?? [];
        const target = ENTITY_MAP[f.reference!];
        control_ = (
          <div className="space-y-1">
            <NativeSelect {...common} {...register(f.name)}>
              <option value="">{f.required ? "Selecione…" : "— Nenhum —"}</option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </NativeSelect>
            {opts.length === 0 && target && (
              <p className="text-xs text-muted-foreground">
                Nenhum registro em {target.plural.toLowerCase()} neste workspace.{" "}
                <a href={`/${target.slug}/novo`} target="_blank" rel="noreferrer" className="text-primary hover:underline">Criar agora</a>
              </p>
            )}
          </div>
        );
        break;
      }
      case "boolean":
        control_ = (
          <label className="flex h-9 items-center gap-2 text-sm">
            <Checkbox {...common} {...register(f.name)} /> {f.label}
          </label>
        );
        break;
      case "date":
        control_ = <Input type="date" {...common} {...register(f.name)} />;
        break;
      case "datetime":
        control_ = <Input type="datetime-local" {...common} {...register(f.name)} />;
        break;
      case "number":
      case "integer":
        control_ = (
          <Input type="number" inputMode="decimal" step={f.type === "integer" ? 1 : "any"} min={f.min} max={f.max} placeholder={f.placeholder} {...common} {...register(f.name)} />
        );
        break;
      case "url":
        control_ = <Input type="url" placeholder={f.placeholder ?? "https://"} {...common} {...register(f.name)} />;
        break;
      case "email":
        control_ = <Input type="email" placeholder={f.placeholder} {...common} {...register(f.name)} />;
        break;
      case "tags":
        control_ = (
          <Controller control={control} name={f.name} render={({ field }) => <TagInput id={id} value={(field.value as string[]) ?? []} onChange={field.onChange} />} />
        );
        break;
      case "checklist":
        control_ = (
          <Controller control={control} name={f.name} render={({ field }) => <ChecklistInput value={(field.value as never[]) ?? []} onChange={field.onChange} />} />
        );
        break;
      case "options":
        if (questionType === "discursiva") return null;
        control_ = (
          <Controller
            control={control}
            name={f.name}
            render={({ field }) => (
              <OptionsInput
                value={(field.value as string[]) ?? []}
                onChange={field.onChange}
                correct={(() => {
                  const c = watch("correct_option");
                  return c === "" || c === null || c === undefined ? null : Number(c);
                })()}
                onCorrectChange={(i) => setValue("correct_option", i === null ? "" : String(i), { shouldDirty: true })}
              />
            )}
          />
        );
        break;
      default:
        control_ = <Input placeholder={f.placeholder} maxLength={f.maxLength} {...common} {...register(f.name)} />;
    }

    const isAbnt = entity.key === "citations" && f.name === "formatted_reference";

    return (
      <div key={f.name} className={cn("space-y-1.5", f.wide && "sm:col-span-2")}>
        {f.type !== "boolean" && (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id}>
              {f.label}
              {f.required && <span className="text-danger"> *</span>}
            </Label>
            {isAbnt && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const r = generateAbntReference(toSubmitValues(entity.fields, getValues()) as never);
                  setValue("formatted_reference", r.text, { shouldDirty: true });
                  if (r.missing.length) toast.warning(`Metadados ausentes (não inventados): ${r.missing.join(", ")}. Revise manualmente.`);
                  else toast.success("Referência gerada. Revise antes de usar.");
                }}
              >
                <Wand2 /> Gerar ABNT
              </Button>
            )}
          </div>
        )}
        {control_}
        {f.help && !err && <p id={`${id}-help`} className="text-xs text-muted-foreground">{f.help}</p>}
        {err && (
          <p id={`${id}-err`} className="text-xs text-danger" role="alert">{err}</p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {entity.notice && <Alert tone={entity.notice.tone} title={entity.notice.title}>{entity.notice.body}</Alert>}
      {formError && <Alert tone="danger" title="Não foi possível salvar">{formError}</Alert>}

      {sections.map(([title, fields]) => (
        <fieldset key={title} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          {sections.length > 1 && <legend className="px-1 text-sm font-semibold">{title}</legend>}
          <div className="grid gap-4 sm:grid-cols-2">{fields.map(renderField)}</div>
        </fieldset>
      ))}

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button variant="outline" onClick={() => router.push(cancelHref)} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {mode === "create" ? "Criar" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

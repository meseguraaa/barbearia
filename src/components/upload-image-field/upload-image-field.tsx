"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type UploadImageFieldProps = {
  /** Nome do campo que será enviado no formulário (ex.: "imageUrl") */
  name: string;
  label?: string;
  required?: boolean;
  /** Valor inicial (ex.: URL já salva no banco ao editar) */
  defaultValue?: string | null;
  /** Texto de ajuda abaixo do campo */
  helperText?: string;
};

export function UploadImageField({
  name,
  label = "Foto",
  required,
  defaultValue,
  helperText,
}: UploadImageFieldProps) {
  // estado inicial vem do defaultValue (para EDITAR) ou vazio (NOVO)
  const [preview, setPreview] = useState<string | null>(defaultValue ?? null);
  const [value, setValue] = useState<string>(defaultValue ?? "");

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClickArea = () => {
    fileInputRef.current?.click();
  };

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Envie um arquivo de imagem (JPG ou PNG).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      setValue(result); // data URL em base64
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const file = event.target.files?.[0] ?? null;
    handleFile(file);
  };

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  };

  const handleRemove = () => {
    setPreview(null);
    setValue("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {/* LABEL */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-label-small text-content-secondary">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>

        {preview && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-content-secondary"
            onClick={handleRemove}
          >
            Remover foto
          </Button>
        )}
      </div>

      {/* ÁREA DE UPLOAD / PREVIEW */}
      <div
        onClick={handleClickArea}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border bg-background-tertiary px-4 py-6 text-center transition-colors",
          isDragging
            ? "border-brand-500/80 bg-brand-500/5"
            : "border-border-primary hover:bg-muted/40",
        ].join(" ")}
      >
        {preview ? (
          // PREVIEW DA IMAGEM
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Preview da imagem"
            className="h-40 w-full rounded-lg object-cover"
          />
        ) : (
          // ESTADO INICIAL (SEM IMAGEM)
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-border-primary bg-background-secondary text-xs text-content-secondary">
              IMG
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-content-primary">
                Arraste uma imagem aqui
              </p>
              <p className="text-xs text-content-secondary">
                ou clique para enviar • JPG ou PNG • até 5MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* HELPER TEXT */}
      {helperText && (
        <p className="text-[11px] text-content-secondary">{helperText}</p>
      )}

      {/* INPUT FILE (REAL) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* INPUT HIDDEN ENVIADO NO FORM */}
      <input type="hidden" name={name} value={value} required={required} />
    </div>
  );
}

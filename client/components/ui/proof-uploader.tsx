import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Loader2,
  AlertCircle,
  FileUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ProofUploaderProps {
  label?: string;
  value?: string; // URL of uploaded proof/file
  onChange: (url: string | undefined) => void;
  proofStatus?: string; // "disponible" | "non_disponible" | "non_renseignee"
  onStatusChange?: (status: "disponible" | "non_disponible" | "non_renseignee") => void;
  folder?:
    | "preuves"
    | "preuves/tests"
    | "preuves/transactions"
    | "preuves/activites-illegales"
    | "avatars"
    | "rapports"
    | "imports";
  disabled?: boolean;
  className?: string;
  required?: boolean;
}

export function ProofUploader({
  label = "Pièce justificative / Preuve",
  value,
  onChange,
  proofStatus = "non_renseignee",
  onStatusChange,
  folder = "preuves",
  disabled = false,
  className,
  required = false,
}: ProofUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPdf = value?.toLowerCase().endsWith(".pdf");
  const isImage = value && !isPdf;

  const handleFile = async (file: File) => {
    if (!file) return;

    // Check size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Le fichier dépasse la taille maximale autorisée (10 Mo).");
      return;
    }

    // Check MIME type
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!allowed.includes(file.type.toLowerCase())) {
      toast.error(
        "Format non pris en charge. Veuillez fournir une image (JPG, PNG, WEBP) ou un document PDF."
      );
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const response = await fetch(`/api/upload?folder=${folder}`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Échec du téléversement vers le stockage.");
      }

      onChange(data.url);
      if (onStatusChange) {
        onStatusChange("disponible");
      }
      toast.success("Preuve téléversée et enregistrée avec succès !");
    } catch (err: any) {
      console.error("Erreur téléversement:", err);
      const msg = err.message || "Impossible de téléverser le fichier.";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDelete = () => {
    onChange(undefined);
    if (onStatusChange) {
      onStatusChange("non_disponible");
    }
    toast.info("Preuve supprimée.");
  };

  return (
    <div className={cn("space-y-2 w-full", className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-[#556B5C] uppercase tracking-wider block">
          {label} {required && <span className="text-[#E52329]">*</span>}
        </label>
        {value && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#006B2D] bg-[#F5F8F5] px-2 py-0.5 rounded border border-[#D8E6DB]">
            <CheckCircle2 className="h-3 w-3" />
            Fichier enregistré
          </span>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        disabled={disabled || isUploading}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* Uploading State */}
      {isUploading && (
        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#006B2D] rounded-xl bg-[#F5F8F5] text-center space-y-2">
          <Loader2 className="h-8 w-8 text-[#006B2D] animate-spin" />
          <p className="text-xs font-bold text-[#17251C]">
            Téléversement sécurisé en cours...
          </p>
          <p className="text-[11px] text-muted-foreground">
            Vérification de l'intégrité et archivage en cours
          </p>
        </div>
      )}

      {/* Uploaded State */}
      {!isUploading && value && (
        <div className="p-3.5 rounded-xl border border-[#D8E6DB] bg-white shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {isImage ? (
                <div className="relative h-14 w-14 rounded-lg overflow-hidden border border-[#D8E6DB] bg-slate-100 shrink-0">
                  <img
                    src={value}
                    alt="Aperçu preuve"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <ImageIcon className="h-5 w-5 text-slate-400 absolute inset-0 m-auto -z-10" />
                </div>
              ) : (
                <div className="h-14 w-14 rounded-lg border border-[#D8E6DB] bg-[#F5F8F5] flex items-center justify-center shrink-0">
                  <FileText className="h-7 w-7 text-[#006B2D]" />
                </div>
              )}

              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-bold text-[#17251C] truncate">
                  {value.split("/").pop() || "Preuve justificative"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isPdf ? "Document PDF" : "Capture / Image"} • Vérifiée
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <a
                    href={value}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#006B2D] hover:underline"
                  >
                    <span>Consulter le fichier</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-xs font-semibold text-[#556B5C] hover:text-[#17251C] hover:bg-slate-100 rounded-lg transition-colors"
                title="Remplacer le fichier"
              >
                <FileUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={handleDelete}
                className="p-1.5 text-xs font-semibold text-[#E52329] hover:bg-red-50 rounded-lg transition-colors"
                title="Supprimer la preuve"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty / Dropzone State */}
      {!isUploading && !value && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={cn(
            "p-5 rounded-xl border-2 border-dashed transition-all duration-150 cursor-pointer flex flex-col items-center justify-center text-center space-y-2",
            isDragOver
              ? "border-[#006B2D] bg-[#F5F8F5]"
              : "border-[#D8E6DB] bg-[#F5F8F5]/60 hover:bg-[#F5F8F5] hover:border-[#006B2D]",
            disabled && "opacity-50 cursor-not-allowed hover:border-[#D8E6DB] hover:bg-[#F5F8F5]/60"
          )}
        >
          <div className="h-10 w-10 rounded-full bg-white border border-[#D8E6DB] flex items-center justify-center text-[#006B2D] shadow-xs">
            <UploadCloud className="h-5 w-5" />
          </div>

          <div className="space-y-0.5">
            <p className="text-xs font-bold text-[#17251C]">

              Glissez-déposez le justificatif ou reçu ici, ou{" "}
              <span className="text-[#006B2D] underline underline-offset-2">parcourez</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Images JPG, PNG, WEBP ou Document PDF (jusqu'à 10 Mo)
            </p>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#E52329]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
}

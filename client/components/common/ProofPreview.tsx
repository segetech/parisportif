import { useEffect, useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, ImageOff, ZoomIn } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ProofPreviewProps {
  url: string;
  title?: string;
}

function isPdfUrl(rawUrl: string): boolean {
  const normalized = rawUrl.split("?")[0].split("#")[0].trim().toLowerCase();
  return normalized.endsWith(".pdf");
}

export function ProofPreview({ url, title = "Pièce justificative" }: ProofPreviewProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    setImageLoadError(false);
    setIsLightboxOpen(false);
  }, [url]);

  const pdf = isPdfUrl(url);

  return (
    <div className="pt-1.5 border-t border-slate-200">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            {pdf ? (
              <FileText className="h-3.5 w-3.5 text-[#006B2D]" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 text-[#006B2D]" />
            )}
            {title}
          </span>
          <div className="flex items-center gap-2">
            {(!imageLoadError || pdf) && (
              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-[#B8DEC6] bg-[#E8F5EC] px-2.5 py-1 text-[11px] font-semibold text-[#006B2D] hover:bg-[#D8EFE0] transition-colors"
              >
                <ZoomIn className="h-3 w-3" />
                Agrandir
              </button>
            )}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Ouvrir
            </a>
          </div>
        </div>

        {pdf ? (
          <div className="p-2.5 bg-slate-50/50 space-y-2">
            <iframe
              src={url}
              title={title}
              className="h-48 w-full rounded-lg border border-slate-200 bg-white"
            />
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006B2D] hover:underline"
            >
              <FileText className="h-3.5 w-3.5" />
              Cliquer pour agrandir le document PDF
            </button>
          </div>
        ) : imageLoadError ? (
          <div className="p-3.5 bg-slate-50/50 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <ImageOff className="h-4 w-4 text-slate-400 shrink-0" />
              Aperçu indisponible pour ce fichier.
            </span>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-[#006B2D] font-semibold underline shrink-0"
            >
              Ouvrir dans un nouvel onglet
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsLightboxOpen(true)}
            aria-label="Agrandir la pièce justificative"
            className="group relative block w-full bg-slate-50/60 p-2.5 text-left focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
          >
            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img
                src={url}
                alt={title}
                onError={() => setImageLoadError(true)}
                className="max-h-56 w-full object-contain bg-white transition-transform duration-150 group-hover:scale-[1.01]"
              />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/85 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm">
                <ZoomIn className="h-3 w-3" />
                Cliquer pour agrandir
              </span>
            </div>
          </button>
        )}
      </div>

      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] flex flex-col gap-3 p-4 sm:p-5 overflow-hidden">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3 pr-8">
              <div>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>
                  Aperçu agrandi du justificatif joint à l&apos;opération.
                </DialogDescription>
              </div>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Nouvel onglet
              </a>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-900 p-3 overflow-auto">
            {pdf ? (
              <iframe
                src={url}
                title={`${title} (agrandi)`}
                className="h-[74vh] w-full rounded-lg bg-white"
              />
            ) : (
              <img
                src={url}
                alt={`${title} (agrandie)`}
                className="max-h-[74vh] w-auto max-w-full object-contain rounded-lg bg-white"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

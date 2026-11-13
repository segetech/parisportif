import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Loader2,
  Move,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export interface ImagePositionOptions {
  zoom: number;
  offsetX: number;
  offsetY: number;
  outputSize?: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Impossible de charger l'image pour le recadrage."));
    img.src = src;
  });
}

/**
 * Renders the source image into a square canvas applying the exact same
 * pan/zoom matrix shown in AvatarPositionDialog.
 */
export async function cropAndPositionImageToBlob(
  imageSrc: string,
  options: ImagePositionOptions,
): Promise<Blob> {
  const size = options.outputSize ?? 512;
  const zoom = clamp(options.zoom, 1, 3);
  const offsetX = clamp(options.offsetX, -100, 100);
  const offsetY = clamp(options.offsetY, -100, 100);

  const img = await loadHtmlImage(imageSrc);
  const natW = img.naturalWidth || img.width || size;
  const natH = img.naturalHeight || img.height || size;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Contexte graphique indisponible sur ce navigateur.");
  }

  ctx.fillStyle = "#17251C";
  ctx.fillRect(0, 0, size, size);

  const baseScale = Math.max(size / natW, size / natH);
  const baseW = natW * baseScale;
  const baseH = natH * baseScale;

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.translate(((offsetX * 0.5) / 100) * size, ((offsetY * 0.5) / 100) * size);
  ctx.scale(zoom, zoom);
  ctx.drawImage(img, -baseW / 2, -baseH / 2, baseW, baseH);
  ctx.restore();

  const toBlobWithType = (mime: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));

  const webpBlob = await toBlobWithType("image/webp", 0.92);
  if (webpBlob) return webpBlob;

  const jpegBlob = await toBlobWithType("image/jpeg", 0.92);
  if (jpegBlob) return jpegBlob;

  throw new Error("Échec de l'export de l'image recadrée.");
}

interface AvatarViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatarUrl: string;
  userName: string;
  onReposition: () => void;
  onChangeFile: () => void;
  onDelete: () => void;
  isBusy?: boolean;
}

export function AvatarViewerDialog({
  open,
  onOpenChange,
  avatarUrl,
  userName,
  onReposition,
  onChangeFile,
  onDelete,
  isBusy = false,
}: AvatarViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white border-[#D8E6DB] text-[#17251C]">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold text-[#17251C]">
            Photo de profil
          </DialogTitle>
          <DialogDescription className="text-xs text-[#556B5C]">
            Aperçu en grand format de la photo actuelle de {userName || "votre compte"}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-2">
          <div className="w-full max-w-[300px] aspect-square rounded-2xl border-2 border-[#D8E6DB] bg-[#17251C] overflow-hidden flex items-center justify-center shadow-xs">
            <img
              src={avatarUrl}
              alt={`Photo de profil de ${userName}`}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={onDelete}
            className="min-h-11 text-xs font-bold text-[#E52329] border-[#E52329]/30 bg-white hover:bg-red-50 hover:text-[#E52329] gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
            <span>Supprimer</span>
          </Button>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={onReposition}
              className="min-h-11 text-xs font-bold border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white gap-1.5"
            >
              <Move className="h-4 w-4 text-[#006B2D]" />
              <span>Ajuster la position</span>
            </Button>
            <Button
              type="button"
              disabled={isBusy}
              onClick={onChangeFile}
              className="min-h-11 text-xs font-bold bg-[#006B2D] hover:bg-[#004D20] text-white gap-1.5"
            >
              <Camera className="h-4 w-4" />
              <span>Changer la photo</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AvatarPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSourceUrl: string | null;
  onConfirm: (positionedFile: File) => Promise<void>;
  isUploading: boolean;
}

export function AvatarPositionDialog({
  open,
  onOpenChange,
  imageSourceUrl,
  onConfirm,
  isUploading,
}: AvatarPositionDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({
    w: 1,
    h: 1,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    baseOffsetX: 0,
    baseOffsetY: 0,
  });

  useEffect(() => {
    if (open) {
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
    }
  }, [open, imageSourceUrl]);

  const handleReset = () => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const nudge = (dx: number, dy: number) => {
    setOffsetX((prev) => clamp(prev + dx, -100, 100));
    setOffsetY((prev) => clamp(prev + dy, -100, 100));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isUploading || isProcessing) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseOffsetX: offsetX,
      baseOffsetY: offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const boxSize = rect?.width || 240;
    const dxPct = ((e.clientX - dragStateRef.current.startX) / (boxSize * 0.5)) * 100;
    const dyPct = ((e.clientY - dragStateRef.current.startY) / (boxSize * 0.5)) * 100;

    setOffsetX(clamp(Math.round(dragStateRef.current.baseOffsetX + dxPct), -100, 100));
    setOffsetY(clamp(Math.round(dragStateRef.current.baseOffsetY + dyPct), -100, 100));
  };

  const handlePointerUp = () => {
    dragStateRef.current.active = false;
  };

  const handleSavePosition = async () => {
    if (!imageSourceUrl) return;
    try {
      setIsProcessing(true);
      let fileToUpload: File;
      try {
        const blob = await cropAndPositionImageToBlob(imageSourceUrl, {
          zoom,
          offsetX,
          offsetY,
          outputSize: 512,
        });
        const ext = blob.type.includes("jpeg") ? "jpg" : "webp";
        fileToUpload = new File([blob], `avatar-positioned.${ext}`, {
          type: blob.type || "image/webp",
        });
      } catch {
        // Fallback if browser blocks canvas readback: fetch raw image blob
        const resp = await fetch(imageSourceUrl);
        const rawBlob = await resp.blob();
        fileToUpload = new File([rawBlob], "avatar-positioned.png", {
          type: rawBlob.type || "image/png",
        });
      }

      await onConfirm(fileToUpload);
    } finally {
      setIsProcessing(false);
    }
  };

  const isWide = naturalSize.w >= naturalSize.h;
  const busy = isUploading || isProcessing;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg bg-white border-[#D8E6DB] text-[#17251C]">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold text-[#17251C]">
            Positionner la photo de profil
          </DialogTitle>
          <DialogDescription className="text-xs text-[#556B5C]">
            Glissez l’image dans le cadre ou utilisez les boutons ci-dessous pour ajuster le cadrage et le zoom avant l’enregistrement.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-1">
          {/* Interactive square crop viewport */}
          <div
            ref={viewportRef}
            role="application"
            aria-label="Zone de positionnement de la photo"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-60 h-60 sm:w-64 sm:h-64 rounded-2xl border-2 border-[#006B2D] bg-[#17251C] overflow-hidden select-none touch-none cursor-move shadow-xs"
          >
            {imageSourceUrl && (
              <div
                className="w-full h-full flex items-center justify-center pointer-events-none"
                style={{
                  transform: `translate(${offsetX * 0.5}%, ${offsetY * 0.5}%) scale(${zoom})`,
                  transformOrigin: "center center",
                }}
              >
                <img
                  src={imageSourceUrl}
                  alt="Aperçu du cadrage"
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    if (el.naturalWidth && el.naturalHeight) {
                      setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
                    }
                  }}
                  style={{
                    width: isWide ? "auto" : "100%",
                    height: isWide ? "100%" : "auto",
                  }}
                  className="max-w-none max-h-none select-none"
                  draggable={false}
                />
              </div>
            )}

            {/* Subtle 3x3 framing grid overlay */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
            >
              <div className="border-r border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-r border-b border-white/25" />
              <div className="border-b border-white/25" />
              <div className="border-r border-white/25" />
              <div className="border-r border-white/25" />
              <div />
            </div>
          </div>

          {/* Zoom slider & nudge controls */}
          <div className="w-full space-y-3 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] p-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Dézoomer"
                disabled={busy || zoom <= 1}
                onClick={() => setZoom((z) => clamp(Number((z - 0.15).toFixed(2)), 1, 3))}
                className="min-h-11 min-w-11 border-[#D8E6DB] bg-white text-[#17251C]"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#556B5C]">
                  <span>Zoom</span>
                  <span className="font-mono text-[#17251C]">{zoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  aria-label="Niveau de zoom"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  disabled={busy}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-[#006B2D] cursor-pointer"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Zoomer"
                disabled={busy || zoom >= 3}
                onClick={() => setZoom((z) => clamp(Number((z + 0.15).toFixed(2)), 1, 3))}
                className="min-h-11 min-w-11 border-[#D8E6DB] bg-white text-[#17251C]"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D8E6DB]">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Déplacer à gauche"
                  disabled={busy}
                  onClick={() => nudge(-8, 0)}
                  className="min-h-11 min-w-11 border-[#D8E6DB] bg-white text-[#17251C]"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Déplacer en haut"
                  disabled={busy}
                  onClick={() => nudge(0, -8)}
                  className="min-h-11 min-w-11 border-[#D8E6DB] bg-white text-[#17251C]"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Déplacer en bas"
                  disabled={busy}
                  onClick={() => nudge(0, 8)}
                  className="min-h-11 min-w-11 border-[#D8E6DB] bg-white text-[#17251C]"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Déplacer à droite"
                  disabled={busy}
                  onClick={() => nudge(8, 0)}
                  className="min-h-11 min-w-11 border-[#D8E6DB] bg-white text-[#17251C]"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={handleReset}
                className="min-h-11 text-xs font-bold border-[#D8E6DB] bg-white text-[#17251C] gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Centrer</span>
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="min-h-11 text-xs font-bold border-[#D8E6DB] bg-[#F5F8F5] text-[#17251C] hover:bg-white"
          >
            Annuler
          </Button>
          <Button
            type="button"
            disabled={busy || !imageSourceUrl}
            onClick={handleSavePosition}
            className="min-h-11 text-xs font-bold bg-[#006B2D] hover:bg-[#004D20] text-white gap-2 px-5"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Enregistrement…</span>
              </>
            ) : (
              <span>Valider cette position</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

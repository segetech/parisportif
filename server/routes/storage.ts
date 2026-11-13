import { Request, Response, RequestHandler } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { uploadToR2, getFromR2, deleteFromR2 } from "../lib/storage";

// Configuration de Multer pour stockage en mémoire vive (max 10 Mo)
const storage = multer.memoryStorage();
export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 Mo
  },
  fileFilter: (_req, file, cb) => {
    // Types autorisés : Images (PNG, JPG, JPEG, WEBP, GIF) et Documents (PDF)
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];

    if (allowedMimes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Format de fichier non pris en charge. Formats acceptés : JPG, PNG, WEBP, GIF, PDF."));
    }
  },
});

export const handleUploadWithMulter: RequestHandler = (req, res, next) => {
  uploadMiddleware.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.message || "Erreur lors de la réception du fichier.",
      });
    }
    next();
  });
};

const ALLOWED_FOLDERS = new Set([
  "avatars",
  "preuves",
  "preuves/tests",
  "preuves/transactions",
  "preuves/activites-illegales",
  "rapports",
  "imports",
]);

function resolveStorageKey(rawFolder: unknown, sanitizedName: string, uniqueId: string): string {
  const requested = typeof rawFolder === "string" ? rawFolder.trim().toLowerCase() : "preuves";
  const folder = ALLOWED_FOLDERS.has(requested) ? requested : "preuves";
  const timestamp = Date.now();

  if (folder === "avatars") {
    return `avatars/${timestamp}_${uniqueId}_${sanitizedName}`;
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${folder}/${year}/${month}/${timestamp}_${uniqueId}_${sanitizedName}`;
}

export const handleUploadFile: RequestHandler = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier fourni dans la requête." });
    }

    // Nom unique sécurisé et non collisionnable
    const uniqueId = crypto.randomUUID();
    const sanitizedName = req.file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .slice(0, 50);
    const key = resolveStorageKey(req.body.folder || req.query.folder, sanitizedName, uniqueId);

    const uploaded = await uploadToR2({
      key,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      metadata: {
        originalName: encodeURIComponent(req.file.originalname),
        uploadedBy: (req as any).user?.id || "anonymous",
      },
    });

    return res.status(200).json({
      success: true,
      url: uploaded.url,
      key: uploaded.key,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      contentType: req.file.mimetype,
    });
  } catch (error: any) {
    console.error("Erreur upload Cloudflare R2:", error);
    return res.status(500).json({
      error: "Erreur lors de l'enregistrement du fichier.",
      details: error.message,
    });
  }
};

export const handleGetFile: RequestHandler = async (req: Request, res: Response) => {
  try {
    let key = (req.params as any).key || req.params[0];
    if (!key) {
      return res.status(400).json({ error: "Clé de fichier requise." });
    }

    // Décoder si la clé a été URL-encodée
    key = decodeURIComponent(key);

    const r2Response = await getFromR2(key);

    if (!r2Response || !r2Response.Body) {
      return res.status(404).json({ error: "Fichier introuvable sur le stockage." });
    }

    // Définir les en-têtes HTTP de streaming et de cache
    if (r2Response.ContentType) {
      res.setHeader("Content-Type", r2Response.ContentType);
    }
    if (r2Response.ContentLength) {
      res.setHeader("Content-Length", r2Response.ContentLength.toString());
    }
    if (r2Response.ETag) {
      res.setHeader("ETag", r2Response.ETag);
    }

    // Cache immutable pour performance maximale
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    // Si inline visualisable dans le navigateur (image / pdf)
    const isPdf = r2Response.ContentType === "application/pdf";
    const isImage = r2Response.ContentType?.startsWith("image/");
    if (isPdf || isImage) {
      res.setHeader("Content-Disposition", "inline");
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(key)}"`);
    }

    // Streaming du flux vers la réponse Express
    if (r2Response.Body instanceof Readable) {
      r2Response.Body.pipe(res);
    } else {
      // Pour les environnements où Body est un Web ReadableStream ou Blob
      const stream = Readable.fromWeb(r2Response.Body as any);
      stream.pipe(res);
    }
  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: "Fichier introuvable." });
    }
    console.error("Erreur récupération fichier Cloudflare R2:", error);
    return res.status(500).json({ error: "Erreur lecture fichier.", details: error.message });
  }
};

export const handleDeleteFile: RequestHandler = async (req: Request, res: Response) => {
  try {
    let key = req.params[0] || (req.params as any).key;
    if (!key) {
      return res.status(400).json({ error: "Clé de fichier requise." });
    }
    key = decodeURIComponent(key);

    await deleteFromR2(key);
    return res.status(200).json({ success: true, message: "Fichier supprimé avec succès." });
  } catch (error: any) {
    console.error("Erreur suppression Cloudflare R2:", error);
    return res.status(500).json({ error: "Erreur suppression fichier.", details: error.message });
  }
};

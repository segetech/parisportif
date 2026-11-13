import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createServer } from "../index";
import { uploadToR2, getFromR2, deleteFromR2, checkFileExistsInR2 } from "../lib/storage";

describe("Cloudflare R2 Object Storage Integration", { timeout: 20000 }, () => {
  let server: http.Server;
  let baseUrl: string;
  const testKey = `test/test_file_${Date.now()}.txt`;
  const uploadedKeys: string[] = [];

  beforeAll(async () => {
    const app = createServer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    // Nettoyage des fichiers temporaires créés sur R2 pendant les tests
    for (const key of uploadedKeys) {
      try {
        await deleteFromR2(key);
      } catch {}
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("doit uploader directement un buffer sur le bucket R2 et le relire fidèlement", async () => {
    const testContent = "Test - Preuve de test R2 " + Date.now();
    uploadedKeys.push(testKey);

    const res = await uploadToR2({
      key: testKey,
      buffer: Buffer.from(testContent, "utf-8"),
      contentType: "text/plain",
      metadata: { env: "test" },
    });

    expect(res.key).toBe(testKey);
    expect(res.url).toContain(encodeURIComponent(testKey));
    expect(res.size).toBe(Buffer.byteLength(testContent));

    // Vérification de la présence
    const exists = await checkFileExistsInR2(testKey);
    expect(exists).toBe(true);

    // Lecture du contenu
    const getRes = await getFromR2(testKey);
    const bodyStr = await getRes.Body?.transformToString();
    expect(bodyStr).toBe(testContent);
  });

  it("POST /api/upload - doit uploader une preuve image via l'endpoint Express et renvoyer son URL", async () => {
    const fakeGifBuffer = Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;");

    const formData = new FormData();
    const blob = new Blob([fakeGifBuffer], { type: "image/gif" });
    formData.append("file", blob, "ticket_preuve.gif");
    formData.append("folder", "preuves");

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.url).toMatch(/^\/api\/storage\/file\//);
    expect(json.key).toMatch(/^preuves\//);
    expect(json.fileName).toBe("ticket_preuve.gif");

    uploadedKeys.push(json.key);

    // Vérifier la récupération via GET /api/storage/file/*
    const getRes = await fetch(`${baseUrl}${json.url}`);
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("content-type")).toContain("image/gif");
    expect(getRes.headers.get("cache-control")).toContain("immutable");
  });

  it("POST /api/upload - doit rejeter un format de fichier non autorisé (ex: .exe)", async () => {
    const badBuffer = Buffer.from("MZ\x90\x00\x03\x00\x00\x00");

    const formData = new FormData();
    const blob = new Blob([badBuffer], { type: "application/x-msdownload" });
    formData.append("file", blob, "virus.exe");

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400); // Erreur de validation de type multer
    const json = await res.json();
    expect(json.details || json.error).toMatch(/Format de fichier non pris en charge/i);
  });

  it("GET /api/storage/file/* - doit renvoyer 404 pour un fichier inexistant", async () => {
    const res = await fetch(`${baseUrl}/api/storage/file/preuves/fichier_inexistant_99999.png`);
    expect(res.status).toBe(404);
  });

  it("POST /api/upload - organise les fichiers dans les sous-dossiers dédiés (avatars, preuves/transactions/AAAA/MM)", async () => {
    const fakeGifBuffer = Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;");

    const txForm = new FormData();
    txForm.append("file", new Blob([fakeGifBuffer], { type: "image/gif" }), "recu.gif");
    txForm.append("folder", "preuves/transactions");

    const txRes = await fetch(`${baseUrl}/api/upload`, { method: "POST", body: txForm });
    expect(txRes.status).toBe(200);
    const txJson = await txRes.json();
    expect(txJson.key).toMatch(/^preuves\/transactions\/\d{4}\/\d{2}\//);
    uploadedKeys.push(txJson.key);

    const avatarForm = new FormData();
    avatarForm.append("file", new Blob([fakeGifBuffer], { type: "image/gif" }), "avatar.gif");
    avatarForm.append("folder", "avatars");

    const avatarRes = await fetch(`${baseUrl}/api/upload`, { method: "POST", body: avatarForm });
    expect(avatarRes.status).toBe(200);
    const avatarJson = await avatarRes.json();
    expect(avatarJson.key).toMatch(/^avatars\//);
    uploadedKeys.push(avatarJson.key);
  });
});

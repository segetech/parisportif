import React, { useState, useRef, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calendar,
  Building2,
  CreditCard,
  Trophy,
  ArrowRight,
  ArrowLeft,
  Download,
  Filter,
  Check,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  parseTransactionRow,
  parseBetRow,
  parseVenuesGrouped,
  detectDuplicatesInTransactions,
  sanitizeForSpreadsheet,
  ParsedTransactionRow,
  ParsedBetRow,
  ParsedVenueGroup,
  Anomaly,
} from "@/lib/excel-import-engine";
import { queryClient } from "@/lib/queryClient";

type ImportStep = "upload" | "config" | "preview" | "importing" | "report";
type TargetEntityType = "depotretrait" | "pari" | "salles";

export default function ExcelImportPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Étape du flux
  const [currentStep, setCurrentStep] = useState<ImportStep>("upload");

  // Fichier et feuilles détectées
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [detectedType, setDetectedType] = useState<TargetEntityType>("depotretrait");

  // Données brutes lues
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);

  // Configuration métier
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [preventDuplicates, setPreventDuplicates] = useState<boolean>(true);

  // Données normalisées
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransactionRow[]>([]);
  const [parsedBets, setParsedBets] = useState<ParsedBetRow[]>([]);
  const [parsedVenues, setParsedVenues] = useState<ParsedVenueGroup[]>([]);

  // Filtre d'affichage des anomalies dans l'aperçu
  const [filterAnomalyOnly, setFilterAnomalyOnly] = useState<boolean>(false);

  // État d'importation
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [batchResult, setBatchResult] = useState<{
    batchId: string;
    total: number;
    imported: number;
    rejected: number;
    ignored: number;
    anomalies: Anomaly[];
  } | null>(null);

  // ---------------------------------------------------------------------------
  // 1. LECTURE DU CLASSEUR EXCEL
  // ---------------------------------------------------------------------------

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation du format et de la taille
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Format de fichier non supporté. Veuillez choisir un fichier Excel (.xlsx ou .xls).");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("Le fichier dépasse la limite maximale autorisée de 20 Mo.");
      return;
    }

    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + " Ko");
    setIsProcessing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const sheetNames: string[] = [];
      workbook.eachSheet((s) => sheetNames.push(s.name));
      setAvailableSheets(sheetNames);

      // Reconnaissance automatique intelligente de la feuille
      let defaultSheet = sheetNames[0] || "";
      let type: TargetEntityType = "depotretrait";

      for (const name of sheetNames) {
        const lower = name.toLowerCase().trim();
        if (lower.includes("depot") || lower.includes("retrait")) {
          defaultSheet = name;
          type = "depotretrait";
          break;
        } else if (lower.includes("pari")) {
          defaultSheet = name;
          type = "pari";
          break;
        } else if (lower.includes("salle")) {
          defaultSheet = name;
          type = "salles";
          break;
        }
      }

      setSelectedSheet(defaultSheet);
      setDetectedType(type);

      // Extraction des lignes de la feuille
      await processSheetData(workbook, defaultSheet, type);

      setCurrentStep("config");
      toast.success(`Fichier "${file.name}" chargé avec succès (${sheetNames.length} feuille(s) détectée(s))`);
    } catch (err: any) {
      console.error("Erreur lecture Excel:", err);
      toast.error("Erreur lors de la lecture du classeur Excel : " + (err.message || "Fichier corrompu"));
    } finally {
      setIsProcessing(false);
    }
  }

  async function processSheetData(workbook: ExcelJS.Workbook, sheetName: string, type: TargetEntityType) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) return;

    // Détection des en-têtes
    const headers: { col: number; name: string }[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const val = cell.text ? cell.text.trim() : "";
      if (val) headers.push({ col: colNumber, name: val });
    });

    const rows: Record<string, any>[] = [];

    worksheet.eachRow((r, rowNumber) => {
      if (rowNumber === 1) return; // Sauter la ligne d'en-tête

      const rowObj: Record<string, any> = { rowNumber };
      let hasData = false;

      // Cas spécial pour la feuille Salles de jeux
      if (type === "salles") {
        const no = r.getCell(1).text?.trim();
        const quartier = r.getCell(2).text?.trim();
        const operator = r.getCell(3).text?.trim();
        const support = r.getCell(4).text?.trim();
        const betType = r.getCell(5).text?.trim();
        const localisation = r.getCell(6).text?.trim();

        if (no || quartier || operator || betType || localisation) {
          rows.push({
            rowNumber,
            no,
            quartier,
            operator,
            support,
            betType,
            localisation,
          });
        }
      } else {
        // Feuilles depotretrait ou pari
        for (const h of headers) {
          const cellVal = r.getCell(h.col).text?.trim();
          rowObj[h.name] = cellVal || "";
          if (cellVal) hasData = true;
        }
        if (hasData) {
          rows.push(rowObj);
        }
      }
    });

    setRawRows(rows);
  }

  // ---------------------------------------------------------------------------
  // 2. NORMALISATION ET PRÉPARATION DE L'APERÇU
  // ---------------------------------------------------------------------------

  async function handleProceedToPreview() {
    setIsProcessing(true);
    try {
      if (detectedType === "depotretrait") {
        // Charger les références existantes en base pour détecter les collisions
        const { data: existingTxs } = await supabase.from("transactions").select("reference").not("reference", "is", null);
        const existingRefs = new Set((existingTxs || []).map((t: any) => String(t.reference).toLowerCase()));

        const parsed = rawRows.map((r) => parseTransactionRow(r, r.rowNumber, selectedDate));
        if (preventDuplicates) {
          detectDuplicatesInTransactions(parsed, existingRefs);
        }
        setParsedTransactions(parsed);
      } else if (detectedType === "pari") {
        const parsed = rawRows.map((r) => parseBetRow(r, r.rowNumber, selectedDate));
        setParsedBets(parsed);
      } else if (detectedType === "salles") {
        const grouped = parseVenuesGrouped(rawRows as any);
        setParsedVenues(grouped);
      }

      setCurrentStep("preview");
    } catch (e: any) {
      toast.error("Erreur d'analyse : " + (e.message || "inconnue"));
    } finally {
      setIsProcessing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. STATISTIQUES DE L'APERÇU
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    let total = 0;
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    const allAnomalies: Anomaly[] = [];

    if (detectedType === "depotretrait") {
      total = parsedTransactions.length;
      parsedTransactions.forEach((tx) => {
        if (tx.isValid) validCount++;
        else errorCount++;
        tx.anomalies.forEach((a) => {
          allAnomalies.push(a);
          if (a.severity === "warning") warningCount++;
        });
      });
    } else if (detectedType === "pari") {
      total = parsedBets.length;
      parsedBets.forEach((b) => {
        if (b.isValid) validCount++;
        else errorCount++;
        b.anomalies.forEach((a) => {
          allAnomalies.push(a);
          if (a.severity === "warning") warningCount++;
        });
      });
    } else if (detectedType === "salles") {
      total = parsedVenues.length;
      parsedVenues.forEach((v) => {
        if (v.isValid) validCount++;
        else errorCount++;
        v.anomalies.forEach((a) => {
          allAnomalies.push(a);
          if (a.severity === "warning") warningCount++;
        });
      });
    }

    return { total, validCount, errorCount, warningCount, allAnomalies };
  }, [detectedType, parsedTransactions, parsedBets, parsedVenues]);

  // ---------------------------------------------------------------------------
  // 4. CONFIRMATION ET ENREGISTREMENT EN BASE DE DONNÉES
  // ---------------------------------------------------------------------------

  async function handleConfirmImport() {
    if (isProcessing) return;
    setIsProcessing(true);
    setCurrentStep("importing");
    setImportProgress(10);

    const isAgent = user?.role === "AGENT";
    const initialStatus = isAgent ? "en_attente" : "valide";
    const batchId = crypto.randomUUID();

    let imported = 0;
    let rejected = 0;
    let ignored = 0;

    try {
      if (detectedType === "depotretrait") {
        const rowsToInsert = parsedTransactions.filter((tx) => tx.isValid);
        rejected = parsedTransactions.length - rowsToInsert.length;

        const chunks = chunkArray(rowsToInsert, 25);
        let progress = 10;
        const step = 80 / (chunks.length || 1);

        for (const chunk of chunks) {
          const records = chunk.map((tx) => ({
            date: tx.date,
            time: tx.time ? `${tx.time}:00` : null,
            operator: tx.operator,
            platform: tx.platform,
            payment_operator: tx.paymentOperator,
            type: tx.type,
            amount_fcfa: tx.amount,
            phone: tx.phone,
            reference: tx.reference,
            proof_status: tx.proofStatus,
            created_by: user?.id,
            validation_status: initialStatus,
            import_batch_id: batchId,
          }));

          const { error } = await supabase.from("transactions").insert(records);
          if (error) throw error;
          imported += chunk.length;
          progress += step;
          setImportProgress(Math.min(90, Math.round(progress)));
        }
      } else if (detectedType === "pari") {
        const rowsToInsert = parsedBets.filter((b) => b.isValid);
        rejected = parsedBets.length - rowsToInsert.length;

        const chunks = chunkArray(rowsToInsert, 25);
        let progress = 10;
        const step = 80 / (chunks.length || 1);

        for (const chunk of chunks) {
          const records = chunk.map((b) => ({
            date: b.date,
            time: b.time ? `${b.time}:00` : null,
            operator: b.operator,
            support: b.support,
            bet_type: b.betType,
            amount_fcfa: b.amount,
            phone: b.phone,
            reference: b.reference,
            status: b.status,
            amount_won_fcfa: b.amountWon,
            proof_status: b.proofStatus,
            created_by: user?.id,
            validation_status: initialStatus,
            import_batch_id: batchId,
          }));

          const { error } = await supabase.from("bets").insert(records);
          if (error) throw error;
          imported += chunk.length;
          progress += step;
          setImportProgress(Math.min(90, Math.round(progress)));
        }
      } else if (detectedType === "salles") {
        const rowsToInsert = parsedVenues.filter((v) => v.isValid);
        rejected = parsedVenues.length - rowsToInsert.length;

        for (const v of rowsToInsert) {
          const venueRecord = {
            quartier_no: v.venueNumber ? String(v.venueNumber) : null,
            quartier: v.quartier,
            operator: v.operator,
            support: v.support,
            bet_type: v.games[0] || "Jeux variés",
            games: v.games,
            address: v.address,
            validation_status: initialStatus,
            created_by: user?.id,
            import_batch_id: batchId,
          };

          const { data: insertedVenue, error: vErr } = await supabase
            .from("venues")
            .insert([venueRecord])
            .select("id")
            .single();

          if (vErr) throw vErr;

          // Insertion des jeux rattachés à l'établissement dans venue_games
          if (insertedVenue && v.games.length > 0) {
            const gameRecords = v.games.map((g) => ({
              venue_id: insertedVenue.id,
              game_name: g,
              active: true,
            }));
            await supabase.from("venue_games").insert(gameRecords);
          }
          imported++;
        }
      }

      setImportProgress(100);

      // Traçabilité du lot d'import dans import_batches
      const batchPayload = {
        id: batchId,
        file_name: fileName,
        sheet_name: selectedSheet,
        entity_type: detectedType,
        total_rows: stats.total,
        imported_rows: imported,
        rejected_rows: rejected,
        ignored_rows: ignored,
        status: "termine",
        anomalies: stats.allAnomalies.slice(0, 100),
        imported_by: user?.id,
      };

      try {
        await supabase.from("import_batches").insert([batchPayload]);
      } catch (batchErr) {
        console.warn("Enregistrement import_batch:", batchErr);
      }

      // Invalidation ciblée des caches React Query
      await queryClient.invalidateQueries();

      setBatchResult({
        batchId,
        total: stats.total,
        imported,
        rejected,
        ignored,
        anomalies: stats.allAnomalies,
      });

      setCurrentStep("report");
      toast.success(`Import terminé avec succès : ${imported} élément(s) importé(s)`);
    } catch (importErr: any) {
      console.error("Erreur enregistrement import:", importErr);
      toast.error("Erreur durant l'enregistrement : " + (importErr.message || "Erreur base de données"));
      setCurrentStep("preview");
    } finally {
      setIsProcessing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. TÉLÉCHARGEMENT DU RAPPORT D'ANOMALIES (CSV SÉCURISÉ)
  // ---------------------------------------------------------------------------

  function downloadAnomalyReport() {
    if (!stats.allAnomalies.length) {
      toast.info("Aucune anomalie à exporter.");
      return;
    }

    const headers = ["Ligne", "Champ", "Gravité", "Message", "Valeur source"];
    const rows = stats.allAnomalies.map((a) => [
      sanitizeForSpreadsheet(a.row),
      sanitizeForSpreadsheet(a.field),
      sanitizeForSpreadsheet(a.severity.toUpperCase()),
      sanitizeForSpreadsheet(a.message),
      sanitizeForSpreadsheet(a.rawValue || ""),
    ]);

    const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `rapport-anomalies-${fileName.replace(/\.xlsx?$/i, "")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Rapport d'anomalies téléchargé.");
  }

  function chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-20">
        {/* EN-TÊTE PRINCIPAL */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D8E6DB] pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#17251C] flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-[#006B2D]" />
              Module d'Import Excel Professionnel
            </h1>
            <p className="text-xs sm:text-sm text-[#556B5C]">
              Contrôle strict des données, regroupement multi-jeux, détection des anomalies et traçabilité des lots
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#006B2D]/10 text-[#006B2D] border border-[#006B2D]/20">
              Rôle : {user?.role || "AGENT"}
            </span>
          </div>
        </div>

        {/* INDICATEUR D'ÉTAPES RESPONSIVE */}
        <div className="grid grid-cols-4 gap-2 text-xs font-semibold">
          <div
            className={`p-2.5 rounded-xl border text-center transition-all ${
              currentStep === "upload"
                ? "bg-[#006B2D] text-white border-[#006B2D] font-bold"
                : "bg-white text-[#556B5C] border-[#D8E6DB]"
            }`}
          >
            1. Choix du fichier
          </div>
          <div
            className={`p-2.5 rounded-xl border text-center transition-all ${
              currentStep === "config"
                ? "bg-[#006B2D] text-white border-[#006B2D] font-bold"
                : "bg-white text-[#556B5C] border-[#D8E6DB]"
            }`}
          >
            2. Configuration
          </div>
          <div
            className={`p-2.5 rounded-xl border text-center transition-all ${
              currentStep === "preview"
                ? "bg-[#006B2D] text-white border-[#006B2D] font-bold"
                : "bg-white text-[#556B5C] border-[#D8E6DB]"
            }`}
          >
            3. Contrôle & Aperçu
          </div>
          <div
            className={`p-2.5 rounded-xl border text-center transition-all ${
              currentStep === "report"
                ? "bg-[#006B2D] text-white border-[#006B2D] font-bold"
                : "bg-white text-[#556B5C] border-[#D8E6DB]"
            }`}
          >
            4. Rapport final
          </div>
        </div>

        {/* =================================================================== */}
        {/* ÉTAPE 1 : CHOIX DU FICHIER & DÉTECTION                              */}
        {/* =================================================================== */}
        {currentStep === "upload" && (
          <div className="bg-white rounded-2xl border border-[#D8E6DB] p-6 sm:p-10 space-y-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#D8E6DB] hover:border-[#006B2D] bg-[#F5F8F5] p-8 sm:p-12 rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center gap-4 group"
            >
              <div className="h-16 w-16 rounded-full bg-white border border-[#D8E6DB] flex items-center justify-center text-[#006B2D] group-hover:scale-105 transition-transform shadow-xs">
                <Upload className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <p className="text-base sm:text-lg font-bold text-[#17251C]">
                  Sélectionnez ou déposez votre fichier Excel
                </p>
                <p className="text-xs sm:text-sm text-[#556B5C]">
                  Fichiers supportés : <code className="font-semibold text-[#006B2D]">formulaire type excel.xlsx</code> ou{" "}
                  <code className="font-semibold text-[#006B2D]">SALLE DE JEUX PAR QUARTIER.xlsx</code> (max 20 Mo)
                </p>
              </div>
              <Button
                type="button"
                className="mt-2 min-h-[44px] px-6 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold rounded-xl shadow-xs"
              >
                Parcourir les fichiers
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-4 border-t border-[#D8E6DB]">
              <div className="p-3 bg-[#F5F8F5] rounded-xl border border-[#D8E6DB]">
                <div className="flex items-center gap-2 text-xs font-bold text-[#17251C]">
                  <CreditCard className="h-4 w-4 text-[#006B2D]" />
                  Dépôts & Retraits
                </div>
                <p className="text-[11px] text-[#556B5C] mt-1">
                  Reconnaissance automatique des flux Orange, Moov, Wave et conversion des montants (ex: 1000F).
                </p>
              </div>

              <div className="p-3 bg-[#F5F8F5] rounded-xl border border-[#D8E6DB]">
                <div className="flex items-center gap-2 text-xs font-bold text-[#17251C]">
                  <Trophy className="h-4 w-4 text-[#006B2D]" />
                  Paris & Jeux
                </div>
                <p className="text-[11px] text-[#556B5C] mt-1">
                  Distinction stricte du résultat (gagné/perdu), gains réels et validation multi-rôles.
                </p>
              </div>

              <div className="p-3 bg-[#F5F8F5] rounded-xl border border-[#D8E6DB]">
                <div className="flex items-center gap-2 text-xs font-bold text-[#17251C]">
                  <Building2 className="h-4 w-4 text-[#006B2D]" />
                  Salles de jeux
                </div>
                <p className="text-[11px] text-[#556B5C] mt-1">
                  Regroupement intelligent de plusieurs jeux sous une même salle physique (34 établissements).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* ÉTAPE 2 : CONFIGURATION MÉTIER (DATE, FEUILLE, DOUBLONS)            */}
        {/* =================================================================== */}
        {currentStep === "config" && (
          <div className="bg-white rounded-2xl border border-[#D8E6DB] p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#D8E6DB] pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#17251C]">
                  Configuration métier de l'import
                </h2>
                <p className="text-xs text-[#556B5C]">
                  Fichier : <span className="font-bold text-[#17251C]">{fileName}</span> ({fileSize})
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep("upload")}
                className="text-xs border-[#D8E6DB] text-[#556B5C]"
              >
                Changer de fichier
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Choix de la feuille */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] block">
                  Feuille source à importer *
                </label>
                <select
                  value={selectedSheet}
                  onChange={(e) => {
                    const sheet = e.target.value;
                    setSelectedSheet(sheet);
                    const lower = sheet.toLowerCase();
                    if (lower.includes("depot") || lower.includes("retrait")) setDetectedType("depotretrait");
                    else if (lower.includes("pari")) setDetectedType("pari");
                    else if (lower.includes("salle")) setDetectedType("salles");
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-[#F5F8F5] border border-[#D8E6DB] rounded-xl text-[#17251C] focus:outline-none focus:ring-2 focus:ring-[#006B2D]"
                >
                  {availableSheets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#556B5C]">
                  Type détecté :{" "}
                  <span className="font-bold text-[#006B2D] uppercase">
                    {detectedType === "depotretrait"
                      ? "Transactions financières (Dépôt / Retrait)"
                      : detectedType === "pari"
                      ? "Paris sportifs & jeux"
                      : "Points de vente physiques (Salles de jeux)"}
                  </span>
                </p>
              </div>

              {/* Règle de date explicite (Obligatoire car absente du fichier Excel) */}
              {detectedType !== "salles" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#556B5C] flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[#006B2D]" />
                      Date de référence des opérations *
                    </label>
                    <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      Règle explicite requise
                    </span>
                  </div>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="min-h-[44px] bg-[#F5F8F5] border-[#D8E6DB] text-sm"
                  />
                  <p className="text-[11px] text-[#556B5C]">
                    La colonne Date étant absente du fichier source, cette date sera appliquée à chaque ligne (aucune déduction silencieuse).
                  </p>
                </div>
              )}
            </div>

            {/* Options anti-doublon */}
            <div className="p-4 bg-[#F5F8F5] rounded-xl border border-[#D8E6DB] space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preventDuplicates}
                  onChange={(e) => setPreventDuplicates(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#D8E6DB] text-[#006B2D] focus:ring-[#006B2D]"
                />
                <div className="text-xs space-y-0.5">
                  <span className="font-bold text-[#17251C]">
                    Activer le contrôle strict des collisions et doublons de référence
                  </span>
                  <p className="text-[#556B5C]">
                    Signale les doublons au sein du fichier et empêche la ré-importation de transactions portant la même référence qu'un enregistrement existant.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[#D8E6DB]">
              <Button
                variant="outline"
                onClick={() => setCurrentStep("upload")}
                className="min-h-[44px] px-5 border-[#D8E6DB] text-[#556B5C]"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Retour
              </Button>
              <Button
                onClick={handleProceedToPreview}
                className="min-h-[44px] px-6 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold rounded-xl shadow-xs"
              >
                Lancer l'analyse et l'aperçu
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* ÉTAPE 3 : APERÇU, STATISTIQUES & CONTRÔLE DES ANOMALIES              */}
        {/* =================================================================== */}
        {currentStep === "preview" && (
          <div className="space-y-6">
            {/* KPI STATISTIQUES D'ANALYSE */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 bg-white rounded-2xl border border-[#D8E6DB]">
                <span className="text-[11px] font-bold text-[#556B5C] uppercase tracking-wider block">
                  Total Lignes / Groupes
                </span>
                <span className="text-2xl font-black text-[#17251C] mt-1 block">{stats.total}</span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#D8E6DB]">
                <span className="text-[11px] font-bold text-[#006B2D] uppercase tracking-wider block flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Conformes
                </span>
                <span className="text-2xl font-black text-[#006B2D] mt-1 block">{stats.validCount}</span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#D8E6DB]">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Avertissements
                </span>
                <span className="text-2xl font-black text-amber-700 mt-1 block">{stats.warningCount}</span>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#D8E6DB]">
                <span className="text-[11px] font-bold text-[#E52329] uppercase tracking-wider block flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> Erreurs bloquantes
                </span>
                <span className="text-2xl font-black text-[#E52329] mt-1 block">{stats.errorCount}</span>
              </div>
            </div>

            {/* BANDEAU D'ACTIONS D'APERÇU */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#D8E6DB]">
              <div className="flex items-center gap-2">
                <Button
                  variant={filterAnomalyOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterAnomalyOnly(!filterAnomalyOnly)}
                  className={`min-h-[40px] text-xs font-semibold ${
                    filterAnomalyOnly
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "border-[#D8E6DB] text-[#556B5C]"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  {filterAnomalyOnly ? "Afficher tout" : "Filtrer seulement les anomalies"}
                </Button>

                {stats.allAnomalies.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadAnomalyReport}
                    className="min-h-[40px] text-xs border-[#D8E6DB] text-[#556B5C] hover:bg-[#F5F8F5]"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Télécharger le rapport d'anomalies
                  </Button>
                )}
              </div>

              <div className="text-xs text-[#556B5C]">
                Statut après import :{" "}
                <Badge className={user?.role === "AGENT" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                  {user?.role === "AGENT" ? "en attente de validation (Agent)" : "validé (Contrôleur/Admin)"}
                </Badge>
              </div>
            </div>

            {/* LISTE D'APERÇU ADAPTATIVE (CARTES SUR MOBILE & DESKTOP) */}
            <div className="space-y-3">
              {detectedType === "depotretrait" && (
                <>
                  {parsedTransactions
                    .filter((tx) => (filterAnomalyOnly ? tx.anomalies.length > 0 : true))
                    .map((tx) => (
                      <div
                        key={tx.rowNumber}
                        className={`p-4 rounded-xl border bg-white space-y-2 transition-all ${
                          !tx.isValid
                            ? "border-[#E52329]/50 bg-red-50/20"
                            : tx.anomalies.length > 0
                            ? "border-amber-300 bg-amber-50/20"
                            : "border-[#D8E6DB]"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black px-2 py-0.5 rounded bg-[#F5F8F5] border border-[#D8E6DB] text-[#17251C]">
                              Ligne {tx.rowNumber}
                            </span>
                            <Badge
                              className={
                                tx.type === "Dépôt"
                                  ? "bg-emerald-100 text-emerald-800 font-bold"
                                  : "bg-amber-100 text-amber-800 font-bold"
                              }
                            >
                              {tx.type}
                            </Badge>
                            <span className="text-sm font-bold text-[#17251C]">{tx.operator}</span>
                            <span className="text-xs text-[#556B5C]">({tx.paymentOperator})</span>
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-black text-[#17251C]">
                              {tx.amount.toLocaleString()} FCFA
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-[#556B5C] pt-1 border-t border-[#D8E6DB]/50">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#556B5C]/70 block">Date & Heure</span>
                            {tx.date} {tx.time || "—"}
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#556B5C]/70 block">Référence</span>
                            <code className="text-[11px] font-mono text-[#17251C]">{tx.reference || "Aucune"}</code>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#556B5C]/70 block">Preuve</span>
                            <span className="capitalize">{tx.proofStatus.replace("_", " ")}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#556B5C]/70 block">Téléphone</span>
                            {tx.phone || "—"}
                          </div>
                        </div>

                        {tx.anomalies.length > 0 && (
                          <div className="pt-2 space-y-1">
                            {tx.anomalies.map((a, i) => (
                              <div
                                key={i}
                                className={`text-[11px] p-2 rounded-lg flex items-center gap-2 ${
                                  a.severity === "error"
                                    ? "bg-red-100/70 text-red-800 font-semibold"
                                    : "bg-amber-100/70 text-amber-800"
                                }`}
                              >
                                {a.severity === "error" ? (
                                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                )}
                                <span>{a.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </>
              )}

              {detectedType === "pari" && (
                <>
                  {parsedBets
                    .filter((b) => (filterAnomalyOnly ? b.anomalies.length > 0 : true))
                    .map((b) => (
                      <div
                        key={b.rowNumber}
                        className={`p-4 rounded-xl border bg-white space-y-2 transition-all ${
                          !b.isValid
                            ? "border-[#E52329]/50 bg-red-50/20"
                            : b.anomalies.length > 0
                            ? "border-amber-300 bg-amber-50/20"
                            : "border-[#D8E6DB]"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black px-2 py-0.5 rounded bg-[#F5F8F5] border border-[#D8E6DB] text-[#17251C]">
                              Ligne {b.rowNumber}
                            </span>
                            <span className="text-sm font-bold text-[#17251C]">{b.operator}</span>
                            <Badge className="bg-slate-100 text-slate-800">{b.betType}</Badge>
                            <Badge
                              className={
                                b.status === "gagné"
                                  ? "bg-emerald-100 text-emerald-800 font-bold"
                                  : b.status === "perdu"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                              }
                            >
                              {b.status}
                            </Badge>
                          </div>

                          <div className="text-right">
                            <span className="text-xs text-[#556B5C]">Misé : </span>
                            <span className="text-sm font-black text-[#17251C]">
                              {b.amount.toLocaleString()} FCFA
                            </span>
                            {b.amountWon !== null && b.amountWon > 0 && (
                              <span className="text-xs font-bold text-emerald-700 ml-2">
                                (Gain : {b.amountWon.toLocaleString()} FCFA)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-[#556B5C] pt-1 border-t border-[#D8E6DB]/50">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#556B5C]/70 block">Date & Heure</span>
                            {b.date} {b.time || "—"}
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#556B5C]/70 block">Référence</span>
                            <code className="text-[11px] font-mono text-[#17251C]">{b.reference || "Aucune"}</code>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#556B5C]/70 block">Support</span>
                            {b.support}
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#556B5C]/70 block">Téléphone</span>
                            {b.phone || "—"}
                          </div>
                        </div>

                        {b.anomalies.length > 0 && (
                          <div className="pt-2 space-y-1">
                            {b.anomalies.map((a, i) => (
                              <div
                                key={i}
                                className={`text-[11px] p-2 rounded-lg flex items-center gap-2 ${
                                  a.severity === "error"
                                    ? "bg-red-100/70 text-red-800 font-semibold"
                                    : "bg-amber-100/70 text-amber-800"
                                }`}
                              >
                                {a.severity === "error" ? (
                                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                )}
                                <span>{a.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </>
              )}

              {detectedType === "salles" && (
                <>
                  {parsedVenues.map((v, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border bg-white space-y-3 transition-all ${
                        !v.isValid
                          ? "border-[#E52329]/50 bg-red-50/20"
                          : v.anomalies.length > 0
                          ? "border-amber-300 bg-amber-50/20"
                          : "border-[#D8E6DB]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black px-2.5 py-1 rounded bg-[#006B2D]/10 text-[#006B2D] border border-[#006B2D]/20">
                            Salle N° {v.venueNumber || idx + 1}
                          </span>
                          <span className="text-sm font-bold text-[#17251C]">{v.quartier}</span>
                          <Badge className="bg-[#17251C] text-white font-bold">{v.operator}</Badge>
                          <span className="text-xs text-[#556B5C]">
                            ({v.rawRows.length} lignes regroupées dans le fichier)
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-[#17251C]">
                        <span className="text-[10px] uppercase font-bold text-[#556B5C] block mb-0.5">Adresse / Localisation :</span>
                        <span className="font-semibold">{v.address}</span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#556B5C] block mb-1">
                          Jeux proposés dans cet établissement ({v.games.length}) :
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {v.games.map((g, gi) => (
                            <Badge key={gi} variant="outline" className="text-xs bg-[#F5F8F5] border-[#D8E6DB] text-[#17251C]">
                              {g}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {v.anomalies.length > 0 && (
                        <div className="pt-2 space-y-1">
                          {v.anomalies.map((a, i) => (
                            <div
                              key={i}
                              className={`text-[11px] p-2 rounded-lg flex items-center gap-2 ${
                                a.severity === "error"
                                  ? "bg-red-100/70 text-red-800 font-semibold"
                                  : "bg-amber-100/70 text-amber-800"
                              }`}
                            >
                              {a.severity === "error" ? (
                                <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                              )}
                              <span>{a.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* BOUTONS D'ACTION FINALE */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-[#D8E6DB]">
              <Button
                variant="outline"
                onClick={() => setCurrentStep("config")}
                className="w-full sm:w-auto min-h-[44px] px-5 border-[#D8E6DB] text-[#556B5C]"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Modifier la configuration
              </Button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  onClick={handleConfirmImport}
                  disabled={isProcessing || stats.validCount === 0}
                  className="w-full sm:w-auto min-h-[44px] px-6 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold rounded-xl shadow-xs"
                >
                  <Check className="h-4 w-4 mr-1.5" />
                  Confirmer et importer {stats.validCount} élément(s) valide(s)
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* ÉTAPE 4 : PROGRESSION DE L'IMPORTATION                              */}
        {/* =================================================================== */}
        {currentStep === "importing" && (
          <div className="bg-white rounded-2xl border border-[#D8E6DB] p-8 sm:p-12 text-center space-y-6">
            <div className="h-14 w-14 rounded-full bg-[#006B2D]/10 text-[#006B2D] mx-auto flex items-center justify-center animate-pulse">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#17251C]">Importation et validation en cours...</h2>
              <p className="text-xs text-[#556B5C]">
                Insertion des enregistrements en base, application des contraintes métier et journalisation.
              </p>
            </div>
            <div className="w-full bg-[#F5F8F5] rounded-full h-3 border border-[#D8E6DB] overflow-hidden max-w-md mx-auto">
              <div
                className="bg-[#006B2D] h-full transition-all duration-300"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="text-xs font-mono font-bold text-[#006B2D]">{importProgress} %</p>
          </div>
        )}

        {/* =================================================================== */}
        {/* ÉTAPE 5 : RAPPORT FINAL D'IMPORTATION                               */}
        {/* =================================================================== */}
        {currentStep === "report" && batchResult && (
          <div className="bg-white rounded-2xl border border-[#D8E6DB] p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2 border-b border-[#D8E6DB] pb-6">
              <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-extrabold text-[#17251C]">
                Importation terminée avec succès !
              </h2>
              <p className="text-xs text-[#556B5C]">
                Identifiant de lot d'audit :{" "}
                <code className="font-mono font-bold text-[#17251C] bg-[#F5F8F5] px-2 py-0.5 rounded border border-[#D8E6DB]">
                  {batchResult.batchId}
                </code>
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-4 bg-[#F5F8F5] rounded-xl border border-[#D8E6DB]">
                <span className="text-[11px] font-bold text-[#556B5C] uppercase block">Total analysé</span>
                <span className="text-xl font-black text-[#17251C] mt-1 block">{batchResult.total}</span>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-800 uppercase block">Importées en base</span>
                <span className="text-xl font-black text-emerald-800 mt-1 block">{batchResult.imported}</span>
              </div>
              <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                <span className="text-[11px] font-bold text-red-800 uppercase block">Rejetées</span>
                <span className="text-xl font-black text-red-800 mt-1 block">{batchResult.rejected}</span>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-800 uppercase block">Ignorées</span>
                <span className="text-xl font-black text-slate-800 mt-1 block">{batchResult.ignored}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-[#D8E6DB]">
              {batchResult.anomalies.length > 0 && (
                <Button
                  variant="outline"
                  onClick={downloadAnomalyReport}
                  className="w-full sm:w-auto min-h-[44px] px-5 border-[#D8E6DB] text-[#556B5C] hover:bg-[#F5F8F5]"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Télécharger le rapport d'audit ({batchResult.anomalies.length} signalements)
                </Button>
              )}

              <Button
                onClick={() => {
                  setCurrentStep("upload");
                  setRawRows([]);
                  setParsedTransactions([]);
                  setParsedBets([]);
                  setParsedVenues([]);
                  setBatchResult(null);
                }}
                className="w-full sm:w-auto min-h-[44px] px-6 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold rounded-xl shadow-xs"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Effectuer un nouvel import
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

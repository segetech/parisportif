import { RequestHandler } from "express";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import {
  buildOpenNotificationEmailHtml,
  sendEmail,
  SendEmailResult,
} from "../lib/email";

type DispatchEventType =
  | "operation_created"
  | "operation_reviewed"
  | "illegal_reported";

type OperationType =
  | "bets"
  | "transactions"
  | "venues"
  | "illegal_bets"
  | "illegal_tx";

type ReviewStatus =
  | "valide"
  | "refuse"
  | "modify"
  | "comment"
  | "en_attente";

interface DispatchPayload {
  eventType?: DispatchEventType;
  operationType?: OperationType;
  operationId?: string;
  status?: ReviewStatus;
  operator?: string;
  amountFcfa?: number | string;
  reference?: string;
  notes?: string;
  authorId?: string;
}

const VALID_OPERATION_TYPES = new Set<OperationType>([
  "bets",
  "transactions",
  "venues",
  "illegal_bets",
  "illegal_tx",
]);

function normalizeOperationType(value?: string): OperationType {
  if (value && VALID_OPERATION_TYPES.has(value as OperationType)) {
    return value as OperationType;
  }
  if (value === "illegal_transactions") return "illegal_tx";
  return "bets";
}

function getAppBaseUrl(req: Parameters<RequestHandler>[0]): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.startsWith("http")) {
    return origin.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

function formatAmount(amount?: number | string): string {
  if (amount === undefined || amount === null || amount === "") return "-";
  const num = Number(amount);
  if (!Number.isFinite(num)) return String(amount);
  return `${num.toLocaleString("fr-FR")} FCFA`;
}

function getOperationLabel(opType: OperationType): string {
  switch (opType) {
    case "bets":
      return "Test de pari";
    case "transactions":
      return "Transaction financière";
    case "venues":
      return "Site / point de test";
    case "illegal_bets":
      return "Pari illégal signalé";
    case "illegal_tx":
      return "Transaction illégale signalée";
  }
}

function buildDeepLinkPath(
  opType: OperationType,
  role: string,
  opts: { operationId?: string; status?: ReviewStatus; reference?: string },
): string {
  const isReviewer = role === "ADMIN" || role === "CONTROLEUR";
  const statusParam =
    opts.status === "valide" ||
    opts.status === "refuse" ||
    opts.status === "en_attente"
      ? opts.status
      : "en_attente";

  if (opType === "illegal_bets") {
    return `/illegal?tab=bets${opts.operationId ? `&id=${encodeURIComponent(opts.operationId)}` : ""}`;
  }
  if (opType === "illegal_tx") {
    return `/illegal?tab=transactions${opts.operationId ? `&id=${encodeURIComponent(opts.operationId)}` : ""}`;
  }
  if (isReviewer) {
    const idQuery = opts.operationId
      ? `&id=${encodeURIComponent(opts.operationId)}`
      : "";
    return `/validation?tab=${opType}&status=${statusParam}${idQuery}`;
  }
  if (opType === "bets") {
    return `/tests${opts.reference ? `?ref=${encodeURIComponent(opts.reference)}` : ""}`;
  }
  if (opType === "transactions") {
    return `/transactions${opts.reference ? `?ref=${encodeURIComponent(opts.reference)}` : ""}`;
  }
  return "/venues";
}

async function resolveOperationAuthorId(
  opType: OperationType,
  operationId?: string,
  explicitAuthorId?: string,
): Promise<string | null> {
  if (explicitAuthorId) return explicitAuthorId;
  if (!operationId) return null;

  const tableMap: Record<OperationType, string> = {
    bets: "bets",
    transactions: "transactions",
    venues: "venues",
    illegal_bets: "illegal_bets",
    illegal_tx: "illegal_transactions",
  };

  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from(tableMap[opType])
      .select("created_by")
      .eq("id", operationId)
      .maybeSingle();
    return data?.created_by || null;
  } catch {
    return null;
  }
}

export const handleDispatchNotification: RequestHandler = async (
  req,
  res,
) => {
  try {
    const actor = req.user;
    if (!actor) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const body = (req.body || {}) as DispatchPayload;
    const eventType: DispatchEventType = body.eventType || "operation_created";
    const opType = normalizeOperationType(body.operationType);
    const opLabel = getOperationLabel(opType);
    const operatorName = body.operator || "Opérateur";
    const formattedAmount = formatAmount(body.amountFcfa);
    const baseUrl = getAppBaseUrl(req);
    const actorDisplay =
      [actor.prenom, actor.nom].filter(Boolean).join(" ").trim() || actor.email;

    const admin = getSupabaseAdmin();
    let notificationsCreated = 0;
    const emailResults: SendEmailResult[] = [];

    if (eventType === "operation_created" || eventType === "illegal_reported") {
      const { data: reviewers, error: revError } = await admin
        .from("users")
        .select("id, email, nom, prenom, role, statut")
        .in("role", ["ADMIN", "CONTROLEUR"])
        .eq("statut", "actif");

      if (revError) {
        console.error("[Notifications] Failed to load reviewers:", revError);
        return res
          .status(500)
          .json({ error: "Impossible de charger les destinataires" });
      }

      const allReviewers = reviewers || [];
      const nonActorReviewers = allReviewers.filter((u) => u.id !== actor.id);
      const targets =
        nonActorReviewers.length > 0 ? nonActorReviewers : allReviewers;

      const isIllegal = eventType === "illegal_reported";
      const title = isIllegal
        ? `Alerte opérateur illégal • ${operatorName}`
        : `Nouvelle opération à valider • ${operatorName}`;
      const message = isIllegal
        ? `${opLabel} enregistré par ${actorDisplay} sur ${operatorName}${formattedAmount !== "-" ? ` (${formattedAmount})` : ""}.`
        : `${opLabel} soumis par ${actorDisplay} sur ${operatorName}${formattedAmount !== "-" ? ` (${formattedAmount})` : ""}.`;

      if (targets.length > 0) {
        const rowsToInsert = targets.map((recipient) => ({
          user_id: recipient.id,
          type: "new_operation",
          title: title.slice(0, 250),
          message,
          operation_type: opType.slice(0, 20),
          operation_id: body.operationId || null,
          read: false,
        }));

        const { error: insertErr } = await admin
          .from("notifications")
          .insert(rowsToInsert);
        if (insertErr) {
          console.error("[Notifications] Insert error:", insertErr);
        } else {
          notificationsCreated = rowsToInsert.length;
        }

        for (const recipient of targets) {
          if (!recipient.email) continue;
          const targetPath = buildDeepLinkPath(opType, recipient.role, {
            operationId: body.operationId,
            status: "en_attente",
            reference: body.reference,
          });
          const recipientName =
            [recipient.prenom, recipient.nom].filter(Boolean).join(" ").trim() ||
            recipient.email;

          const html = buildOpenNotificationEmailHtml({
            badge: isIllegal ? "Alerte Illégal" : "À Valider",
            badgeColor: isIllegal ? "red" : "amber",
            title,
            greeting: `Bonjour ${recipientName},`,
            intro: message,
            details: [
              { label: "Type d'opération", value: opLabel },
              { label: "Opérateur", value: operatorName },
              ...(formattedAmount !== "-"
                ? [{ label: "Montant", value: formattedAmount }]
                : []),
              ...(body.reference
                ? [{ label: "Référence", value: body.reference }]
                : []),
              { label: "Enregistré par", value: actorDisplay },
              ...(body.notes
                ? [{ label: "Note", value: body.notes }]
                : []),
            ],
            ctaLabel: isIllegal
              ? "Consulter le signalement"
              : "Ouvrir dans Validation",
            ctaUrl: `${baseUrl}${targetPath}`,
          });

          const emailRes = await sendEmail({
            to: recipient.email,
            subject: `[OPEN] ${title}`,
            html,
          });
          emailResults.push(emailRes);
        }
      }

      return res.json({
        success: true,
        notificationsCreated,
        emailsProcessed: emailResults.length,
        emailResults,
      });
    }

    // eventType === "operation_reviewed"
    const reviewStatus = body.status || "valide";
    const targetUserId =
      (await resolveOperationAuthorId(
        opType,
        body.operationId,
        body.authorId,
      )) || actor.id;

    const { data: recipient } = await admin
      .from("users")
      .select("id, email, nom, prenom, role")
      .eq("id", targetUserId)
      .maybeSingle();

    let notifType = "modified";
    let badgeText = "Mise à jour";
    let badgeColor: "green" | "red" | "amber" | "blue" = "blue";
    let title = `Mise à jour sur votre ${opLabel.toLowerCase()} • ${operatorName}`;
    let intro = `${actorDisplay} a mis à jour votre ${opLabel.toLowerCase()} sur ${operatorName}.`;

    if (reviewStatus === "valide") {
      notifType = "validated";
      badgeText = "Validée";
      badgeColor = "green";
      title = `${opLabel} validé • ${operatorName}`;
      intro = `Bonne nouvelle : votre ${opLabel.toLowerCase()} sur ${operatorName}${formattedAmount !== "-" ? ` (${formattedAmount})` : ""} a été validé par ${actorDisplay}.`;
    } else if (reviewStatus === "refuse") {
      notifType = "rejected";
      badgeText = "Refusée";
      badgeColor = "red";
      title = `${opLabel} refusé • ${operatorName}`;
      intro = `Votre ${opLabel.toLowerCase()} sur ${operatorName}${formattedAmount !== "-" ? ` (${formattedAmount})` : ""} a été refusé par ${actorDisplay}.`;
    } else if (reviewStatus === "modify") {
      notifType = "modified";
      badgeText = "Modification requise";
      badgeColor = "amber";
      title = `Modification demandée • ${operatorName}`;
      intro = `${actorDisplay} demande une correction sur votre ${opLabel.toLowerCase()} (${operatorName}).`;
    } else if (reviewStatus === "comment") {
      notifType = "modified";
      badgeText = "Nouveau commentaire";
      badgeColor = "blue";
      title = `Nouveau commentaire • ${operatorName}`;
      intro = `${actorDisplay} a ajouté un commentaire sur l'opération ${operatorName}.`;
    }

    const messageText = body.notes
      ? `${intro} Motif / Note : ${body.notes}`
      : intro;

    const { error: insertErr } = await admin.from("notifications").insert({
      user_id: targetUserId,
      type: notifType,
      title: title.slice(0, 250),
      message: messageText,
      operation_type: opType.slice(0, 20),
      operation_id: body.operationId || null,
      read: false,
    });

    if (insertErr) {
      console.error("[Notifications] Review insert error:", insertErr);
    } else {
      notificationsCreated = 1;
    }

    if (recipient?.email) {
      const targetPath = buildDeepLinkPath(opType, recipient.role || "AGENT", {
        operationId: body.operationId,
        status: reviewStatus,
        reference: body.reference,
      });
      const recipientName =
        [recipient.prenom, recipient.nom].filter(Boolean).join(" ").trim() ||
        recipient.email;

      const html = buildOpenNotificationEmailHtml({
        badge: badgeText,
        badgeColor,
        title,
        greeting: `Bonjour ${recipientName},`,
        intro,
        details: [
          { label: "Opération", value: opLabel },
          { label: "Opérateur", value: operatorName },
          ...(formattedAmount !== "-"
            ? [{ label: "Montant", value: formattedAmount }]
            : []),
          ...(body.reference
            ? [{ label: "Référence", value: body.reference }]
            : []),
          { label: "Décision par", value: actorDisplay },
          ...(body.notes
            ? [{ label: "Commentaire / Motif", value: body.notes }]
            : []),
        ],
        ctaLabel: "Voir l'opération",
        ctaUrl: `${baseUrl}${targetPath}`,
      });

      const emailRes = await sendEmail({
        to: recipient.email,
        subject: `[OPEN] ${title}`,
        html,
      });
      emailResults.push(emailRes);
    }

    return res.json({
      success: true,
      notificationsCreated,
      emailsProcessed: emailResults.length,
      emailResults,
    });
  } catch (error) {
    console.error("[Notifications] Dispatch unexpected error:", error);
    return res
      .status(500)
      .json({ error: "Erreur lors de l'envoi de la notification" });
  }
};

export const handleSendTestNotificationEmail: RequestHandler = async (
  req,
  res,
) => {
  try {
    const actor = req.user;
    if (!actor) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const requestedEmail =
      typeof req.body?.email === "string" && req.body.email.includes("@")
        ? req.body.email.trim()
        : actor.email;

    const baseUrl = getAppBaseUrl(req);
    const admin = getSupabaseAdmin();
    const actorDisplay =
      [actor.prenom, actor.nom].filter(Boolean).join(" ").trim() || actor.email;

    const notifTitle = "Notification & Email Resend opérationnels";
    const notifMessage = `Test déclenché avec succès pour ${requestedEmail}. Cliquer ouvre votre Profil & Sécurité.`;

    const { error: insertErr } = await admin.from("notifications").insert({
      user_id: actor.id,
      type: "validated",
      title: notifTitle,
      message: notifMessage,
      operation_type: "profil",
      operation_id: null,
      read: false,
    });

    const html = buildOpenNotificationEmailHtml({
      badge: "Test Système",
      badgeColor: "green",
      title: notifTitle,
      greeting: `Bonjour ${actorDisplay},`,
      intro:
        "Votre passerelle d'alertes email Resend et le centre de notifications OPEN sont bien connectés et opérationnels.",
      details: [
        { label: "Destinataire", value: requestedEmail },
        { label: "Compte déclencheur", value: `${actorDisplay} (${actor.role})` },
        { label: "Service Email", value: "Resend API" },
      ],
      ctaLabel: "Accéder à mon Profil",
      ctaUrl: `${baseUrl}/profil`,
    });

    const emailResult = await sendEmail({
      to: requestedEmail,
      subject: "[OPEN] Test du système de notifications Resend",
      html,
    });

    return res.json({
      success: true,
      inAppCreated: !insertErr,
      emailSent: Boolean(emailResult.messageId),
      emailResult,
    });
  } catch (error) {
    console.error("[Notifications] Test email error:", error);
    return res
      .status(500)
      .json({ error: "Impossible d'envoyer l'email de test" });
  }
};

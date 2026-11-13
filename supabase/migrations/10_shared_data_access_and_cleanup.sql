-- Migration 10: Partage de lecture des données entre tous les rôles actifs (ADMIN, CONTROLEUR, AGENT)
-- + nettoyage des anciennes données de test et référentiels non issus du classeur importé.

-- 1. Politiques SELECT partagées pour tous les utilisateurs actifs et valides
DROP POLICY IF EXISTS bets_select_policy ON public.bets;
CREATE POLICY bets_select_policy ON public.bets
  FOR SELECT
  USING (is_active_and_cleared_user());

DROP POLICY IF EXISTS transactions_select_policy ON public.transactions;
CREATE POLICY transactions_select_policy ON public.transactions
  FOR SELECT
  USING (is_active_and_cleared_user());

DROP POLICY IF EXISTS illegal_bets_select_policy ON public.illegal_bets;
CREATE POLICY illegal_bets_select_policy ON public.illegal_bets
  FOR SELECT
  USING (is_active_and_cleared_user());

DROP POLICY IF EXISTS illegal_transactions_select_policy ON public.illegal_transactions;
CREATE POLICY illegal_transactions_select_policy ON public.illegal_transactions
  FOR SELECT
  USING (is_active_and_cleared_user());

-- 2. Mise à jour de get_dashboard_aggregates pour refléter les données partagées pour tous les rôles
CREATE OR REPLACE FUNCTION public.get_dashboard_aggregates(p_agent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_caller RECORD;
  v_filter_user UUID;
  v_total_bets INT := 0;
  v_total_bets_amount NUMERIC := 0;
  v_total_known_winnings NUMERIC := 0;
  v_won_bets_count INT := 0;
  v_lost_bets_count INT := 0;
  v_pending_bets_count INT := 0;
  v_pending_bets_val INT := 0;
  v_pending_tx_val INT := 0;
  v_total_deposits NUMERIC := 0;
  v_total_withdrawals NUMERIC := 0;
  v_total_venues INT := 0;
  v_total_illegal_bets INT := 0;
  v_total_illegal_tx INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED : L''authentification est obligatoire pour accéder aux agrégats du tableau de bord.';
  END IF;

  SELECT id, role, statut, must_change_password
  INTO v_caller
  FROM public.users
  WHERE id = v_caller_id;

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND : Utilisateur non trouvé dans le référentiel des comptes.';
  END IF;

  IF v_caller.statut IS DISTINCT FROM 'actif' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE : Le compte appelant est inactif, suspendu ou désactivé.';
  END IF;

  IF v_caller.must_change_password IS TRUE THEN
    RAISE EXCEPTION 'PASSWORD_RENEWAL_REQUIRED : Renouvellement obligatoire du mot de passe requis avant tout accès aux données.';
  END IF;

  IF v_caller.role NOT IN ('ADMIN', 'CONTROLEUR', 'AGENT') THEN
    RAISE EXCEPTION 'ROLE_UNAUTHORIZED : Rôle opérationnel non reconnu ou non autorisé.';
  END IF;

  v_filter_user := p_agent_id;

  SELECT
    COUNT(*),
    COALESCE(SUM(amount_fcfa), 0),
    COALESCE(SUM(COALESCE(amount_won_fcfa, 0)), 0),
    COUNT(*) FILTER (WHERE lower(status) LIKE '%gagn%' OR status = 'won'),
    COUNT(*) FILTER (WHERE lower(status) LIKE '%perdu%' OR status = 'lost'),
    COUNT(*) FILTER (WHERE validation_status = 'en_attente')
  INTO
    v_total_bets,
    v_total_bets_amount,
    v_total_known_winnings,
    v_won_bets_count,
    v_lost_bets_count,
    v_pending_bets_val
  FROM public.bets
  WHERE (v_filter_user IS NULL OR created_by = v_filter_user);

  v_pending_bets_count := v_total_bets - v_won_bets_count - v_lost_bets_count;

  SELECT
    COALESCE(SUM(amount_fcfa) FILTER (WHERE type = 'Dépôt' OR type = 'depot'), 0),
    COALESCE(SUM(amount_fcfa) FILTER (WHERE type = 'Retrait' OR type = 'retrait'), 0),
    COUNT(*) FILTER (WHERE validation_status = 'en_attente')
  INTO
    v_total_deposits,
    v_total_withdrawals,
    v_pending_tx_val
  FROM public.transactions
  WHERE (v_filter_user IS NULL OR created_by = v_filter_user);

  SELECT COUNT(*) INTO v_total_venues
  FROM public.venues
  WHERE (v_filter_user IS NULL OR created_by = v_filter_user);

  SELECT COUNT(*) INTO v_total_illegal_bets FROM public.illegal_bets;
  SELECT COUNT(*) INTO v_total_illegal_tx FROM public.illegal_transactions;

  RETURN jsonb_build_object(
    'total_bets', v_total_bets,
    'total_bets_amount', v_total_bets_amount,
    'total_known_winnings', v_total_known_winnings,
    'won_bets_count', v_won_bets_count,
    'lost_bets_count', v_lost_bets_count,
    'pending_bets_count', v_pending_bets_count,
    'pending_validations_count', v_pending_bets_val + v_pending_tx_val,
    'total_deposits', v_total_deposits,
    'total_withdrawals', v_total_withdrawals,
    'total_venues', v_total_venues,
    'total_illegal_bets', v_total_illegal_bets,
    'total_illegal_transactions', v_total_illegal_tx
  );
END;
$function$;

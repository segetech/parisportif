-- Script complet pour le système de validation avec historique et notifications
-- Exécutez ce script dans le SQL Editor de Supabase

-- ============================================
-- 1. TABLE D'HISTORIQUE DES MODIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS operation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type VARCHAR(20) NOT NULL, -- 'bet', 'transaction', 'venue'
  operation_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'created', 'modified', 'validated', 'rejected'
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  modified_by UUID REFERENCES users(id),
  modified_at TIMESTAMP DEFAULT NOW(),
  changes JSONB, -- Détails des modifications
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_operation_history_operation ON operation_history(operation_type, operation_id);
CREATE INDEX idx_operation_history_modified_by ON operation_history(modified_by);
CREATE INDEX idx_operation_history_created_at ON operation_history(created_at DESC);

-- ============================================
-- 2. TABLE DE NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'new_operation', 'validation_request', 'validated', 'rejected', 'modified'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  operation_type VARCHAR(20), -- 'bet', 'transaction', 'venue'
  operation_id UUID,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================
-- 3. TABLE DE MESSAGES/COMMENTAIRES
-- ============================================

CREATE TABLE IF NOT EXISTS operation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type VARCHAR(20) NOT NULL,
  operation_id UUID NOT NULL,
  user_id UUID REFERENCES users(id),
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE, -- Commentaire interne (visible seulement pour contrôleurs/admins)
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_operation_comments_operation ON operation_comments(operation_type, operation_id);
CREATE INDEX idx_operation_comments_user ON operation_comments(user_id);
CREATE INDEX idx_operation_comments_created_at ON operation_comments(created_at);

-- ============================================
-- 4. FONCTION POUR CRÉER UNE NOTIFICATION
-- ============================================

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type VARCHAR,
  p_title VARCHAR,
  p_message TEXT,
  p_operation_type VARCHAR DEFAULT NULL,
  p_operation_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, operation_type, operation_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_operation_type, p_operation_id)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. FONCTION POUR ENREGISTRER L'HISTORIQUE
-- ============================================

CREATE OR REPLACE FUNCTION log_operation_history(
  p_operation_type VARCHAR,
  p_operation_id UUID,
  p_action VARCHAR,
  p_previous_status VARCHAR,
  p_new_status VARCHAR,
  p_modified_by UUID,
  p_changes JSONB DEFAULT NULL,
  p_comment TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
BEGIN
  INSERT INTO operation_history (
    operation_type, operation_id, action, 
    previous_status, new_status, modified_by, 
    changes, comment
  )
  VALUES (
    p_operation_type, p_operation_id, p_action,
    p_previous_status, p_new_status, p_modified_by,
    p_changes, p_comment
  )
  RETURNING id INTO v_history_id;
  
  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. TRIGGER POUR NOTIFIER LES CONTRÔLEURS
-- ============================================

-- Fonction trigger pour les nouvelles opérations
CREATE OR REPLACE FUNCTION notify_controllers_new_operation()
RETURNS TRIGGER AS $$
DECLARE
  v_controller RECORD;
  v_operation_name TEXT;
BEGIN
  -- Déterminer le nom de l'opération
  v_operation_name := CASE TG_TABLE_NAME
    WHEN 'bets' THEN 'Nouveau pari'
    WHEN 'transactions' THEN 'Nouvelle transaction'
    WHEN 'venues' THEN 'Nouvelle salle'
  END;

  -- Notifier tous les contrôleurs et admins
  FOR v_controller IN 
    SELECT id FROM users WHERE role IN ('CONTROLEUR', 'ADMIN') AND statut = 'actif'
  LOOP
    PERFORM create_notification(
      v_controller.id,
      'new_operation',
      v_operation_name || ' en attente',
      'Une nouvelle opération nécessite votre validation',
      TG_TABLE_NAME,
      NEW.id
    );
  END LOOP;

  -- Enregistrer dans l'historique
  PERFORM log_operation_history(
    TG_TABLE_NAME,
    NEW.id,
    'created',
    NULL,
    NEW.validation_status,
    NEW.created_by,
    NULL,
    'Opération créée'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer les triggers
DROP TRIGGER IF EXISTS trigger_notify_new_bet ON bets;
CREATE TRIGGER trigger_notify_new_bet
  AFTER INSERT ON bets
  FOR EACH ROW
  WHEN (NEW.validation_status = 'en_attente')
  EXECUTE FUNCTION notify_controllers_new_operation();

DROP TRIGGER IF EXISTS trigger_notify_new_transaction ON transactions;
CREATE TRIGGER trigger_notify_new_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW
  WHEN (NEW.validation_status = 'en_attente')
  EXECUTE FUNCTION notify_controllers_new_operation();

DROP TRIGGER IF EXISTS trigger_notify_new_venue ON venues;
CREATE TRIGGER trigger_notify_new_venue
  AFTER INSERT ON venues
  FOR EACH ROW
  WHEN (NEW.validation_status = 'en_attente')
  EXECUTE FUNCTION notify_controllers_new_operation();

-- ============================================
-- 7. TRIGGER POUR NOTIFIER L'AGENT
-- ============================================

-- Fonction trigger pour les validations/rejets
CREATE OR REPLACE FUNCTION notify_agent_validation()
RETURNS TRIGGER AS $$
DECLARE
  v_operation_name TEXT;
  v_status_text TEXT;
BEGIN
  -- Déterminer le nom de l'opération
  v_operation_name := CASE TG_TABLE_NAME
    WHEN 'bets' THEN 'Pari'
    WHEN 'transactions' THEN 'Transaction'
    WHEN 'venues' THEN 'Salle'
  END;

  -- Déterminer le texte du statut
  v_status_text := CASE NEW.validation_status
    WHEN 'valide' THEN 'validée'
    WHEN 'refuse' THEN 'refusée'
    ELSE 'modifiée'
  END;

  -- Notifier l'agent créateur
  IF OLD.validation_status != NEW.validation_status AND NEW.created_by IS NOT NULL THEN
    PERFORM create_notification(
      NEW.created_by,
      CASE NEW.validation_status
        WHEN 'valide' THEN 'validated'
        WHEN 'refuse' THEN 'rejected'
        ELSE 'modified'
      END,
      v_operation_name || ' ' || v_status_text,
      'Votre opération a été ' || v_status_text || ' par un contrôleur',
      TG_TABLE_NAME,
      NEW.id
    );

    -- Enregistrer dans l'historique
    PERFORM log_operation_history(
      TG_TABLE_NAME,
      NEW.id,
      CASE NEW.validation_status
        WHEN 'valide' THEN 'validated'
        WHEN 'refuse' THEN 'rejected'
        ELSE 'modified'
      END,
      OLD.validation_status,
      NEW.validation_status,
      NEW.validated_by,
      jsonb_build_object('validation_notes', NEW.validation_notes),
      NEW.validation_notes
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer les triggers
DROP TRIGGER IF EXISTS trigger_notify_bet_validation ON bets;
CREATE TRIGGER trigger_notify_bet_validation
  AFTER UPDATE ON bets
  FOR EACH ROW
  WHEN (OLD.validation_status IS DISTINCT FROM NEW.validation_status)
  EXECUTE FUNCTION notify_agent_validation();

DROP TRIGGER IF EXISTS trigger_notify_transaction_validation ON transactions;
CREATE TRIGGER trigger_notify_transaction_validation
  AFTER UPDATE ON transactions
  FOR EACH ROW
  WHEN (OLD.validation_status IS DISTINCT FROM NEW.validation_status)
  EXECUTE FUNCTION notify_agent_validation();

DROP TRIGGER IF EXISTS trigger_notify_venue_validation ON venues;
CREATE TRIGGER trigger_notify_venue_validation
  AFTER UPDATE ON venues
  FOR EACH ROW
  WHEN (OLD.validation_status IS DISTINCT FROM NEW.validation_status)
  EXECUTE FUNCTION notify_agent_validation();

-- ============================================
-- 8. POLITIQUES RLS
-- ============================================

-- Operation History
ALTER TABLE operation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read history"
  ON operation_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert history"
  ON operation_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Comments
ALTER TABLE operation_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read comments"
  ON operation_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create comments"
  ON operation_comments FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- 9. VUES UTILES
-- ============================================

-- Vue pour les statistiques de validation
CREATE OR REPLACE VIEW validation_stats AS
SELECT 
  validation_status,
  COUNT(*) as count,
  'bet' as type
FROM bets
GROUP BY validation_status
UNION ALL
SELECT 
  validation_status,
  COUNT(*) as count,
  'transaction' as type
FROM transactions
GROUP BY validation_status
UNION ALL
SELECT 
  validation_status,
  COUNT(*) as count,
  'venue' as type
FROM venues
GROUP BY validation_status;

-- Vue pour les notifications non lues
CREATE OR REPLACE VIEW unread_notifications_count AS
SELECT 
  user_id,
  COUNT(*) as unread_count
FROM notifications
WHERE read = FALSE
GROUP BY user_id;

-- ============================================
-- 10. VÉRIFICATION
-- ============================================

SELECT 'Tables créées:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('operation_history', 'notifications', 'operation_comments')
ORDER BY table_name;

SELECT 'Fonctions créées:' as info;
SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN ('create_notification', 'log_operation_history', 'notify_controllers_new_operation', 'notify_agent_validation')
ORDER BY routine_name;

SELECT 'Triggers créés:' as info;
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name LIKE 'trigger_notify%'
ORDER BY trigger_name;

SELECT 'Configuration terminée avec succès!' as status;

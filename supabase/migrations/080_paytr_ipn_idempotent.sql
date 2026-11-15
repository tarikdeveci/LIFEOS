-- PayTR IPN: ödeme başına bekleyen payment_history satırı ve tek seferlik işleme.
-- Eskiden IPN aboneliği subscriptions.paytr_merchant_oid ile arıyordu; ikinci ödeme
-- başlatılınca bu alan eziliyor, ilk ödemenin bildirimi aboneliği bulamıyordu.
-- Eşzamanlı ya da tekrar gelen bildirim de dönemi iki kez uzatabiliyordu.
CREATE UNIQUE INDEX IF NOT EXISTS payment_history_paytr_merchant_oid_idx
  ON payment_history (paytr_merchant_oid)
  WHERE paytr_merchant_oid IS NOT NULL;

CREATE OR REPLACE FUNCTION paytr_settle_payment(
  p_oid TEXT,
  p_status TEXT,
  p_amount NUMERIC,
  p_error_message TEXT DEFAULT NULL,
  p_net_monthly_usd NUMERIC DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment payment_history%ROWTYPE;
  v_plan_key TEXT;
  v_user_id UUID;
  v_period_end TIMESTAMPTZ;
BEGIN
  -- Kilitli olarak kaydı al
  SELECT * INTO v_payment
  FROM payment_history
  WHERE paytr_merchant_oid = p_oid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_payment.status IN ('success', 'failure') THEN
    RETURN 'already';
  END IF;

  -- Ödeme durumunu güncelle
  UPDATE payment_history
  SET
    status = p_status,
    amount = p_amount,
    description = CASE
      WHEN p_status = 'success' THEN
        CASE WHEN v_payment.plan = 'pro_annual' THEN 'Yıllık Pro abonelik' ELSE 'Aylık Pro abonelik' END
      ELSE 'Ödeme başarısız'
    END,
    error_message = p_error_message,
    currency = 'TRY'
  WHERE id = v_payment.id;

  -- Başarılıysa aboneliği güncelle
  IF p_status = 'success' THEN
    v_plan_key := v_payment.plan;
    v_user_id := v_payment.user_id;

    IF v_plan_key = 'pro_annual' THEN
      v_period_end := NOW() + INTERVAL '1 year';
    ELSE
      v_period_end := NOW() + INTERVAL '1 month';
    END IF;

    -- Abonelik satırı yoksa açılır; plan da yazılır (useSubscription plan'ı okur).
    INSERT INTO subscriptions AS s (
      user_id, status, plan, paytr_merchant_oid, current_period_start, current_period_end,
      cancel_at_period_end, cancelled_at, net_monthly_usd
    ) VALUES (
      v_user_id, v_plan_key::subscription_status, v_plan_key, p_oid, NOW(), v_period_end,
      FALSE, NULL, p_net_monthly_usd
    )
    ON CONFLICT (user_id) DO UPDATE SET
      status = EXCLUDED.status,
      plan = EXCLUDED.plan,
      paytr_merchant_oid = EXCLUDED.paytr_merchant_oid,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = FALSE,
      cancelled_at = NULL,
      net_monthly_usd = COALESCE(EXCLUDED.net_monthly_usd, s.net_monthly_usd),
      updated_at = NOW();
  END IF;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION paytr_settle_payment FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION paytr_settle_payment TO service_role;

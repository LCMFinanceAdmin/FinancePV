-- 272: a voucher cannot be attached to a claim the General Manager has not
-- accepted.
--
-- 085 established what AWAITING_GM means — "freshly verified by EXCO, GM to
-- accept" — and said in its own comment that ACCEPTED is when "the PV can now
-- be raised". Nothing enforced it. The GM Claims table showed Create PV on a
-- row still sitting at AWAITING_GM, so Finance could raise and link a voucher
-- for a claim the GM had not yet instructed them to pay, and the first anyone
-- would know of it is the voucher arriving in his own verification queue
-- already drawn up.
--
-- The buttons are now greyed, which is the half of this that people see. This
-- is the half that holds: a greyed button is a courtesy to whoever is reading
-- the page, and anybody with a kept link, a typed address or the API can walk
-- straight past it.
--
-- What it refuses, narrowly: setting pv_id on a row whose gm_status is
-- AWAITING_GM. Everything else about such a row stays editable — the GM
-- corrects the amount, the ministry and the purpose on exactly these rows
-- before accepting them, and a rule that froze the row would stop him doing
-- the thing he is being asked to do. Clearing pv_id is allowed too: that is
-- unlinking a mistake, which takes a commitment back rather than making one.
--
-- Accepting and linking in one statement is allowed, because the row being
-- written is then ACCEPTED and the instruction has been given. That is how
-- the GM's own Accept works if it ever grows a link step.

CREATE OR REPLACE FUNCTION gm_claim_pv_needs_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pv_id IS NOT NULL
     AND NEW.pv_id IS DISTINCT FROM OLD.pv_id
     AND NEW.gm_status = 'AWAITING_GM' THEN
    RAISE EXCEPTION
      'Claim % has not been accepted by the General Manager yet, so no payment voucher can be raised against it.',
      COALESCE(NEW.claim_no, NEW.id::text)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gm_claim_pv_needs_acceptance ON gm_claims;
CREATE TRIGGER trg_gm_claim_pv_needs_acceptance
  BEFORE UPDATE ON gm_claims
  FOR EACH ROW
  EXECUTE FUNCTION gm_claim_pv_needs_acceptance();

-- An INSERT already carrying a pv_id would side-step the trigger above, since
-- that one only fires on UPDATE. Nothing in the app does this — pr-action
-- writes the claim and the PV is linked later — but a rule with a hole in it
-- is worse than no rule, because it is believed.
CREATE OR REPLACE FUNCTION gm_claim_insert_pv_needs_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pv_id IS NOT NULL AND NEW.gm_status = 'AWAITING_GM' THEN
    RAISE EXCEPTION
      'A claim cannot be created already carrying a payment voucher while it awaits the General Manager.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gm_claim_insert_pv_needs_acceptance ON gm_claims;
CREATE TRIGGER trg_gm_claim_insert_pv_needs_acceptance
  BEFORE INSERT ON gm_claims
  FOR EACH ROW
  EXECUTE FUNCTION gm_claim_insert_pv_needs_acceptance();

-- Nothing existing is in breach, but say so rather than assume it: any claim
-- already linked to a PV while awaiting acceptance is a decision somebody
-- made before this rule existed, and the trigger would not have caught it.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM gm_claims
   WHERE pv_id IS NOT NULL AND gm_status = 'AWAITING_GM';
  IF n > 0 THEN
    RAISE NOTICE '% existing claim(s) hold a PV while still awaiting the GM. They are left alone; the rule applies from now on.', n;
  END IF;
END $$;

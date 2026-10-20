-- Export receipts need only these billing facts, never payer proof tokens.
CREATE OR REPLACE VIEW "PrivateToolBillingMetadata" AS
SELECT "id", "runId",
 CASE WHEN "paymentEvidence"->>'billingKind' = 'platform' THEN
  jsonb_build_object('billingKind','platform',
   'providerCostMicroUsd',"paymentEvidence"->>'providerCostMicroUsd',
   'amount',"paymentEvidence"->>'amount')
 ELSE NULL END AS "billingEvidence"
FROM "PrivateToolCall";

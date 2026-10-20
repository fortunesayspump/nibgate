-- Apply only after the dedicated funding role exists. No ciphertext/key access.
GRANT CONNECT ON DATABASE drnib_private_synthetic TO drnib_private_funding_testnet;
GRANT USAGE ON SCHEMA drnib TO drnib_private_funding_testnet;
GRANT SELECT ("id","userId","walletAddress","metadata","status","budgetCap","deletedAt","settledAt"), UPDATE ("metadata","settledAt","updatedAt") ON drnib."ResearchRun" TO drnib_private_funding_testnet;
GRANT SELECT, INSERT ON drnib."BudgetLedger" TO drnib_private_funding_testnet;
GRANT SELECT ("id","runId","model","status","billingKind","committedMicroUsd","costBasis","usageEvidence") ON drnib."PrivateInferenceCall" TO drnib_private_funding_testnet;
GRANT SELECT ("id","runId","status") ON drnib."PrivateActionReceipt" TO drnib_private_funding_testnet;
GRANT SELECT ("id","runId","committedMicroUsd") ON drnib."PrivateAiBudgetReservation" TO drnib_private_funding_testnet;
GRANT SELECT ("id","runId","kind","revision","removed","digest") ON drnib."PrivateClientObject" TO drnib_private_funding_testnet;
GRANT UPDATE ("budgetCap") ON drnib."ResearchRun" TO drnib_private_guest_testnet;
GRANT SELECT ("id","runId","kind","amount","txRef") ON drnib."BudgetLedger" TO drnib_private_guest_testnet;
GRANT SELECT,INSERT,UPDATE ON drnib."PrivateToolCall" TO drnib_private_funding_testnet;
GRANT SELECT ("id","runId","questionId","tool","requestDigest","status","committedMicroUsd","costBasis","resultDigest","txHash") ON drnib."PrivateToolCall" TO drnib_private_guest_testnet;
GRANT SELECT ON drnib."PrivateToolBillingMetadata" TO drnib_private_guest_testnet;
GRANT SELECT ON drnib."PrivateToolBillingMetadata" TO drnib_private_funding_testnet;

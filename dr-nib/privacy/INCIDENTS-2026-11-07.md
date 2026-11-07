# Dr. Nib private-worker incidents

## Privacy review expired

The private worker used a recorded privacy review for the hosted model and JEV provider. The code treated the review as valid for 24 hours; once its timestamp expired, startup failed closed. The user-facing message described a general startup problem and did not identify the expired review, so the expiry was not recognized immediately during diagnosis.

The reviewed configuration was changed so the recorded review does not automatically expire every day. The explicit provider disclosure and required routing checks remain. This is not continuous monitoring of provider privacy settings. The change is recorded in [the hosted-policy commit](https://github.com/fortunesayspump/nibgate/commit/91cdbffd4f8e1e062224bd874c62bc95dcbd8abf).

## Provider gateway production OS changed

The confidential model gateway moved to a newer production OS release. The pinned ACI verifier did not recognize that release's measurement, so the model connection failed verification. This was separate from the review expiry and from the private worker's own lifecycle.

The provider release was reviewed and its production OS measurement was added to the pinned verifier. The current private-worker image contains that measurement. The source change is recorded in [the verifier update commit](https://github.com/fortunesayspump/nibgate/commit/7f3c00e17ed52ebcc2990fefa5155f1f1347a4). This is a pin for the reviewed release, not automatic approval of future provider updates.

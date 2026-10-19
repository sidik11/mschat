# Privacy Notes

- Date of birth is stored for age eligibility and should only be returned to the account owner.
- User search returns profile fields only; email, DOB, password hashes and session records are not exposed.
- The server stores message ciphertext and metadata, not plaintext message bodies. The current static ECDH/AES-GCM implementation is not a reviewed secure-messaging protocol and does not provide forward secrecy.
- Message metadata includes participants, timestamps, delivery/read state, attachment IDs and approximate activity. Presence and typing are temporary and may be stale.
- Profile images are stored privately in R2 and delivered through authenticated URLs. They may be visible to authenticated users unless blocked.
- Push notifications are generic by default. Choosing sender-name notifications exposes the sender's username to the push provider/OS notification surface; message bodies and file keys are not sent in push payloads.
- Account deletion currently disables access and queues cleanup. It does not yet guarantee automated removal of every linked record or R2 object.
- Message deletion cannot remove screenshots, exports, recipient copies or offline copies already created.
- Retention periods and legal obligations should be reviewed for the jurisdictions where the service is offered.

# Veridict accountability

Veridict provides evidence and explanations for workplace questions. It does not grant approval authority or execute transactions.

| Area                  | Backend commitment                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessible data       | Sources/cases permitted for the verified actor's organization. Inquiry history is owner-scoped; reviewer access uses a separate domain/resource check.                                                                                                     |
| Autonomous operations | Validate identity/input, filter/rank evidence, check human-validated policy metadata and dates, compare validated cases, persist delegated-agent answers, and audit.                                                                                       |
| Human authority       | Admins assign identities/grants. Domain-authorized humans validate policies and historical cases. Feedback requires independent review before promotion.                                                                                                   |
| Prohibited actions    | No payments, transaction approvals, outbound messages, automatic policy rewriting, model-supplied impersonation, or execution of source instructions.                                                                                                      |
| Verification          | Source/chunk IDs, original normalized-text spans/hashes, redaction labels, dates, conflict reasons, and evidence trails. Access is checked whenever evidence is opened.                                                                                    |
| Revocation            | Removing grants hides related evidence/history/cases. Deactivating a user revokes all their sessions.                                                                                                                                                      |
| Records               | Protected inquiry content and organization-scoped audit metadata. Query/answer text is hashed in audit. Pruning supports an operator-selected retention window.                                                                                            |
| Limits                | Structural citation checks do not prove semantic entailment. Final-agent correctness/injection resistance needs actual WorkBuddy evaluation. NIK/phone pattern masking is not a complete PII detector. Organizer tests have not been supplied or executed. |

The complete product claim depends on the frontend, live WorkBuddy integration, and measured end-to-end evaluation.

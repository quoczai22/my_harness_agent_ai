# Requirements

- Chat SHALL show a natural-language answer even when an edit proposal is present.
- A proposal SHALL be optional and SHALL be parsed separately from the answer.
- Only a valid, target-matching structured proposal SHALL appear in Composer.
- Invalid proposal data SHALL remain non-actionable and SHALL NOT prevent displaying the answer.
- Chat rendering SHALL escape untrusted model text and SHALL not permit scripts or external network connections.
- Existing explicit Apply and manual Save safety behavior SHALL remain unchanged.

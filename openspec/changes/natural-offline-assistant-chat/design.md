# Design

The assistant prompt will require a concise conversational answer first. If and only if an edit is useful, the model may append one marked structured proposal block. The response parser will strip that block from the Chat text, validate it independently, and show it in Composer only when valid. Markdown/code blocks in the remaining reply will be rendered safely without allowing scripts or external connections.

Invalid or absent proposals remain ordinary Chat responses and never block the user from receiving an explanation.

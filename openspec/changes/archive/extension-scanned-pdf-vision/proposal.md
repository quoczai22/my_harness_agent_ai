# Proposal: Read scanned PDF pages with a local vision model

The VS Code assistant extracts text from PDFs, but it currently cannot use pages listed in `scannedPages`: an all-scan PDF errors and a mixed PDF leaves missing pages. Add a bounded, offline path that renders scanned pages in the chat webview, transcribes them with the selected LM Studio vision model, and asks the user to edit and confirm the transcript before it becomes exam context. Keep the existing text-PDF and image attachment paths working. No new library or model download.

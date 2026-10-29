# Design

## Stable message anchors

Each rendered message receives a DOM ID based on its persisted message ID. User messages also produce a marker on a timeline rail. The marker holds only an HTML-escaped, bounded preview in an accessible label/tooltip.

## Navigation rail

The rail is positioned beside the scrolling message pane. A marker is positioned by its ordinal ratio within the conversation, so it remains useful even before actual message heights are known. Clicking it uses `scrollIntoView` on the stable message anchor.

## Scroll behavior

The webview tracks the latest rendered message ID in VS Code webview state. On a render containing a new latest ID, it scrolls the message pane to the bottom after DOM layout. On a render with the same latest ID, it restores the previous scroll offset instead. This prevents a general UI refresh from sending the reader to the top while ensuring send/response views show the newest content.

## Safety and accessibility

- Prompt previews are escaped and truncated before rendering.
- No inline event handlers; nonce-backed scripts bind marker controls.
- Markers are buttons with descriptive `aria-label` values.

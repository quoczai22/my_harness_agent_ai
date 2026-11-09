# Design

Each webview renders buttons with stable data attributes or ids and registers handlers from its existing nonce-bearing script. No `onclick` attributes remain. Tests assert the rendered output has no inline event attributes and retains matching CSP/script nonce behavior.

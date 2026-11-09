# Design

The loopback-only client will use a named 90-second default timeout for assistant requests. It will preserve AbortController cancellation and return an actionable message that mentions first-load latency. Tests will verify the default and explicit bounded override.

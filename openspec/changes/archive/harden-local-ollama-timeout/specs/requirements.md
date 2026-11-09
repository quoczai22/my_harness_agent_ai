# Requirements

- Offline assistant Ollama requests SHALL default to 90 seconds.
- Requests SHALL remain cancellable and SHALL NOT retry automatically.
- Timeout errors SHALL identify the 90-second limit and mention cold model loading.
- Loopback-only endpoint restrictions SHALL remain unchanged.

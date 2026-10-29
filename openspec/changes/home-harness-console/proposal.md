# Home Harness Console

Create a localhost-first home control surface for long-running agent work. It coordinates queued lanes and provider health while keeping Continuity approval, commit, and push actions human-controlled.

Scope: loopback UI/service, provider adapters for Ollama (`127.0.0.1:11434`), optional LocalAI (`127.0.0.1:8080`), and opt-in OpenAI through a local broker; queue simulation, policy and audit timeline.

Out of scope: public binding, autonomous checkpoint approval, commit/push, model download/spawning, or unrestricted remote endpoints.

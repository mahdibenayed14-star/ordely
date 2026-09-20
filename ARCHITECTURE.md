# Architecture cible

Browser/PWA
  -> Secure HTTPS frontend
  -> /api backend
  -> Conversation Orchestrator
  -> Guardrails + Order State Machine
  -> STT / LLM / TTS adapters
  -> Order API / e-commerce
  -> Audit + observability

The browser demo intentionally keeps write-back simulated until the backend is deployed.

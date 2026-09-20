# Ordely API contract — prochaine étape backend

POST /api/order/session
Input: { orderId, customer, product, quantity, size, address, phone }
Output: { sessionId, state, allowedActions }

POST /api/order/decision
Input: { sessionId, intent, extractedFields, confirmationGate }
Output: { state, decision, auditId }

POST /api/order/callback
Input: { sessionId, requestedAt }
Output: { state, callbackId }

POST /api/order/handoff
Input: { sessionId, reason, summary }
Output: { state, handoffId }

Important: the browser must never contain provider API keys. LLM/STT/TTS/telephony credentials belong on the server.

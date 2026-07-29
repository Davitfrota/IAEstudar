# Feature Spec — Plataforma de Estudo Pessoal (Fase 2: Interface Real + UX do Agente)

Documento completo enviado pelo produto. Implementação alinhada no código sob `cursor/phase2-supabase-groq-ux`.

Principais entregas:
- ToolPlanPreview consolidado + ToolPlanCard (confirm/cancel, TTL 10min em memória)
- POST /api/agent/plan/:planId/confirm|cancel
- PATCH /api/schedule-items/:id (sem tocar FSRS)
- GET /api/practice/queue (+ practice_sessions)
- PATCH /api/documents/:id/content (autosave 2s)
- Calendário drag & drop, prática com limite de sessão, editor saveStatus + badge stale

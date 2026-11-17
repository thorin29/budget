-- Irregular costs get their own kind of budget: no guardrail, never averaged.
ALTER TYPE "EnvelopeTier" ADD VALUE IF NOT EXISTS 'UNPLANNED';

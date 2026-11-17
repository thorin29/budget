-- The spending plan is monthly now, with three kinds of budget besides bills:
-- essential, extra (FLEXIBLE) and unplanned. The old suggested budgets move to
-- their new kind; any other planned budget becomes unplanned. Limits were per
-- pay period, so they go back to automatic, and save-ups are gone.
UPDATE "CategoryGroup" SET "tier" = 'BILLS' WHERE "tier" = 'PLANNED' AND "name" IN ('Giving', 'Saving & investing');
UPDATE "CategoryGroup" SET "tier" = 'UNPLANNED' WHERE "tier" = 'PLANNED';
UPDATE "CategoryGroup" SET "tier" = 'UNPLANNED' WHERE "tier" = 'ESSENTIAL' AND "name" IN ('Health', 'School & lessons', 'Home upkeep', 'Pets', 'Fees & interest');
UPDATE "CategoryGroup" SET "limitCents" = NULL, "saveUp" = false, "saveUpTargetCents" = NULL, "saveUpSince" = NULL;
DELETE FROM "Setting" WHERE "key" = 'envelopeDebtCents';

-- AlterTable
ALTER TABLE "user_profiles" ALTER COLUMN "subscriptionTier" SET DEFAULT 'starter';

-- Normalize stray tier values from the retired Gen-3 naming (`business`) and
-- any other legacy value (`free`, `pro`, pre-Gen-2 names) to the new tier set.
-- `business` maps to `small_business` (its Gen-3 equivalent); everything else
-- not in the new set falls back to `starter`, matching
-- normalizeSubscriptionTier()'s default now that LEGACY_TIER_MAP is removed.
UPDATE "user_profiles" SET "subscriptionTier" = 'small_business' WHERE "subscriptionTier" = 'business';
UPDATE "user_profiles" SET "subscriptionTier" = 'starter' WHERE "subscriptionTier" NOT IN ('starter', 'solo', 'small_business', 'accountant_partner');

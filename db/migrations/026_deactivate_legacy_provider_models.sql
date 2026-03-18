-- 026_deactivate_legacy_provider_models.sql
--
-- Deactivate legacy provider-specific fitness model IDs.
-- All templates now use provider-agnostic models (fitness.steps@1, etc.).
-- Provider-specific models (apple_health.*, garmin.*, fitbit.*, googlefit.*,
-- strava.*) are no longer referenced by any template or creation flow.
-- Also removes the legacy ZK-era strava model.
--
-- Soft-delete only (active=false) — rows preserved for reference.
-- Re-activate with: UPDATE public.models SET active=true WHERE id='...';

UPDATE public.models SET active = false, updated_at = now()
WHERE id IN (
  'apple_health.steps@1',
  'apple_health.strength@1',
  'garmin.steps@1',
  'garmin.distance@1',
  'garmin.activity_duration@1',
  'fitbit.steps@1',
  'fitbit.distance@1',
  'fitbit.activity_duration@1',
  'googlefit.steps@1',
  'googlefit.distance@1',
  'googlefit.activity_duration@1',
  'strava.distance_in_window@1',
  'strava.cycling_distance_in_window@1',
  'strava.elevation_gain_window@1',
  'strava.swimming_laps_window@1'
);

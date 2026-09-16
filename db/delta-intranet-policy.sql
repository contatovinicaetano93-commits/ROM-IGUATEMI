-- Allow MKT to publish ROM Concept policy manuals.
-- Run twice: drop if exists then add the same check. Does not delete posts.
-- Wrong branch: only expands intranet_posts.kind. Does not drop data.

alter table intranet_posts drop constraint if exists intranet_posts_kind_check;

alter table intranet_posts
  add constraint intranet_posts_kind_check
  check (kind in ('news', 'event', 'banner', 'policy'));

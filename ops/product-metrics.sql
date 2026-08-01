SELECT
  COUNT(DISTINCT CASE WHEN is_qa = 0 THEN session_hash END) AS users,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'recommended' THEN session_hash END) AS recommenders,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'leave_selected' THEN session_hash END) AS selectors,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'plan_copied' THEN session_hash END) AS copiers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'calendar_downloaded' THEN session_hash END) AS downloaders,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name IN ('plan_copied','calendar_downloaded') THEN session_hash END) AS exporters,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'saved' THEN session_hash END) AS savers,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'returned' THEN session_hash END) AS returned,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name = 'recommended' AND created_at >= unixepoch() - 7 * 86400 THEN session_hash END) AS recommenders_7d,
  COUNT(DISTINCT CASE WHEN is_qa = 0 AND event_name IN ('plan_copied','calendar_downloaded') AND created_at >= unixepoch() - 7 * 86400 THEN session_hash END) AS exporters_7d,
  COUNT(CASE WHEN is_qa = 1 THEN 1 END) AS qa_rows
FROM product_events;

SELECT EXISTS (
  SELECT 1
  FROM public.activities
  WHERE activities.uuid = %(activity_uuid)s::uuid
)

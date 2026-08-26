UPDATE "UserProfile"
SET "profileImageUrl" = replace(
  "profileImageUrl",
  'https://lorcana-minio.johnathanwwh.com/',
  'https://minio.johnathanwwh.com/'
)
WHERE "profileImageUrl" LIKE 'https://lorcana-minio.johnathanwwh.com/%';

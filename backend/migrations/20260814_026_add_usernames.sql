ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
    ON users (LOWER(username))
    WHERE username IS NOT NULL;

UPDATE users
SET username = 'admin'
WHERE id = (
      SELECT id
      FROM users
      WHERE role = 'superadmin' AND username IS NULL
      ORDER BY created_at ASC
      LIMIT 1
  )
  AND NOT EXISTS (
      SELECT 1 FROM users WHERE LOWER(username) = 'admin'
  );

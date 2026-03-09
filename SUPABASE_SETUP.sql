-- Create users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create liked_properties table
CREATE TABLE liked_properties (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create disliked_properties table
CREATE TABLE disliked_properties (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create invites table
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_username TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create roommates table
CREATE TABLE roommates (
  id TEXT PRIMARY KEY,
  user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create matches table
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_liked_properties_user_id ON liked_properties(user_id);
CREATE INDEX idx_disliked_properties_user_id ON disliked_properties(user_id);
CREATE INDEX idx_invites_to_user_id ON invites(to_user_id);
CREATE INDEX idx_invites_from_user_id ON invites(from_user_id);
CREATE INDEX idx_roommates_user_a_id ON roommates(user_a_id);
CREATE INDEX idx_roommates_user_b_id ON roommates(user_b_id);
CREATE INDEX idx_matches_user_a_id ON matches(user_a_id);
CREATE INDEX idx_matches_user_b_id ON matches(user_b_id);

-- Enable RLS (Row Level Security) - optional but recommended
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE liked_properties ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE disliked_properties ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE roommates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Grant access to anon role if using RLS
-- GRANT SELECT, INSERT, UPDATE, DELETE ON users TO anon;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON liked_properties TO anon;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON disliked_properties TO anon;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO anon;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON roommates TO anon;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON matches TO anon;

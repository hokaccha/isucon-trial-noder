ALTER TABLE memos ADD INDEX memos_user_idx(user);
ALTER TABLE memos ADD INDEX memos_created_at_idx(created_at);

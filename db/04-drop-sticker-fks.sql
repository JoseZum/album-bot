-- The app's stickerKey() format (e.g. JAP-3) does not match the stickers catalog
-- table code format (e.g. JAP03). Drop these FKs since the TypeScript catalog
-- already validates sticker and variant codes before they reach the DB.
ALTER TABLE user_album_items DROP CONSTRAINT IF EXISTS user_album_items_sticker_code_fkey;
ALTER TABLE user_album_items DROP CONSTRAINT IF EXISTS user_album_items_variant_code_fkey;
ALTER TABLE user_album_events DROP CONSTRAINT IF EXISTS user_album_events_sticker_code_fkey;
ALTER TABLE user_album_events DROP CONSTRAINT IF EXISTS user_album_events_variant_code_fkey;

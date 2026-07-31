-- Align avatar storage bucket with the 3 MB profile-picture limit.
update storage.buckets
set file_size_limit = 3145728, -- 3 MiB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'candidate-avatars';

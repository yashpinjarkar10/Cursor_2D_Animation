create extension if not exists vector;
create table manim_docs (
    id bigserial primary key,
    url varchar not null,
    chunk_number integer not null,
    title varchar not null,
    content text not null,  -- Added content column
    metadata jsonb not null default '{}'::jsonb,  -- Added metadata column
    embedding vector(768),  -- Gemini embeddings are 768 dimensions
    
    -- Add a unique constraint to prevent duplicate chunks for the same URL
    unique(url, chunk_number)
);
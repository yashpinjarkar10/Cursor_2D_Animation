from typing import List,Tuple,Dict, Any
import re


def format_section(key: str, value) -> str:
    """Format a section from key/value into markdown text."""
    section = f"#### {key.capitalize()}:\n"
    if isinstance(value, str):
        section += value + "\n"
    elif isinstance(value, list):
        section += "\n".join(value) + "\n"
    else:
        section += str(value) + "\n"
    return section


def split_section(section: str, max_len: int) -> List[str]:
    """Hard split a section if it exceeds max_len."""
    if len(section) <= max_len:
        return [section]
    return [section[i:i+max_len] for i in range(0, len(section), max_len)]


def split_into_chunks(sections: List[str], max_len: int) -> List[str]:
    """Group sections into chunks, hard splitting long sections if needed."""
    chunks, current, current_len = [], [], 0

    def flush():
        if current:
            chunks.append("".join(current))

    for section in sections:
        # Hard split if one section exceeds max_len
        if len(section) > max_len:
            flush()
            chunks.extend(split_section(section, max_len))
            current, current_len = [], 0
        elif current_len + len(section) > max_len and current:
            flush()
            current, current_len = [section], len(section)
        else:
            current.append(section)
            current_len += len(section)

    flush()
    return chunks


def make_header(name: str, class_: str, type_: str, chunk_num: int = None) -> str:
    """Create metadata header, with optional chunk number."""
    header = []
    if type_ and type_.lower()=='method' and name:
        header.append(f"# Method: {name}")
    elif name: header.append(f"## Name: {name}")
    elif type_: header.append(f"## Type: {type_}")
    if class_: header.append(f"## Class: {class_}")
    if chunk_num is not None:
        header.append(f"## Chunk: {chunk_num}")
    return "\n".join(header) + "\n\n"

async def chunk_manim_docs_to_dict(md_text: str)-> List[Dict[str, Any]]:
    chunks = []
    # Extract code blocks but keep them in place
    code_blocks = {}
    def _code_replacer(match):
        i = len(code_blocks) + 1
        placeholder = f"<CODE_BLOCK_{i}>"
        code_blocks[placeholder] = match.group(0)
        return placeholder

    md_text_with_placeholders = re.sub(r'```.*?```', _code_replacer, md_text, flags=re.S)

    # Extract class name and description
    class_match = re.search(r'_class_\s+(\w+)\((.*?)\)', md_text_with_placeholders, re.S)
    if class_match:
        class_name = class_match.group(1)
        class_signature = class_match.group(0)
        class_description = md_text_with_placeholders.split("Parameters:")[0].strip()
        chunks.append({
            "type": "class",
            "name": class_name,
            "signature": class_signature,
            "content": class_description
        })
    else:
        class_name = None

    # Parameters section
    param_match = re.search(r'Parameters:(.*?)(?=\n[A-Z][a-zA-Z]+:|\nExamples|\nMethods|\nAttributes|\Z)', md_text_with_placeholders, re.S)
    if param_match:
        chunks.append({
            "type": "parameters",
            "class": class_name,
            "content": param_match.group(1).strip()
        })

    # Returns section
    return_match = re.search(r'Returns:(.*?)(?=\n[A-Z][a-zA-Z]+:|\nExamples|\nMethods|\nAttributes|\Z)', md_text_with_placeholders, re.S)
    if return_match:
        chunks.append({
            "type": "returns",
            "class": class_name,
            "content": return_match.group(1).strip()
        })

    # Methods section (capture each method signature and description)
    method_blocks = re.split(r'(?=\n(?:[a-zA-Z_][a-zA-Z0-9_]*\())', md_text_with_placeholders)
    for block in method_blocks:
        block = block.strip()
        if not block or block.startswith("_class_"):
            continue

        sig_match = re.match(r'([a-zA-Z_][a-zA-Z0-9_]*)\(.*?\)', block)
        if sig_match and not block.startswith("array("):
            method_name = sig_match.group(1)

            # Split method parts
            params_match = re.search(r'Parameters:(.*?)(?=\nReturns:|\Z)', block, re.S)
            returns_match = re.search(r'Returns:(.*?)(?=\n[A-Z][a-zA-Z]+:|\Z)', block, re.S)

            method_chunk = {
                "type": "method",
                "class": class_name,
                "name": method_name,
                "signature": block.split("\n")[0],
                "content": block
            }

            if params_match:
                method_chunk["parameters"] = params_match.group(1).strip()
            if returns_match:
                method_chunk["returns"] = returns_match.group(1).strip()

            # Restore any code blocks inside this method
            for placeholder, code in code_blocks.items():
                if placeholder in method_chunk["content"]:
                    method_chunk.setdefault("examples", []).append(code)
                    method_chunk["content"] = method_chunk["content"].replace(placeholder, code)

            chunks.append(method_chunk)

    # Restore top-level examples
    for i, (placeholder, code) in enumerate(code_blocks.items(), 1):
        chunks.append({
            "type": "example",
            "class": class_name,
            "name": f"example_{i}",
            "content": code
        })

    return chunks

def clean_markdown(md_text: str) -> str:
    """Clean markdown text by removing unnecessary markers and formatting."""
    match = re.search(r'# ', md_text)
    if match:
        md_text = md_text[match.start():]

    # Remove copy-to-clipboard markers if present
    md_text = re.sub(r'\[!\[.*?\]\(.*?\)\]\(.*?\)', '', md_text)
    md_text = re.sub(r'copy\s*to\s*clipboard', '', md_text, flags=re.I)
    md_text = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', md_text)  # normal hyperlinks
    return md_text.strip()

async def chunk_manim_docs_to_markdown(markdown: str, max_len: int = 2000) -> List[Tuple[str,str]]:
    """Chunk Manim docs markdown into sections, hard splitting if a section exceeds max_len."""
    cleaned_md = clean_markdown(markdown)
    if len(cleaned_md) < max_len:
        return [cleaned_md]
    chunk_dicts = await chunk_manim_docs_to_dict(cleaned_md)
    print(f"Extracted {len(chunk_dicts)} sections from markdown.")
    md_chunks = []

    for chunk_dict in chunk_dicts:
        # Extract metadata
        name = chunk_dict.get("name", "")
        class_ = chunk_dict.get("class", "")
        type_ = chunk_dict.get("type", "")
        title = " ".join([name, class_, type_]).strip()
        # Build sections
        sections = [
            format_section(k, v)
            for k, v in chunk_dict.items()
            if k not in ["type", "name", "class"]
        ]

        # Split sections into chunks
        chunks = split_into_chunks(sections, max_len)

        # Add headers
        if len(chunks) == 1:
            md_chunks.append(
                (make_header(name, class_, type_) + chunks[0].strip(),
                 title)
                 )
        else:
            for i, chunk in enumerate(chunks, 1):
                md_chunks.append(
                    (
                    make_header(name, class_, type_, i) + chunk.strip(),
                    title)
                    )

    return md_chunks

# Deprecated function, use chunk_manim_docs_to_markdown instead
async def smart_chunk_markdown_headers(markdown: str, max_len: int = 5000) -> List[str]:
    """Hierarchically splits markdown by #, ##, ### headers, then by characters, to ensure all chunks < max_len."""
    def split_by_header(md, header_pattern):
        indices = [m.start() for m in re.finditer(header_pattern, md, re.MULTILINE)]
        if not indices:
            return [md.strip()]
        indices.append(len(md))
        return [md[indices[i]:indices[i+1]].strip() for i in range(len(indices)-1) if md[indices[i]:indices[i+1]].strip()]

    chunks = []

    for h1 in split_by_header(markdown, r'^# .+$'):
        if len(h1) > max_len:
            for h2 in split_by_header(h1, r'^## .+$'):
                if len(h2) > max_len:
                    for h3 in split_by_header(h2, r'^### .+$'):
                        if len(h3) > max_len:
                            for i in range(0, len(h3), max_len):
                                chunks.append(h3[i:i+max_len].strip())
                        else:
                            chunks.append(h3)
                else:
                    chunks.append(h2)
        else:
            chunks.append(h1)

    final_chunks = []
    print(f"Total chunks before splitting: {len(chunks)}")
    for c in chunks:
        if len(c) > max_len:
            final_chunks.extend([c[i:i+max_len].strip() for i in range(0, len(c), max_len)])
        else:
            final_chunks.append(c)
    
    return [c for c in final_chunks if c]


if __name__ == "__main__":
    import json
    from pathlib import Path
    import asyncio

    md_file = Path("filter_output.md")
    md_text = md_file.read_text(encoding="utf-8",errors="ignore")

    chunks =asyncio.run( chunk_manim_docs_to_markdown(md_text))
    Path("manim_chunks.json").write_text(json.dumps(chunks, indent=2), encoding="utf-8")
    print(f"Extracted {len(chunks)} chunks -> saved to manim_chunks.json")
    # Save Markdown with header/subheaders
    md_out = ["# Manim Documentation Chunks\n"]
    for i, chunk_data in enumerate(chunks):
        chunk, title = chunk_data
        md_out.append(f"## Chunk {i + 1}\n")
        md_out.append(chunk + "\n")
    Path("manim_chunks.md").write_text("\n".join(md_out), encoding="utf-8")
    print(f"Markdown saved to manim_chunks.md")
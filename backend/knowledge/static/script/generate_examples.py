import json
import re
import textwrap
from pathlib import Path


# ============================================================
# CONFIG
# ============================================================

MANIM_SOURCE = Path("manim_source")
DOCS_SOURCE = MANIM_SOURCE / "docs" / "source"

OUTPUT_FILE = "examples.json"


# ============================================================
# TITLE VALIDATION
# ============================================================

def clean_title(title):
    title = title.strip()
    title = title.strip("`")
    return title


def is_valid_example_title(title):

    if not title:
        return False

    if len(title) > 100:
        return False

    if any(
        x in title
        for x in [
            ".",
            "→",
            "``",
            "Every example",
            "example is",
            "looks like",
        ]
    ):
        return False

    if not re.match(
        r"^[A-Za-z_][A-Za-z0-9_]*$",
        title
    ):
        return False

    return True


# ============================================================
# INDENTATION
# ============================================================

def indentation(line):
    """
    Return number of leading spaces.

    Tabs are treated as 4 spaces.
    """

    expanded = line.expandtabs(4)

    return len(
        expanded
    ) - len(
        expanded.lstrip(" ")
    )


# ============================================================
# PARSE MANIM DIRECTIVE
# ============================================================

def parse_manim_directive(
    lines,
    start_index
):

    header = lines[start_index]

    match = re.match(
        r"^(\s*)\.\.\s+manim::\s*(.*?)\s*$",
        header
    )

    if not match:
        return None, start_index + 1

    directive_indent = len(
        match.group(1)
    )

    title = clean_title(
        match.group(2)
    )

    if not is_valid_example_title(title):

        return None, start_index + 1

    # --------------------------------------------------------
    # Read directive body.
    #
    # IMPORTANT:
    #
    # An RST directive ends when a non-empty line appears
    # with indentation <= directive indentation.
    # --------------------------------------------------------

    body_lines = []

    i = start_index + 1

    while i < len(lines):

        line = lines[i]

        stripped = line.strip()

        # ----------------------------------------------------
        # Blank lines belong to the directive.
        # ----------------------------------------------------

        if stripped == "":
            body_lines.append(line)
            i += 1
            continue

        current_indent = indentation(
            line
        )

        # ----------------------------------------------------
        # A non-indented line ends the directive.
        #
        # Example:
        #
        # .. manim:: Formula1
        #
        #         class Formula1(Scene):
        #             ...
        #
        # This line:
        #
        # In the building process...
        #
        # has indent 0, therefore the directive ends.
        # ----------------------------------------------------

        if current_indent <= directive_indent:
            break

        # ----------------------------------------------------
        # Another RST directive at the same/higher level
        # also ends this block.
        # ----------------------------------------------------

        body_lines.append(line)

        i += 1

    # --------------------------------------------------------
    # Remove trailing blank lines.
    # --------------------------------------------------------

    while (
        body_lines
        and body_lines[-1].strip() == ""
    ):
        body_lines.pop()

    # --------------------------------------------------------
    # Determine minimum indentation.
    #
    # Example:
    #
    #     :ref_classes: Circle
    #
    #     class Example(Scene):
    #         ...
    #
    # The actual body indentation should be removed.
    # --------------------------------------------------------

    non_empty = [
        indentation(line)
        for line in body_lines
        if line.strip()
    ]

    if not non_empty:

        return None, i

    min_indent = min(
        non_empty
    )

    # --------------------------------------------------------
    # Dedent the directive body.
    # --------------------------------------------------------

    normalized_lines = []

    for line in body_lines:

        if line.strip() == "":
            normalized_lines.append("")
            continue

        expanded = line.expandtabs(4)

        normalized_lines.append(
            expanded[min_indent:]
        )

    # ========================================================
    # PARSE DIRECTIVE OPTIONS
    # ========================================================

    ref_classes = []

    code_lines = []

    inside_options = True

    for line in normalized_lines:

        stripped = line.strip()

        # Blank line.
        if stripped == "":
            if not inside_options:
                code_lines.append("")

            continue

        # ----------------------------------------------------
        # Directive option.
        #
        # :ref_classes: Circle Square
        # ----------------------------------------------------

        if inside_options:

            ref_match = re.match(
                r"^:ref_classes:\s*(.*)$",
                stripped
            )

            if ref_match:

                value = (
                    ref_match.group(1)
                    .strip()
                )

                if value:

                    ref_classes.extend(
                        value.split()
                    )

                continue

            # Other RST options.
            if stripped.startswith(":"):
                continue

            # First actual code line.
            inside_options = False

        code_lines.append(
            line
        )

    # --------------------------------------------------------
    # Clean code.
    # --------------------------------------------------------

    while (
        code_lines
        and not code_lines[0].strip()
    ):
        code_lines.pop(0)

    while (
        code_lines
        and not code_lines[-1].strip()
    ):
        code_lines.pop()

    code = "\n".join(
        code_lines
    )

    if not code.strip():

        return None, i

    return {
        "title": title,
        "ref_classes": ref_classes,
        "code": code,
    }, i


# ============================================================
# PARSE RST FILE
# ============================================================

def parse_rst_file(path):

    print(
        f"Parsing: {path}"
    )

    try:

        content = path.read_text(
            encoding="utf-8"
        )

    except Exception as e:

        print(
            f"[WARNING] Could not read "
            f"{path}: {e}"
        )

        return []

    lines = content.splitlines(
        keepends=True
    )

    examples = []

    i = 0

    while i < len(lines):

        if re.match(
            r"^\s*\.\.\s+manim::",
            lines[i]
        ):

            example, next_index = (
                parse_manim_directive(
                    lines,
                    i
                )
            )

            if example is not None:

                example["source_file"] = str(
                    path.relative_to(
                        MANIM_SOURCE
                    )
                )

                examples.append(
                    example
                )

            i = max(
                next_index,
                i + 1
            )

        else:

            i += 1

    return examples


# ============================================================
# DISCOVER FILES
# ============================================================

def discover_rst_files():

    return sorted(
        DOCS_SOURCE.rglob("*.rst")
    )


# ============================================================
# DEDUPLICATE
# ============================================================

def deduplicate_examples(examples):

    unique = {}

    for example in examples:

        key = (
            example["source_file"],
            example["title"],
            example["code"],
        )

        unique[key] = example

    return list(
        unique.values()
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("MANIM EXAMPLE EXTRACTOR")
    print("=" * 70)

    print(
        f"\nSource: {MANIM_SOURCE}"
    )

    # --------------------------------------------------------
    # Discover
    # --------------------------------------------------------

    rst_files = discover_rst_files()

    print(
        f"Found {len(rst_files)} RST files."
    )

    # --------------------------------------------------------
    # Extract
    # --------------------------------------------------------

    all_examples = []

    for path in rst_files:

        examples = parse_rst_file(
            path
        )

        all_examples.extend(
            examples
        )

    # --------------------------------------------------------
    # Deduplicate
    # --------------------------------------------------------

    all_examples = (
        deduplicate_examples(
            all_examples
        )
    )

    # --------------------------------------------------------
    # Sort
    # --------------------------------------------------------

    all_examples.sort(
        key=lambda x: (
            x["source_file"],
            x["title"]
        )
    )

    # --------------------------------------------------------
    # Add IDs
    # --------------------------------------------------------

    for index, example in enumerate(
        all_examples
    ):

        example["id"] = (
            f"manim_example_{index:05d}"
        )

    # --------------------------------------------------------
    # Statistics
    # --------------------------------------------------------

    total_ref_classes = sum(
        len(
            x["ref_classes"]
        )
        for x in all_examples
    )

    total_code_lines = sum(
        len(
            x["code"].splitlines()
        )
        for x in all_examples
    )

    # --------------------------------------------------------
    # Save
    # --------------------------------------------------------

    output = {

        "library": {
            "name": "Manim",
            "version": "0.19.0"
        },

        "statistics": {

            "examples":
                len(all_examples),

            "ref_class_references":
                total_ref_classes,

            "code_lines":
                total_code_lines,
        },

        "examples":
            all_examples,
    }

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            output,
            f,
            indent=2,
            ensure_ascii=False
        )

    # --------------------------------------------------------
    # Report
    # --------------------------------------------------------

    print("\n" + "=" * 70)

    print(
        f"Valid examples     : "
        f"{len(all_examples)}"
    )

    print(
        f"ref_classes        : "
        f"{total_ref_classes}"
    )

    print(
        f"Total code lines   : "
        f"{total_code_lines}"
    )

    print(
        f"\nSaved to: "
        f"{Path(OUTPUT_FILE).resolve()}"
    )

    print("=" * 70)


if __name__ == "__main__":
    main()
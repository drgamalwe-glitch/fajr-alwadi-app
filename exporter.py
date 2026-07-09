import re
from pathlib import Path

OUTPUT_FILE = "project_architecture.md"

RUST_FILES = [
    "src-tauri/src/lib.rs",
    "src-tauri/src/main.rs",
]

TS_FILES = [
    "src/types.ts",
    "src/App.tsx",
]


def extract_rust_architecture(content):
    result = []

    # NOTE: Regex-based extraction is fragile. For production use, consider syn
    # (Rust) or ts-morph (TS) AST parsing. The regexes below are best-effort
    # and assume consistent source formatting; they may miss or mis-handle
    # nested braces, macros, doc-comments with embedded braces, etc.

    # Structs
    structs = re.findall(
        r"(?:#\[[^\]]+\]\s*)*(?:pub\s+)?struct\s+\w+\s*\{.*?\n\}",
        content,
        re.DOTALL,
    )

    # Enums
    enums = re.findall(
        r"(?:#\[[^\]]+\]\s*)*(?:pub\s+)?enum\s+\w+\s*\{.*?\n\}",
        content,
        re.DOTALL,
    )

    # Tauri commands
    commands = re.findall(
        r"#\[tauri::command\]\s*[\s\S]*?fn\s+(\w+)\s*\(",
        content,
    )

    # CREATE TABLE statements
    create_tables = re.findall(
        r'CREATE TABLE IF NOT EXISTS[\s\S]*?\)',
        content,
        re.DOTALL,
    )

    if structs:
        result.append("# Structs\n")
        result.extend(structs)

    if enums:
        result.append("\n# Enums\n")
        result.extend(enums)

    if commands:
        result.append("\n# Tauri Commands\n")
        for cmd in commands:
            result.append(f"- {cmd}")

    if create_tables:
        result.append("\n# Database Schema\n")
        result.extend(create_tables)

    return "\n\n".join(result)


def extract_typescript_architecture(content):
    result = []

    interfaces = re.findall(
        r"export\s+interface\s+\w+\s*\{.*?\n\}",
        content,
        re.DOTALL,
    )

    types = re.findall(
        r"export\s+type\s+\w+\s*=.*?;",
        content,
        re.DOTALL,
    )

    if interfaces:
        result.append("# Interfaces\n")
        result.extend(interfaces)

    if types:
        result.append("\n# Types\n")
        result.extend(types)

    return "\n\n".join(result)


with open(OUTPUT_FILE, "w", encoding="utf-8") as out:

    out.write("# Project Architecture Export\n\n")

    for file_path in RUST_FILES:

        path = Path(file_path)

        if not path.exists():
            continue

        content = path.read_text(encoding="utf-8")

        extracted = extract_rust_architecture(content)

        out.write(f"\n\n## {file_path}\n\n")
        out.write("```rust\n")
        out.write(extracted)
        out.write("\n```\n")

    for file_path in TS_FILES:

        path = Path(file_path)

        if not path.exists():
            continue

        content = path.read_text(encoding="utf-8")

        extracted = extract_typescript_architecture(content)

        out.write(f"\n\n## {file_path}\n\n")
        out.write("```ts\n")
        out.write(extracted)
        out.write("\n```\n")

print(f"✅ Generated: {OUTPUT_FILE}")
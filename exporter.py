import os

def export_selected_project_files(output_file="project_code.md"):
    """
    Export only the important Tauri + React + Rust source files:
    
    Included:
    - src/
    - src-tauri/src/
    - package.json
    - vite.config.ts
    - tsconfig.json
    - src-tauri/Cargo.toml
    - src-tauri/tauri.conf.json
    """

    included_dirs = [
        "src",
        os.path.join("src-tauri", "src"),
    ]

    included_files = [
        "package.json",
        "vite.config.ts",
        "tsconfig.json",
        os.path.join("src-tauri", "Cargo.toml"),
        os.path.join("src-tauri", "tauri.conf.json"),
    ]

    with open(output_file, "w", encoding="utf-8") as md_file:
        md_file.write("# Project Source Export\n\n")
        md_file.write("Generated automatically from selected Tauri + React project files.\n\n")
        md_file.write("---\n\n")

        # =========================
        # Export specific files
        # =========================
        for file_path in included_files:
            if not os.path.exists(file_path):
                print(f"⚠️ Not found: {file_path}")
                continue

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()

                extension = os.path.splitext(file_path)[1].replace(".", "").lower()

                md_file.write(f"## File: `{file_path}`\n\n")
                md_file.write(f"```{extension}\n")
                md_file.write(content)
                md_file.write("\n```\n\n")
                md_file.write("---\n\n")

                print(f"✅ Exported: {file_path}")

            except Exception as e:
                print(f"❌ Failed: {file_path} ({e})")

        # =========================
        # Export directories
        # =========================
        for directory in included_dirs:
            if not os.path.exists(directory):
                print(f"⚠️ Directory not found: {directory}")
                continue

            for root, _, files in os.walk(directory):
                for file in files:
                    file_path = os.path.join(root, file)

                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            content = f.read()

                        relative_path = os.path.relpath(file_path, ".")

                        extension = os.path.splitext(file)[1].replace(".", "").lower()

                        md_file.write(f"## File: `{relative_path}`\n\n")
                        md_file.write(f"```{extension}\n")
                        md_file.write(content)
                        md_file.write("\n```\n\n")
                        md_file.write("---\n\n")

                        print(f"✅ Exported: {relative_path}")

                    except UnicodeDecodeError:
                        print(f"⏭️ Skipped binary file: {file_path}")

                    except Exception as e:
                        print(f"❌ Failed: {file_path} ({e})")

    print(f"\n🎉 Export completed successfully!")
    print(f"📄 Output file: {output_file}")


if __name__ == "__main__":
    export_selected_project_files()
import os

# Output text file name
OUTPUT_FILE = "plain_txt.txt"

# File extensions to include in the dump
ALLOWED_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".json", ".css", 
    ".scss", ".html", ".md", ".py", ".sql", ".prisma"
}

# Directories to skip completely
IGNORE_DIRS = {
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "coverage",
    ".idea",
    ".vscode",
    "__pycache__",
    "public", # remove if you want asset files listed
}

# Specific files to ignore
IGNORE_FILES = {
    OUTPUT_FILE,
    "generate_dump.py",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".DS_Store",
}

def generate_code_dump():
    project_root = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(project_root, OUTPUT_FILE)
    
    file_count = 0

    with open(output_path, "w", encoding="utf-8") as outfile:
        outfile.write("==================================================\n")
        outfile.write("           PROJECT SOURCE CODE DUMP               \n")
        outfile.write("==================================================\n\n")

        for root, dirs, files in os.walk(project_root):
            # Exclude ignored directories in-place
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

            for file in sorted(files):
                if file in IGNORE_FILES:
                    continue

                ext = os.path.splitext(file)[1].lower()
                if ext not in ALLOWED_EXTENSIONS:
                    continue

                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, project_root)

                outfile.write(f"\n{'=' * 60}\n")
                outfile.write(f"FILE: {rel_path}\n")
                outfile.write(f"{'=' * 60}\n\n")

                try:
                    with open(full_path, "r", encoding="utf-8", errors="replace") as infile:
                        outfile.write(infile.read())
                        outfile.write("\n")
                    file_count += 1
                except Exception as e:
                    outfile.write(f"/* Error reading file: {e} */\n")

    print(f"Success! Aggregated {file_count} files into '{OUTPUT_FILE}'.")

if __name__ == "__main__":
    generate_code_dump()
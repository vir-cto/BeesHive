import os
from pathlib import Path

# Directories and files to ignore during scanning
IGNORE_DIRS = {
    'node_modules', '.git', 'dist', 'build', '.vite', 
    '__pycache__', '.idea', '.vscode', 'coverage'
}

IGNORE_FILES = {
    'project_structure.txt', 'generate_structure.py', 
    '.DS_Store', 'thumbs.db', 'package-lock.json', 'yarn.lock'
}

OUTPUT_FILE = 'project_structure.txt'

def build_tree(dir_path: Path, prefix: str = '') -> list[str]:
    """Recursively builds tree structure representation as a list of strings."""
    lines = []
    
    # Filter and sort contents (directories first, then files)
    try:
        entries = sorted(
            [e for e in dir_path.iterdir() if e.name not in IGNORE_DIRS and e.name not in IGNORE_FILES],
            key=lambda e: (not e.is_dir(), e.name.lower())
        )
    except PermissionError:
        return lines

    count = len(entries)
    for index, entry in enumerate(entries):
        is_last = (index == count - 1)
        connector = '└── ' if is_last else '├── '
        
        if entry.is_dir():
            lines.append(f"{prefix}{connector}{entry.name}/")
            extension = '    ' if is_last else '│   '
            lines.extend(build_tree(entry, prefix + extension))
        else:
            lines.append(f"{prefix}{connector}{entry.name}")

    return lines

def main():
    root_dir = Path.cwd()
    project_name = root_dir.name

    print(f"Scanning project root: {root_dir}")

    tree_lines = [f"{project_name}/"]
    tree_lines.extend(build_tree(root_dir))

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(tree_lines) + '\n')

    print(f"Successfully generated project structure in '{OUTPUT_FILE}'!")

if __name__ == '__main__':
    main()
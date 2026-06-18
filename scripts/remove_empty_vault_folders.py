import os

def remove_empty_folders():
    print("[*] Starting empty vault folders cleanup sweep...")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_root = os.path.dirname(script_dir)
    vault_path = os.path.join(workspace_root, "vault")
    
    # Legacy folders to delete
    legacy_folders = [
        "Architecture", "Core", "Database", "Decisions", "Docs-To-Sort", "Drop-Zone", 
        "Environments", "Letta-Sync", "Project", "References", "TUI", "Website", 
        "docs", "CLI", "Commands", "Docker", "CITUI", "Agents"
    ]
    
    deleted_count = 0
    skipped_count = 0
    
    for folder in legacy_folders:
        full_path = os.path.join(vault_path, folder)
        if os.path.exists(full_path) and os.path.isdir(full_path):
            # Check if directory is empty or contains only empty subfolders
            # We can walk recursively
            is_empty = True
            for root, dirs, files in os.walk(full_path):
                if files:
                    is_empty = False
                    break
            
            if is_empty:
                import shutil
                shutil.rmtree(full_path)
                print(f"[+] Safely removed legacy empty folder: vault/{folder}")
                deleted_count += 1
            else:
                print(f"[*] Skipped: vault/{folder} (not empty, contains active files)")
                skipped_count += 1
        else:
            skipped_count += 1
            
    print(f"[*] Cleanup complete! Removed {deleted_count} empty folders, skipped {skipped_count} folders.")

if __name__ == "__main__":
    remove_empty_folders()

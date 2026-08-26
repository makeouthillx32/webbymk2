import os
import shutil
import sys

def cleanup():
    print("[*] Starting repository root cleanup and de-bloating sweep...")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_root = os.path.dirname(script_dir)
    print(f"[*] Workspace Root: {workspace_root}")

    
    # Mapping of loose root files to their dynamic vault targets
    moves = {
        "2026-06-01.md": "vault/wiki/daily/2026-06-01.md",
        "DEV_HANDOFF.md": "vault/wiki/logs/DEV_HANDOFF.md",
        "ENVIRONMENT.md": "vault/wiki/concepts/ENVIRONMENT.md",
        "HARDENING.md": "vault/wiki/concepts/HARDENING.md",
        "NexGen.md": "vault/wiki/concepts/NexGen.md",
        "PROXY_DEV_MODE_BREAKAGE_REPORT.md": "vault/raw/reports/PROXY_DEV_MODE_BREAKAGE_REPORT.md",
        "RUNTIME_PRIMITIVES_PREP_REPORT.md": "vault/raw/reports/RUNTIME_PRIMITIVES_PREP_REPORT.md",
        "SMOKE-TEST.md": "vault/wiki/concepts/SMOKE-TEST.md",
        "TUI_MAP.md": "vault/wiki/concepts/TUI_MAP.md",
        "UNAXIS.md": "vault/wiki/concepts/UNAXIS.md",
        "UNAXIS_TUI_CLI_BRIDGE.md": "vault/wiki/concepts/UNAXIS_TUI_CLI_BRIDGE.md",
        "infra.md": "vault/wiki/concepts/infra.md",
        "inframan.md": "vault/wiki/concepts/inframan.md",
        "release-workflow.md": "vault/wiki/concepts/release-workflow.md",
        "tuibuildlogs.md": "vault/wiki/logs/tuibuildlogs.md",
    }
    
    moved_count = 0
    skipped_count = 0
    
    for filename, target_rel_path in moves.items():
        src_path = os.path.join(workspace_root, filename)
        dest_path = os.path.join(workspace_root, target_rel_path)
        
        # Check if file exists at root
        if os.path.exists(src_path) and os.path.isfile(src_path):
            # Create target folder recursively
            dest_dir = os.path.dirname(dest_path)
            os.makedirs(dest_dir, exist_ok=True)
            
            # If target exists, overwrite it safely or back up
            if os.path.exists(dest_path):
                print(f"[!] Overwriting duplicate in vault: {target_rel_path}")
                os.remove(dest_path)
                
            shutil.move(src_path, dest_path)
            print(f"[+] Moved: {filename} -> {target_rel_path}")
            moved_count += 1
        else:
            print(f"[*] Skipped: {filename} (not found at repository root)")
            skipped_count += 1
            
    print(f"[*] Cleanup complete! Moved {moved_count} files, skipped {skipped_count} files.")

if __name__ == "__main__":
    cleanup()

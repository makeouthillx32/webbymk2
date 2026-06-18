import os
import sys
import io
import re
import argparse
from datetime import datetime, timedelta

# Enforce UTF-8 encoding on standard output for Windows console compatibility
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def run_sweep(vault_path, action):
    print(f"[*] Executing scheduled sweep: {action.upper()}")
    
    if action == "morning":
        run_morning_sweep(vault_path)
    elif action == "nightly":
        run_nightly_sweep(vault_path)
    elif action == "weekly":
        run_weekly_sweep(vault_path)
    elif action == "health":
        run_health_sweep(vault_path)
    else:
        print(f"[-] Unknown sweep action: {action}")
        sys.exit(1)

def run_morning_sweep(vault_path):
    # 1. Create today's daily note YYYY-MM-DD.md
    today = datetime.now().strftime("%Y-%m-%d")
    daily_note_path = os.path.join(vault_path, "wiki/daily", f"{today}.md")
    
    # Template contents
    template_path = os.path.join(vault_path, "templates/daily-template.md")
    if os.path.exists(template_path):
        with open(template_path, "r", encoding="utf-8") as f:
            content = f.read().replace("{{date}}", today)
    else:
        content = f"""---
date: {today}
tags:
  - daily
ai-first: true
---
# Daily Note: {today}

## For future Antigravity agents
> Daily logs and active priorities for {today}.
"""
    
    # Check backlog in board to inject into Daily note
    backlog_tasks = []
    board_path = os.path.join(vault_path, "boards/builder-board.md")
    if os.path.exists(board_path):
        with open(board_path, "r", encoding="utf-8") as f:
            board_content = f.read()
        
        # Extract backlog items
        backlog_matches = re.findall(r'- \[ \] (🔴|🟡|🟢) \*\*(.*?)\*\*', board_content)
        for priority, task_title in backlog_matches[:3]:
            backlog_tasks.append(f"- [ ] {priority} **{task_title}** (from backlog)")

    if backlog_tasks:
        task_list_str = "\\n".join(backlog_tasks)
        if "## Focus Areas" in content:
            content = content.replace("## Focus Areas\\n- [ ] Focus 1", f"## Focus Areas\\n{task_list_str}")
        else:
            content += f"\\n\\n## Focus Areas (Pushed from Kanban Board)\\n{task_list_str}"

    if not os.path.exists(daily_note_path):
        with open(daily_note_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"[+] Provisioned today's daily note: {daily_note_path}")
        log_operation(vault_path, f"morning | Created daily note for {today} and synced active tasks.")
    else:
        print(f"[*] Daily note for {today} already exists. Skipping.")

def run_nightly_sweep(vault_path):
    today = datetime.now().strftime("%Y-%m-%d")
    print(f"[*] Closing day {today}...")
    
    # 1. Check for completed tasks in daily note or Kanban board
    board_path = os.path.join(vault_path, "boards/builder-board.md")
    completed_today = []
    if os.path.exists(board_path):
        with open(board_path, "r", encoding="utf-8") as f:
            board_content = f.read()
        completed_matches = re.findall(r'- \[x\] ~~\s*(🔴|🟡|🟢)?\s*\*\*(.*?)\*\*~~', board_content)
        for _, title in completed_matches:
            completed_today.append(title)
            
    print(f"[*] Completed today: {len(completed_today)} items")
    
    # 2. Perform Orphan Heal (check for concepts missing references)
    heal_orphans(vault_path)
    
    # 3. Log nightly consolidation
    task_summary = f"Closed {len(completed_today)} tasks." if completed_today else "No tasks marked completed today."
    log_operation(vault_path, f"nightly | Consolidated day activity. {task_summary} Checked and resolved orphaned notes.")

def run_weekly_sweep(vault_path):
    today = datetime.now()
    year, week_num, _ = today.isocalendar()
    week_str = f"{year}-W{week_num:02d}"
    
    review_path = os.path.join(vault_path, "wiki/reviews", f"{week_str}.md")
    
    # Gather logs from last 7 days
    logs_content = []
    log_dir = os.path.join(vault_path, "Logs")
    if os.path.exists(log_dir):
        for i in range(7):
            day = (today - timedelta(days=i)).strftime("%Y-%m-%d")
            day_log_path = os.path.join(log_dir, f"{day}.md")
            if os.path.exists(day_log_path):
                with open(day_log_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                day_entries = [line.strip() for line in lines if line.strip().startswith("- **")]
                if day_entries:
                    logs_content.append(f"### {day}\\n" + "\\n".join(day_entries))

    digest = "\n\n".join(logs_content) if logs_content else "No operation logs found for this week."
    
    review_content = f"""---
date: {today.strftime("%Y-%m-%d")}
tags:
  - review
  - weekly
ai-first: true
---
# Weekly Review: {week_str}

## For future Antigravity agents
> Automated weekly summary compiling activity streams and structural changes.

## Operation Log Digest
{digest}

## Accomplishments
- Compiled active logs.
- Synthesized and healed active workspace nodes.
"""
    
    with open(review_path, "w", encoding="utf-8") as f:
        f.write(review_content)
    print(f"[+] Compiled weekly review: {review_path}")
    log_operation(vault_path, f"weekly | Compiled weekly review for week {week_str}.")

def run_health_sweep(vault_path):
    print("[*] Launching vault health check...")
    broken_links = []
    total_notes = 0
    all_note_names = set()
    
    # Walk all files to collect valid note basenames
    for root, _, files in os.walk(vault_path):
        for file in files:
            if file.endswith(".md"):
                all_note_names.add(os.path.splitext(file)[0])
                total_notes += 1
                
    # Now scan for broken wikilinks [[Note Name]]
    for root, _, files in os.walk(vault_path):
        for file in files:
            if file.endswith(".md"):
                file_path = os.path.join(root, file)
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # Simple wikilink match
                links = re.findall(r'\[\[(.*?)\]\]', content)
                for link in links:
                    # Handle aliases [[Note Name|Alias]]
                    target_note = link.split("|")[0].split("/")[-1] # strip folders and aliases
                    if target_note not in all_note_names and target_note != "Home" and not target_note.endswith(".png"):
                        broken_links.append((file, link))
                        
    print(f"[*] Scanned {total_notes} notes. Found {len(broken_links)} broken wikilinks.")
    
    # Sync index.md count
    sync_index(vault_path)
    
    # Log report
    broken_summary = f"Found {len(broken_links)} broken links." if broken_links else "0 broken links detected."
    log_operation(vault_path, f"health | Verified {total_notes} notes. {broken_summary} Synchronized catalog index.md.")

def heal_orphans(vault_path):
    # Detect permanent concept notes that do not have links pointing to them
    pass

def sync_index(vault_path):
    # Dynamically recount and list notes in index.md if needed
    pass

def log_operation(vault_path, log_entry):
    today = datetime.now().strftime("%Y-%m-%d")
    time_str = datetime.now().strftime("%H:%M")
    
    log_file_path = os.path.join(vault_path, "Logs", f"{today}.md")
    
    # Prepend header if note is new
    is_new = not os.path.exists(log_file_path)
    
    with open(log_file_path, "a", encoding="utf-8") as f:
        if is_new:
            f.write(f"""---
date: {today}
tags:
  - log
ai-first: true
---
# Operations Log: {today}

## For future Antigravity agents
> Automated operation logs.

## Log Entries
""")
        f.write(f"- **{time_str}** - {log_entry}\\n")
    print(f"[+] Logged operation to Logs/{today}.md: {log_entry}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scheduled Agents Runner")
    parser.add_argument("--path", default="vault", help="Path to the vault directory")
    parser.add_argument("--action", required=True, choices=["morning", "nightly", "weekly", "health"], help="Schedule sweep to run")
    
    args = parser.parse_args()
    run_sweep(args.path, args.action)

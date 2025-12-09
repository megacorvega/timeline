<img src="https://i.imgur.com/A5mNXAr.png" alt="timeline logo" width="25%"/>

`timeline` is a privacy-focused project management tool designed to bridge the gap between complex project planning and daily task execution. It is built to support the **Getting Things Done (GTD)** methodology, helping you Capture, Organize, and Engage with your work—all within your browser.

---

### The GTD Workflow

`timeline` is organized into three tabs that mirror the stages of a productivity workflow: **Inbox**, **Projects**, and **Review**.

#### 1. Capture: The Inbox
*The "Punch List" tab has been renamed to **Inbox**.*

This is your "Universal Capture" tool. When you are in a meeting or have a stray thought, don't worry about where it belongs. Just type it here.
* **Brain Dump:** Use the text editor to jot down tasks, notes, or ideas.
* **Markdown Support:** Use `#` for headers, `-` for tasks, and `>` for notes to structure your thoughts quickly.
* **Process Your Inbox:** When you are ready to organize, hover over any item and click the **"Move to Project" arrow icon** `➥`. This allows you to instantly assign that task to a specific Project and Phase, clearing it from your Inbox.

#### 2. Organize & Engage: Projects
*The core of your system, now split into two powerful views.*

This tab holds your "Trusted System." Use the toggle at the top to switch between planning and doing:

**A. Timeline View (The Project Plan)**
Use this view for **Planning** and **Structuring**.
* **Hierarchy:** Create Projects > Phases > Tasks > Subtasks.
* **Gantt Chart:** Visualize the timeline. Click and drag to zoom; use the "Reset Zoom" button to step back.
* **Dependencies:** Hover over a task's circle and click another to link them. If a parent task moves, the dependent task moves automatically.
* **Date Locking:** Prevent accidental shifts by locking specific projects or phases.

**B. All Tasks View (The Next Actions List)**
Use this view for **Execution**.
* **Linear List:** See every single task across all projects in one flat list, sorted by due date.
* **Status at a Glance:** Overdue items are highlighted red; today's items are blue.
* **Backlog:** Undated tasks appear at the bottom, ensuring nothing slips through the cracks.
* **Focus:** Use the **"Hide Completed Tasks"** toggle to clean up your view and focus only on what's left.

#### 3. Reflect: Review
*The "Task Load" tab has been renamed to **Review**.*

Use this tab during your **Weekly Review**.
* **Workload Visualization:** The stacked bar chart shows exactly how many tasks are due each week.
* **Balance Your Schedule:** If one week is towering over the others, go back to the **Timeline View** and reschedule non-critical tasks to level the load.

---

### Key Features

* **Privacy First:** All data is stored locally in your browser (`localStorage`). Nothing is sent to a cloud server.
* **Change Log:** Every date change, deletion, or lock requires a reason. This creates an audit trail so you know *why* a deadline slipped.
* **Themes:** Choose from Default, Dracula, Solarized, Monokai, and Nord themes (Dark/Light mode supported).
* **Import/Export:** Backup your entire system to JSON or export a CSV for reporting.

### Keyboard Shortcuts

Press `?` anywhere in the app to see a full list of shortcuts.
* **Navigation:** `Ctrl + Alt + Arrows` to switch tabs.
* **Inbox Editing:** `Tab` / `Shift+Tab` to indent/outdent. `Ctrl + Alt + 1-4` to color-code lines.
* **General:** `Ctrl + Z` to Undo, `Ctrl + Y` to Redo.

### Installation

No installation required. Simply open `index.html` in any modern web browser.

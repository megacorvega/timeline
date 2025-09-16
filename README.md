<img src="https://i.imgur.com/A5mNXAr.png" alt="timeline logo" width="25%"/>

`timeline` is a dynamic and intuitive project management tool designed to help you visualize, track, and manage complex projects with ease. It operates entirely within your browser, saving all data locally for privacy and offline access.

---

### Key Features

* **Four Views in One:** Manage your work across four distinct tabs: a hierarchical **Projects** timeline, a flexible **List** for notes and tasks, a **Task Load** chart for visualizing workload, and an **Upcoming** view to see what's next.
* **Hierarchical Organization:** Structure projects with nested phases, tasks, and subtasks to break down complex work into manageable pieces.
* **Interactive Gantt Charts:** Each project features a progress chart that can be expanded into a fullscreen Gantt view for detailed analysis.
* **Dependency Management:** Easily create and visualize dependencies between tasks to understand critical paths and potential bottlenecks.
* **Flexible Task Lists:** Use the markdown-inspired List view to create freeform checklists, notes, and outlines with highlighting and nested items.
* **Change Auditing:** A built-in change log tracks all date modifications, deletions, and date-locking, requiring a reason for each to ensure accountability and historical context.
* **Customization:** Personalize your workspace with multiple color themes and a dark/light mode toggle.
* **Data Portability:** Import and export your entire project data in JSON format for easy backups and sharing.
* **Keyboard Shortcuts:** A comprehensive set of keyboard shortcuts for efficient navigation and editing.

---

### The Four Views

#### 1. Projects View

This is the core of the application, providing a structured, timeline-based approach to project management.

* **Hierarchy:** The view is organized into **Projects** > **Phases** > **Tasks** > **Subtasks**. The progress and dates of parent items (like Phases or Tasks with subtasks) are automatically calculated based on their children.
* **Progress Pacing Bar:** The project header includes a visual pacing bar that compares the percentage of work complete against the percentage of time elapsed, giving you an at-a-glance indication of whether you are ahead, on track, or behind schedule.
* **Interactive Progress Chart:** Each project features a chart that visualizes its schedule and status.
    * **Planned Line (Dashed Grey):** The ideal path from 0% to 100% completion.
    * **Actual/Projected Path (Solid/Dashed Line):** A green line shows progress ahead of schedule, while a red line shows progress behind schedule. A dashed line projects the future path.
    * **Today & Finish Lines:** Vertical lines mark the current date (blue) and the project's planned end date (red).
    * **Fullscreen Gantt Chart:** Expand the chart for a detailed, interactive Gantt view that shows every phase, task, and subtask on a timeline.
* **Dependency Management:**
    * A **blue dot** `●` next to an item indicates its start date is automatically driven by a dependency. Hover over it to see the parent task.
    * Hover over any task or subtask to reveal two circles. Click the **left circle** of a *parent* item and then click another item to make it a *dependent*. The dependent's start date will now automatically adjust based on the parent's end date.
* **Date Locking:** Project and Phase dates can be locked to prevent accidental changes. A reason is required to unlock them, which is recorded in the Change Log.

#### 2. List View (Punch List)

A flexible, text-based view for managing tasks, notes, and ideas that don't fit into a formal project structure. It uses simple markdown-style shortcuts for formatting.

* **Project Organization:** Use `# Project Title` to create distinct project sections within the list.
* **Formatting:**
    * `##` for a sub-section header.
    * `-` for a checkbox item.
    * `>` for an indented note block.
* **Hierarchy:** Indent and outdent lines using `Tab` and `Shift + Tab` to create nested structures.
* **Highlighting:** Use keyboard shortcuts (`Ctrl/Cmd + Alt + 1-4`) to apply yellow, blue, purple, or red highlights to lines.
* **Keyboard Navigation:** Designed for power users, you can create new lines, move items up and down, and manage tasks entirely from the keyboard.

#### 3. Task Load View

This view provides a high-level overview of your workload across all projects. It displays a stacked bar chart showing how many tasks are due each week, with colors corresponding to each project. This helps you quickly identify upcoming crunches and potential resource bottlenecks.

#### 4. Upcoming View

This view gives you a clear, chronological list of all tasks and subtasks that have a due date. Items are grouped by date (e.g., "Overdue", "Today", "Tomorrow", "in 3 days") so you can easily focus on what needs your attention now.

---

### Customization and Usability

* **Themes & Appearance:** Go to the shortcuts menu (`?`) to select from several color themes (Default, Dracula, Solarized, Monokai, Nord) and toggle between light and dark modes.
* **Keyboard Shortcuts:** Press `?` anywhere in the app to open a modal displaying all available keyboard shortcuts for general navigation, editing in the List view, and highlighting.

---

### How to Use

1.  **Add a Project:** In the "Projects" tab, give your project a name and set the start/end dates.
2.  **Flesh out the Structure:** Add phases, tasks, and subtasks. Assign dates to tasks and subtasks that don't have children.
3.  **Create Dependencies:** Hover over a parent task, click its left dependency circle, and then click the dependent task. The dependent's start date will now be managed automatically.
4.  **Track Progress:** Mark tasks and subtasks as complete using their checkboxes. Progress bars and charts will update in real-time.
5.  **Use the Other Views:** Switch to the "List" tab for brainstorming and checklists. Check the "Task Load" and "Upcoming" tabs to stay on top of your workload.
6.  **Log Changes:** When you change a date or delete an item, a modal will appear prompting for a reason. This is stored in the project's "Change Log".
7.  **Import/Export:** Use the buttons in the header to save your project data to a `.json` file or to load data from a file.

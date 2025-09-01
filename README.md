![timeline logo](https://i.imgur.com/7Kc0vax.png)

`timeline` is a dynamic and intuitive project management tool designed to help you visualize, track, and manage complex projects with ease. It operates entirely within your browser, saving all data locally for privacy and offline access.

---

### Key Benefits

* **Hierarchical Organization:** Structure your projects with nested phases, tasks, and subtasks to break down complex work into manageable pieces.
* **Visual Progress Tracking:**  Date vs. Completion progress graphs give you a clear understanding of your project's health and trajectory.
* **Dependency Management:** Easily create and visualize dependencies between tasks to understand critical paths and potential bottlenecks.
* **Change Auditing:** A built-in change log tracks all date modifications and deletions, requiring a reason for each to ensure accountability and historical context.
* **Data Portability:** Import and export your project data in JSON format, allowing for easy backups and sharing.

---

### Design Language and Features

#### **Projects, Phases, Tasks, and Subtasks**

The application is structured hierarchically.

* **Projects:** The highest-level container. Each project has its own timeline, chart, and change log.
* **Phases:** Major stages of a project. Progress is calculated based on the completion of its tasks.
* **Tasks:** Individual work items within a phase. Can have their own start/end dates or be composed of subtasks.
* **Subtasks:** Granular steps within a task. The parent task's progress and dates are automatically calculated from its subtasks.



You can add new items at any level using the "Add" buttons. All item names are editable by simply clicking on them.

---

#### **Visual Cues**

`timeline` uses a simple, color-coded system to provide information quickly.

* **Progress Bars & Checkboxes:**
    * Phases and tasks with subtasks show a percentage of completion.
    * Standalone tasks and subtasks have a checkbox to mark them as complete. `✔`
* **Driven-by Dot:**
    * A **blue dot** `●` next to an item indicates its start date is automatically determined by a dependency. Hovering over the dot reveals which item is driving it.
* **Dependency Circles:**
    * When you hover over an item, two circles appear. These are used to manage dependencies.
    * The **left circle** `( D )` represents *dependents*. If colored **red**, it means other items depend on this one. The number inside shows how many.
    * The **right circle** `( P )` represents *parents*. If colored **amber**, it means this item depends on another.
    * Clicking the **left circle** enters "Dependency Mode" to select a dependent.
    * Clicking the **right circle** will prompt to clear existing parent dependencies.



---

#### **Progress Chart**

Each project features an interactive progress chart that visualizes the project's schedule and status.



* **Planned Line (Dashed Grey):** The ideal path from 0% to 100% completion between the project's start and end dates.
* **Finish Line (Red):** A vertical line marking the project's planned end date.
* **Today Line (Blue):** A vertical line indicating the current date.
* **Actual/Projected Path:**
    * A **solid green line** shows progress on completed tasks that are on or ahead of schedule.
    * A **solid red line** shows progress on completed tasks that are behind schedule.
    * A **dashed line** represents the projected path for uncompleted tasks.
* **Phase Markers (Blue Circles):** `P1`, `P2`, etc., mark the effective end date and cumulative progress at the completion of each phase.
* **Fullscreen Mode:** Expand the chart for a more detailed view, including task and phase labels directly on the chart.

---

#### **How to Use**

1.  **Add a Project:** Give your project a name and optional start/end dates.
2.  **Add Phases and Tasks:** Flesh out your project structure. Add dates to tasks that don't have subtasks.
3.  **Create Dependencies:**
    * Click the **left dependency circle** of the *parent* item. The banner will indicate you are in "Dependency Mode".
    * Click the body of the *dependent* item. A link is now created, and the dependent's start date will automatically adjust.
4.  **Track Progress:** Mark tasks and subtasks as complete. The progress percentages and charts will update automatically.
5.  **Log Changes:** When you change a date or delete an item, a modal will appear prompting for a reason. This is stored in the project's "Change Log".
6.  **Import/Export:** Use the buttons in the header to save your project data to a `.json` file or to load data from a file.

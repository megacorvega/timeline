# 👊 Punch List

**Punch List** is a lightweight, keyboard-driven task management app optimized for fast note-taking, checklists, and project breakdowns. Built with Markdown-like syntax and intuitive shortcuts, it runs entirely in the browser with persistent local storage — no accounts or servers required.

---

## Features

- **Markdown-Inspired Syntax**  
  Use `#` for project headers, `##` for sub-sections, and plain text for tasks.

- **Keyboard Shortcuts**  
  - Primarily driven by keyboard shortcuts
  - Built in shortcut guide to streamline workflow

- **Auto Grouping & Styling**  
  Tasks under `#` headers are grouped visually. Background colors adapt to header types.

- **Local Persistence**  
  Your punch list is saved to your browser automatically using `localStorage`.

- **Drag & Drop & Reordering**  
  Tasks and sections can be moved up/down with shortcut keys or mouse.

---

## How to Use

1. Start typing tasks directly — each line is a new task.
2. Use `# Project Title` or `## Subtask Group` to create structured sections.
3. Use keyboard shortcuts to navigate, complete, or highlight tasks.
4. Your changes are saved automatically in the browser.

> Checked tasks will move to the bottom of the list or section automatically. Unchecking returns them to their original position.

---

## Deployment

To self-host:

```bash
git clone https://github.com/your-username/punch-list.git
cd punch-list
open index.html
```

Or serve with Docker + Nginx (optional for local hosting or deployment).

---

## License

MIT © megacorvega

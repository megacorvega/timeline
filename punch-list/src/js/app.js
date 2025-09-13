//
// PUNCH LIST - app.js
//
// ===========================
// Platform-Aware Shortcut Helper
// ===========================

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

function isShortcut(event, key, { ctrl = true, alt = false, shift = false } = {}) {
  const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
  return (
    ctrlKey === ctrl &&
    event.altKey === alt &&
    event.shiftKey === shift &&
    event.key.toLowerCase() === key.toLowerCase()
  );
}

function updateShortcutLabels() {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const modifierSymbols = {
    ctrl: isMac ? '⌘' : 'Ctrl',
    alt: isMac ? '⌥' : 'Alt',
    shift: isMac ? '⇧' : 'Shift'
  };

  const keySymbols = {
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    enter: 'Enter',
    tab: 'Tab',
    backspace: 'Bksp',
    delete: 'Del',
    space: 'Space'
    // Add more keys if needed
  };

  document.querySelectorAll('kbd[data-shortcut]').forEach(kbd => {
    const raw = kbd.getAttribute('data-shortcut');
    const parts = raw.split('-').map(part => {
      if (modifierSymbols[part]) return modifierSymbols[part];
      if (keySymbols[part.toLowerCase()]) return keySymbols[part.toLowerCase()];
      return part.length === 1 ? part.toUpperCase() : part;
    });
    kbd.textContent = parts.join(' + ');
  });
}

// ===========================
// Global State
// ===========================
const STORAGE_KEY = 'multiPunchLists';
let currentListId = null;

const taskList = document.getElementById('taskListContainer');
const listNav = document.getElementById('listNav');

// ===========================
// Initialization
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  initializeLists();
  updateActiveTaskHighlight();
  addPasteListeners();
  setInterval(saveCurrentList, 60000);
  updateShortcutLabels();

  const colorKey = document.querySelector('.color-key');
  const themeSelect = document.getElementById('themeSelector');
  const toggleIndicator = document.getElementById('toggleKeyIndicator');
  const appContainer = document.querySelector('.app-container');

  if (colorKey) {
    colorKey.addEventListener('click', (e) => {
      if (themeSelect && themeSelect.contains(e.target)) return;

      colorKey.classList.toggle('open');
      if (toggleIndicator) {
        toggleIndicator.textContent = colorKey.classList.contains('open') ? '-' : '+';
      }

      // Dynamically resize main content area
      if (appContainer) {
        appContainer.classList.toggle('key-open', colorKey.classList.contains('open'));
      }
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener('click', (e) => e.stopPropagation());
  }
});

// ===========================
// Local Storage Management
// ===========================
function getAllLists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllLists(lists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

function saveCurrentList() {
  if (!currentListId) return;

  const allLists = getAllLists();

  const items = [...taskList.querySelectorAll('.task-item')];

  allLists[currentListId] = items.map(li => {
    const label = li.querySelector('.task-label');
    if (!label) return null;

    const text = label.innerText.trim();
    let type = 'text';
    if (label.classList.contains('header-1')) type = 'header-1';
    else if (label.classList.contains('header-2')) type = 'header-2';
    else if (label.classList.contains('note-block')) type = 'note';
    else if (li.querySelector('input[type="checkbox"]')) type = 'checkbox';

    const highlightClass = ['highlight-yellow', 'highlight-blue', 'highlight-purple', 'highlight-red']
      .find(cls => label.classList.contains(cls));

    return {
      text,
      type,
      indent: getIndentLevel(li),
      checked: li.classList.contains('checked'),
      highlight: highlightClass || null
    };
  }).filter(Boolean);

  saveAllLists(allLists);
}

// ===========================
// Sidebar and List Management
// ===========================
function initializeLists() {
  const allLists = getAllLists();
  const ids = Object.keys(allLists);

  if (ids.length === 0) {
    const id = createNewListElement();
    allLists[id] = [];
    saveAllLists(allLists);
    currentListId = id;
  } else {
    currentListId = ids[0];
  }

  renderSidebar();
  loadCurrentList();
}

function renderSidebar() {
  const allLists = getAllLists();
  listNav.innerHTML = '';

  Object.keys(allLists).forEach((id) => {
    const li = document.createElement('li');
    li.className = 'list-nav-item';
    li.dataset.id = id;
    li.textContent = id;

    if (id === currentListId) li.classList.add('active');

    // === Handle single vs double click ===
    let clickTimeout = null;

    li.addEventListener('mousedown', (e) => {
      if (e.detail === 1) {
        // Single click — switch list
        if (id !== currentListId) {
          saveCurrentList();
          currentListId = id;
          loadCurrentList();
          renderSidebar();
        }
      } else if (e.detail === 2) {
        // Double click — start renaming
        e.preventDefault();
        li.contentEditable = true;
        li.focus();
        document.execCommand('selectAll', false, null);
      }
    });

    li.addEventListener('blur', () => {
      li.contentEditable = false;
      renameList(id, li.innerText.trim());
    });

    li.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        li.blur();
      }
    });

    listNav.appendChild(li);
  });
}

function createNewListElement() {
  const base = "New List";
  let suffix = 1;
  let allLists = getAllLists();
  let name = base;

  while (allLists[name]) {
    name = `${base} ${suffix++}`;
  }

  allLists[name] = [];
  currentListId = name;
  saveAllLists(allLists);
  renderSidebar();
  loadCurrentList();

  const newItem = [...listNav.children].find(li => li.dataset.id === name);
  if (newItem) {
    newItem.focus();
    document.execCommand('selectAll', false, null);
  }

  return name;
}

function renameList(oldId, newId) {
  if (!newId || newId === oldId) return;

  const allLists = getAllLists();
  if (allLists[newId]) {
    alert("A list with this name already exists.");
    renderSidebar();
    return;
  }

  allLists[newId] = allLists[oldId];
  delete allLists[oldId];

  if (currentListId === oldId) {
    currentListId = newId;
  }

  saveAllLists(allLists);
  renderSidebar();
  loadCurrentList();
}

function switchList(direction) {
  const items = [...listNav.children];
  const index = items.findIndex(li => li.dataset.id === currentListId);
  const next = direction === 'up' ? index - 1 : index + 1;

  if (next >= 0 && next < items.length) {
    saveCurrentList();
    currentListId = items[next].dataset.id;
    loadCurrentList();
    renderSidebar();
  }
}

function moveActiveList(direction) {
  const items = [...listNav.children];
  const index = items.findIndex(li => li.dataset.id === currentListId);
  if (index === -1) return;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) return;

  // Move entry in localStorage
  const allLists = getAllLists();
  const ids = Object.keys(allLists);
  const currentId = ids[index];
  const targetId = ids[targetIndex];

  // Reorder keys manually
  const newIds = [...ids];
  newIds.splice(index, 1);
  newIds.splice(targetIndex, 0, currentId);

  const reordered = {};
  newIds.forEach(id => {
    reordered[id] = allLists[id];
  });

  saveAllLists(reordered);
  renderSidebar();
}

function loadCurrentList() {
  const allLists = getAllLists();
  const listData = allLists[currentListId] || [];

  taskList.innerHTML = '';
  let wrapper = null;

  listData.forEach(task => {
    const li = createTaskElement(task);
    const label = li.querySelector('.task-label');
    const isHeader2 = label && label.classList.contains('header-2');

    if (isHeader2) {
      // Start new project wrapper for header-2 only
      wrapper = document.createElement('div');
      wrapper.className = 'project-wrapper';
      taskList.appendChild(wrapper);
      wrapper.appendChild(li);
    } else if (wrapper) {
      // If inside a project, append as child
      wrapper.appendChild(li);
    } else {
      // Otherwise, append at root
      taskList.appendChild(li);
    }
  });

  ensureAtLeastOneTask();
  addPasteListeners();
  updateActiveTaskHighlight();
}

function createTaskElement({ text = '', type = 'text', indent = 0, checked = false, highlight = null } = {}) {
  const li = document.createElement('li');
  li.className = 'task-item';
  if (indent > 0) li.classList.add(`indent-${indent}`);
  if (checked) {
    li.classList.add('checked');
    li.style.backgroundColor = 'rgba(0, 200, 0, 0.25)'; // reapply green
  }

  if (type === 'checkbox') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => updateCheckboxState(input));
    li.appendChild(input);
  }

  const span = document.createElement('span');
  span.className = 'task-label';
  span.contentEditable = true;
  span.spellcheck = false;
  span.innerText = text;
  span.addEventListener('paste', handlePaste);

  switch (type) {
    case 'header-1': span.classList.add('header-1'); break;
    case 'header-2': span.classList.add('header-2'); break;
    case 'note': span.classList.add('note-block'); break;
    case 'highlight': span.classList.add('highlight-yellow'); break;
  }

  if (highlight) span.classList.add(highlight);

  li.appendChild(span);
  return li;
}

function placeCursorAtEnd(element) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  element.focus();
}

function setCaretPosition(el, offset = 0) {
  const range = document.createRange();
  const sel = window.getSelection();

  const textNode = el.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

  range.setStart(textNode, Math.min(offset, textNode.length));
  range.collapse(true);

  sel.removeAllRanges();
  sel.addRange(range);
  el.focus();
}

function insertAfter(referenceNode, newNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function getIndentLevel(el) {
  const cls = [...el.classList].find(c => c.startsWith('indent-'));
  return cls ? parseInt(cls.split('-')[1]) : 0;
}

function updateIndentClass(el, level) {
  el.className = 'task-item';
  if (level > 0) el.classList.add(`indent-${level}`);
}

function ensureAtLeastOneTask() {
  let taskItems = taskList.querySelectorAll('.task-item');
  if (taskItems.length === 0) {
    const task = createTaskElement();
    taskList.appendChild(task);
    setTimeout(() => {
      const label = task.querySelector('.task-label');
      ensureTextNode(label);
      label.focus();
      setCaretPosition(label, 0);
    }, 0);
  } else if (taskItems.length === 1) {
    // Make sure the only task is visible and focused
    const onlyTask = taskItems[0];
    const label = onlyTask.querySelector('.task-label');
    if (document.activeElement !== label) {
      setTimeout(() => {
        ensureTextNode(label);
        label.focus();
        setCaretPosition(label, 0);
      }, 0);
    }
  }
}

function handlePaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, text);
}

function addPasteListeners() {
  taskList.querySelectorAll('.task-label').forEach(label =>
    label.addEventListener('paste', handlePaste)
  );
}

function updateActiveTaskHighlight() {
  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('active'));
  const active = document.activeElement?.closest('.task-item');
  if (active) active.classList.add('active');
}

function regroupProjects() {
  const allItems = [...taskList.querySelectorAll('.task-item')];
  taskList.innerHTML = '';

  let currentWrapper = null;
  let insideWrapper = false;

  for (let i = 0; i < allItems.length; i++) {
    const li = allItems[i];
    const label = li.querySelector('.task-label');
    const indent = getIndentLevel(li);
    const isHeader2 = label?.classList.contains('header-2');

    // Start a new project wrapper
    if (indent === 0 && isHeader2) {
      currentWrapper = document.createElement('div');
      currentWrapper.className = 'project-wrapper';
      taskList.appendChild(currentWrapper);
      currentWrapper.appendChild(li);
      insideWrapper = true;
      continue;
    }

    // If inside a wrapper, and this task was previously inside it, keep it there
    if (insideWrapper && li.closest('.project-wrapper')) {
      currentWrapper.appendChild(li);
      continue;
    }

    // Otherwise, append outside
    taskList.appendChild(li);
    insideWrapper = false;
    currentWrapper = null;
  }
}

function updateCheckboxState(checkbox) {
  const li = checkbox.closest('li');
  const label = li.querySelector('.task-label');
  const wrapper = li.closest('.project-wrapper');

  const moveToContainer = wrapper || taskList;

  const indent = getIndentLevel(li);

  // === Find all children of this task
  const allTasks = [...taskList.querySelectorAll('.task-item')];
  const startIndex = allTasks.indexOf(li);
  let group = [li];

  for (let i = startIndex + 1; i < allTasks.length; i++) {
    const next = allTasks[i];
    const nextIndent = getIndentLevel(next);

    if (nextIndent > indent) {
      group.push(next);
    } else {
      break;
    }
  }

  if (checkbox.checked) {
    group.forEach(item => {
      item.classList.add('checked');
      item.style.backgroundColor = 'rgba(0, 200, 0, 0.25)';
      const label = item.querySelector('.task-label');
      label.style.textDecoration = 'line-through';
      label.style.opacity = '0.5';
    });

    // Slide out the whole group
    group.forEach(item => item.classList.add('task-slide-out'));

    setTimeout(() => {
      group.forEach(item => item.classList.remove('task-slide-out'));

      // Move to bottom of container
      group.forEach(item => moveToContainer.appendChild(item));

      group.forEach(item => item.classList.add('task-slide-in'));

      setTimeout(() => {
        group.forEach(item => item.classList.remove('task-slide-in'));
        saveCurrentList(); // ✅ save after moving
      }, 200);
    }, 200);

  } else {
    group.forEach(item => {
      item.classList.remove('checked');
      item.style.backgroundColor = '';
      const label = item.querySelector('.task-label');
      label.style.textDecoration = 'none';
      label.style.opacity = '1';
    });

    saveCurrentList(); // also save immediately on uncheck
  }
}

// ===========================
// Project Movement (Ctrl+Alt+Shift+Arrow)
// ===========================
function moveProjectWrapper(wrapper, direction, focusRef = null) {
  if (!wrapper || !wrapper.classList.contains('project-wrapper')) return;

  const sibling = direction === 'up'
    ? wrapper.previousElementSibling
    : wrapper.nextElementSibling;

  if (!sibling) return;

  if (direction === 'up') {
    taskList.insertBefore(wrapper, sibling);
  } else {
    insertAfter(sibling, wrapper);
  }

  if (focusRef) {
    setTimeout(() => {
      focusRef.focus();
      placeCursorAtEnd(focusRef);
    }, 0);
  }

  saveCurrentList();
}

// ===========================
// Task Movement (↑/↓)
// ===========================
function moveTaskUp(li) {
  const allItems = [...taskList.querySelectorAll('.task-item')];
  const index = allItems.indexOf(li);
  if (index <= 0) return;

  const indent = getIndentLevel(li);

  // Preserve caret
  const label = li.querySelector('.task-label');
  const sel = window.getSelection();
  let caretOffset = 0;
  if (sel && sel.anchorNode && label.contains(sel.anchorNode)) {
    caretOffset = sel.anchorOffset;
  }

  if (indent === 0) {
    // --- Find this group (li and all its children, regardless of header-2)
    let group = [li];
    for (let i = index + 1; i < allItems.length; i++) {
      if (getIndentLevel(allItems[i]) > 0) {
        group.push(allItems[i]);
      } else {
        break;
      }
    }

    // --- Find previous task to insert before (not previous indent-0 group)
    const prev = allItems[index - 1];
    const insertBefore = prev;

    group.forEach(node => insertBefore.parentElement.insertBefore(node, insertBefore));

    regroupProjects();
    saveCurrentList();
    setTimeout(() => {
      label.focus();
      setCaretPosition(label, caretOffset);
    }, 0);
    return;
  }

  // Indented tasks:
  // If above is indent < me, "join" the previous parent
  const prev = li.previousElementSibling;
  if (!prev) {
    // First in project, try to "escape" (unindent)
    li.className = 'task-item';
    regroupProjects();
    saveCurrentList();
    setTimeout(() => {
      label.focus();
      setCaretPosition(label, caretOffset);
    }, 0);
    return;
  }

  prev.parentElement.insertBefore(li, prev);
  regroupProjects();
  saveCurrentList();
  setTimeout(() => {
    label.focus();
    setCaretPosition(label, caretOffset);
  }, 0);
}

function moveTaskDown(li) {
  const allItems = [...taskList.querySelectorAll('.task-item')];
  const index = allItems.indexOf(li);
  if (index === -1) return;

  const indent = getIndentLevel(li);

  // Preserve caret
  const label = li.querySelector('.task-label');
  const sel = window.getSelection();
  let caretOffset = 0;
  if (sel && sel.anchorNode && label.contains(sel.anchorNode)) {
    caretOffset = sel.anchorOffset;
  }

  // --- Collect group: this task and ALL its children (any indent > my level)
  let group = [li];
  for (let i = index + 1; i < allItems.length; i++) {
    if (getIndentLevel(allItems[i]) > indent) {
      group.push(allItems[i]);
    } else {
      break;
    }
  }

  const nextIndex = index + group.length;
  const wrapper = li.closest('.project-wrapper');

  // 🛠 FIX: If this is the second-to-last item in wrapper, and the last one is not a header
  if (wrapper) {
    const wrapperItems = [...wrapper.querySelectorAll('.task-item')];
    const lastInWrapper = wrapperItems[wrapperItems.length - 1];
    const secondLastInWrapper = wrapperItems[wrapperItems.length - 2];

    // If we're the second-to-last in the wrapper, move to end of wrapper
    if (secondLastInWrapper === li) {
      group.forEach(el => wrapper.appendChild(el));
      setTimeout(() => setCaretPosition(label, caretOffset), 0);
      regroupProjects();
      saveCurrentList();
      return;
    }
  }

  // --- Find the start of the next sibling group at same indent or less
  let nextGroupStart = nextIndex;
  while (nextGroupStart < allItems.length && getIndentLevel(allItems[nextGroupStart]) > indent) {
    nextGroupStart++;
  }

  if (nextGroupStart >= allItems.length) {
    // At end: just append group to the end
    group.forEach(el => taskList.appendChild(el));
    setTimeout(() => setCaretPosition(label, caretOffset), 0);
    regroupProjects();
    saveCurrentList();
    return;
  }

  // --- Now find the end of that next group (so we can insert after it)
  let nextGroupEnd = nextGroupStart + 1;
  const nextIndent = getIndentLevel(allItems[nextGroupStart]);
  for (; nextGroupEnd < allItems.length; nextGroupEnd++) {
    if (getIndentLevel(allItems[nextGroupEnd]) <= nextIndent) break;
  }

  const insertAfter = allItems[nextGroupEnd] || null;
  const insertParent = insertAfter?.parentElement || taskList;

  group.forEach(el => insertParent.insertBefore(el, insertAfter));

  setTimeout(() => setCaretPosition(label, caretOffset), 0);
  regroupProjects();
  saveCurrentList();
}

function ensureTextNode(element) {
  if (!element.firstChild) element.appendChild(document.createTextNode(""));
}

function handleKeyboardEvents(e) {
  const active = document.activeElement;
  if (!active?.classList.contains('task-label')) return;

  const li = active.closest('.task-item');
  const label = li.querySelector('.task-label');
  const key = e.key.toLowerCase();

  // Preserve caret
  const sel = window.getSelection();
  let caretOffset = 0;
  if (sel && sel.anchorNode && label.contains(sel.anchorNode)) {
    caretOffset = sel.anchorOffset;
  }

  // ===============================
  // Ctrl+Enter → Break out of # Project (if not the header itself)
  // ===============================
  if (key === 'enter' && e.ctrlKey) {
    e.preventDefault();
    const wrapper = li.closest('.project-wrapper');
    if (wrapper && !label.classList.contains('header-2')) {
      const newTask = createTaskElement({ indent: 0 });
      insertAfter(wrapper, newTask);
      setTimeout(() => {
        const newLabel = newTask.querySelector('.task-label');
        newLabel?.focus();
        setCaretPosition(newLabel, 0);
      }, 0);
      saveCurrentList();
      updateActiveTaskHighlight();
      return;
    }
    // Checkbox toggle (original behavior)
    const checkbox = li.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      updateCheckboxState(checkbox);
      label.focus();
      setTimeout(() => {
        const fresh = li.querySelector('.task-label');
        if (fresh) {
          ensureTextNode(fresh);
          fresh.focus();
          setCaretPosition(fresh, caretOffset);
        }
      }, 0);

      return;
    }
  }

  // ===============================
  // Project Movement: Ctrl + Alt + Shift + ↑ / ↓
  // ===============================
  if (isShortcut(e, 'arrowup', { alt: true, shift: true })) {
    e.preventDefault();
    const wrapper = li.closest('.project-wrapper');
    if (wrapper) moveProjectWrapper(wrapper, 'up', label);
    setTimeout(() => {
      ensureTextNode(label);
      setCaretPosition(label, caretOffset);
    }, 0);
    return;
  }

  if (isShortcut(e, 'arrowdown', { alt: true, shift: true })) {
    e.preventDefault();
    const wrapper = li.closest('.project-wrapper');
    if (wrapper) moveProjectWrapper(wrapper, 'down', label);
    setTimeout(() => {
      ensureTextNode(label);
      setCaretPosition(label, caretOffset);
    }, 0);
    return;
  }

  // ===============================
  // Task Movement (Shift + ↑ / ↓)
  // ===============================
  if (e.shiftKey && !e.ctrlKey && (key === 'arrowup' || key === 'arrowdown')) {
    e.preventDefault();
    key === 'arrowup' ? moveTaskUp(li) : moveTaskDown(li);
    // Caret is restored inside moveTaskUp/moveTaskDown
    return;
  }

  // ===============================
  // Task Focus Up/Down (Arrow Only)
  // ===============================
  if (!e.shiftKey && (key === 'arrowup' || key === 'arrowdown')) {
    e.preventDefault();
    const allItems = [...taskList.querySelectorAll('.task-item')];
    const index = allItems.findIndex(item => item === li);
    const nextIndex = key === 'arrowup' ? index - 1 : index + 1;
    if (nextIndex >= 0 && nextIndex < allItems.length) {
      const target = allItems[nextIndex];
      const nextLabel = target.querySelector('.task-label');
      nextLabel?.focus();
      setTimeout(() => {
        ensureTextNode(nextLabel);
        setCaretPosition(nextLabel, caretOffset);
      }, 0);
    }
    return;
  }

  // ===============================
  // Task Indent / Unindent (Tab / Shift+Tab)
  // ===============================
  if (e.key === 'Tab') {
    e.preventDefault();
    const currentIndent = getIndentLevel(li);
    const newIndent = e.shiftKey ? Math.max(0, currentIndent - 1) : Math.min(4, currentIndent + 1);

    li.className = 'task-item';
    if (newIndent > 0) li.classList.add(`indent-${newIndent}`);

    regroupProjects();
    saveCurrentList();

    setTimeout(() => {
      ensureTextNode(label);
      setCaretPosition(label, caretOffset);
    }, 0);
    return;
  }

  // ===============================
// Enter → New Task / Toggle Checkbox
// ===============================
if (key === 'enter') {
  e.preventDefault();

  // Shift + Enter → Toggle checkbox
  if (e.shiftKey) {
    const checkbox = li.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      updateCheckboxState(checkbox);
      
      // Restore focus to the same item
      setTimeout(() => {
        const freshLabel = li.querySelector('.task-label');
        if (freshLabel) {
          ensureTextNode(freshLabel);
          freshLabel.focus();
          setCaretPosition(freshLabel, caretOffset); // Use preserved caret position
        }
      }, 0);
      return; // Stop further execution
    }
  }

  // Regular Enter → new task below
  const newTask = createTaskElement({ indent: getIndentLevel(li) });
  insertAfter(li, newTask);
  regroupProjects();
  saveCurrentList();
  setTimeout(() => {
    const newLabel = newTask.querySelector('.task-label');
    ensureTextNode(newLabel);
    newLabel?.focus();
    setCaretPosition(newLabel, 0);
  }, 0);
  return;
}

// ===============================
// Backspace → remove style or task
// ===============================
if (key === 'backspace') {
  const selection = window.getSelection();
  const cursorAtStart = selection?.anchorOffset === 0 && selection.isCollapsed;

  if (cursorAtStart) {
    const text = label.innerText;
    const classesToRemove = ['header-1', 'header-2', 'note-block', 'highlight-yellow'];

    for (const className of classesToRemove) {
      if (label.classList.contains(className)) {
        label.classList.remove(className);

        let newText = text;
        if (text.startsWith('# ')) newText = text.slice(2);
        else if (text.startsWith('## ')) newText = text.slice(3);
        else if (text.startsWith('> ')) newText = text.slice(2);
        else if (text.startsWith('- ')) newText = text.slice(2);

        setTimeout(() => {
          label.innerText = newText;
          ensureTextNode(label);
          label.focus();
          setCaretPosition(label, 0);

          // --- [Fix: Handle demotion of header-2] ---
          if (className === 'header-2') {
            const wrapper = li.closest('.project-wrapper');
            if (wrapper) {
              // Move all children out of the wrapper
              let moving = [li];
              let next = li.nextElementSibling;
              while (
                next &&
                !next.querySelector('.task-label').classList.contains('header-2')
              ) {
                moving.push(next);
                next = next.nextElementSibling;
              }

              let afterWrapper = wrapper.nextSibling;
              moving.forEach(item => taskList.insertBefore(item, afterWrapper));

              if (!wrapper.querySelector('.task-item')) {
                wrapper.remove();
              }

              // Restore caret after DOM updates
              setTimeout(() => {
                const newLabel = li.querySelector('.task-label');
                if (newLabel) {
                  ensureTextNode(newLabel);
                  newLabel.focus();
                  setCaretPosition(newLabel, 0);
                }
              }, 0);
            }
          }
        }, 0);

        e.preventDefault();
        saveCurrentList();
        return;
      }
    }

    const checkbox = li.querySelector('input[type="checkbox"]');
    if (checkbox && checkbox === li.firstElementChild) {
      const textOnly = label.innerText;
      li.innerHTML = '';
      const plainTask = createTaskElement({ text: textOnly });
      li.replaceWith(plainTask);
      setTimeout(() => {
        const plainLabel = plainTask.querySelector('.task-label');
        if (plainLabel) {
          ensureTextNode(plainLabel);
          plainLabel.focus();
          setCaretPosition(plainLabel, 0);
        }
      }, 0);
      regroupProjects();
      e.preventDefault();
      saveCurrentList();
      return;
    }
  }

  const trimmed = label.innerText.trim();
  const isStyled =
    label.classList.contains('header-1') ||
    label.classList.contains('header-2') ||
    label.classList.contains('note-block') ||
    li.querySelector('input[type="checkbox"]');

  if (trimmed === '') {
    e.preventDefault();

    if (isStyled) {
      li.innerHTML = '';
      const plain = createTaskElement({ text: '' });
      li.replaceWith(plain);
      regroupProjects();
      setTimeout(() => {
        const plainLabel = plain.querySelector('.task-label');
        ensureTextNode(plainLabel);
        placeCursorAtEnd(plainLabel);
      }, 0);
    } else {
      const parent = li.parentElement;
      const prev = li.previousElementSibling;
      const grandParent = parent.parentElement;

      parent.removeChild(li);

      let nextFocusTarget = null;
      if (prev) {
        nextFocusTarget = prev.querySelector('.task-label');
      } else if (parent.classList.contains('project-wrapper')) {
        const wrapperPrev = parent.previousElementSibling;
        if (wrapperPrev) {
          const label = wrapperPrev.querySelector('.task-item:last-child .task-label');
          if (label) nextFocusTarget = label;
        } else if (grandParent?.classList.contains('app-container')) {
          const all = [...taskList.querySelectorAll('.task-label')];
          nextFocusTarget = all[all.length - 1];
        }
      }

      if (
        parent.classList.contains('project-wrapper') &&
        parent.querySelectorAll('.task-item').length === 0
      ) {
        parent.remove();
      }

      setTimeout(() => {
        if (nextFocusTarget) {
          ensureTextNode(nextFocusTarget);
          placeCursorAtEnd(nextFocusTarget);
        } else {
          ensureAtLeastOneTask();
        }
      }, 0);
    }

    saveCurrentList();
    return;
  }
}

  // ===============================
  // Color Tags (Ctrl + Alt + 1–4)
  // ===============================
  const highlightMap = {
    '1': 'highlight-yellow',
    '2': 'highlight-blue',
    '3': 'highlight-purple',
    '4': 'highlight-red'
  };

  if (['1', '2', '3', '4'].includes(key) && isShortcut(e, key, { ctrl: true, alt: true })) {
    e.preventDefault();

    const current = highlightMap[key];
    const allHighlightClasses = Object.values(highlightMap);

    if (label.classList.contains(current)) {
      label.classList.remove(current);
    } else {
      allHighlightClasses.forEach(cls => label.classList.remove(cls));
      label.classList.add(current);
    }

    saveCurrentList();
    setTimeout(() => {
      ensureTextNode(label);
      setCaretPosition(label, caretOffset);
    }, 0);
    return;
  }
}

// ===========================
// JSON Import/Export (All Lists)
// ===========================
function exportAllListsAsJson() {
  const allLists = getAllLists();
  const blob = new Blob([JSON.stringify(allLists, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `punchlist-multilist.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importAllListsFromJson(file) {
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const json = JSON.parse(event.target.result);
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('Invalid format: Expected an object of lists');
      }

      const confirmed = confirm("This will replace all existing lists. Continue?");
      if (!confirmed) return;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(json));

      const ids = Object.keys(json);
      currentListId = ids.length > 0 ? ids[0] : null;

      renderSidebar();
      loadCurrentList();
    } catch (err) {
      alert('Failed to import file: Invalid JSON structure.');
    }
  };
  reader.readAsText(file);
}

taskList.addEventListener('input', e => {
  const target = e.target;
  if (!target?.classList.contains('task-label')) return;

  const li = target.closest('.task-item');
  const match = target.innerText.match(/^(\#{1,2}|\-|\>)\s(.*)/);
  if (!match) return;

  const [_, prefix, rest] = match;

  setTimeout(() => {
    const indent = getIndentLevel(li);

    const restoreCaret = (el, pos = 0) => {
      if (!el) return;
      ensureTextNode(el);
      el.focus();
      setCaretPosition(el, pos);
    };

    let newLabel;

    if (prefix === '-') {
      const checkboxTask = createTaskElement({
        text: rest,
        type: 'checkbox',
        indent
      });
      li.replaceWith(checkboxTask);
      newLabel = checkboxTask.querySelector('.task-label');
      restoreCaret(newLabel, rest.length);

    } else if (prefix === '#') {
      const headerTask = createTaskElement({
        text: rest,
        type: 'header-2',
        indent
      });
      li.replaceWith(headerTask);
      newLabel = headerTask.querySelector('.task-label');

    } else if (prefix === '##') {
      const headerTask = createTaskElement({
        text: rest,
        type: 'header-1',
        indent
      });
      li.replaceWith(headerTask);
      newLabel = headerTask.querySelector('.task-label');

    } else if (prefix === '>') {
      li.innerHTML = `<span class="task-label note-block" contenteditable="true">${rest}</span>`;
      const note = li.querySelector('.task-label');
      note.addEventListener('paste', handlePaste);
      restoreCaret(note, rest.length);
      saveCurrentList();
      return;
    }

    // Regroup and restore caret for # / ## only
    setTimeout(() => {
      regroupProjects();
      restoreCaret(newLabel, rest.length);
    }, 50);

    saveCurrentList();
  }, 0);
});

// ===========================
// Global Keyboard Events
// ===========================
document.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();

  // New List — Ctrl + Alt + N
  if (isShortcut(e, 'n', { ctrl: true, alt: true })) {
    e.preventDefault();
    createNewListElement();
    return;
  }

  // Delete List — Ctrl + Alt + D
  if (isShortcut(e, 'd', { ctrl: true, alt: true })) {
    e.preventDefault();

    const allLists = getAllLists();
    const ids = Object.keys(allLists);

    if (ids.length <= 1) {
      alert("You must have at least one list.");
      return;
    }

    const confirmDelete = confirm(`Delete the list "${currentListId}"?`);
    if (!confirmDelete) return;

    delete allLists[currentListId];
    const newIds = Object.keys(allLists);
    const newIndex = Math.max(0, ids.indexOf(currentListId) - 1);
    currentListId = newIds[newIndex] || newIds[0];

    saveAllLists(allLists);
    renderSidebar();
    loadCurrentList();
    return;
  }

  // Switch List Up — Ctrl + Alt + W
  if (isShortcut(e, 'w', { ctrl: true, alt: true })) {
    e.preventDefault();
    switchList('up');
    return;
  }

  // Switch List Down — Ctrl + Alt + S
  if (isShortcut(e, 's', { ctrl: true, alt: true })) {
    e.preventDefault();
    switchList('down');
    return;
  }

  // Move Active List Up — Ctrl + Alt + Shift + W
  if (isShortcut(e, 'w', { ctrl: true, alt: true, shift: true })) {
    e.preventDefault();
    moveActiveList('up');
    return;
  }

  // Move Active List Down — Ctrl + Alt + Shift + S
  if (isShortcut(e, 's', { ctrl: true, alt: true, shift: true })) {
    e.preventDefault();
    moveActiveList('down');
    return;
  }

  // Tab / Shift+Tab — Indent / Unindent task with caret preservation
  if (e.key === 'Tab') {
    const active = document.activeElement;
    const li = active?.closest('.task-item');
    if (li && active.classList.contains('task-label')) {
      e.preventDefault();

      // ⌨️ Preserve caret before indenting
      const sel = window.getSelection();
      let caretOffset = 0;
      if (sel && sel.anchorNode && active.contains(sel.anchorNode)) {
        caretOffset = sel.anchorOffset;
      }

      let indent = getIndentLevel(li);
      indent += e.shiftKey ? -1 : 1;
      indent = Math.max(0, Math.min(indent, 4)); // Clamp between 0 and 4

      updateIndentClass(li, indent);
      regroupProjects();
      saveCurrentList();

      setTimeout(() => {
        const fresh = li.querySelector('.task-label');
        if (fresh) {
          ensureTextNode(fresh);
          fresh.focus();
          setCaretPosition(fresh, caretOffset);
        }
      }, 0);

      return;
    }
  }

  // Other app-level shortcuts and movement logic
  handleKeyboardEvents(e);
});

document.addEventListener('focusin', updateActiveTaskHighlight);
document.addEventListener('click', updateActiveTaskHighlight);

// ===========================
// Checkbox State Hook
// ===========================
taskList.addEventListener('change', e => {
  if (e.target.type === 'checkbox') {
    updateCheckboxState(e.target);
  }
});

// ===========================
// Theme Selector Init
// ===========================
(function () {
  const selector = document.getElementById('themeSelector');
  const THEME_KEY = 'punchlist-theme';

  function applyTheme(theme) {
    document.body.className = '';
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem(THEME_KEY, theme);
  }

  const savedTheme = localStorage.getItem(THEME_KEY) || 'desert';
  applyTheme(savedTheme);
  if (selector) selector.value = savedTheme;

  if (selector) {
    selector.addEventListener('change', e => {
      applyTheme(e.target.value);
    });
  }
})();

// ===========================
// Import/Export Buttons
// ===========================
document.getElementById('exportJsonBtn')?.addEventListener('click', exportAllListsAsJson);
document.getElementById('importJsonTrigger')?.addEventListener('click', () => {
  document.getElementById('importJsonInput')?.click();
});
document.getElementById('importJsonInput')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) importAllListsFromJson(file);
});

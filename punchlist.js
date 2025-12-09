    const punchListApp = {
        STORAGE_KEY: 'timelinePunchListData',
        taskList: null,
        initialized: false,
        isMac: /Mac|iPod|iPhone|iPad/.test(navigator.platform),

        isShortcut(event, key, { ctrl = true, alt = false, shift = false } = {}) {
            const ctrlKey = this.isMac ? event.metaKey : event.ctrlKey;
            return (
                ctrlKey === ctrl &&
                event.altKey === alt &&
                event.shiftKey === shift &&
                event.key.toLowerCase() === key.toLowerCase()
            );
        },

        init() {
            if (this.initialized) return;
            this.taskList = document.getElementById('punch-list-container');
            if (!this.taskList) return;

            this.loadList();
            this.addEventListeners();
            this.initialized = true;
        },

        addEventListeners() {
            this.taskList.addEventListener('input', (e) => {
                const target = e.target;
                if (!target?.classList.contains('task-label')) return;
                this.handleMarkdown.call(this, e);
            });

            document.addEventListener('focusin', this.updateActiveTaskHighlight.bind(this));
            document.addEventListener('click', this.updateActiveTaskHighlight.bind(this));
            this.taskList.addEventListener('change', e => {
                if (e.target.type === 'checkbox') this.updateCheckboxState(e.target);
            });
            // This global listener is in app.js now, to avoid double-firing
            // document.addEventListener('keydown', this.handleKeyboard.bind(this));
        },

        saveList() {
            if (!this.taskList) return;
            const items = [...this.taskList.querySelectorAll('.task-item')];
            const dataToSave = items.map(li => {
                const label = li.querySelector('.task-label');
                if (!label) return null;
                const text = label.innerText;
                let type = 'text';
                if (label.classList.contains('header-1')) type = 'header-1';
                else if (label.classList.contains('header-2')) type = 'header-2';
                else if (label.classList.contains('note-block')) type = 'note';
                else if (li.querySelector('input[type="checkbox"]')) type = 'checkbox';

                const highlightClass = ['highlight-yellow', 'highlight-blue', 'highlight-purple', 'highlight-red']
                    .find(cls => label.classList.contains(cls));

                return { text, type, indent: this.getIndentLevel(li), checked: li.classList.contains('checked'), highlight: highlightClass || null };
            }).filter(Boolean);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToSave));
        },

        loadList() {
            const listData = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
            this.taskList.innerHTML = '';
            let wrapper = null;
            listData.forEach(task => {
                const li = this.createTaskElement(task);
                const label = li.querySelector('.task-label');
                const isHeader2 = label && label.classList.contains('header-2');
                if (isHeader2 && this.getIndentLevel(li) === 0) {
                    wrapper = document.createElement('div');
                    wrapper.className = 'project-wrapper';
                    this.taskList.appendChild(wrapper);
                }
                (wrapper || this.taskList).appendChild(li);
            });
            this.ensureAtLeastOneTask();
            this.addPasteListeners();
            this.updateActiveTaskHighlight();
        },

    createTaskElement({ text = '', type = 'text', indent = 0, checked = false, highlight = null } = {}) {
        const li = document.createElement('li');
        li.className = 'task-item';
        if (indent > 0) li.classList.add(`indent-${indent}`);
        if (checked) li.classList.add('checked');

        // Checkbox Logic
        if (type === 'checkbox') {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'custom-checkbox';
            input.checked = checked;
            li.appendChild(input);
        }

        // --- NEW: Move to Project Button ---
        // Only show if it's not a header or note
        if (type === 'text' || type === 'checkbox') {
            const moveBtn = document.createElement('button');
            moveBtn.className = 'move-to-project-btn text-gray-400 hover:text-blue-500 mr-2 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity';
            moveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>`;
            moveBtn.title = "Move to Project";
            moveBtn.onclick = (e) => {
                e.stopPropagation(); 
                const label = li.querySelector('.task-label');
                if (label && label.innerText.trim()) {
                    // FIX: Ensure we are looking at the window object for the app
                    if (window.timelineApp && typeof window.timelineApp.promptMoveToProject === 'function') {
                        window.timelineApp.promptMoveToProject(label.innerText.trim(), () => {
                            li.remove();
                            this.saveList();
                            this.ensureAtLeastOneTask();
                        });
                    } else {
                        console.error("Timeline App not found on window.timelineApp");
                        alert("Error: Link to project feature is not ready. Try refreshing the page.");
                    }
                }
            };;
            li.appendChild(moveBtn);
        }

        // Label Logic
        const span = document.createElement('span');
        span.className = 'task-label';
        span.contentEditable = true;
        span.spellcheck = false;
        span.innerText = text;

        if (type === 'header-1') span.classList.add('header-1');
        else if (type === 'header-2') span.classList.add('header-2');
        else if (type === 'note') span.classList.add('note-block');
        if (highlight) span.classList.add(highlight);

        li.appendChild(span);
        return li;
    },

        handleKeyboard(e) {
            const active = document.activeElement;
            if (!active?.classList.contains('task-label') || !this.taskList.contains(active)) return;

            const li = active.closest('.task-item');
            if (!li) return;
            
            const label = li.querySelector('.task-label');
            const key = e.key.toLowerCase();
            const sel = window.getSelection();
            const caretOffset = sel.rangeCount > 0 ? sel.getRangeAt(0).startOffset : 0;

            if (this.isShortcut(e, 'arrowup', { shift: true, alt: false })) {
                e.preventDefault();
                const wrapper = li.closest('.project-wrapper');
                if (wrapper) this.moveProjectWrapper(wrapper, 'up', label);
                return;
            }

            if (this.isShortcut(e, 'arrowdown', { shift: true, alt: false })) {
                e.preventDefault();
                const wrapper = li.closest('.project-wrapper');
                if (wrapper) this.moveProjectWrapper(wrapper, 'down', label);
                return;
            }

            if (e.shiftKey && !e.ctrlKey && !e.altKey && (key === 'arrowup' || key === 'arrowdown')) {
                e.preventDefault();
                this.moveTask(li, key === 'arrowup' ? 'up' : 'down');
                return;
            }

            if (!e.shiftKey && !e.ctrlKey && !e.altKey && (key === 'arrowup' || key === 'arrowdown')) {
                e.preventDefault();
                const allItems = [...this.taskList.querySelectorAll('.task-item')];
                const index = allItems.findIndex(item => item === li);
                const nextIndex = key === 'arrowup' ? index - 1 : index + 1;
                if (nextIndex >= 0 && nextIndex < allItems.length) {
                    const nextLabel = allItems[nextIndex].querySelector('.task-label');
                    setTimeout(() => this.setCaretPosition(nextLabel, caretOffset), 0);
                }
                return;
            }

            if (key === 'tab') {
                e.preventDefault();
                const currentIndent = this.getIndentLevel(li);
                const newIndent = e.shiftKey ? Math.max(0, currentIndent - 1) : Math.min(4, currentIndent + 1);
                if (currentIndent !== newIndent) {
                    li.className = li.className.replace(/indent-\d+/g, '').trim();
                    if (newIndent > 0) li.classList.add(`indent-${newIndent}`);
                    this.regroupProjects();
                    this.saveList();
                    setTimeout(() => this.setCaretPosition(active, caretOffset), 0);
                }
                return;
            }

            if (key === 'enter') {
                e.preventDefault();
                if (e.ctrlKey) {
                    const wrapper = li.closest('.project-wrapper');
                    if (wrapper && !label.classList.contains('header-2')) {
                        const newTask = this.createTaskElement({ indent: 0 });
                        this.insertAfter(wrapper, newTask);
                        this.focusNewTask(newTask);
                        this.saveList();
                        return;
                    }
                }
                if (e.shiftKey) {
                    const checkbox = li.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this.updateCheckboxState(checkbox);
                        setTimeout(() => this.setCaretPosition(label, caretOffset), 0);
                    }
                    return;
                }
                const newTask = this.createTaskElement({ indent: this.getIndentLevel(li) });
                const highlightClass = ['highlight-yellow', 'highlight-blue', 'highlight-purple', 'highlight-red'].find(cls => label.classList.contains(cls));
                if (highlightClass && !label.classList.contains('header-1') && !label.classList.contains('header-2')) {
                    newTask.querySelector('.task-label').classList.add(highlightClass);
                }
                this.insertAfter(li, newTask);
                this.regroupProjects();
                this.focusNewTask(newTask);
                this.saveList();
                return;
            }

            if (key === 'backspace') {
                const cursorAtStart = sel.anchorOffset === 0 && sel.isCollapsed;
                if (active.innerText.trim() === '') {
                    e.preventDefault();
                    const prev = li.previousElementSibling || li.closest('.project-wrapper')?.previousElementSibling;
                    li.remove();
                    this.regroupProjects();
                    this.saveList();
                    if (prev) {
                        const prevLabel = prev.querySelector('.task-item:last-of-type .task-label') || prev.querySelector('.task-label');
                        this.placeCursorAtEnd(prevLabel);
                    } else {
                        this.ensureAtLeastOneTask();
                    }
                    return;
                }

                if (cursorAtStart && active.innerText.trim() !== '') {
                    const currentIndent = this.getIndentLevel(li);
                    if (currentIndent > 0) {
                        e.preventDefault();
                        const newIndent = currentIndent - 1;
                        li.className = li.className.replace(/indent-\d+/g, '').trim();
                        if (newIndent > 0) li.classList.add(`indent-${newIndent}`);
                        this.regroupProjects();
                        this.saveList();
                        setTimeout(() => this.setCaretPosition(active, 0), 0);
                    }
                    return;
                }
            }

            const highlightMap = { '1': 'highlight-yellow', '2': 'highlight-blue', '3': 'highlight-purple', '4': 'highlight-red' };
            if (['1', '2', '3', '4'].includes(e.key) && this.isShortcut(e, e.key, { ctrl: true, alt: true })) {
                e.preventDefault();
                const currentClass = highlightMap[e.key];
                const allHighlightClasses = Object.values(highlightMap);
                if (label.classList.contains(currentClass)) {
                    label.classList.remove(currentClass);
                } else {
                    allHighlightClasses.forEach(cls => label.classList.remove(cls));
                    label.classList.add(currentClass);
                }
                this.saveList();
                setTimeout(() => this.setCaretPosition(label, caretOffset), 0);
            }
        },
        
        focusNewTask(taskElement) {
            setTimeout(() => {
                const newLabel = taskElement.querySelector('.task-label');
                this.ensureTextNode(newLabel);
                newLabel?.focus();
                this.setCaretPosition(newLabel, 0);
            }, 0);
        },

        handleMarkdown(e) {
            const target = e.target;
            const match = target.innerText.match(/^(\#{1,2}|\-|\>)\s/);
            if (!match) {
                this.saveList(); // Save on regular input too
                return;
            };

            const [fullMatch, prefix] = match;
            const rest = target.innerText.substring(fullMatch.length);

            setTimeout(() => {
                const li = target.closest('.task-item');
                const indent = this.getIndentLevel(li);
                let newType = 'text';

                if (prefix.trim() === '-') newType = 'checkbox';
                else if (prefix.trim() === '#') newType = 'header-2';
                else if (prefix.trim() === '##') newType = 'header-1';
                else if (prefix.trim() === '>') newType = 'note';

                const newElement = this.createTaskElement({ text: rest, type: newType, indent });
                li.replaceWith(newElement);
                this.regroupProjects();
                const newLabel = newElement.querySelector('.task-label');
                this.placeCursorAtEnd(newLabel);
                this.saveList();
            }, 0);
        },

        updateCheckboxState(checkbox) {
            const li = checkbox.closest('li');
            const wrapper = li.closest('.project-wrapper');
            const moveToContainer = wrapper || this.taskList;
            const indent = this.getIndentLevel(li);
            const allTasks = [...this.taskList.querySelectorAll('.task-item')];
            const startIndex = allTasks.indexOf(li);
            let group = [li];

            for (let i = startIndex + 1; i < allTasks.length; i++) {
                if (this.getIndentLevel(allTasks[i]) > indent) {
                    group.push(allTasks[i]);
                } else {
                    break;
                }
            }

            if (checkbox.checked) {
                group.forEach(item => item.classList.add('checked', 'task-slide-out'));
                setTimeout(() => {
                    group.forEach(item => {
                        item.classList.remove('task-slide-out');
                        moveToContainer.appendChild(item);
                        item.classList.add('task-slide-in');
                    });
                    setTimeout(() => {
                        group.forEach(item => item.classList.remove('task-slide-in'));
                        this.saveList();
                    }, 200);
                }, 150);
            } else {
                group.forEach(item => item.classList.remove('checked'));
                this.saveList();
            }
        },
        
        moveProjectWrapper(wrapper, direction, focusRef = null) {
            if (!wrapper || !wrapper.classList.contains('project-wrapper')) return;
            const sibling = direction === 'up' ? wrapper.previousElementSibling : wrapper.nextElementSibling;
            if (!sibling) return;

            if (direction === 'up') {
                this.taskList.insertBefore(wrapper, sibling);
            } else {
                this.insertAfter(sibling, wrapper);
            }

            if (focusRef) {
                setTimeout(() => {
                    focusRef.focus();
                    this.placeCursorAtEnd(focusRef);
                }, 0);
            }
            this.saveList();
        },

        moveTask(li, direction) {
            const allItems = [...this.taskList.querySelectorAll('.task-item')];
            const currentIndex = allItems.indexOf(li);
            if (currentIndex === -1) return;

            const label = li.querySelector('.task-label');
            const sel = window.getSelection();
            const caretOffset = sel.rangeCount > 0 ? sel.getRangeAt(0).startOffset : 0;
            const parentIndent = this.getIndentLevel(li);

            // 1. Find the task and all its children (more indented items that follow)
            const taskGroup = [li];
            for (let i = currentIndex + 1; i < allItems.length; i++) {
                const item = allItems[i];
                if (this.getIndentLevel(item) > parentIndent) {
                    taskGroup.push(item);
                } else {
                    break;
                }
            }

            const fragment = document.createDocumentFragment();
            taskGroup.forEach(item => fragment.appendChild(item));

            if (direction === 'up') {
                const prevItemIndex = currentIndex - 1;
                if (prevItemIndex < 0) return; // Already at the top
                const targetItem = allItems[prevItemIndex];
                targetItem.parentElement.insertBefore(fragment, targetItem);
            } else { // 'down'
                const groupEndIndex = currentIndex + taskGroup.length - 1;
                const nextItemIndex = groupEndIndex + 1;
                if (nextItemIndex >= allItems.length) return; // Already at the bottom

                // Find the end of the next sibling's group to insert after
                const nextSibling = allItems[nextItemIndex];
                const nextSiblingIndent = this.getIndentLevel(nextSibling);
                let insertAfterTarget = nextSibling;
                for (let i = nextItemIndex + 1; i < allItems.length; i++) {
                    if (this.getIndentLevel(allItems[i]) > nextSiblingIndent) {
                        insertAfterTarget = allItems[i];
                    } else {
                        break;
                    }
                }
                this.insertAfter(insertAfterTarget, fragment);
            }
            
            this.regroupProjects();
            this.saveList();
            setTimeout(() => this.setCaretPosition(label, caretOffset), 0);
        },

        getIndentLevel: el => {
            const cls = [...el.classList].find(c => c.startsWith('indent-'));
            return cls ? parseInt(cls.split('-')[1]) : 0;
        },
        insertAfter: (referenceNode, newNode) => referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling),

        regroupProjects() {
            const allItems = [...this.taskList.querySelectorAll('.task-item')];
            this.taskList.innerHTML = '';
            let currentWrapper = null;
            for (const li of allItems) {
                const isHeader2 = li.querySelector('.task-label')?.classList.contains('header-2');
                if (this.getIndentLevel(li) === 0 && isHeader2) {
                    currentWrapper = document.createElement('div');
                    currentWrapper.className = 'project-wrapper';
                    this.taskList.appendChild(currentWrapper);
                }
                (currentWrapper || this.taskList).appendChild(li);
            }
        },
        addPasteListeners() {
            this.taskList.addEventListener('paste', (e) => {
                if (e.target.classList.contains('task-label')) {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                }
            });
        },
        updateActiveTaskHighlight() {
            this.taskList.querySelectorAll('.task-item').forEach(el => el.classList.remove('active'));
            const active = document.activeElement?.closest('.task-item');
            if (active && this.taskList.contains(active)) active.classList.add('active');
        },
        ensureAtLeastOneTask() {
            if (this.taskList.children.length === 0 || this.taskList.querySelectorAll('.task-item').length === 0) {
                const task = this.createTaskElement();
                this.taskList.appendChild(task);
                this.focusNewTask(task);
            }
        },
        ensureTextNode: element => { if (element && !element.firstChild) element.appendChild(document.createTextNode("")); },
        setCaretPosition(el, offset = 0) {
            if (!el) return;
            el.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            if (el.childNodes.length > 0) {
                const textNode = el.firstChild;
                range.setStart(textNode, Math.min(offset, textNode.textContent.length));
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        },
        placeCursorAtEnd(element) {
            if (!element) return;
            element.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(element);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    };


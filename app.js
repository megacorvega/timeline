const timelineApp = {
    // --- STATE & CONFIG ---
    projects: [],
    deletedProjectLogs: [],
    history: [],
    redoStack: [],
    MAX_HISTORY: 10,
    sharedPicker: null,
    currentPickerContext: null,
    pendingDateChange: null,
    pendingDeletion: null,
    dependencyMode: false,
    firstSelectedItem: null,
    pendingClearDependencies: null,
    deletedLogCollapsed: true,
    taskLoadChartColor: d3.scaleOrdinal(d3.schemeTableau10),
    activeTab: 'projects',
    tabOrder: ['projects', 'list', 'overall-load', 'upcoming'],

    // --- DOM ELEMENTS ---
    elements: {},

    isShortcut(event, key, { ctrl = false, alt = false, shift = false } = {}) {
        const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
        const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
        return (
            ctrlKey === ctrl &&
            event.altKey === alt &&
            event.shiftKey === shift &&
            event.key.toLowerCase() === key.toLowerCase()
        );
    },

    init() {
        this.cacheDOMElements();
        this.loadTabData();
        this.renderTabs();
        this.addEventListeners();
        this.applyTheme(); // Changed from applyTheme()
        this.loadProjects();
        this.renderProjects();
        this.showMainTab(this.activeTab, false);
        this.updateUndoRedoButtons();
        this.initializeSharedDatePicker();
    },

    cacheDOMElements() {
        this.elements = {
            projectsContainer: document.getElementById('projects-container'),
            addProjectBtn: document.getElementById('add-project-btn'),
            newProjectNameInput: document.getElementById('new-project-name'),
            themeSelect: document.getElementById('theme-select'),
            darkModeToggle: document.getElementById('dark-mode-toggle'),
            darkIcon: document.getElementById('theme-toggle-dark-icon'),
            lightIcon: document.getElementById('theme-toggle-light-icon'),
            importBtn: document.getElementById('import-btn'),
            exportBtn: document.getElementById('export-btn'),
            pdfBtn: document.getElementById('pdf-btn'),
            importFileInput: document.getElementById('import-file-input'),
            datepickerBackdrop: document.getElementById('datepicker-backdrop'),
            reasonModal: document.getElementById('reason-modal'),
            reasonModalTitle: document.getElementById('reason-modal-title'),
            reasonModalDetails: document.getElementById('reason-modal-details'),
            reasonCommentTextarea: document.getElementById('reason-comment'),
            saveReasonBtn: document.getElementById('save-reason-btn'),
            cancelReasonBtn: document.getElementById('cancel-reason-btn'),
            dependencyBanner: document.getElementById('dependency-banner'),
            dependencyTooltip: document.getElementById('dependency-tooltip'),
            confirmModal: document.getElementById('confirm-modal'),
            confirmModalTitle: document.getElementById('confirm-modal-title'),
            confirmModalText: document.getElementById('confirm-modal-text'),
            cancelConfirmBtn: document.getElementById('cancel-confirm-btn'),
            confirmActionBtn: document.getElementById('confirm-action-btn'),
            fullscreenModal: document.getElementById('fullscreen-modal'),
            closeFullscreenBtn: document.getElementById('close-fullscreen-btn'),
            undoBtn: document.getElementById('undo-btn'),
            redoBtn: document.getElementById('redo-btn'),
            toggleDeletedLogBtn: document.getElementById('toggle-deleted-log-btn'),
            mainTabs: document.getElementById('main-tabs'),
            shortcutsBtn: document.getElementById('shortcuts-btn'),
            shortcutsModal: document.getElementById('shortcuts-modal'),
            shortcutsModalBackdrop: document.getElementById('shortcuts-modal-backdrop'),
            closeShortcutsBtn: document.getElementById('close-shortcuts-btn')
        };
    },

    addEventListeners() {
        this.elements.themeSelect.addEventListener('change', (e) => {
            document.documentElement.setAttribute('data-theme', e.target.value);
            localStorage.setItem('timeline-theme-name', e.target.value);
            this.renderProjects(); // Re-render to apply theme to charts
        });
        this.elements.darkModeToggle.addEventListener('click', () => {
            this.setDarkMode(!document.documentElement.classList.contains('dark'));
        });

        this.elements.exportBtn.addEventListener('click', () => { 
            const a = document.createElement('a'); 
            a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.projects, null, 2)); 
            a.download = "timeline-projects.json"; 
            document.body.appendChild(a); 
            a.click(); 
            a.remove(); 
        });
        this.elements.importBtn.addEventListener('click', () => this.elements.importFileInput.click());
        this.elements.importFileInput.addEventListener('change', (e) => { 
            const file = e.target.files[0]; if (!file) return; 
            const reader = new FileReader(); 
            reader.onload = (e) => { 
                try { 
                    const imported = JSON.parse(e.target.result); 
                    if (Array.isArray(imported)) { this.projects = imported; this.saveState(); this.renderProjects(); } 
                } catch (err) { console.error(err); } 
            }; 
            reader.readAsText(file); e.target.value = null; 
        });
         this.elements.pdfBtn.addEventListener('click', () => {
            const originalCollapsedState = this.projects.map(p => ({id: p.id, collapsed: p.collapsed, phases: p.phases.map(ph => ({id: ph.id, collapsed: ph.collapsed}))}));
            this.projects.forEach(p => { p.collapsed = false; p.phases.forEach(ph => ph.collapsed = false); });
            this.renderProjects();
            setTimeout(() => {
                window.print();
                this.projects.forEach(p => {
                    const originalProject = originalCollapsedState.find(op => op.id === p.id);
                    if(originalProject) {
                       p.collapsed = originalProject.collapsed;
                        p.phases.forEach(ph => {
                            const originalPhase = originalProject.phases.find(oph => oph.id === ph.id);
                            if(originalPhase) ph.collapsed = originalPhase.collapsed;
                        });
                    }
                });
                this.renderProjects();
            }, 100);
        });
        document.querySelector('.container').addEventListener('click', (e) => { 
            const icon = e.target.closest('.date-input-icon-wrapper'); 
            if (icon) { 
                const input = icon.parentElement.querySelector('.date-input'); 
                if (input && !input.disabled) this.handleDateTrigger(input);
                return;
            }
            if (this.dependencyMode) {
                const candidate = e.target.closest('.dependency-candidate');
                if (candidate) this.handleDependencyClick(candidate);
            }
            if (!e.target.closest('.move-task-btn') && !e.target.closest('.move-task-dropdown')) {
                document.querySelectorAll('.move-task-dropdown').forEach(d => d.classList.remove('show'));
            }
        });
        this.elements.addProjectBtn.addEventListener('click', this.addProject.bind(this));
        this.elements.undoBtn.addEventListener('click', this.undo.bind(this));
        this.elements.redoBtn.addEventListener('click', this.redo.bind(this));
        this.elements.toggleDeletedLogBtn.addEventListener('click', this.toggleDeletedLog.bind(this));
        this.elements.closeFullscreenBtn.addEventListener('click', () => {
            this.elements.fullscreenModal.style.display = 'none';
            d3.select("body").selectAll(".fullscreen-chart-tooltip").remove();
        });
        this.elements.saveReasonBtn.addEventListener('click', this.handleSaveReason.bind(this));
        this.elements.cancelReasonBtn.addEventListener('click', this.handleCancelReason.bind(this));
        this.elements.cancelConfirmBtn.addEventListener('click', () => {
            this.elements.confirmModal.classList.add('hidden');
            this.pendingClearDependencies = null;
        });
        this.elements.confirmActionBtn.addEventListener('click', () => {
            if (this.pendingClearDependencies) {
                this.clearDependencies(this.pendingClearDependencies);
            }
            this.elements.confirmModal.classList.add('hidden');
            this.pendingClearDependencies = null;
        });
        
        // Shortcuts Modal Listeners
        this.elements.shortcutsBtn.addEventListener('click', this.toggleShortcutsModal.bind(this));
        this.elements.closeShortcutsBtn.addEventListener('click', this.toggleShortcutsModal.bind(this));
        this.elements.shortcutsModalBackdrop.addEventListener('click', this.toggleShortcutsModal.bind(this));

        window.addEventListener('resize', () => this.updateTabIndicator());

        document.addEventListener('keydown', (e) => {
            if (e.key === '?') {
                 if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.contentEditable !== 'true') {
                    e.preventDefault();
                    this.toggleShortcutsModal();
                }
            }
            if(e.key === 'Escape') {
                if (!this.elements.shortcutsModal.classList.contains('hidden')) {
                    this.toggleShortcutsModal();
                    return; 
                }
                if (this.dependencyMode) {
                    this.dependencyMode = false;
                    this.firstSelectedItem = null;
                    this.elements.dependencyBanner.classList.add('hidden');
                    this.renderProjects();
                }
                if (this.elements.fullscreenModal.style.display === 'block') {
                     this.elements.fullscreenModal.style.display = 'none';
                     d3.select("body").selectAll(".fullscreen-chart-tooltip").remove();
                }
            }

            if (this.isShortcut(e, 'arrowleft', { ctrl: true, alt: true }) || this.isShortcut(e, 'arrowright', { ctrl: true, alt: true })) {
                e.preventDefault();
                const direction = e.key.toLowerCase() === 'arrowleft' ? -1 : 1;
                const currentIndex = this.tabOrder.indexOf(this.activeTab);
                if (currentIndex === -1) return;
        
                let newIndex = currentIndex + direction;
        
                if (newIndex < 0) {
                    newIndex = this.tabOrder.length - 1;
                } else if (newIndex >= this.tabOrder.length) {
                    newIndex = 0;
                }
                
                const newTabName = this.tabOrder[newIndex];
                this.showMainTab(newTabName);
                document.getElementById(`main-tab-btn-${newTabName}`).focus();
            }
        });
        this.addDragAndDropListeners();
    },
    
    // --- DATA & UTILS ---
    saveState() {
        this.history.push(JSON.parse(JSON.stringify(this.projects)));
        if (this.history.length > this.MAX_HISTORY) {
            this.history.shift(); 
        }
        this.redoStack = []; 
        this.saveProjects();
        this.updateUndoRedoButtons();
    },

    undo() {
        if (this.history.length > 0) {
            this.redoStack.push(JSON.parse(JSON.stringify(this.projects)));
            this.projects = this.history.pop();
            this.saveProjects(); 
            this.renderProjects();
            this.updateUndoRedoButtons();
        }
    },

    redo() {
        if (this.redoStack.length > 0) {
            this.history.push(JSON.parse(JSON.stringify(this.projects)));
            this.projects = this.redoStack.pop();
            this.saveProjects(); 
            this.renderProjects();
            this.updateUndoRedoButtons();
        }
    },
    
    updateUndoRedoButtons() {
        this.elements.undoBtn.disabled = this.history.length === 0;
        this.elements.redoBtn.disabled = this.redoStack.length === 0;
    },

    saveProjects() {
        localStorage.setItem('projectTimelineData', JSON.stringify(this.projects));
        localStorage.setItem('projectTimelineDeletedLogs', JSON.stringify(this.deletedProjectLogs));
    },
    loadProjects() {
        const savedData = localStorage.getItem('projectTimelineData');
        let loadedProjects = [];
        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData);
                if (Array.isArray(parsedData)) {
                    loadedProjects = parsedData;
                }
            } catch (error) { console.error("Error parsing projects from localStorage:", error); }
        }
        this.projects = loadedProjects;
        this.projects.forEach(project => {
            if (!project.originalStartDate) project.originalStartDate = project.startDate;
            if (!project.originalEndDate) project.originalEndDate = project.endDate;
            if (!project.phases) project.phases = [];
            project.phases.forEach(phase => { 
                if(phase.collapsed === undefined) phase.collapsed = false; 
                if(!phase.dependencies) phase.dependencies = [];
                if(!phase.dependents) phase.dependents = [];
                phase.tasks.forEach(task => {
                    if(task.collapsed === undefined) task.collapsed = false;
                    if(!task.dependencies) task.dependencies = [];
                    if(!task.dependents) task.dependents = [];
                    if(task.subtasks) {
                        task.subtasks.forEach(subtask => {
                            if(!subtask.dependencies) subtask.dependencies = [];
                            if(!subtask.dependents) subtask.dependents = [];
                        });
                    }
                });
            });
            if (!project.logs) project.logs = [];
            if (project.collapsed === undefined) project.collapsed = false;
            if (typeof project.startDate !== 'string' || project.startDate.trim() === '') project.startDate = null;
            if (typeof project.endDate !== 'string' || project.endDate.trim() === '') project.endDate = null;
        });

        const savedDeletedLogs = localStorage.getItem('projectTimelineDeletedLogs');
        if (savedDeletedLogs) {
            try {
                this.deletedProjectLogs = JSON.parse(savedDeletedLogs);
            } catch (error) {
                console.error("Error parsing deleted project logs from localStorage:", error);
                this.deletedProjectLogs = [];
            }
        }
    },
    parseDate: d3.timeParse("%Y-%m-%d"),
    formatDate: d3.timeFormat("%m/%d/%y"),
    formatLogTimestamp: d3.timeFormat("%Y-%m-%d %H:%M"),

    sortByEndDate(a, b, dateKey = 'endDate') {
        const dateA_end = a[dateKey] ? this.parseDate(a[dateKey]) : null;
        const dateB_end = b[dateKey] ? this.parseDate(b[dateKey]) : null;

        if (dateA_end && dateB_end) {
            const diff = dateA_end - dateB_end;
            if (diff !== 0) return diff;
        } else if (dateA_end) return -1;
          else if (dateB_end) return 1;

        const startDateKey = dateKey.startsWith('effective') ? 'effectiveStartDate' : 'startDate';
        const dateA_start = a[startDateKey] ? this.parseDate(a[startDateKey]) : null;
        const dateB_start = b[startDateKey] ? this.parseDate(b[startDateKey]) : null;

        if (dateA_start && dateB_start) return dateA_start - dateB_start;
        if (dateA_start) return -1;
        if (dateB_start) return 1;
        return 0;
    },

    getBoundaryDate(items, type) {
        const dates = items.map(item => this.parseDate(type === 'latest' ? item.effectiveEndDate || item.endDate : item.effectiveStartDate || item.startDate)).filter(Boolean);
        if (dates.length === 0) return null;
        const boundary = type === 'latest' ? new Date(Math.max.apply(null, dates)) : new Date(Math.min.apply(null, dates));
        return boundary.toISOString().split('T')[0];
    },
    
    getDurationProgress(startDateStr, endDateStr) {
        if (!startDateStr || !endDateStr) return 0;
        const start = this.parseDate(startDateStr).getTime();
        const end = this.parseDate(endDateStr).getTime();
        const now = new Date().getTime();
        if (now < start) return 0;
        if (now > end) return 100;
        const totalDuration = end - start;
        if (totalDuration <= 0) return 100;
        const elapsed = now - start;
        return (elapsed / totalDuration) * 100;
    },

    calculateRollups() {
        this.projects.forEach(p => {
            p.phases.forEach(phase => {
                phase.tasks.forEach(task => {
                    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
                    if (hasSubtasks) {
                        task.effectiveStartDate = this.getBoundaryDate(task.subtasks, 'earliest');
                        task.effectiveEndDate = this.getBoundaryDate(task.subtasks, 'latest');
                        const completedSubtasks = task.subtasks.filter(st => st.completed).length;
                        task.progress = task.subtasks.length > 0 ? (completedSubtasks / task.subtasks.length) * 100 : 0;
                        task.completed = task.progress === 100;
                    } else {
                        task.effectiveStartDate = task.startDate;
                        task.effectiveEndDate = task.endDate;
                        task.progress = task.completed ? 100 : 0;
                    }
                });
                
                phase.effectiveStartDate = this.getBoundaryDate(phase.tasks, 'earliest');
                phase.effectiveEndDate = this.getBoundaryDate(phase.tasks, 'latest');
                const totalProgress = phase.tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
                phase.progress = phase.tasks.length > 0 ? totalProgress / phase.tasks.length : 0;
                phase.completed = phase.progress === 100;
            });

            p.totalPhaseProgress = p.phases.reduce((sum, ph) => sum + (ph.progress || 0), 0);
            p.overallProgress = p.phases.length > 0 ? p.totalPhaseProgress / p.phases.length : 0;
        });
    },

    resolveDependencies() {
        const allItems = new Map();
        this.projects.forEach(p => {
            p.phases.forEach(ph => {
                allItems.set(ph.id, ph);
                ph.tasks.forEach(t => {
                    allItems.set(t.id, t);
                    if (t.subtasks) {
                        t.subtasks.forEach(st => allItems.set(st.id, st));
                    }
                });
            });
        });

        allItems.forEach(item => item.isDriven = false);

        for (let i = 0; i < allItems.size; i++) {
            allItems.forEach(item => {
                if (item.dependencies && item.dependencies.length > 0) {
                    const parentId = item.dependencies[0];
                    const parent = allItems.get(parentId);

                    if (parent) {
                        const parentEndDateValue = parent.effectiveEndDate || parent.endDate;
                        if (parentEndDateValue) {
                            const parentEndDate = this.parseDate(parentEndDateValue);
                            const newStartDate = new Date(parentEndDate);

                            const oldEffectiveStartDate = item.effectiveStartDate ? this.parseDate(item.effectiveStartDate) : null;
                            const oldEffectiveEndDate = item.effectiveEndDate ? this.parseDate(item.effectiveEndDate) : null;
                            let duration = null;

                            if (oldEffectiveStartDate && oldEffectiveEndDate) {
                                duration = oldEffectiveEndDate.getTime() - oldEffectiveStartDate.getTime();
                            }

                            item.startDate = newStartDate.toISOString().split('T')[0];

                            if (duration !== null) {
                                const newEndDate = new Date(newStartDate.getTime() + duration);
                                item.endDate = newEndDate.toISOString().split('T')[0];
                            } else if (item.endDate) {
                                const existingEndDate = this.parseDate(item.endDate);
                                if (newStartDate > existingEndDate) {
                                    item.endDate = newStartDate.toISOString().split('T')[0];
                                }
                            }
                            
                            item.isDriven = true;
                            item.driverName = parent.name;
                            
                            if (item.subtasks && item.subtasks.length > 0 && oldEffectiveStartDate) {
                                const timeShift = newStartDate.getTime() - oldEffectiveStartDate.getTime();
                                if(timeShift !== 0) {
                                    item.subtasks.forEach(subtask => {
                                        if (subtask.startDate) {
                                            const oldSubtaskStartDate = this.parseDate(subtask.startDate);
                                            const newSubtaskStartDate = new Date(oldSubtaskStartDate.getTime() + timeShift);
                                            subtask.startDate = newSubtaskStartDate.toISOString().split('T')[0];
                                        }
                                        if (subtask.endDate) {
                                            const oldSubtaskEndDate = this.parseDate(subtask.endDate);
                                            const newSubtaskEndDate = new Date(oldSubtaskEndDate.getTime() + timeShift);
                                            subtask.endDate = newSubtaskEndDate.toISOString().split('T')[0];
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            });
            this.calculateRollups();
        }
    },

    renderProjects() {
        this.calculateRollups();
        this.resolveDependencies(); 
        this.elements.projectsContainer.innerHTML = '';
        const sortedProjects = [...this.projects].sort((a, b) => {
            if (a.overallProgress >= 100 && b.overallProgress < 100) return 1;
            if (a.overallProgress < 100 && b.overallProgress >= 100) return -1;
            return this.sortByEndDate(a, b, 'endDate');
        });

        sortedProjects.forEach((project) => {
            const projectCard = document.createElement('div');
            projectCard.className = `project-card p-3 rounded-xl`;
            let completionIcon = project.overallProgress >= 100 ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>` : '';

            projectCard.innerHTML = `
                <div class="flex justify-between items-center mb-3">
                    <div class="flex items-center gap-2 flex-grow min-w-0">
                        ${completionIcon}
                        <button onclick="timelineApp.toggleProjectCollapse(${project.id})" class="p-1 rounded-full hover-bg-secondary flex-shrink-0">
                            <svg id="chevron-${project.id}" class="w-5 h-5 text-tertiary chevron ${project.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </button>
                        <h3 class="text-xl font-bold truncate editable-text" onclick="timelineApp.makeEditable(this, 'updateProjectName', ${project.id})">${project.name}</h3>
                        <span class="text-sm font-medium text-secondary flex-shrink-0">${Math.round(project.overallProgress)}%</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-secondary flex-shrink-0">
                        <div class="date-input-container">
                            <input type="text" value="${project.startDate ? this.formatDate(this.parseDate(project.startDate)) : ''}" placeholder="Start Date" class="date-input" data-project-id="${project.id}" data-type="project-start" data-date="${project.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                            <div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                        </div>
                        <div class="date-input-container">
                            <input type="text" value="${project.endDate ? this.formatDate(this.parseDate(project.endDate)) : ''}" placeholder="End Date" class="date-input" data-project-id="${project.id}" data-type="project-end" data-date="${project.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                            <div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                        </div>
                    </div>
                    <button onclick="timelineApp.deleteProject(${project.id})" class="text-gray-400 hover:text-red-500 transition-colors text-xl font-bold ml-4 flex-shrink-0">&times;</button>
                </div>
                 <div id="project-body-${project.id}" class="${project.collapsed ? 'hidden' : ''}">
                    <div id="chart-${project.id}" class="w-full h-48 mb-3 relative"></div>
                    <div id="phases-${project.id}" class="space-y-1"></div>
                    <div class="mt-3">
                        <button onclick="timelineApp.toggleLog(${project.id})" class="text-xs font-semibold text-tertiary hover-text-primary flex items-center gap-1">
                            <svg id="log-chevron-${project.id}" class="w-4 h-4 chevron -rotate-90" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                            Change Log
                        </button>
                        <div id="log-container-${project.id}" class="hidden mt-2 p-2 log-container-bg rounded-md">${this.renderLog(project)}</div>
                    </div>
                </div>
            `;
            this.elements.projectsContainer.appendChild(projectCard);
            this.renderPhaseList(project);
            if (!project.collapsed && project.startDate && project.endDate) {
                this.drawChart(project);
            } else if (!project.startDate || !project.endDate) {
                document.getElementById(`chart-${project.id}`).innerHTML = `<div class="flex items-center justify-center h-full text-gray-400">Set project start and end dates to see progress chart.</div>`;
            }
        });
        this.renderDeletedProjectsLog();
         // Re-render active main tab if it's not the project tab
        if (this.activeTab === 'overall-load') {
            this.drawOverallLoadChart();
        } else if (this.activeTab === 'upcoming') {
            this.renderUpcomingTasks();
        }
    },
    
    getDependencyIcon(item) {
        const dependentCount = item.dependents?.length || 0;
        const isDependentSource = dependentCount > 0;
        const isParentSource = (item.dependencies?.length || 0) > 0;
        let dependentSourceClass = isDependentSource ? 'is-dependent-source' : '';
        let parentSourceClass = isParentSource ? 'is-parent-source' : '';

        return `
            <div class="dependency-container">
                <div class="dependency-circle ${dependentSourceClass}" 
                     onmouseover="timelineApp.showDependencyTooltip(event, ${item.id})" 
                     onmouseout="timelineApp.hideDependencyTooltip()"
                     onclick="timelineApp.startDependencyMode(${item.id})">${isDependentSource ? `<span>${dependentCount}</span>` : ''}</div>
                <div class="dependency-circle ${parentSourceClass}"
                     onmouseover="timelineApp.showDependencyTooltip(event, ${item.id})"
                     onmouseout="timelineApp.hideDependencyTooltip()"
                     onclick="timelineApp.handleCircleClick(${item.id})"></div>
            </div>
        `;
    },


    renderPhaseList(project) {
        const phaseContainer = document.getElementById(`phases-${project.id}`);
        let html = '';
        const sortedPhases = [...project.phases].sort((a, b) => this.sortByEndDate(a, b, 'effectiveEndDate'));

        sortedPhases.forEach(phase => {
            const hasTasks = phase.tasks && phase.tasks.length > 0;
            const toggleButton = hasTasks ?
                `<button onclick="timelineApp.togglePhaseCollapse(${project.id}, ${phase.id})" class="p-1 rounded-full hover-bg-tertiary flex-shrink-0">
                    <svg id="phase-chevron-${phase.id}" class="w-4 h-4 text-tertiary chevron ${phase.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>` : `<div class="w-6 h-6 flex-shrink-0"></div>`; 

            const depClass = this.dependencyMode && this.firstSelectedItem?.id !== phase.id ? 'dependency-candidate' : '';
            const selectedClass = this.firstSelectedItem?.id === phase.id ? 'dependency-selected' : '';
            const drivenDot = phase.isDriven ? `<div class="driven-by-dot" title="Starts after: ${phase.driverName.replace(/"/g, '&quot;')}"></div>` : '<div class="w-2"></div>';
            const durationProgress = this.getDurationProgress(phase.effectiveStartDate, phase.effectiveEndDate);
            let durationBarColorClass = 'bg-blue-500';
            if (phase.completed) {
                durationBarColorClass = 'bg-green-500';
            } else if (durationProgress === 100) {
                durationBarColorClass = 'bg-red-500';
            } else if (durationProgress > 90) {
                durationBarColorClass = 'bg-orange-500';
            } else if (durationProgress > 75) {
                durationBarColorClass = 'bg-yellow-500';
            }

            html += `
                <div class="phase-row rounded-lg p-2 ${depClass} ${selectedClass}" data-id="${phase.id}" data-type="phase" data-project-id="${project.id}">
                    <div class="flex items-center gap-3 item-main-row">
                        ${toggleButton}
                         ${drivenDot}
                        <div class="text-xs font-bold text-secondary w-10 text-center flex-shrink-0">${Math.round(phase.progress || 0)}%</div>
                        <div class="duration-scale-container" title="Duration Progress">
                            <div class="duration-scale-bar ${durationBarColorClass}" style="width: ${durationProgress}%;"></div>
                        </div>
                        <span class="font-semibold flex-grow editable-text" onclick="timelineApp.makeEditable(this, 'updatePhaseName', ${project.id}, ${phase.id})">${phase.name}</span>
                        ${this.getDependencyIcon(phase)}
                        <div class="flex items-center gap-2 text-sm text-secondary">
                            <div class="date-input-container"><input type="text" value="${phase.effectiveStartDate ? this.formatDate(this.parseDate(phase.effectiveStartDate)) : ''}" placeholder="Start" readonly class="date-input date-input-disabled" disabled></div>
                            <div class="date-input-container"><input type="text" value="${phase.effectiveEndDate ? this.formatDate(this.parseDate(phase.effectiveEndDate)) : ''}" placeholder="End" readonly class="date-input date-input-disabled" disabled></div>
                        </div>
                        <button onclick="timelineApp.deletePhase(${project.id}, ${phase.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold">&times;</button>
                    </div>
                    <div id="tasks-container-${phase.id}" class="pl-12 mt-2 space-y-1 pt-2 border-t border-primary ${phase.collapsed ? 'hidden' : ''}">${this.renderTaskList(project.id, phase.id, phase.tasks)}</div>
                </div>`;
        });
         html += `
            <div class="mt-2 pl-4">
                 <div class="flex items-center gap-2">
                    <input type="text" id="new-phase-name-${project.id}" placeholder="Add a new phase..." class="flex-grow w-full px-2 py-1 input-primary rounded-md text-sm h-[28px]" onkeydown="if(event.key==='Enter') timelineApp.addPhase(${project.id})">
                    <button onclick="timelineApp.addPhase(${project.id})" class="btn-secondary font-semibold rounded-md text-sm btn-sm">Add</button>
                </div>
            </div>`;
        phaseContainer.innerHTML = html;
    },

    renderTaskList(projectId, phaseId, tasks) {
        let html = '';
        const sortedTasks = [...tasks].sort((a, b) => this.sortByEndDate(a, b, 'effectiveEndDate'));
        const iconHtml = `<div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>`;
        sortedTasks.forEach(task => {
            const hasSubtasks = task.subtasks && task.subtasks.length > 0;
            let taskControlHtml = hasSubtasks ? `<div class="text-xs font-bold text-secondary w-10 text-center flex-shrink-0">${Math.round(task.progress || 0)}%</div>` : `<input type="checkbox" class="custom-checkbox" onchange="timelineApp.toggleTaskComplete(${projectId}, ${phaseId}, ${task.id})" ${task.completed ? 'checked' : ''}>`;
            const toggleButton = hasSubtasks ? 
                `<button onclick="timelineApp.toggleTaskCollapse(${projectId}, ${phaseId}, ${task.id})" class="p-1 rounded-full hover-bg-tertiary flex-shrink-0">
                    <svg id="task-chevron-${task.id}" class="w-4 h-4 text-tertiary chevron ${task.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>` : `<div class="w-6 h-6 flex-shrink-0"></div>`;
            const depClass = this.dependencyMode && this.firstSelectedItem?.id !== task.id ? 'dependency-candidate' : '';
            const selectedClass = this.firstSelectedItem?.id === task.id ? 'dependency-selected' : '';
            const drivenDot = task.isDriven ? `<div class="driven-by-dot" title="Starts after: ${task.driverName.replace(/"/g, '&quot;')}"></div>` : '<div class="w-2"></div>';
            const durationProgress = this.getDurationProgress(task.effectiveStartDate, task.effectiveEndDate);
            let durationBarColorClass = 'bg-blue-500';
            if (task.completed) {
                durationBarColorClass = 'bg-green-500';
            } else if (durationProgress === 100) {
                durationBarColorClass = 'bg-red-500';
            } else if (durationProgress > 90) {
                durationBarColorClass = 'bg-orange-500';
            } else if (durationProgress > 75) {
                durationBarColorClass = 'bg-yellow-500';
            }
            const isDriven = hasSubtasks || task.isDriven;
            const dateInputClasses = isDriven ? 'date-input-disabled' : '';

            html += `
                <div class="task-row rounded-lg px-2 py-1 ${depClass} ${selectedClass}" data-id="${task.id}" data-type="task" data-project-id="${projectId}" data-phase-id="${phaseId}">
                    <div class="flex items-center gap-3 item-main-row">
                         ${toggleButton}
                        ${drivenDot}
                        ${taskControlHtml}
                        <div class="duration-scale-container" title="Duration Progress">
                            <div class="duration-scale-bar ${durationBarColorClass}" style="width: ${durationProgress}%;"></div>
                        </div>
                        <div class="flex-grow flex items-center gap-2">
                            <span class="font-medium editable-text" onclick="timelineApp.makeEditable(this, 'updateTaskName', ${projectId}, ${phaseId}, ${task.id})">${task.name}</span>
                            <button onclick="timelineApp.showAddSubtaskInput(${task.id})" class="add-subtask-btn items-center gap-1 text-xs btn-secondary font-semibold rounded-md px-2 py-1 flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                <span>Subtask</span>
                            </button>
                            <div class="relative">
                                <button onclick="timelineApp.toggleMoveTaskDropdown(event, ${projectId}, ${phaseId}, ${task.id})" class="move-task-btn items-center gap-1 text-xs btn-secondary font-semibold rounded-md px-2 py-1 flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                    <span>Move</span>
                                </button>
                                <div id="move-task-dropdown-${task.id}" class="move-task-dropdown"></div>
                            </div>
                        </div>
                        ${this.getDependencyIcon(task)}
                        <div class="flex items-center gap-2 text-sm text-secondary">
                            <div class="date-input-container">
                                <input type="text" value="${task.effectiveStartDate ? this.formatDate(this.parseDate(task.effectiveStartDate)) : ''}" placeholder="Start" class="date-input ${dateInputClasses}" ${isDriven ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${task.id}" data-type="task-start" data-date="${task.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                                ${!isDriven ? iconHtml : ''}
                            </div>
                            <div class="date-input-container">
                                <input type="text" value="${task.effectiveEndDate ? this.formatDate(this.parseDate(task.effectiveEndDate)) : ''}" placeholder="End" class="date-input ${dateInputClasses}" ${isDriven ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${task.id}" data-type="task-end" data-date="${task.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                                ${!isDriven ? iconHtml : ''}
                            </div>
                        </div>
                        <button onclick="timelineApp.deleteTask(${projectId}, ${phaseId}, ${task.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold">&times;</button>
                    </div>
                    <div id="subtasks-container-${task.id}" class="pl-12 mt-2 space-y-2 pt-2 border-t border-primary ${task.collapsed || !hasSubtasks ? 'hidden' : ''}">
                        ${this.renderSubtaskList(projectId, phaseId, task.id, task.subtasks || [])}
                    </div>
                    <div id="add-subtask-form-${task.id}" class="hidden ml-12 mt-2">
                         <div class="flex items-center gap-2">
                            <input type="text" id="new-subtask-name-${task.id}" placeholder="Add subtask..." class="flex-grow w-full px-2 py-1 input-primary rounded-md text-xs h-[28px]" onkeydown="if(event.key==='Enter') timelineApp.addSubtask(${projectId}, ${phaseId}, ${task.id})">
                            <button onclick="timelineApp.addSubtask(${projectId}, ${phaseId}, ${task.id})" class="btn-secondary font-semibold rounded-md text-xs btn-sm">Add</button>
                         </div>
                    </div>
                </div>`;
        });
        html += `
            <div>
                <div class="flex items-center gap-2">
                    <input type="text" id="new-task-name-${phaseId}" placeholder="Add a new task..." class="flex-grow w-full px-2 py-1 input-primary rounded-md text-xs h-[28px]" onkeydown="if(event.key==='Enter') timelineApp.addTask(${projectId}, ${phaseId})">
                    <button onclick="timelineApp.addTask(${projectId}, ${phaseId})" class="btn-secondary font-semibold rounded-md text-xs btn-sm">Add</button>
                </div>
            </div>`;
        return html;
    },

    renderSubtaskList(projectId, phaseId, taskId, subtasks) {
        if (!subtasks || subtasks.length === 0) return '';
        let html = '<div class="ml-12 mt-1 space-y-1 pt-1">';
        const sortedSubtasks = [...subtasks].sort((a,b) => this.sortByEndDate(a, b, 'endDate'));
        const iconHtml = `<div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>`;
        sortedSubtasks.forEach(subtask => {
            const depClass = this.dependencyMode && this.firstSelectedItem?.id !== subtask.id ? 'dependency-candidate' : '';
            const selectedClass = this.firstSelectedItem?.id === subtask.id ? 'dependency-selected' : '';
            const drivenDot = subtask.isDriven ? `<div class="driven-by-dot" title="Starts after: ${subtask.driverName.replace(/"/g, '&quot;')}"></div>` : '<div class="w-2"></div>';
            const durationProgress = this.getDurationProgress(subtask.startDate, subtask.endDate);
            let durationBarColorClass = 'bg-blue-500';
            if (subtask.completed) {
                durationBarColorClass = 'bg-green-500';
            } else if (durationProgress === 100) {
                durationBarColorClass = 'bg-red-500';
            } else if (durationProgress > 90) {
                durationBarColorClass = 'bg-orange-500';
            } else if (durationProgress > 75) {
                durationBarColorClass = 'bg-yellow-500';
            }
            const dateInputClasses = subtask.isDriven ? 'date-input-disabled' : '';

            html += `
                <div class="flex items-center gap-3 subtask-row ${depClass} ${selectedClass}" data-id="${subtask.id}" data-type="subtask" data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}">
                    ${drivenDot}
                    <input type="checkbox" class="custom-checkbox" onchange="timelineApp.toggleSubtaskComplete(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" ${subtask.completed ? 'checked' : ''}>
                    <div class="duration-scale-container" title="Duration Progress">
                        <div class="duration-scale-bar ${durationBarColorClass}" style="width: ${durationProgress}%;"></div>
                    </div>
                    <span class="text-sm flex-grow ${subtask.completed ? 'line-through opacity-60' : ''} editable-text" onclick="timelineApp.makeEditable(this, 'updateSubtaskName', ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})">${subtask.name}</span>
                    ${this.getDependencyIcon(subtask)}
                    <div class="date-input-container">
                            <input type="text" value="${subtask.startDate ? this.formatDate(this.parseDate(subtask.startDate)) : ''}" placeholder="Start" class="date-input ${dateInputClasses}" ${subtask.isDriven ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}" data-subtask-id="${subtask.id}" data-type="subtask-start" data-date="${subtask.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                             ${!subtask.isDriven ? iconHtml : ''}
                         </div>
                         <div class="date-input-container">
                            <input type="text" value="${subtask.endDate ? this.formatDate(this.parseDate(subtask.endDate)) : ''}" placeholder="End" class="date-input" data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}" data-subtask-id="${subtask.id}" data-type="subtask-end" data-date="${subtask.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                            ${iconHtml}
                        </div>
                    <button onclick="timelineApp.deleteSubtask(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold w-5 text-center flex-shrink-0">&times;</button>
                </div>`;
        });
        return html + '</div>';
    },

    renderLog(project) {
        if (!project.logs || project.logs.length === 0) return '<p class="text-xs text-secondary">No changes logged.</p>';
        let tableHtml = `<table class="w-full text-xs font-mono"><thead><tr class="border-b border-primary"><th class="text-left p-1 w-1/4">Timestamp</th><th class="text-left p-1 w-1/4">Item</th><th class="text-left p-1">Change</th><th class="text-left p-1">Reason</th></tr></thead><tbody>`;
        [...project.logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(log => {
            let changeText = '';
            if (log.type === 'deletion') {
                changeText = 'Deleted';
            } else {
                changeText = `${log.from ? this.formatDate(this.parseDate(log.from)) : 'None'} -> ${this.formatDate(this.parseDate(log.to))}`;
            }
            tableHtml += `<tr class="border-b border-secondary"><td class="p-1 align-top">${this.formatLogTimestamp(new Date(log.timestamp))}</td><td class="p-1 align-top">${log.item}</td><td class="p-1 align-top">${changeText}</td><td class="p-1 align-top">${log.comment}</td></tr>`;
        });
        return tableHtml + '</tbody></table>';
    },

    renderDeletedProjectsLog() {
        const container = document.getElementById('deleted-projects-log-content');
        const toggleBtn = this.elements.toggleDeletedLogBtn;
        const chevron = document.getElementById('deleted-log-chevron');

        if (!this.deletedProjectLogs || this.deletedProjectLogs.length === 0) {
            container.innerHTML = '';
            toggleBtn.classList.add('hidden');
            return;
        }

        toggleBtn.classList.remove('hidden');
        if(this.deletedLogCollapsed){
            container.classList.add('hidden');
            chevron.classList.add('-rotate-90');
        } else {
            container.classList.remove('hidden');
            chevron.classList.remove('-rotate-90');
        }

        let tableHtml = `<div class="project-card p-3">
            <table class="w-full text-xs font-mono">
                <thead>
                    <tr class="border-b border-primary">
                        <th class="text-left p-1 w-1/4">Timestamp</th>
                        <th class="text-left p-1 w-1/4">Item</th>
                        <th class="text-left p-1">Change</th>
                        <th class="text-left p-1">Reason</th>
                    </tr>
                </thead>
                <tbody>`;

        [...this.deletedProjectLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(log => {
            tableHtml += `<tr class="border-b border-secondary">
                                <td class="p-1 align-top">${this.formatLogTimestamp(new Date(log.timestamp))}</td>
                                <td class="p-1 align-top">${log.item}</td>
                                <td class="p-1 align-top">Deleted</td>
                                <td class="p-1 align-top">${log.comment}</td>
                            </tr>`;
        });

        tableHtml += '</tbody></table></div>';
        container.innerHTML = tableHtml;
    },

    drawChart(project) {
        const container = d3.select(`#chart-${project.id}`);
        if (container.empty() || !project.startDate || !project.endDate) return;
        setTimeout(() => {
            const width = container.node().getBoundingClientRect().width;
            if (width <= 0) return;
            container.selectAll("*").remove();
            
            container.append('button')
                .html('<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5" /></svg>')
                .attr('class', 'absolute bottom-1 right-1 p-1.5 btn-secondary rounded-full')
                .on('click', () => this.showFullscreenChart(project.id));
            
            const margin = { top: 10, right: 20, bottom: 20, left: 40 },
                chartWidth = width - margin.left - margin.right,
                height = container.node().getBoundingClientRect().height - margin.top - margin.bottom;
            const svg = container.append("svg").attr("width", chartWidth + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
            const x = d3.scaleTime().range([0, chartWidth]),
                y = d3.scaleLinear().range([height, 0]);
            const startDate = this.parseDate(project.startDate),
                endDate = this.parseDate(project.endDate);
            x.domain([startDate, endDate]);
            y.domain([0, 100]);
            svg.append("g").attr("class", "chart-grid").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(5).tickFormat(this.formatDate));
            svg.append("g").attr("class", "chart-grid").call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}%`));

            const endDateChanges = project.logs
                .filter(log => log.item.includes(`Project '${project.name}' end date`) && log.from)
                .map(log => log.from);
            if (project.originalEndDate) {
                endDateChanges.push(project.originalEndDate);
            }
            const uniquePriorEndDates = [...new Set(endDateChanges)].filter(d => d !== project.endDate);

            uniquePriorEndDates.forEach(dateStr => {
                const date = this.parseDate(dateStr);
                if (date) {
                    svg.append("line")
                        .attr("class", "ghost-finish-line")
                        .attr("x1", x(date))
                        .attr("y1", 0)
                        .attr("x2", x(date))
                        .attr("y2", height);
                }
            });

            const today = new Date();
            if (today >= startDate && today <= endDate) {
                svg.append("line")
                    .attr("class", "today-line")
                    .attr("x1", x(today))
                    .attr("y1", 0)
                    .attr("x2", x(today))
                    .attr("y2", height);
            }

            svg.append("line").attr("class", "planned-line").attr("x1", x(startDate)).attr("y1", y(0)).attr("x2", x(endDate)).attr("y2", y(100));
            svg.append("line").attr("class", "finish-line").attr("x1", x(endDate)).attr("y1", 0).attr("x2", x(endDate)).attr("y2", height);

            const allTasks = project.phases.flatMap(phase => phase.tasks).filter(task => task.effectiveEndDate);
            const firstActivityDate = this.parseDate(this.getBoundaryDate(allTasks, 'earliest')) || startDate;
            const pathData = [{ date: firstActivityDate, progress: 0 }];
            let cumulativeProgress = 0;

            allTasks.sort((a,b) => this.parseDate(a.effectiveEndDate) - this.parseDate(b.effectiveEndDate)).forEach(task => {
                const dateForPoint = this.parseDate(task.effectiveEndDate);
                if (dateForPoint) {
                    cumulativeProgress += 100 / (allTasks.length || 1);
                    pathData.push({ date: dateForPoint, progress: cumulativeProgress, completed: task.completed, name: task.name });
                }
            });

            const line = d3.line().x(d => x(d.date)).y(d => y(d.progress));
            const totalDuration = endDate.getTime() - startDate.getTime();
            const getPlannedProgress = date => totalDuration <= 0 ? 0 : Math.min(100, (date.getTime() - startDate.getTime()) / totalDuration * 100);
            for (let i = 0; i < pathData.length - 1; i++) {
                const segment = [pathData[i], pathData[i+1]], endPoint = segment[1];
                const colorClass = endPoint.date > endDate ? 'stroke-red-500' : (endPoint.progress >= getPlannedProgress(endPoint.date) ? 'stroke-green-500' : 'stroke-red-500');
                svg.append("path").datum(segment).attr("class", `${endPoint.completed ? 'actual-line' : 'projected-line'} ${colorClass}`).attr("d", line);
            }
            svg.selectAll(".actual-point").data(pathData.slice(1).filter(d=>d.completed)).enter().append("circle").attr("class", "actual-point").attr("cx", d => x(d.date)).attr("cy", d => y(d.progress)).attr("fill", d => d.date > endDate ? '#ef4444' : (d.progress >= getPlannedProgress(d.date) ? '#22c55e' : '#ef4444'));

            const sortedPhases = [...project.phases]
                .filter(p => p.effectiveEndDate)
                .sort((a, b) => this.parseDate(a.effectiveEndDate) - this.parseDate(b.effectiveEndDate));

            const phaseMarkers = svg.selectAll(".phase-marker")
                .data(sortedPhases)
                .enter()
                .append("g")
                .attr("class", "phase-marker")
                .attr("transform", (d, i) => {
                    const phaseEndDate = this.parseDate(d.effectiveEndDate);
                    let tasksInPhaseOrBefore = allTasks.filter(t => this.parseDate(t.effectiveEndDate) <= phaseEndDate);
                    let phaseEndProgress = (tasksInPhaseOrBefore.length / (allTasks.length || 1)) * 100;
                    return `translate(${x(phaseEndDate)}, ${y(phaseEndProgress)})`;
                });

            phaseMarkers.append("circle").attr("class", "phase-marker-circle");
            phaseMarkers.append("text").attr("class", "phase-marker-text").text((d, i) => `P${i + 1}`);
        }, 0);
    },

    drawOverallLoadChart() {
        const containerId = `overall-load-chart`;
        const container = d3.select(`#${containerId}`);
        if (container.empty()) return;
        container.selectAll("*").remove();
        
        const legendContainer = d3.select('#overall-load-legend');
        legendContainer.html('');

        const allTasks = [];
        this.projects.forEach(project => {
            project.phases.forEach(phase => {
                phase.tasks.forEach(task => {
                    if (task.subtasks && task.subtasks.length > 0) {
                        task.subtasks.forEach(subtask => {
                            if (subtask.endDate) allTasks.push({ name: subtask.name, endDate: subtask.endDate, colorKey: project.name });
                        });
                    } else if (task.endDate) {
                        allTasks.push({ name: task.name, endDate: task.endDate, colorKey: project.name });
                    }
                });
            });
        });

        if (allTasks.length === 0) {
            container.html(`<div class="flex items-center justify-center h-full text-gray-400">No tasks with due dates.</div>`);
            return;
        }

        const tasksByWeek = d3.group(allTasks, d => d3.timeMonday(this.parseDate(d.endDate)));
        const uniqueProjectNames = [...new Set(allTasks.map(t => t.colorKey))];
        const overallChartColor = d3.scaleOrdinal(d3.schemeTableau10).domain(uniqueProjectNames);

        const stackData = Array.from(tasksByWeek.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([week, tasks]) => {
                const weekData = { week: week };
                uniqueProjectNames.forEach(name => {
                    weekData[name] = tasks.filter(t => t.colorKey === name).length;
                });
                return weekData;
            });

        const stack = d3.stack().keys(uniqueProjectNames);
        const series = stack(stackData);

        setTimeout(() => {
            const width = container.node().getBoundingClientRect().width;
            if (width <= 0) return;
            
            const margin = { top: 20, right: 20, bottom: 50, left: 40 },
                chartWidth = width - margin.left - margin.right,
                height = container.node().getBoundingClientRect().height - margin.top - margin.bottom;

            const svg = container.append("svg").attr("width", chartWidth + margin.left + margin.right).attr("height", height + margin.top + margin.bottom)
                .append("g").attr("transform", `translate(${margin.left},${margin.top})`);
                
            const x = d3.scaleBand().domain(stackData.map(d => d.week)).range([0, chartWidth]).padding(0.2);
            const yMax = d3.max(series, d => d3.max(d, d => d[1]));
            const y = d3.scaleLinear().domain([0, yMax > 0 ? yMax : 1]).nice().range([height, 0]);
                
            svg.append("g").attr("class", "chart-grid").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b %d")))
                .selectAll("text").style("font-size", "10px").attr("transform", "rotate(-45)").style("text-anchor", "end");

            svg.append("g").attr("class", "chart-grid").call(d3.axisLeft(y).ticks(Math.min(yMax, 10)).tickFormat(d3.format("d")));

            let tooltip = d3.select("body").select(".chart-tooltip");
            if (tooltip.empty()) {
                tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
            }

            svg.append("g").selectAll("g").data(series).enter().append("g").attr("fill", d => overallChartColor(d.key))
                .selectAll("rect").data(d => d).enter().append("rect")
                .attr("x", d => x(d.data.week)).attr("y", d => y(d[1])).attr("height", d => y(d[0]) - y(d[1])).attr("width", x.bandwidth())
                .on("mouseover", function(event, d) {
                    const seriesData = d3.select(this.parentNode).datum();
                    const projectName = seriesData.key;
                    const taskCount = d.data[projectName];
                    if (taskCount === 0) return;
                    const weekStart = d3.timeFormat("%b %d")(d.data.week);
                    tooltip.style("visibility", "visible").html(`<strong>${projectName}</strong><br>Week of ${weekStart}<br>Tasks Due: ${taskCount}`);
                })
                .on("mousemove", (event) => { tooltip.style("top", (event.pageY - 10) + "px").style("left", (event.pageX + 10) + "px"); })
                .on("mouseout", () => { tooltip.style("visibility", "hidden"); });

            const legend = legendContainer.selectAll('.legend-item').data(uniqueProjectNames).enter().append('div').attr('class', 'flex items-center');
            legend.append('div').style('width', '12px').style('height', '12px').style('background-color', d => overallChartColor(d)).attr('class', 'mr-2 rounded-sm');
            legend.append('span').text(d => d);
        }, 0);
    },
    
    renderUpcomingTasks() {
        const container = document.getElementById('upcoming-tasks-container');
        container.innerHTML = '';
        const allItems = [];
        this.projects.forEach(project => {
            project.phases.forEach(phase => {
                phase.tasks.forEach(task => {
                    if (task.subtasks && task.subtasks.length > 0) {
                        task.subtasks.forEach(subtask => {
                            if (subtask.endDate && !subtask.completed) {
                                allItems.push({ date: subtask.endDate, path: `${project.name} &gt; ${phase.name} &gt; ${task.name}`, name: subtask.name, completed: subtask.completed });
                            }
                        });
                    } else {
                        if (task.effectiveEndDate && !task.completed) {
                            allItems.push({ date: task.effectiveEndDate, path: `${project.name} &gt; ${phase.name}`, name: task.name, completed: task.completed });
                        }
                    }
                });
            });
        });

        if (allItems.length === 0) {
            container.innerHTML = `<div class="upcoming-card p-4 rounded-xl shadow-md text-center text-secondary">No upcoming tasks with due dates.</div>`;
            return;
        }

        allItems.sort((a, b) => this.parseDate(a.date) - this.parseDate(b.date));
        const groupedByDate = d3.group(allItems, d => d.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let html = '';
        const sortedDates = Array.from(groupedByDate.keys()).sort((a,b) => this.parseDate(a) - this.parseDate(b));

        for (const dateStr of sortedDates) {
            const items = groupedByDate.get(dateStr);
            const dueDate = this.parseDate(dateStr);
            const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
            let dateLabel = '', headerColorClass = 'bg-gray-100 dark:bg-slate-800';

            if (diffDays < 0) {
                dateLabel = `${Math.abs(diffDays)} days ago`;
                headerColorClass = 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200';
            } else if (diffDays === 0) {
                dateLabel = 'Today';
                headerColorClass = 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
            } else if (diffDays === 1) {
                dateLabel = 'Tomorrow';
                headerColorClass = 'bg-orange-200 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300';
            } else if (diffDays > 1 && diffDays <= 7) {
                dateLabel = `in ${diffDays} days`;
                headerColorClass = 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200';
            } else {
                dateLabel = `in ${diffDays} days`;
            }

            html += `<div class="upcoming-card rounded-xl shadow-md">
                    <div class="p-3 border-b border-primary ${headerColorClass} rounded-t-xl">
                        <h3 class="font-bold">${this.formatDate(dueDate)} <span class="text-sm font-normal text-tertiary">(${dateLabel})</span></h3>
                    </div>
                    <div class="p-3 space-y-2">`;
            items.forEach(item => {
                const isOverdue = diffDays < 0 && !item.completed;
                const completedClass = item.completed ? 'line-through opacity-60' : '';
                const overdueClass = isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : '';

                html += `<div class="flex items-center text-sm ${completedClass}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2 text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                        <span class="text-secondary mr-2">${item.path} &gt;</span>
                        <span class="font-medium ${overdueClass}">${item.name}</span>
                        ${isOverdue ? '<span class="ml-2 text-xs font-bold text-red-500 bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-full">OVERDUE</span>' : ''}
                    </div>`;
            });
            html += `</div></div>`;
        }
        container.innerHTML = html;
    },

    showFullscreenChart(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;
        this.elements.fullscreenModal.style.display = 'block';
        this.drawFullscreenChart(project);
    },

    drawFullscreenChart(project) {
        const container = d3.select("#fullscreen-chart-container");
        container.selectAll("svg").remove(); 
        d3.select("body").selectAll(".fullscreen-chart-tooltip").remove();

        const tooltip = d3.select("body").append("div").attr("class", "chart-tooltip fullscreen-chart-tooltip");
        const width = container.node().getBoundingClientRect().width, height = container.node().getBoundingClientRect().height;
        const margin = { top: 40, right: 50, bottom: 40, left: 60 }, chartWidth = width - margin.left - margin.right, chartHeight = height - margin.top - margin.bottom;
        const svg = container.append("svg").attr("width", width).attr("height", height).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const x = d3.scaleTime().range([0, chartWidth]), y = d3.scaleLinear().range([chartHeight, 0]);
        const startDate = this.parseDate(project.startDate), endDate = this.parseDate(project.endDate);
        x.domain([startDate, endDate]);
        y.domain([0, 100]);
        
        const timeDiff = endDate.getTime() - startDate.getTime(), days = timeDiff / (1000 * 3600 * 24);
        let tickInterval;
        if (days > 365) tickInterval = d3.timeMonth.every(3);
        else if (days > 180) tickInterval = d3.timeMonth.every(1);
        else if (days > 60) tickInterval = d3.timeWeek.every(2);
        else tickInterval = d3.timeWeek.every(1);

        svg.append("g").attr("class", "chart-grid").attr("transform", `translate(0,${chartHeight})`).call(d3.axisBottom(x).ticks(tickInterval).tickFormat(d3.timeFormat("%b %d")));
        svg.append("g").attr("class", "chart-grid").call(d3.axisLeft(y).ticks(10).tickFormat(d => `${d}%`));
        svg.append("text").attr("x", chartWidth / 2).attr("y", 0 - (margin.top / 2)).attr("text-anchor", "middle").attr("class", "text-lg font-bold chart-title").text(`${project.name} - Progress Chart`);
        svg.append("line").attr("class", "planned-line").attr("x1", x(startDate)).attr("y1", y(0)).attr("x2", x(endDate)).attr("y2", y(100));
        svg.append("line").attr("class", "finish-line").attr("x1", x(endDate)).attr("y1", 0).attr("x2", x(endDate)).attr("y2", chartHeight);

        const today = new Date();
        if (today >= startDate && today <= endDate) {
            svg.append("line").attr("class", "today-line").attr("x1", x(today)).attr("y1", 0).attr("x2", x(today)).attr("y2", chartHeight);
        }
        
        const allTasksWithPhase = [];
        project.phases.forEach(phase => phase.tasks.forEach(task => { if (task.effectiveEndDate) allTasksWithPhase.push({ ...task, phaseName: phase.name }); }));
        const firstActivityDate = this.parseDate(this.getBoundaryDate(allTasksWithPhase, 'earliest')) || startDate;
        const pathData = [{ date: firstActivityDate, progress: 0 }];
        let cumulativeProgress = 0;

        allTasksWithPhase.sort((a,b) => this.parseDate(a.effectiveEndDate) - this.parseDate(b.effectiveEndDate)).forEach(task => {
            const dateForPoint = this.parseDate(task.effectiveEndDate);
            if (dateForPoint) {
                cumulativeProgress += 100 / (allTasksWithPhase.length || 1);
                pathData.push({ date: dateForPoint, progress: cumulativeProgress, completed: task.completed, name: task.name, phaseName: task.phaseName, percentComplete: Math.round(task.progress) });
            }
        });
        
        const line = d3.line().x(d => x(d.date)).y(d => y(d.progress));
        const totalDuration = endDate.getTime() - startDate.getTime();
        const getPlannedProgress = date => totalDuration <= 0 ? 0 : Math.min(100, (date.getTime() - startDate.getTime()) / totalDuration * 100);
        
        for (let i = 0; i < pathData.length - 1; i++) {
            const segment = [pathData[i], pathData[i+1]], endPoint = segment[1];
            const colorClass = endPoint.date > endDate ? 'stroke-red-500' : (endPoint.progress >= getPlannedProgress(endPoint.date) ? 'stroke-green-500' : 'stroke-red-500');
            svg.append("path").datum(segment).attr("class", `${endPoint.completed ? 'actual-line' : 'projected-line'} ${colorClass}`).attr("d", line);
        }

        svg.selectAll(".task-point").data(pathData.slice(1)).enter().append("circle").attr("class", "task-point actual-point")
            .attr("cx", d => x(d.date)).attr("cy", d => y(d.progress)).attr("fill", d => d.date > endDate ? '#ef4444' : (d.progress >= getPlannedProgress(d.date) ? '#22c55e' : '#ef4444'));

        const labels = svg.selectAll(".task-label-container").data(pathData.slice(1)).enter().append("foreignObject").attr("class", "task-label-container").attr("width", 180).attr("height", 60);

        labels.each(function(d) {
            const fo = d3.select(this);
            fo.append("xhtml:div").attr("class", "p-2 rounded-md text-xs chart-label-card")
                .html(`<div class="font-bold text-blue-500 truncate">${d.phaseName}</div><strong class="truncate">${d.name}</strong><br>${timelineApp.formatDate(d.date)} - ${d.percentComplete}%`);

            const pointX = x(d.date), pointY = y(d.progress), foWidth = 180, foHeight = 60;
            let foX = pointX + 10, foY = pointY - (foHeight / 2);

            if (foX + foWidth > chartWidth) foX = pointX - foWidth - 10;
            if (foY < 0) foY = 0;
            if (foY + foHeight > chartHeight) foY = chartHeight - foHeight;
            fo.attr("x", foX).attr("y", foY);
        });

        labels.each(function(d, i) {
            const currentLabel = d3.select(this);
            labels.each(function(d2, j) {
                if (i >= j) return;
                const otherLabel = d3.select(this);
                const currentBox = {x: parseFloat(currentLabel.attr("x")), y: parseFloat(currentLabel.attr("y")), width: 180, height: 60};
                const otherBox = {x: parseFloat(otherLabel.attr("x")), y: parseFloat(otherLabel.attr("y")), width: 180, height: 60};
                if (currentBox.x < otherBox.x + otherBox.width && currentBox.x + currentBox.width > otherBox.x && currentBox.y < otherBox.y + otherBox.height && currentBox.height + currentBox.y > otherBox.y) {
                    const newY = currentBox.y + currentBox.height + 2;
                     if (newY + otherBox.height <= chartHeight) otherLabel.attr("y", newY);
                }
            });
        });
    },

    showDependencyTooltip(event, itemId) {
        const allItems = new Map();
        this.projects.forEach(p => p.phases.forEach(ph => { allItems.set(ph.id, ph); ph.tasks.forEach(t => { allItems.set(t.id, t); if(t.subtasks) t.subtasks.forEach(st => allItems.set(st.id, st)); }); }));
        const item = allItems.get(itemId);
        if (!item || ((!item.dependents || item.dependents.length === 0) && (!item.dependencies || item.dependencies.length === 0))) return;

        let rootItem = item;
        let visited = new Set();
        while (rootItem.dependencies && rootItem.dependencies.length > 0 && !visited.has(rootItem.id)) {
            visited.add(rootItem.id);
            const parentId = rootItem.dependencies[0];
            const parentItem = allItems.get(parentId);
            if (!parentItem || visited.has(parentId)) break;
            rootItem = parentItem;
        }

        const treeHtml = this.buildDependencyTree(rootItem.id, itemId, allItems);
        this.elements.dependencyTooltip.innerHTML = treeHtml;
        this.elements.dependencyTooltip.classList.remove('hidden');

        const rect = event.target.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 5, left = rect.left + window.scrollX;

        this.elements.dependencyTooltip.style.top = `${top}px`;
        this.elements.dependencyTooltip.style.left = `${left}px`;
        
        const tooltipRect = this.elements.dependencyTooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) this.elements.dependencyTooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
        if (tooltipRect.bottom > window.innerHeight) this.elements.dependencyTooltip.style.top = `${top - tooltipRect.height - rect.height - 10}px`;
    },

    hideDependencyTooltip() {
        this.elements.dependencyTooltip.classList.add('hidden');
    },

    buildDependencyTree(itemId, highlightedId, allItems, visited = new Set()) {
        if (visited.has(itemId)) return ''; 
        visited.add(itemId);

        const item = allItems.get(itemId);
        if (!item) return '';

        let highlightClass = item.id === highlightedId ? 'highlight' : '';
        let childrenHtml = '';
        if (item.dependents && item.dependents.length > 0) {
            childrenHtml += '<div class="node-children">';
            item.dependents.forEach(childId => {
                childrenHtml += this.buildDependencyTree(childId, highlightedId, allItems, visited);
            });
            childrenHtml += '</div>';
        }

        return `<div class="dependency-tree-node">
                    <div class="node-content ${highlightClass}">${item.name}</div>
                    ${childrenHtml}
                </div>`;
    },

    formatDateInput(event) { let value = event.target.value.replace(/\D/g, ''); if (value.length > 2) value = value.substring(0, 2) + '/' + value.substring(2); if (value.length > 5) value = value.substring(0, 5) + '/' + value.substring(5, 7); event.target.value = value; },
    
    handleManualDateInput(event) {
        const input = event.target, dateStr = input.value;
        const revert = () => { input.value = input.dataset.date ? this.formatDate(this.parseDate(input.dataset.date)) : ''; };
        if (dateStr && !/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) { revert(); return; }
        if (!dateStr) {
            this.updateDate({ type: input.dataset.type, projectId: parseInt(input.dataset.projectId), phaseId: parseInt(input.dataset.phaseId), taskId: parseInt(input.dataset.taskId), subtaskId: parseInt(input.dataset.subtaskId), element: input }, null);
            return;
        }
        const [month, day, year] = dateStr.split('/').map(p => parseInt(p, 10));
        const dateObj = new Date(year + 2000, month - 1, day);
        if (dateObj.getFullYear() !== year + 2000 || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) { revert(); return; }
        const newDate = dateObj.toISOString().split('T')[0], oldDate = input.dataset.date || null;
        const context = { type: input.dataset.type, projectId: parseInt(input.dataset.projectId), phaseId: parseInt(input.dataset.phaseId), taskId: parseInt(input.dataset.taskId), subtaskId: parseInt(input.dataset.subtaskId), element: input };
        if (input.dataset.type.startsWith('new-project')) { input.dataset.date = newDate; return; }
        if (oldDate && oldDate !== newDate) {
            this.pendingDateChange = { context, newDate };
            this.elements.reasonModalTitle.textContent = 'Reason for Date Change';
            this.elements.reasonModalDetails.textContent = `Changing date from ${this.formatDate(this.parseDate(oldDate))} to ${this.formatDate(this.parseDate(newDate))}.`;
            this.elements.reasonModal.classList.remove('hidden');
            this.elements.reasonCommentTextarea.focus();
        }
        else if (!oldDate && newDate) { this.updateDate(context, newDate); }
    },
    
    handleDateInputKeydown(event) { if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); } },

    makeEditable(element, updateFunction, ...args) {
        if (this.dependencyMode) return;
        const originalText = element.innerText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText;
        input.className = 'inline-input';
        element.replaceWith(input);
        input.focus();
        input.addEventListener('blur', () => {
            const newText = input.value.trim();
            if (newText && newText !== originalText) {
                this[updateFunction](...args, newText);
            }
            this.renderProjects();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = originalText; input.blur(); }
        });
    },
    
    showAddSubtaskInput(taskId) {
        const form = document.getElementById(`add-subtask-form-${taskId}`);
        if (form) {
            form.classList.remove('hidden');
            form.querySelector('input').focus();
        }
    },
    
    addProject() {
        const name = this.elements.newProjectNameInput.value.trim(); if (!name) return;
        const startDateInput = document.getElementById('new-project-start-date'), endDateInput = document.getElementById('new-project-end-date');
        const startDate = startDateInput.dataset.date || null, endDate = endDateInput.dataset.date || null;
        this.projects.push({ id: Date.now(), name, startDate, endDate, originalStartDate: startDate, originalEndDate: endDate, collapsed: false, phases: [], logs: [] });
        this.saveState(); 
        this.elements.newProjectNameInput.value = ''; 
        startDateInput.value = ''; endDateInput.value = ''; delete startDateInput.dataset.date; delete endDateInput.dataset.date; 
        this.renderProjects();
    },

    addPhase(projectId) {
        const nameInput = document.getElementById(`new-phase-name-${projectId}`), name = nameInput.value.trim(); if (!name) return;
        const project = this.projects.find(p => p.id === projectId); 
        if (project) { project.phases.push({ id: Date.now(), name, collapsed: false, tasks: [], dependencies: [], dependents: [] }); this.saveState(); this.renderProjects(); }
    },

    addTask(projectId, phaseId) {
        const nameInput = document.getElementById(`new-task-name-${phaseId}`), name = nameInput.value.trim(); if (!name) return;
        const phase = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId); 
        if (phase) { phase.tasks.push({ id: Date.now(), name, startDate: null, endDate: null, completed: false, subtasks: [], dependencies: [], dependents: [] }); this.saveState(); this.renderProjects(); }
    },

    addSubtask(projectId, phaseId, taskId) {
        const nameInput = document.getElementById(`new-subtask-name-${taskId}`), name = nameInput.value.trim(); if (!name) return;
        const task = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId); 
        if (task) { if (!task.subtasks) task.subtasks = []; task.subtasks.push({ id: Date.now(), name, startDate: null, endDate: null, completed: false, dependencies: [], dependents: [] }); nameInput.value = ''; this.saveState(); this.renderProjects(); }
    },
    moveTask(projectId, fromPhaseId, toPhaseId, taskId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;
        const fromPhase = project.phases.find(p => p.id === fromPhaseId), toPhase = project.phases.find(p => p.id === toPhaseId);
        if (!fromPhase || !toPhase) return;
        const taskIndex = fromPhase.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;
        const [taskToMove] = fromPhase.tasks.splice(taskIndex, 1);
        toPhase.tasks.push(taskToMove);
        this.saveState();
        this.renderProjects();
    },

    toggleMoveTaskDropdown(event, projectId, phaseId, taskId) {
        event.stopPropagation();
        const dropdown = document.getElementById(`move-task-dropdown-${taskId}`);
        const isVisible = dropdown.classList.contains('show');
        document.querySelectorAll('.move-task-dropdown').forEach(d => d.classList.remove('show'));

        if (!isVisible) {
            const project = this.projects.find(p => p.id === projectId);
            if (!project) return;
            let optionsHtml = '';
            project.phases.forEach(phase => {
                if (phase.id === phaseId) {
                    optionsHtml += `<div class="move-task-dropdown-item disabled">${phase.name} (current)</div>`;
                } else {
                    optionsHtml += `<div class="move-task-dropdown-item" onclick="timelineApp.moveTask(${projectId}, ${phaseId}, ${phase.id}, ${taskId})">${phase.name}</div>`;
                }
            });
            dropdown.innerHTML = optionsHtml;
            dropdown.classList.add('show');
        }
    },

    updateProjectName(projectId, newName) { const p = this.projects.find(p => p.id === projectId); if (p) { p.name = newName; this.saveState(); } },
    updatePhaseName(projectId, phaseId, newName) { const p = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId); if (p) { p.name = newName; this.saveState(); } },
    updateTaskName(projectId, phaseId, taskId, newName) { const t = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId); if (t) { t.name = newName; this.saveState(); } },
    updateSubtaskName(projectId, phaseId, taskId, subtaskId, newName) { const s = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId)?.subtasks.find(st => st.id === subtaskId); if (s) { s.name = newName; this.saveState(); } },

    updateDate(context, value, comment = null) {
        const { projectId, phaseId, taskId, subtaskId, type } = context; const project = this.projects.find(p => p.id === projectId); if (!project) return; let targetItem, dateField, itemName;
        if (type.startsWith('project')) { targetItem = project; dateField = type.endsWith('start') ? 'startDate' : 'endDate'; itemName = `Project '${project.name}' ${dateField.replace('Date','')} date`; }
        else {
            const phase = project.phases.find(ph => ph.id === phaseId); if (!phase) return; const task = phase.tasks.find(t => t.id === taskId); if (!task) return; itemName = `Task '${task.name}'`;
            if (type.startsWith('task')) { targetItem = task; dateField = type.endsWith('start') ? 'startDate' : 'endDate'; itemName += ` ${dateField.replace('Date','')} date`; }
            else if (type.startsWith('subtask')) { const subtask = task.subtasks.find(st => st.id === subtaskId); if (!subtask) return; targetItem = subtask; dateField = type.endsWith('start') ? 'startDate' : 'endDate'; itemName = `Subtask '${subtask.name}' ${dateField.replace('Date','')} date`; }
        }
        if (targetItem && dateField) { const oldDate = targetItem[dateField]; if (comment) { if (!project.logs) project.logs = []; project.logs.push({ timestamp: new Date().toISOString(), item: itemName, from: oldDate, to: value, comment }); } targetItem[dateField] = value; }
        this.saveState(); this.renderProjects();
    },

    toggleTaskComplete(projectId, phaseId, taskId) { const t = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId); if (t) { t.completed = !t.completed; this.saveState(); this.renderProjects(); } },
    toggleSubtaskComplete(projectId, phaseId, taskId, subtaskId) { const s = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId)?.subtasks.find(st => st.id === subtaskId); if (s) { s.completed = !s.completed; this.saveState(); this.renderProjects(); } },
    
    removeAllDependencies(itemId) {
        const allItems = new Map();
        this.projects.forEach(p => p.phases.forEach(ph => { allItems.set(ph.id, ph); ph.tasks.forEach(t => { allItems.set(t.id, t); if(t.subtasks) t.subtasks.forEach(st => allItems.set(st.id, st)); }); }));
        
        const itemToRemove = allItems.get(itemId);
        if (!itemToRemove) return;

        (itemToRemove.dependencies || []).forEach(parentId => {
            const parent = allItems.get(parentId);
            if (parent && parent.dependents) { parent.dependents = parent.dependents.filter(id => id !== itemId); }
        });
        itemToRemove.dependencies = [];

        (itemToRemove.dependents || []).forEach(dependentId => {
            const dependent = allItems.get(dependentId);
            if(dependent && dependent.dependencies) { dependent.dependencies = dependent.dependencies.filter(id => id !== itemId); }
        });
        itemToRemove.dependents = [];
    },
    
    deleteProject(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.phases.forEach(ph => { this.removeAllDependencies(ph.id); ph.tasks.forEach(t => { this.removeAllDependencies(t.id); if(t.subtasks) t.subtasks.forEach(st => this.removeAllDependencies(st.id)); }); });
            this.pendingDeletion = { type: 'project', logContext: { projectId }, deleteFn: () => { this.projects = this.projects.filter(p => p.id !== projectId); }, itemName: `Project '${project.name}'` };
            this.elements.reasonModalTitle.textContent = 'Reason for Deletion';
            this.elements.reasonModalDetails.textContent = `You are about to delete the project: "${project.name}".`;
            this.elements.reasonModal.classList.remove('hidden');
            this.elements.reasonCommentTextarea.focus();
        }
    },

    deletePhase(projectId, phaseId) {
        const project = this.projects.find(p => p.id === projectId);
        const phase = project?.phases.find(ph => ph.id === phaseId);
        if (phase) {
            this.removeAllDependencies(phaseId);
            phase.tasks.forEach(t => { this.removeAllDependencies(t.id); if(t.subtasks) t.subtasks.forEach(st => this.removeAllDependencies(st.id)); });
            this.pendingDeletion = { type: 'phase', logContext: { projectId }, deleteFn: () => { project.phases = project.phases.filter(ph => ph.id !== phaseId); }, itemName: `Phase '${phase.name}' from project '${project.name}'` };
            this.elements.reasonModalTitle.textContent = 'Reason for Deletion';
            this.elements.reasonModalDetails.textContent = `You are about to delete the phase: "${phase.name}".`;
            this.elements.reasonModal.classList.remove('hidden');
            this.elements.reasonCommentTextarea.focus();
        }
    },

    deleteTask(projectId, phaseId, taskId) {
        const project = this.projects.find(p => p.id === projectId);
        const phase = project?.phases.find(ph => ph.id === phaseId);
        const task = phase?.tasks.find(t => t.id === taskId);
        if (task) {
            this.removeAllDependencies(taskId);
            if(task.subtasks) task.subtasks.forEach(st => this.removeAllDependencies(st.id));
            this.pendingDeletion = { type: 'task', logContext: { projectId }, deleteFn: () => { phase.tasks = phase.tasks.filter(t => t.id !== taskId); }, itemName: `Task '${task.name}' from phase '${phase.name}'` };
            this.elements.reasonModalTitle.textContent = 'Reason for Deletion';
            this.elements.reasonModalDetails.textContent = `You are about to delete the task: "${task.name}".`;
            this.elements.reasonModal.classList.remove('hidden');
            this.elements.reasonCommentTextarea.focus();
        }
    },

    deleteSubtask(projectId, phaseId, taskId, subtaskId) {
        const project = this.projects.find(p => p.id === projectId);
        const task = project?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
        const subtask = task?.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
            this.removeAllDependencies(subtaskId);
            this.pendingDeletion = { type: 'subtask', logContext: { projectId }, deleteFn: () => { task.subtasks = task.subtasks.filter(st => st.id !== subtaskId); }, itemName: `Subtask '${subtask.name}' from task '${task.name}'` };
            this.elements.reasonModalTitle.textContent = 'Reason for Deletion';
            this.elements.reasonModalDetails.textContent = `You are about to delete the subtask: "${subtask.name}".`;
            this.elements.reasonModal.classList.remove('hidden');
            this.elements.reasonCommentTextarea.focus();
        }
    },
    
    toggleProjectCollapse(projectId) {
        const p = this.projects.find(p => p.id === projectId);
        if (p) {
            p.collapsed = !p.collapsed;
            this.saveState();
            document.getElementById(`project-body-${projectId}`).classList.toggle('hidden');
            document.getElementById(`chevron-${projectId}`).classList.toggle('-rotate-90');
            if (!p.collapsed && p.startDate && p.endDate) this.drawChart(p);
        }
    },

    toggleTaskCollapse(projectId, phaseId, taskId) {
        const task = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
        if (task) {
            task.collapsed = task.collapsed === undefined ? false : !task.collapsed;
            this.saveState();
            document.getElementById(`subtasks-container-${taskId}`).classList.toggle('hidden');
            document.getElementById(`task-chevron-${taskId}`).classList.toggle('-rotate-90');
        }
    },

    showMainTab(tabName, save = true) {
        if (save) {
            this.activeTab = tabName;
            localStorage.setItem('timelineActiveTab', tabName);
        }
        this.updateTabIndicator();

        ['projects', 'list', 'overall-load', 'upcoming'].forEach(name => {
            const panel = document.getElementById(`main-tab-panel-${name}`);
            const btn = document.getElementById(`main-tab-btn-${name}`);
            if (panel) panel.classList.add('hidden');
            if (btn) btn.classList.remove('active');
        });

        const activePanel = document.getElementById(`main-tab-panel-${tabName}`);
        const activeBtn = document.getElementById(`main-tab-btn-${tabName}`);
        if (activePanel) activePanel.classList.remove('hidden');
        if (activeBtn) activeBtn.classList.add('active');
        
        this.updateTabIndicator();
        
        // Conditional rendering based on the new active tab
        if (tabName === 'projects') {
            // Re-draw charts whenever the projects tab becomes visible to ensure they render
            this.projects.forEach(project => {
                if (!project.collapsed && project.startDate && project.endDate) {
                    this.drawChart(project);
                }
            });
        } else if (tabName === 'overall-load') {
            this.drawOverallLoadChart();
        } else if (tabName === 'upcoming') {
            this.renderUpcomingTasks();
        } else if (tabName === 'list') {
            punchListApp.init();
        }
    },


    toggleLog(projectId) { document.getElementById(`log-container-${projectId}`).classList.toggle('hidden'); document.getElementById(`log-chevron-${projectId}`).classList.toggle('-rotate-90'); },
    togglePhaseCollapse(projectId, phaseId) { const phase = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId); if (phase) { phase.collapsed = !phase.collapsed; this.saveState(); document.getElementById(`tasks-container-${phaseId}`).classList.toggle('hidden'); document.getElementById(`phase-chevron-${phaseId}`).classList.toggle('-rotate-90'); } },

    toggleDeletedLog() {
        this.deletedLogCollapsed = !this.deletedLogCollapsed;
        this.renderDeletedProjectsLog();
    },

    applyTheme() { 
        const savedTheme = localStorage.getItem('timeline-theme-name') || 'default';
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedMode = localStorage.getItem('timeline-theme-mode');
        
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.elements.themeSelect.value = savedTheme;

        if (savedMode === 'dark' || (savedMode === null && prefersDark)) {
            this.setDarkMode(true);
        } else {
            this.setDarkMode(false);
        }
        this.renderProjects();
    },

    setDarkMode(isDark) {
        if (isDark) {
            document.documentElement.classList.add('dark');
            this.elements.lightIcon.classList.remove('hidden');
            this.elements.darkIcon.classList.add('hidden');
            localStorage.setItem('timeline-theme-mode', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            this.elements.darkIcon.classList.remove('hidden');
            this.elements.lightIcon.classList.add('hidden');
            localStorage.setItem('timeline-theme-mode', 'light');
        }
        this.renderProjects(); // Re-render to apply theme to charts
    },
    
    initializeSharedDatePicker() {
        const dummy = document.createElement('input'); dummy.style.display = 'none'; document.body.appendChild(dummy);
        this.sharedPicker = flatpickr(dummy, {
            dateFormat: "Y-m-d", 
            onOpen: () => this.elements.datepickerBackdrop.classList.remove('hidden'), 
            onClose: () => this.elements.datepickerBackdrop.classList.add('hidden'),
            onChange: (selectedDates, dateStr, instance) => {
                if (!this.currentPickerContext) return;
                const newDate = instance.formatDate(selectedDates[0], "Y-m-d"), { type, oldDate, element } = this.currentPickerContext;
                if (type.startsWith('new-project')) { element.value = this.formatDate(this.parseDate(newDate)); element.dataset.date = newDate; instance.close(); return; }
                if (oldDate && oldDate !== newDate) {
                    this.pendingDateChange = { context: this.currentPickerContext, newDate };
                    this.elements.reasonModalTitle.textContent = 'Reason for Date Change';
                    this.elements.reasonModalDetails.textContent = `Changing date from ${this.formatDate(this.parseDate(oldDate))} to ${this.formatDate(this.parseDate(newDate))}.`;
                    this.elements.reasonModal.classList.remove('hidden');
                    this.elements.reasonCommentTextarea.focus();
                    instance.close();
                }
                else if (!oldDate) { this.updateDate(this.currentPickerContext, newDate); instance.close(); } else { instance.close(); }
            },
            onReady: [function() { const button = document.createElement("button"); button.className = "flatpickr-today-button"; button.textContent = "Today"; button.addEventListener("click", (e) => { this.setDate(new Date(), true); e.preventDefault(); }); this.calendarContainer.appendChild(button); }]
        });
        document.body.removeChild(dummy);
    },

    handleDateTrigger(trigger) {
        if (!trigger) return;
        const { projectId, phaseId, taskId, subtaskId, type } = trigger.dataset;
        this.currentPickerContext = { type, projectId: parseInt(projectId), phaseId: parseInt(phaseId), taskId: parseInt(taskId), subtaskId: parseInt(subtaskId), element: trigger, oldDate: trigger.dataset.date || null };
        let defaultDate = trigger.dataset.date || new Date();
        if (type && type.endsWith('-end')) {
            let startDate;
            if (subtaskId) startDate = this.projects.find(p=>p.id===parseInt(projectId))?.phases.find(p=>p.id===parseInt(phaseId))?.tasks.find(t=>t.id===parseInt(taskId))?.subtasks.find(s=>s.id===parseInt(subtaskId))?.startDate;
            else if (taskId) startDate = this.projects.find(p=>p.id===parseInt(projectId))?.phases.find(p=>p.id===parseInt(phaseId))?.tasks.find(t=>t.id===parseInt(taskId))?.startDate;
            else if (projectId) startDate = this.projects.find(p=>p.id===parseInt(projectId))?.startDate;
            if (startDate) defaultDate = startDate;
        }
        this.sharedPicker.set('defaultDate', defaultDate); this.sharedPicker.open();
    },

    handleSaveReason() {
        const comment = this.elements.reasonCommentTextarea.value.trim();
        if (!comment) {
            this.elements.reasonCommentTextarea.classList.add('border-red-500', 'ring-red-500');
            setTimeout(() => this.elements.reasonCommentTextarea.classList.remove('border-red-500', 'ring-red-500'), 2000);
            return;
        }

        if (this.pendingDateChange) {
            this.updateDate(this.pendingDateChange.context, this.pendingDateChange.newDate, comment);
        } else if (this.pendingDeletion) {
            const { type, logContext, deleteFn, itemName } = this.pendingDeletion;

            if (type === 'project') {
                 this.deletedProjectLogs.push({ timestamp: new Date().toISOString(), item: itemName, type: 'deletion', comment: comment });
            } else {
                const project = this.projects.find(p => p.id === logContext.projectId);
                if (project) {
                    if (!project.logs) project.logs = [];
                    project.logs.push({ timestamp: new Date().toISOString(), item: itemName, type: 'deletion', comment: comment });
                }
            }
            deleteFn();
            this.saveState();
            this.renderProjects();
        }

        this.elements.reasonModal.classList.add('hidden');
        this.elements.reasonCommentTextarea.value = '';
        this.pendingDateChange = null;
        this.pendingDeletion = null;
    },

    handleCancelReason() {
        this.elements.reasonModal.classList.add('hidden');
        this.elements.reasonCommentTextarea.value = '';
        this.renderProjects();
        this.pendingDateChange = null;
        this.pendingDeletion = null;
    },

    handleCircleClick(itemId) {
        const allItems = new Map();
        this.projects.forEach(p => p.phases.forEach(ph => { allItems.set(ph.id, ph); ph.tasks.forEach(t => { allItems.set(t.id, t); if(t.subtasks) t.subtasks.forEach(st => allItems.set(st.id, st)); }); }));
        const item = allItems.get(itemId);
        if (item.dependencies && item.dependencies.length > 0) {
            this.pendingClearDependencies = itemId;
            this.elements.confirmModalText.textContent = 'Do you want to clear the parents for this item?';
            this.elements.confirmModal.classList.remove('hidden');
        }
    },
    
    clearDependencies(itemId) {
        const allItems = new Map();
        this.projects.forEach(p => p.phases.forEach(ph => { allItems.set(ph.id, ph); ph.tasks.forEach(t => { allItems.set(t.id, t); if(t.subtasks) t.subtasks.forEach(st => allItems.set(st.id, st)); }); }));
        const itemToClear = allItems.get(itemId);
        if (!itemToClear || !itemToClear.dependencies) return;
        itemToClear.dependencies.forEach(parentId => {
            const parent = allItems.get(parentId);
            if (parent && parent.dependents) {
                parent.dependents = parent.dependents.filter(id => id !== itemId);
            }
        });
        itemToClear.dependencies = [];
        itemToClear.isDriven = false;
        this.saveState();
        this.renderProjects();
    },

    startDependencyMode(itemId) {
        const allItems = new Map();
        this.projects.forEach(p => p.phases.forEach(ph => { allItems.set(ph.id, ph); ph.tasks.forEach(t => { allItems.set(t.id, t); if(t.subtasks) t.subtasks.forEach(st => allItems.set(st.id, st)); }); }));
        this.firstSelectedItem = allItems.get(itemId);
        this.dependencyMode = true;
        this.elements.dependencyBanner.classList.remove('hidden');
        this.renderProjects();
    },
    
    handleDependencyClick(target) {
         if (!this.dependencyMode || !this.firstSelectedItem) return;
        const itemId = parseInt(target.dataset.id);
        if (this.firstSelectedItem.id === itemId) return;
        const allItems = new Map();
        this.projects.forEach(p => p.phases.forEach(ph => { allItems.set(ph.id, ph); ph.tasks.forEach(t => { allItems.set(t.id, t); if(t.subtasks) t.subtasks.forEach(st => allItems.set(st.id, st)); }); }));
        const secondItem = allItems.get(itemId), firstItem = this.firstSelectedItem;

        let current = secondItem, visited = new Set();
        while(current) {
            if (current.id === firstItem.id) {
                alert("Cannot create a circular dependency.");
                this.dependencyMode = false; this.firstSelectedItem = null; this.elements.dependencyBanner.classList.add('hidden'); this.renderProjects(); return;
            }
            if (!current.dependencies || current.dependencies.length === 0 || visited.has(current.id)) break;
            visited.add(current.id);
            current = allItems.get(current.dependencies[0]);
        }

        if (secondItem.dependencies && secondItem.dependencies.length > 0) {
            const oldParentId = secondItem.dependencies[0];
            const oldParent = allItems.get(oldParentId);
            if (oldParent && oldParent.dependents) {
                oldParent.dependents = oldParent.dependents.filter(dependentId => dependentId !== secondItem.id);
            }
        }

        secondItem.dependencies = [firstItem.id];
        if (!firstItem.dependents) firstItem.dependents = [];
        if (!firstItem.dependents.includes(secondItem.id)) firstItem.dependents.push(secondItem.id);
        
        this.dependencyMode = false; this.firstSelectedItem = null; this.elements.dependencyBanner.classList.add('hidden');
        this.saveState(); this.renderProjects();
    },

    // --- TAB MANAGEMENT ---
    loadTabData() {
        const savedTab = localStorage.getItem('timelineActiveTab');
        if (savedTab) this.activeTab = savedTab;

        const savedOrder = localStorage.getItem('timelineTabOrder');
        if (savedOrder) {
            try {
                const parsedOrder = JSON.parse(savedOrder);
                // Basic validation
                if(Array.isArray(parsedOrder) && parsedOrder.length === this.tabOrder.length && parsedOrder.every(t => this.tabOrder.includes(t))) {
                    this.tabOrder = parsedOrder;
                }
            } catch(e) { console.error("Could not parse tab order", e); }
        }
    },
    
    renderTabs() {
        this.elements.mainTabs.innerHTML = '';
        const glider = document.createElement('div');
        glider.className = 'glider';
        this.elements.mainTabs.appendChild(glider);

        const tabNames = {
            projects: 'Projects',
            list: 'List',
            'overall-load': 'Task Load',
            upcoming: 'Upcoming'
        };
        this.tabOrder.forEach(tabKey => {
            const button = document.createElement('button');
            button.id = `main-tab-btn-${tabKey}`;
            button.className = 'tab-button';
            button.textContent = tabNames[tabKey];
            button.dataset.tabName = tabKey;
            button.setAttribute('draggable', true);
            button.onclick = () => this.showMainTab(tabKey);
            this.elements.mainTabs.appendChild(button);
        });
        this.showMainTab(this.activeTab, false);
    },

    updateTabIndicator() {
        setTimeout(() => {
            const container = this.elements.mainTabs;
            if (!container) return;
            const activeTab = container.querySelector('.tab-button.active');
            const glider = container.querySelector('.glider');
            if (!glider || !activeTab) return;

            glider.style.width = `${activeTab.offsetWidth}px`;
            glider.style.left = `${activeTab.offsetLeft}px`;
        }, 50); // Small delay to ensure layout is calculated
    },

    addDragAndDropListeners() {
        const tabsContainer = this.elements.mainTabs;
        let draggedItem = null;

        tabsContainer.addEventListener('dragstart', (e) => {
            draggedItem = e.target;
            setTimeout(() => {
                e.target.classList.add('dragging');
            }, 0);
        });

        tabsContainer.addEventListener('dragend', (e) => {
            draggedItem?.classList.remove('dragging');
            draggedItem = null;
            document.querySelectorAll('.drag-over-left, .drag-over-right').forEach(el => {
                el.classList.remove('drag-over-left', 'drag-over-right');
            });
        });

        tabsContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(tabsContainer, e.clientX);
            document.querySelectorAll('.drag-over-left, .drag-over-right').forEach(el => {
                el.classList.remove('drag-over-left', 'drag-over-right');
            });

            if (afterElement == null) {
                // Find the last tab-button, not the glider
                const lastChild = tabsContainer.querySelector('.tab-button:last-of-type');
                if(lastChild) lastChild.classList.add('drag-over-right');
            } else {
                afterElement.classList.add('drag-over-left');
            }
        });

        tabsContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            if(!draggedItem) return;
            
            const afterElement = this.getDragAfterElement(tabsContainer, e.clientX);
            const draggedTab = draggedItem.dataset.tabName;
            const newOrder = [...this.tabOrder];
            newOrder.splice(newOrder.indexOf(draggedTab), 1);

            if (afterElement == null) {
                newOrder.push(draggedTab);
            } else {
                const referenceTab = afterElement.dataset.tabName;
                const index = newOrder.indexOf(referenceTab);
                newOrder.splice(index, 0, draggedTab);
            }

            this.tabOrder = newOrder;
            localStorage.setItem('timelineTabOrder', JSON.stringify(this.tabOrder));
            this.renderTabs();
            this.showMainTab(this.activeTab, false);
        });
    },

    getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.tab-button:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    },

    toggleShortcutsModal() {
        this.elements.shortcutsModal.classList.toggle('hidden');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    timelineApp.init();
    // Global keydown listener for punch list logic when its tab is active
    document.addEventListener('keydown', (e) => {
        const listPanel = document.getElementById('main-tab-panel-list');
        if (listPanel && !listPanel.classList.contains('hidden')) {
            punchListApp.handleKeyboard(e);
        }
    });
});

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
    pendingLockChange: null,
    dependencyMode: false,
    firstSelectedItem: null,
    pendingClearDependencies: null,
    deletedLogCollapsed: true,
    taskLoadChartColor: d3.scaleOrdinal(d3.schemeTableau10),
    activeTab: 'projects',
    tabOrder: ['projects', 'list', 'overall-load', 'upcoming'],
    resizeTimeout: null,
    upcomingProjectFilter: 'all',

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
            importFileInput: document.getElementById('import-file-input'),
            datepickerBackdrop: document.getElementById('datepicker-backdrop'),
            reasonModal: document.getElementById('reason-modal'),
            reasonModalTitle: document.getElementById('reason-modal-title'),
            reasonModalDetails: document.getElementById('reason-modal-details'),
            reasonCommentTextarea: document.getElementById('reason-comment'),
            logChangeCheckbox: document.getElementById('log-change-checkbox'), // ADD THIS LINE
            saveReasonBtn: document.getElementById('save-reason-btn'),
            cancelReasonBtn: document.getElementById('cancel-reason-btn'),
            dependencyBanner: document.getElementById('dependency-banner'),
            dependencyTooltip: document.getElementById('dependency-tooltip'),
            confirmModal: document.getElementById('confirm-modal'),
            confirmModalTitle: document.getElementById('confirm-modal-title'),
            confirmModalText: document.getElementById('confirm-modal-text'),
            cancelConfirmBtn: document.getElementById('cancel-confirm-btn'),
            confirmActionBtn: document.getElementById('confirm-action-btn'),
            undoBtn: document.getElementById('undo-btn'),
            redoBtn: document.getElementById('redo-btn'),
            toggleDeletedLogBtn: document.getElementById('toggle-deleted-log-btn'),
            mainTabs: document.getElementById('main-tabs'),
            shortcutsBtn: document.getElementById('shortcuts-btn'),
            shortcutsModal: document.getElementById('shortcuts-modal'),
            shortcutsModalBackdrop: document.getElementById('shortcuts-modal-backdrop'),
            closeShortcutsBtn: document.getElementById('close-shortcuts-btn'),
            upcomingProjectFilter: document.getElementById('upcoming-project-filter')
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
            // Standard JSON export
            const punchListData = JSON.parse(localStorage.getItem(punchListApp.STORAGE_KEY) || '[]');
            const dataToExport = {
                projects: this.projects,
                punchList: punchListData
            };
            const a = document.createElement('a');
            a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2));
            a.download = "timeline-data.json";
            document.body.appendChild(a);
            a.click();
            a.remove();

            // Monday.com CSV export
            this.exportToMondayCsv();
        });

        this.elements.importBtn.addEventListener('click', () => this.elements.importFileInput.click());
        this.elements.importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (importedData.projects && Array.isArray(importedData.projects)) {
                        this.projects = importedData.projects;
                        this.saveState();
                        this.renderProjects();
                    }
                    if (importedData.punchList && Array.isArray(importedData.punchList)) {
                        localStorage.setItem(punchListApp.STORAGE_KEY, JSON.stringify(importedData.punchList));
                        if (this.activeTab === 'list') {
                            punchListApp.loadList();
                        }
                    }
                } catch (err) { console.error(err); }
            };
            reader.readAsText(file); e.target.value = null;
        });
        
        // REMOVED old pdfBtn event listener
        
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
        
        this.elements.upcomingProjectFilter.addEventListener('change', (e) => {
            this.upcomingProjectFilter = e.target.value;
            this.renderUpcomingTasks();
        });

        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => this.handleResize(), 150);
        });

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

    exportToMondayCsv() {
        const headers = [
            "Item Name",
            "Start Date",
            "End Date",
            "Status"
        ];

        const rows = [];

        this.projects.forEach(project => {
            project.phases.forEach(phase => {
                phase.tasks.forEach(task => {
                    const hasSubtasks = task.subtasks && task.subtasks.length > 0;

                    if (hasSubtasks) {
                        // If there are subtasks, only export the subtasks
                        task.subtasks.forEach(subtask => {
                            const subtaskStatus = subtask.completed ? "Done" : "Working on it";
                            const subtaskRow = [
                                `${project.name} > ${phase.name} > ${task.name} > ${subtask.name}`,
                                subtask.startDate || "",
                                subtask.endDate || "",
                                subtaskStatus
                            ];
                            rows.push(subtaskRow);
                        });
                    } else {
                        // If there are no subtasks, export the task itself
                        const taskStatus = task.completed ? "Done" : "Working on it";
                        const taskRow = [
                            `${project.name} > ${phase.name} > ${task.name}`,
                            task.effectiveStartDate || "",
                            task.effectiveEndDate || "",
                            taskStatus
                        ];
                        rows.push(taskRow);
                    }
                });
            });
        });

        // Helper function to escape CSV data
        const escapeCsv = (str) => {
            if (str === null || str === undefined) return '';
            const text = String(str);
            if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        };
        
        // Convert rows to CSV format
        let csvContent = headers.map(escapeCsv).join(",") + "\n";
        rows.forEach(row => {
            csvContent += row.map(escapeCsv).join(",") + "\n";
        });

        // Create a blob and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = "timeline-export-for-monday.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    handleResize() {
        this.updateTabIndicator();
        if (this.activeTab === 'projects') {
            this.projects.forEach(project => {
                if (!project.collapsed && project.startDate && project.endDate) {
                    this.drawChart(project);
                }
            });
        } else if (this.activeTab === 'overall-load') {
            this.drawOverallLoadChart();
        }

        if (this.elements.fullscreenModal.style.display === 'flex') {
            const projectId = parseInt(document.getElementById('fullscreen-project-title').dataset.projectId);
            const project = this.projects.find(p => p.id === projectId);
            if(project) this.drawFullscreenChart(project);
        }
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
            if (project.locked === undefined) project.locked = false;
            if (!project.phases) project.phases = [];
            if (project.zoomDomain === undefined) project.zoomDomain = null;
            project.phases.forEach(phase => {
                if(phase.collapsed === undefined) phase.collapsed = false;
                if (phase.locked === undefined) phase.locked = false;
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

    countWeekdays(startDate, endDate) {
        let count = 0;
        const curDate = new Date(startDate.getTime());
        while (curDate <= endDate) {
            const dayOfWeek = curDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                count++;
            }
            curDate.setDate(curDate.getDate() + 1);
        }
        return count;
    },

    getDaysLeft(endDateStr) {
        if (!endDateStr) return { text: '-', tooltip: 'No end date', isOverdue: false, days: null, className: '' };
        const end = this.parseDate(endDateStr);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (end < now) {
            const daysOverdue = this.countWeekdays(end, now);
            return { text: `${daysOverdue}`, tooltip: `${daysOverdue} weekdays overdue`, isOverdue: true, days: -daysOverdue, className: 'days-left-pill-overdue' };
        } else if (end.getTime() === now.getTime()) {
             return { text: '0', tooltip: 'Due today', isOverdue: false, days: 0, className: 'days-left-pill-due-today' };
        } else {
            const daysLeft = this.countWeekdays(now, end);
            return { text: `${daysLeft}`, tooltip: `${daysLeft} weekdays left`, isOverdue: false, days: daysLeft, className: '' };
        }
    },


    getScopedPlannedProgress(date, scopePathData, project) {
        if (!scopePathData || scopePathData.length < 2) {
            // Fallback to linear project dates if no valid scope phases exist
            if (!project || !project.startDate || !project.endDate) return 0;
            const projectStartDate = this.parseDate(project.startDate);
            const projectEndDate = this.parseDate(project.endDate);
            if (!projectStartDate || !projectEndDate) return 0;
            const totalDuration = projectEndDate.getTime() - projectStartDate.getTime();
            if (totalDuration <= 0) return (date >= projectEndDate) ? 100 : 0;
            const elapsed = Math.max(0, date.getTime() - projectStartDate.getTime());
            return Math.min(100, (elapsed / totalDuration) * 100);
        }

        const targetTime = date.getTime();
        const firstPoint = scopePathData[0];
        const lastPoint = scopePathData[scopePathData.length - 1];

        if (targetTime <= firstPoint.date.getTime()) return 0;
        if (targetTime >= lastPoint.date.getTime()) return 100;

        let p1 = firstPoint, p2 = lastPoint;
        for (let i = 0; i < scopePathData.length - 1; i++) {
            if (targetTime >= scopePathData[i].date.getTime() && targetTime <= scopePathData[i + 1].date.getTime()) {
                p1 = scopePathData[i];
                p2 = scopePathData[i + 1];
                break;
            }
        }

        const segmentDuration = p2.date.getTime() - p1.date.getTime();
        if (segmentDuration === 0) return p1.progress;

        const timeIntoSegment = targetTime - p1.date.getTime();
        const progressInSegment = p2.progress - p1.progress;

        const plannedProgress = p1.progress + (progressInSegment * (timeIntoSegment / segmentDuration));
        return plannedProgress;
    },

    getPlannedDateForProgress(progress, scopePathData, project) {
        if (progress <= 0) {
            return this.parseDate(project.startDate);
        }
        if (progress >= 100) {
            return this.parseDate(project.endDate);
        }
    
        // Fallback for simple projects without detailed phases
        if (!scopePathData || scopePathData.length < 2) {
            const projectStartDate = this.parseDate(project.startDate);
            const projectEndDate = this.parseDate(project.endDate);
            if (!projectStartDate || !projectEndDate) return new Date(); // Should not happen
            const totalDuration = projectEndDate.getTime() - projectStartDate.getTime();
            const timeOffset = totalDuration * (progress / 100);
            return new Date(projectStartDate.getTime() + timeOffset);
        }
    
        const firstPoint = scopePathData[0];
        const lastPoint = scopePathData[scopePathData.length - 1];
    
        if (progress <= firstPoint.progress) return firstPoint.date;
        if (progress >= lastPoint.progress) return lastPoint.date;
    
        let p1 = firstPoint, p2 = lastPoint;
        for (let i = 0; i < scopePathData.length - 1; i++) {
            if (progress >= scopePathData[i].progress && progress <= scopePathData[i + 1].progress) {
                p1 = scopePathData[i];
                p2 = scopePathData[i + 1];
                break;
            }
        }
    
        const progressInSegment = p2.progress - p1.progress;
        if (progressInSegment === 0) return p1.date;
    
        const progressRatio = (progress - p1.progress) / progressInSegment;
        const segmentDuration = p2.date.getTime() - p1.date.getTime();
        const timeOffset = segmentDuration * progressRatio;
    
        return new Date(p1.date.getTime() + timeOffset);
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

                const tasksStartDate = this.getBoundaryDate(phase.tasks, 'earliest');
                const tasksEndDate = this.getBoundaryDate(phase.tasks, 'latest');

                // Combine the phase's own dates with the calculated task boundaries
                const allStartDates = [tasksStartDate, phase.startDate].filter(Boolean).map(d => this.parseDate(d));
                const allEndDates = [tasksEndDate, phase.endDate].filter(Boolean).map(d => this.parseDate(d));

                phase.effectiveStartDate = allStartDates.length > 0
                    ? new Date(Math.min.apply(null, allStartDates)).toISOString().split('T')[0]
                    : null;

                phase.effectiveEndDate = allEndDates.length > 0
                    ? new Date(Math.max.apply(null, allEndDates)).toISOString().split('T')[0]
                    : null;

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
                if (item.dependencies && item.dependencies.length > 0 && !item.locked) {
                    const parentId = item.dependencies[0];
                    const parent = allItems.get(parentId);

                    if (parent) {
                        const parentEndDateValue = parent.effectiveEndDate || parent.endDate;
                        if (parentEndDateValue) {
                            const parentEndDate = this.parseDate(parentEndDateValue);
                            const newStartDate = new Date(parentEndDate);

                            // Maintain duration
                            const oldStartDate = item.startDate ? this.parseDate(item.startDate) : null;
                            const oldEndDate = item.endDate ? this.parseDate(item.endDate) : null;
                            let duration = null;
                            if (oldStartDate && oldEndDate) {
                                duration = oldEndDate.getTime() - oldStartDate.getTime();
                            }

                            item.startDate = newStartDate.toISOString().split('T')[0];

                            if (duration !== null) {
                                const newEndDate = new Date(newStartDate.getTime() + duration);
                                item.endDate = newEndDate.toISOString().split('T')[0];
                            }

                            item.isDriven = true;
                            item.driverName = parent.name;
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

            const durationProgress = this.getDurationProgress(project.startDate, project.endDate);
            const daysLeftInfo = this.getDaysLeft(project.endDate);
            const overallProgress = Math.round(project.overallProgress);

            let progressColor = 'var(--green)';
            let tooltipText = '';

            const isBehind = overallProgress < durationProgress && !daysLeftInfo.isOverdue;

            if (project.overallProgress >= 100) {
                 progressColor = 'var(--green)';
                 tooltipText = `<b>Status: Complete</b><br>Finished with ${daysLeftInfo.days !== null ? Math.abs(daysLeftInfo.days) : '0'} weekdays to spare.`;
            } else if (daysLeftInfo.isOverdue) {
                progressColor = 'var(--red)';
                tooltipText = `<b>Status: Overdue</b><br>The deadline has passed, and only ${overallProgress}% of work is complete.`;
            } else if (isBehind) {
                progressColor = 'var(--amber)';
                 tooltipText = `<b>Status: Behind</b><br>Only ${overallProgress}% of work is complete, but ${Math.round(durationProgress)}% of time has passed.`;
            } else if (overallProgress > durationProgress) {
                progressColor = 'var(--green)';
                tooltipText = `<b>Status: Ahead</b><br>${overallProgress}% of work is complete in only ${Math.round(durationProgress)}% of the allotted time.`;
            } else { // on track
                progressColor = 'var(--blue)';
                 tooltipText = `<b>Status: On Track</b><br>${overallProgress}% of work is complete in ${Math.round(durationProgress)}% of the allotted time.`;
            }

            const pacingBarHTML = `
                <div class="duration-scale-container tooltip">
                    <span class="tooltip-text">${tooltipText}</span>
                    <div class="relative h-2 w-full rounded-full" style="background-color: var(--bg-tertiary);">
                        <div class="absolute h-2 top-0 left-0 rounded-full" style="background-color: var(--bg-tertiary); width: ${durationProgress}%; z-index: 1;"></div>
                        <div class="absolute h-2 top-0 left-0 rounded-full" style="background-color: ${progressColor}; width: ${overallProgress}%; z-index: 2;"></div>
                    </div>
                </div>
            `;

            const daysLeftPillHTML = `
                <div class="days-left-pill ${daysLeftInfo.className}" title="${daysLeftInfo.tooltip}">
                    ${daysLeftInfo.text}
                </div>
            `;

            const lockIcon = project.locked
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/></svg>`;
            
            const commentDot = project.comments && project.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';

            projectCard.innerHTML = `
                <div class="flex justify-between items-center mb-3 project-header">
                    <div class="flex items-center gap-2 flex-grow min-w-0">
                        ${completionIcon}
                        <button onclick="timelineApp.toggleProjectCollapse(${project.id})" class="p-1 rounded-full hover-bg-secondary flex-shrink-0">
                            <svg id="chevron-${project.id}" class="w-5 h-5 text-tertiary chevron ${project.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </button>
                        ${commentDot}
                        <h3 class="text-xl font-bold truncate editable-text" onclick="timelineApp.makeEditable(this, 'updateProjectName', ${project.id})">${project.name}</h3>
                        ${pacingBarHTML}
                        ${daysLeftPillHTML}
                    </div>
                    <div class="flex items-center gap-2 text-sm text-secondary flex-shrink-0">
                        <button onclick="timelineApp.generatePrintView(${project.id})" class="print-btn" title="Print Project">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd" /></svg>
                        </button>
                        <button onclick="timelineApp.toggleCommentSection('project', ${project.id})" class="comment-btn" title="Comments">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                        </button>
                        <button onclick="timelineApp.toggleProjectLock(${project.id})" class="lock-toggle-btn" title="${project.locked ? 'Unlock Project Dates' : 'Lock Project Dates'}">
                            ${lockIcon}
                        </button>
                        <div class="date-input-container">
                            <input type="text" value="${project.startDate ? this.formatDate(this.parseDate(project.startDate)) : ''}" placeholder="Start Date" class="date-input" data-project-id="${project.id}" data-type="project-start" data-date="${project.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)" ${project.locked ? 'disabled' : ''}>
                            <div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                        </div>
                        <div class="date-input-container">
                            <input type="text" value="${project.endDate ? this.formatDate(this.parseDate(project.endDate)) : ''}" placeholder="End Date" class="date-input" data-project-id="${project.id}" data-type="project-end" data-date="${project.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)" ${project.locked ? 'disabled' : ''}>
                            <div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                        </div>
                    </div>
                    <button onclick="timelineApp.deleteProject(${project.id})" class="text-gray-400 hover:text-red-500 transition-colors text-xl font-bold ml-4 flex-shrink-0">&times;</button>
                </div>
                 <div id="project-body-${project.id}" class="${project.collapsed ? 'hidden' : ''}">
                    <div id="comment-section-project-${project.id}" class="comment-section hidden"></div>
                    <div class="relative">
                        <button onclick="timelineApp.resetZoom(${project.id})" class="reset-zoom-btn btn-secondary px-2 py-1 text-xs font-semibold rounded-md ${!project.zoomDomain ? 'hidden' : ''}">Reset Zoom</button>
                        <div id="chart-${project.id}" class="w-full h-48 mb-3 relative"></div>
                    </div>
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
        const sortedPhases = [...project.phases].sort((a, b) => this.sortByEndDate(a, b, 'endDate'));

        sortedPhases.forEach((phase, index) => {
            const hasTasks = phase.tasks && phase.tasks.length > 0;
            const toggleButton = hasTasks ?
                `<button onclick="timelineApp.togglePhaseCollapse(${project.id}, ${phase.id})" class="p-1 rounded-full hover-bg-tertiary flex-shrink-0">
                    <svg id="phase-chevron-${phase.id}" class="w-4 h-4 text-tertiary chevron ${phase.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>` : `<div class="w-6 h-6 flex-shrink-0"></div>`;

            const depClass = this.dependencyMode && this.firstSelectedItem?.id !== phase.id ? 'dependency-candidate' : '';
            const selectedClass = this.firstSelectedItem?.id === phase.id ? 'dependency-selected' : '';
            const commentDot = phase.comments && phase.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';
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
            const iconHtml = `<div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>`;
            const lockIcon = phase.locked
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/></svg>`;

            const isStartDateDrivenByDependency = phase.isDriven;
            const startDateInputClasses = isStartDateDrivenByDependency ? 'date-input-disabled' : '';

            html += `
                <div class="phase-row rounded-lg p-2 ${depClass} ${selectedClass}" data-id="${phase.id}" data-type="phase" data-project-id="${project.id}" onmouseover="timelineApp.highlightPhaseOnChart(${phase.id})" onmouseout="timelineApp.unhighlightPhaseOnChart(${phase.id})">
                    <div class="flex items-center gap-3 item-main-row">
                        ${toggleButton}
                        ${commentDot}
                        <div class="text-xs font-bold text-secondary w-10 text-center flex-shrink-0">${Math.round(phase.progress || 0)}%</div>
                        <div class="duration-scale-container" title="Duration Progress">
                            <div class="duration-scale-bar ${durationBarColorClass}" style="width: ${durationProgress}%;"></div>
                        </div>
                        <span class="font-semibold flex-grow editable-text" onclick="timelineApp.makeEditable(this, 'updatePhaseName', ${project.id}, ${phase.id})">${phase.name}</span>
                        
                        ${this.getDependencyIcon(phase)}

                        <div class="flex items-center gap-2 text-sm text-secondary flex-shrink-0">
                            <button onclick="timelineApp.togglePhaseLock(${project.id}, ${phase.id})" class="lock-toggle-btn" title="${phase.locked ? 'Unlock Phase Dates' : 'Lock Phase Dates'}">
                                ${lockIcon}
                            </button>
                            <button onclick="timelineApp.toggleCommentSection('phase', ${project.id}, ${phase.id})" class="comment-btn" title="Comments">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                            </button>
                            <div class="date-input-container">
                                <input type="text" value="${phase.startDate ? this.formatDate(this.parseDate(phase.startDate)) : ''}" placeholder="Start Date" class="date-input ${startDateInputClasses}" data-project-id="${project.id}" data-phase-id="${phase.id}" data-type="phase-start" data-date="${phase.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)" ${phase.locked || isStartDateDrivenByDependency ? 'disabled' : ''}>
                                ${!isStartDateDrivenByDependency ? iconHtml : ''}
                            </div>
                            <div class="date-input-container">
                                <input type="text" value="${phase.endDate ? this.formatDate(this.parseDate(phase.endDate)) : ''}" placeholder="End Date" class="date-input" data-project-id="${project.id}" data-phase-id="${phase.id}" data-type="phase-end" data-date="${phase.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)" ${phase.locked ? 'disabled' : ''}>
                                ${iconHtml}
                            </div>
                        </div>
                        <button onclick="timelineApp.deletePhase(${project.id}, ${phase.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold">&times;</button>
                    </div>
                    <div id="comment-section-phase-${phase.id}" class="comment-section hidden"></div>
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
            const commentDot = task.comments && task.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';
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

            const isStartDateDrivenByDependency = task.isDriven;
            const isStartDateDisabled = hasSubtasks || isStartDateDrivenByDependency;
            const startDateInputClasses = isStartDateDisabled ? 'date-input-disabled' : '';
            const isEndDateDisabled = hasSubtasks;
            const endDateInputClasses = isEndDateDisabled ? 'date-input-disabled' : '';

            html += `
                <div class="task-row rounded-lg px-2 py-1 ${depClass} ${selectedClass}" data-id="${task.id}" data-type="task" data-project-id="${projectId}" data-phase-id="${phaseId}">
                    <div class="flex items-center gap-3 item-main-row">
                         ${toggleButton}
                        ${commentDot}
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
                            <button onclick="timelineApp.toggleCommentSection('task', ${projectId}, ${phaseId}, ${task.id})" class="comment-btn" title="Comments">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                            </button>
                            <div class="date-input-container">
                                <input type="text" value="${task.effectiveStartDate ? this.formatDate(this.parseDate(task.effectiveStartDate)) : ''}" placeholder="Start" class="date-input ${startDateInputClasses}" ${isStartDateDisabled ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${task.id}" data-type="task-start" data-date="${task.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                                ${!isStartDateDisabled ? iconHtml : ''}
                            </div>
                            <div class="date-input-container">
                                <input type="text" value="${task.effectiveEndDate ? this.formatDate(this.parseDate(task.effectiveEndDate)) : ''}" placeholder="End" class="date-input ${endDateInputClasses}" ${isEndDateDisabled ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${task.id}" data-type="task-end" data-date="${task.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                                ${!isEndDateDisabled ? iconHtml : ''}
                            </div>
                        </div>
                        <button onclick="timelineApp.deleteTask(${projectId}, ${phaseId}, ${task.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold">&times;</button>
                    </div>
                    <div id="comment-section-task-${task.id}" class="comment-section hidden"></div>
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
            const commentDot = subtask.comments && subtask.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';
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
                <div class="subtask-row-wrapper">
                    <div class="flex items-center gap-3 subtask-row ${depClass} ${selectedClass}" data-id="${subtask.id}" data-type="subtask" data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}">
                        ${commentDot}
                        <input type="checkbox" class="custom-checkbox" onchange="timelineApp.toggleSubtaskComplete(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" ${subtask.completed ? 'checked' : ''}>
                        <div class="duration-scale-container" title="Duration Progress">
                            <div class="duration-scale-bar ${durationBarColorClass}" style="width: ${durationProgress}%;"></div>
                        </div>
                        <span class="text-sm flex-grow ${subtask.completed ? 'line-through opacity-60' : ''} editable-text" onclick="timelineApp.makeEditable(this, 'updateSubtaskName', ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})">${subtask.name}</span>
                        ${this.getDependencyIcon(subtask)}
                        <button onclick="timelineApp.toggleCommentSection('subtask', ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="comment-btn" title="Comments">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                        </button>
                        <div class="date-input-container">
                                <input type="text" value="${subtask.startDate ? this.formatDate(this.parseDate(subtask.startDate)) : ''}" placeholder="Start" class="date-input ${dateInputClasses}" ${subtask.isDriven ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}" data-subtask-id="${subtask.id}" data-type="subtask-start" data-date="${subtask.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                                 ${!subtask.isDriven ? iconHtml : ''}
                             </div>
                             <div class="date-input-container">
                                <input type="text" value="${subtask.endDate ? this.formatDate(this.parseDate(subtask.endDate)) : ''}" placeholder="End" class="date-input" data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}" data-subtask-id="${subtask.id}" data-type="subtask-end" data-date="${subtask.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                                ${iconHtml}
                            </div>
                        <button onclick="timelineApp.deleteSubtask(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold w-5 text-center flex-shrink-0">&times;</button>
                    </div>
                    <div id="comment-section-subtask-${subtask.id}" class="comment-section hidden"></div>
                </div>
                `;
        });
        return html + '</div>';
    },

    renderLog(project) {
        if (!project.logs || project.logs.length === 0) return '<p class="text-xs text-secondary">No changes logged.</p>';
        let tableHtml = `<table class="w-full text-xs font-mono"><thead><tr class="border-b border-primary"><th class="text-left p-1 w-1/4">Timestamp</th><th class="text-left p-1 w-1/4">Item</th><th class="text-left p-1">Change</th><th class="text-left p-1">Reason</th></tr></thead><tbody>`;
        [...project.logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(log => {
            const rowClass = log.type === 'unlock' ? 'unlock-log-entry' : '';
            let changeText = '';
            if (log.type === 'deletion') {
                changeText = 'Deleted';
            } else if (log.type === 'lock' || log.type === 'unlock') {
                changeText = log.type.charAt(0).toUpperCase() + log.type.slice(1) + 'ed';
            } else {
                changeText = `${log.from ? this.formatDate(this.parseDate(log.from)) : 'None'} -> ${this.formatDate(this.parseDate(log.to))}`;
            }
            tableHtml += `<tr class="border-b border-secondary ${rowClass}"><td class="p-1 align-top">${this.formatLogTimestamp(new Date(log.timestamp))}</td><td class="p-1 align-top">${log.item}</td><td class="p-1 align-top">${changeText}</td><td class="p-1 align-top">${log.comment}</td></tr>`;
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
    
            let tooltip = d3.select("body").select(".chart-tooltip");
            if (tooltip.empty()) {
                tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
            }
    
            const margin = { top: 10, right: 20, bottom: 20, left: 40 },
                chartWidth = width - margin.left - margin.right,
                height = container.node().getBoundingClientRect().height - margin.top - margin.bottom;
            const svg = container.append("svg").attr("width", chartWidth + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
            const x = d3.scaleTime().range([0, chartWidth]),
                y = d3.scaleLinear().range([height, 0]);
    
            const startDate = project.zoomDomain ? this.parseDate(project.zoomDomain[0]) : this.parseDate(project.startDate);
            const endDate = project.zoomDomain ? this.parseDate(project.zoomDomain[1]) : this.parseDate(project.endDate);
    
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
    
            const scopedPhases = [...project.phases]
                .filter(p => p.startDate && p.endDate)
                .sort((a, b) => this.parseDate(a.startDate) - this.parseDate(b.startDate));
    
            const scopePathData = [];
            if (scopedPhases.length > 0) {
                scopePathData.push({ date: this.parseDate(scopedPhases[0].startDate), progress: 0 });
                scopedPhases.forEach((phase, i) => {
                    const progressPerPhase = 100 / scopedPhases.length;
                    const cumulativeProgress = (i + 1) * progressPerPhase;
                    scopePathData.push({ date: this.parseDate(phase.endDate), progress: cumulativeProgress });
                });
            }
    
            if (scopePathData.length > 1) {
                const scopeLine = d3.line().x(d => x(d.date)).y(d => y(d.progress));
                svg.append("path")
                    .datum(scopePathData)
                    .attr("class", "planned-line")
                    .attr("d", scopeLine)
                    .style("fill", "none");
            } else {
                svg.append("line").attr("class", "planned-line").attr("x1", x(this.parseDate(project.startDate))).attr("y1", y(0)).attr("x2", x(this.parseDate(project.endDate))).attr("y2", y(100));
            }
    
            svg.append("line").attr("class", "finish-line").attr("x1", x(this.parseDate(project.endDate))).attr("y1", 0).attr("x2", x(this.parseDate(project.endDate))).attr("y2", height);
    
            const allTasks = project.phases.flatMap(phase => phase.tasks).filter(task => task.effectiveEndDate);
            const firstActivityDate = this.parseDate(this.getBoundaryDate(allTasks, 'earliest')) || this.parseDate(project.startDate);
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
    
            for (let i = 0; i < pathData.length - 1; i++) {
                const segment = [pathData[i], pathData[i+1]];
                const endPoint = segment[1];
    
                const plannedDateForProgress = this.getPlannedDateForProgress(endPoint.progress, scopePathData, project);
                const actualDate = endPoint.date;
                const isLate = actualDate > plannedDateForProgress || actualDate > this.parseDate(project.endDate);
                const colorClass = isLate ? 'stroke-red-500' : 'stroke-green-500';
    
                svg.append("path").datum(segment).attr("class", `${endPoint.completed ? 'actual-line' : 'projected-line'} ${colorClass}`).attr("d", line);
            }
            svg.selectAll(".actual-point").data(pathData.slice(1).filter(d=>d.completed)).enter().append("circle").attr("class", "actual-point").attr("cx", d => x(d.date)).attr("cy", d => y(d.progress))
                .attr("fill", d => {
                    const plannedDateForProgress = this.getPlannedDateForProgress(d.progress, scopePathData, project);
                    const actualDate = d.date;
                    const isLate = actualDate > plannedDateForProgress || actualDate > this.parseDate(project.endDate);
                    return isLate ? '#ef4444' : '#22c55e';
                });
    
            const phaseMarkers = svg.selectAll(".phase-marker")
                .data(scopedPhases) // Use the same data source as the planned line
                .enter()
                .append("g")
                .attr("class", d => `phase-marker phase-marker-${d.id}`)
                .attr("transform", (d, i) => {
                    const phaseEndDate = this.parseDate(d.endDate); // Use the phase's own end date
                    const progressPerPhase = 100 / scopedPhases.length;
                    const phaseEndProgress = (i + 1) * progressPerPhase; // Calculate progress the same way as the line
                    return `translate(${x(phaseEndDate)}, ${y(phaseEndProgress)})`;
                })
                .on("mouseover", function(event, d) {
                    tooltip.style("visibility", "visible")
                        .html(`<strong>${d.name}</strong><br>Ends: ${timelineApp.formatDate(timelineApp.parseDate(d.effectiveEndDate))}<br>Progress: ${Math.round(d.progress || 0)}%`);
                    d3.select(this).select('circle').classed('phase-marker-highlight', true);
                    const phaseRow = document.querySelector(`.phase-row[data-id='${d.id}']`);
                    if (phaseRow) {
                        phaseRow.classList.add('phase-row-highlight');
                    }
                })
                .on("mousemove", (event) => {
                    tooltip.style("top", (event.pageY - 10) + "px").style("left", (event.pageX + 10) + "px");
                })
                .on("mouseout", function(event, d) {
                    tooltip.style("visibility", "hidden");
                    d3.select(this).select('circle').classed('phase-marker-highlight', false);
                    const phaseRow = document.querySelector(`.phase-row[data-id='${d.id}']`);
                    if (phaseRow) {
                        phaseRow.classList.remove('phase-row-highlight');
                    }
                });
    
            phaseMarkers.append("circle").attr("class", "phase-marker-circle");
            phaseMarkers.append("text").attr("class", "phase-marker-text").text((d, i) => `P${i + 1}`);
    
            const brush = d3.brushX()
                .extent([[0, 0], [chartWidth, height]])
                .on("end", (event) => {
                    if (!event.selection) return;
                    const [x0, x1] = event.selection.map(x.invert);
                    project.zoomDomain = [x0.toISOString().split('T')[0], x1.toISOString().split('T')[0]];
                    this.saveState();
                    this.renderProjects();
                });
            svg.append("g").attr("class", "brush").call(brush);
    
        }, 0);
    },

    resetZoom(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.zoomDomain = null;
            this.saveState();
            this.renderProjects();
        }
    },

    highlightPhaseOnChart(phaseId) {
        d3.selectAll(`.phase-marker-${phaseId} circle`).classed('phase-marker-highlight', true);
    },

    unhighlightPhaseOnChart(phaseId) {
        d3.selectAll(`.phase-marker-${phaseId} circle`).classed('phase-marker-highlight', false);
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
        // --- Populate Filter Dropdown ---
        const filterDropdown = this.elements.upcomingProjectFilter;
        const currentFilterValue = this.upcomingProjectFilter; // Save the current value
        filterDropdown.innerHTML = '<option value="all">All Projects</option>'; // Reset
        this.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            filterDropdown.appendChild(option);
        });
        filterDropdown.value = currentFilterValue; // Restore the saved value
    
        // --- Filter and Render Tasks ---
        const container = document.getElementById('upcoming-tasks-container');
        container.innerHTML = '';
        let allItems = [];
        this.projects.forEach(project => {
            // Apply the project filter here
            if (this.upcomingProjectFilter !== 'all' && project.id.toString() !== this.upcomingProjectFilter) {
                return; // Skip this project if it doesn't match the filter
            }
    
            project.phases.forEach(phase => {
                phase.tasks.forEach(task => {
                    if (task.subtasks && task.subtasks.length > 0) {
                        task.subtasks.forEach(subtask => {
                            if (subtask.endDate && !subtask.completed) {
                                allItems.push({
                                    date: subtask.endDate,
                                    path: `${project.name} &gt; ${phase.name} &gt; ${task.name}`,
                                    name: subtask.name,
                                    completed: subtask.completed,
                                    projectId: project.id,
                                    phaseId: phase.id,
                                    taskId: task.id,
                                    subtaskId: subtask.id
                                });
                            }
                        });
                    } else {
                        if (task.effectiveEndDate && !task.completed) {
                            allItems.push({
                                date: task.effectiveEndDate,
                                path: `${project.name} &gt; ${phase.name}`,
                                name: task.name,
                                completed: task.completed,
                                projectId: project.id,
                                phaseId: phase.id,
                                taskId: task.id,
                                subtaskId: null
                            });
                        }
                    }
                });
            });
        });
    
        if (allItems.length === 0) {
            container.innerHTML = `<div class="upcoming-card p-4 rounded-xl shadow-md text-center text-secondary">No upcoming tasks match the filter.</div>`;
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
                const onclickAttr = `onclick="timelineApp.navigateToTask(${item.projectId}, ${item.phaseId}, ${item.taskId}, ${item.subtaskId || 'null'})"`;
    
                html += `<div class="upcoming-task-item flex items-center text-sm ${completedClass}" ${onclickAttr}>
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

    navigateToTask(projectId, phaseId, taskId, subtaskId) {
        this.showMainTab('projects');

        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;
        project.collapsed = false;

        const phase = project.phases.find(ph => ph.id === phaseId);
        if (!phase) return;
        phase.collapsed = false;

        const task = phase.tasks.find(t => t.id === taskId);
        if (task && subtaskId) {
            task.collapsed = false;
        }

        this.renderProjects();

        // Use setTimeout to allow the DOM to update after renderProjects()
        setTimeout(() => {
            let element;
            if (subtaskId) {
                element = document.querySelector(`.subtask-row[data-id='${subtaskId}']`);
            } else {
                element = document.querySelector(`.task-row[data-id='${taskId}']`);
            }

            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight-task');
                setTimeout(() => {
                    element.classList.remove('highlight-task');
                }, 2000);
            }
        }, 100);
    },

generatePrintView(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project || !project.startDate || !project.endDate) {
            alert("Project must have a start and end date to be printed.");
            return;
        }

        const printContainer = document.getElementById('print-view');
        printContainer.innerHTML = ''; 

        const projectWrapper = document.createElement('div');
        projectWrapper.className = 'print-project-container';

        const header = document.createElement('div');
        header.className = 'print-header';
        header.innerHTML = `
            <h1>${project.name}</h1>
            <h2>${this.formatDate(this.parseDate(project.startDate))} - ${this.formatDate(this.parseDate(project.endDate))}</h2>
        `;
        projectWrapper.appendChild(header);

        const layout = document.createElement('div');
        layout.className = 'print-layout';

        const listContainer = document.createElement('div');
        listContainer.className = 'print-list-container';
        
        const chartContainer = document.createElement('div');
        chartContainer.className = 'print-chart-container';
        
        layout.appendChild(listContainer);
        layout.appendChild(chartContainer);
        projectWrapper.appendChild(layout);
        printContainer.appendChild(projectWrapper);
        
        const visibleItems = [];
        if (!project.collapsed) {
            project.phases.forEach(phase => {
                visibleItems.push({ ...phase, level: 2, type: 'Phase', id: `p-${phase.id}` });
                if (!phase.collapsed) {
                    phase.tasks.forEach(task => {
                        visibleItems.push({ ...task, level: 3, type: 'Task', id: `t-${task.id}` });
                        if (!task.collapsed && task.subtasks && task.subtasks.length > 0) {
                            task.subtasks.forEach(subtask => {
                                visibleItems.push({ ...subtask, level: 4, type: 'Subtask', id: `st-${subtask.id}`});
                            });
                        }
                    });
                }
            });
        }
        
        visibleItems.forEach(item => {
             const el = document.createElement('div');
             el.className = `print-item level-${item.level}`;
             el.innerHTML = `<div class="print-item-name">${item.name}</div>`;
             listContainer.appendChild(el);
        });
        
        this.drawPrintChartForProject(project, visibleItems, chartContainer);
        
        setTimeout(() => {
            window.print();
        }, 250); 
    },

    drawPrintChartForProject(project, items, container) {
        if (items.length === 0) return;

        const containerBounds = container.getBoundingClientRect();
        const itemHeight = containerBounds.height / items.length;

        const margin = { top: 0, right: 10, bottom: 20, left: 0 };
        const width = containerBounds.width - margin.left - margin.right;
        const height = containerBounds.height - margin.top - margin.bottom;

        const svg = d3.select(container).append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        const startDate = this.parseDate(project.startDate);
        const endDate = this.parseDate(project.endDate);

        const x = d3.scaleTime().domain([startDate, endDate]).range([0, width]);
        const y = d3.scaleBand().domain(items.map(d => d.id)).range([0, height]).padding(0.3);

        svg.append("g").attr("class", "gantt-x-axis chart-grid")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(d3.timeWeek.every(1)).tickFormat(d3.timeFormat("%b %d")));

        const bars = svg.selectAll(".bar")
            .data(items.filter(d => (d.effectiveStartDate || d.startDate) && (d.effectiveEndDate || d.endDate)))
            .enter().append("g");
            
        bars.append("rect")
            .attr("class", "gantt-bar-bg")
            .attr("x", d => x(this.parseDate(d.effectiveStartDate || d.startDate)))
            .attr("y", d => y(d.id))
            .attr("width", d => {
                const start = this.parseDate(d.effectiveStartDate || d.startDate);
                let end = this.parseDate(d.effectiveEndDate || d.endDate);
                return start && end ? Math.max(0, x(end) - x(start)) : 0;
            })
            .attr("height", y.bandwidth())
            .attr("rx", 3)
            .attr("ry", 3);

        bars.append("rect")
            .attr("class", "gantt-bar-progress")
            .attr("x", d => x(this.parseDate(d.effectiveStartDate || d.startDate)))
            .attr("y", d => y(d.id))
            .attr("width", d => {
                const start = this.parseDate(d.effectiveStartDate || d.startDate);
                let end = this.parseDate(d.effectiveEndDate || d.endDate);
                if (!start || !end) return 0;
                const totalWidth = Math.max(0, x(end) - x(start));
                return totalWidth * ((d.progress || 0) / 100);
            })
            .attr("height", y.bandwidth())
            .attr("rx", 3)
            .attr("ry", 3);
        
        const today = new Date();
        if (today >= startDate && today <= endDate) {
             svg.append("line").attr("class", "today-line").attr("x1", x(today)).attr("y1", 0).attr("x2", x(today)).attr("y2", height);
        }

        const phaseDividers = items.filter(item => item.level === 2);
        svg.selectAll(".phase-divider-line")
            .data(phaseDividers)
            .enter()
            .append("line")
            .attr("class", "phase-divider-line")
            .attr("x1", d => x(this.parseDate(d.effectiveStartDate || d.startDate)))
            .attr("y1", 0)
            .attr("x2", d => x(this.parseDate(d.effectiveStartDate || d.startDate)))
            .attr("y2", height);
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
        this.projects.push({ id: Date.now(), name, startDate, endDate, originalStartDate: startDate, originalEndDate: endDate, collapsed: false, phases: [], logs: [], zoomDomain: null });
        this.saveState();
        this.elements.newProjectNameInput.value = '';
        startDateInput.value = ''; endDateInput.value = ''; delete startDateInput.dataset.date; delete endDateInput.dataset.date;
        this.renderProjects();
    },

    addPhase(projectId) {
        const nameInput = document.getElementById(`new-phase-name-${projectId}`), name = nameInput.value.trim(); if (!name) return;
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.phases.push({ id: Date.now(), name, startDate: null, endDate: null, collapsed: false, tasks: [], dependencies: [], dependents: [] });
            this.saveState();
            this.renderProjects();
        }
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

    updateDate(context, value, comment = null, shouldLog = true) {
        const { projectId, phaseId, taskId, subtaskId, type } = context; const project = this.projects.find(p => p.id === projectId); if (!project) return; let targetItem, dateField, itemName;
        if (type.startsWith('project')) { targetItem = project; dateField = type.endsWith('start') ? 'startDate' : 'endDate'; itemName = `Project '${project.name}' ${dateField.replace('Date','')} date`; }
        else {
            const phase = project.phases.find(ph => ph.id === phaseId); if (!phase) return;
            if (type.startsWith('phase')) {
                targetItem = phase;
                dateField = type.endsWith('start') ? 'startDate' : 'endDate';
                itemName = `Phase '${phase.name}' ${dateField.replace('Date','')} date`;
            } else {
                const task = phase.tasks.find(t => t.id === taskId); if (!task) return; itemName = `Task '${task.name}'`;
                if (type.startsWith('task')) { targetItem = task; dateField = type.endsWith('start') ? 'startDate' : 'endDate'; itemName += ` ${dateField.replace('Date','')} date`; }
                else if (type.startsWith('subtask')) { const subtask = task.subtasks.find(st => st.id === subtaskId); if (!subtask) return; targetItem = subtask; dateField = type.endsWith('start') ? 'startDate' : 'endDate'; itemName = `Subtask '${subtask.name}' ${dateField.replace('Date','')} date`; }
            }
        }
        if (targetItem && dateField) {
            const oldDate = targetItem[dateField];
            if (comment && shouldLog) {
                if (!project.logs) project.logs = [];
                project.logs.push({ timestamp: new Date().toISOString(), item: itemName, from: oldDate, to: value, comment });
            }
            targetItem[dateField] = value;
        }
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
            this.pendingDeletion = { type: 'phase', logContext: { projectId }, deleteFn: () => {
            project.phases = project.phases.filter(ph => ph.id !== phaseId);
        }, itemName: `Phase '${phase.name}' from project '${project.name}'` };
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
            else if (phaseId) startDate = this.projects.find(p=>p.id===parseInt(projectId))?.phases.find(p=>p.id===parseInt(phaseId))?.startDate;
            else if (projectId) startDate = this.projects.find(p=>p.id===parseInt(projectId))?.startDate;
            if (startDate) defaultDate = startDate;
        }
        this.sharedPicker.set('defaultDate', defaultDate); this.sharedPicker.open();
    },

    handleSaveReason() {
        const comment = this.elements.reasonCommentTextarea.value.trim();
        const shouldLog = this.elements.logChangeCheckbox.checked;

        if (!comment && shouldLog) { // MODIFIED: Only require comment if logging
            this.elements.reasonCommentTextarea.classList.add('border-red-500', 'ring-red-500');
            setTimeout(() => this.elements.reasonCommentTextarea.classList.remove('border-red-500', 'ring-red-500'), 2000);
            return;
        }

        if (this.pendingDateChange) {
            this.updateDate(this.pendingDateChange.context, this.pendingDateChange.newDate, comment, shouldLog);
        } else if (this.pendingDeletion) {
            const { type, logContext, deleteFn, itemName } = this.pendingDeletion;

            if (shouldLog) { // MODIFIED: Conditional logging
                if (type === 'project') {
                     this.deletedProjectLogs.push({ timestamp: new Date().toISOString(), item: itemName, type: 'deletion', comment: comment });
                } else {
                    const project = this.projects.find(p => p.id === logContext.projectId);
                    if (project) {
                        if (!project.logs) project.logs = [];
                        project.logs.push({ timestamp: new Date().toISOString(), item: itemName, type: 'deletion', comment: comment });
                    }
                }
            }
            deleteFn();
            this.saveState();
            this.renderProjects();
        } else if (this.pendingLockChange) {
            const { type, projectId, phaseId, newState } = this.pendingLockChange;
            const project = this.projects.find(p => p.id === projectId);
            if (!project) return;

            let item, itemName;
            if (type === 'project') {
                item = project;
                itemName = `Project '${project.name}'`;
            } else {
                item = project.phases.find(ph => ph.id === phaseId);
                itemName = `Phase '${item.name}'`;
            }

            if (item) {
                item.locked = newState;
                if (shouldLog) { // MODIFIED: Conditional logging
                    const logType = newState ? 'lock' : 'unlock';
                    if (!project.logs) project.logs = [];
                    project.logs.push({
                        timestamp: new Date().toISOString(),
                        item: itemName,
                        type: logType,
                        comment: comment
                    });
                }
                this.saveState();
                this.renderProjects();
            }
        }

        this.elements.reasonModal.classList.add('hidden');
        this.elements.reasonCommentTextarea.value = '';
        this.elements.logChangeCheckbox.checked = true; // Reset checkbox
        this.pendingDateChange = null;
        this.pendingDeletion = null;
        this.pendingLockChange = null;
    },

    handleCancelReason() {
        this.elements.reasonModal.classList.add('hidden');
        this.elements.reasonCommentTextarea.value = '';
        this.elements.logChangeCheckbox.checked = true; // Reset checkbox
        this.renderProjects();
        this.pendingDateChange = null;
        this.pendingDeletion = null;
        this.pendingLockChange = null;
    },

    handleCircleClick(itemId) {
        this.hideDependencyTooltip(); // Hide tooltip on click
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
        this.hideDependencyTooltip(); // Hide tooltip on click
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
        const itemType = target.dataset.type;

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

    toggleProjectLock(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;
        const isLocking = !project.locked;
        this.pendingLockChange = {
            type: 'project',
            projectId: projectId,
            newState: isLocking
        };
        this.elements.reasonModalTitle.textContent = isLocking ? 'Reason for Locking Dates' : 'Reason for Unlocking Dates';
        this.elements.reasonModalDetails.textContent = `You are about to ${isLocking ? 'lock' : 'unlock'} the dates for project: "${project.name}".`;
        this.elements.reasonModal.classList.remove('hidden');
        this.elements.reasonCommentTextarea.focus();
    },

    togglePhaseLock(projectId, phaseId) {
        const project = this.projects.find(p => p.id === projectId);
        const phase = project?.phases.find(ph => ph.id === phaseId);
        if (!phase) return;
        const isLocking = !phase.locked;
        this.pendingLockChange = {
            type: 'phase',
            projectId: projectId,
            phaseId: phaseId,
            newState: isLocking
        };
        this.elements.reasonModalTitle.textContent = isLocking ? 'Reason for Locking Dates' : 'Reason for Unlocking Dates';
        this.elements.reasonModalDetails.textContent = `You are about to ${isLocking ? 'lock' : 'unlock'} the dates for phase: "${phase.name}".`;
        this.elements.reasonModal.classList.remove('hidden');
        this.elements.reasonCommentTextarea.focus();
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
    },

    // --- COMMENT FUNCTIONALITY ---
    toggleCommentSection(type, projectId, phaseId, taskId, subtaskId) {
        const id = subtaskId || taskId || phaseId || projectId;
        const commentSection = document.getElementById(`comment-section-${type}-${id}`);
        if (commentSection) {
            commentSection.classList.toggle('hidden');
            if (!commentSection.classList.contains('hidden')) {
                this.renderCommentSection(type, projectId, phaseId, taskId, subtaskId);
            }
        }
    },

    renderCommentSection(type, projectId, phaseId, taskId, subtaskId) {
        const id = subtaskId || taskId || phaseId || projectId;
        const item = this.getItem(type, projectId, phaseId, taskId, subtaskId);
        const commentSection = document.getElementById(`comment-section-${type}-${id}`);

        if (!item || !commentSection) return;

        let commentsHtml = '<div class="comments-list">';
        if (item.comments && item.comments.length > 0) {
            item.comments.forEach((comment, index) => {
                commentsHtml += `
                    <div class="comment-item" data-comment-index="${index}">
                        <div class="comment-content">
                            <div class="comment-text">${comment.text}</div>
                            <div class="comment-date">${new Date(comment.date).toLocaleString()}</div>
                        </div>
                        <div class="comment-actions">
                            <button class="btn-secondary btn-sm" onclick="timelineApp.editComment('${type}', ${projectId}, ${phaseId}, ${taskId}, ${subtaskId}, ${index})">Edit</button>
                            <button class="btn-secondary btn-sm" onclick="timelineApp.deleteComment('${type}', ${projectId}, ${phaseId}, ${taskId}, ${subtaskId}, ${index})">Delete</button>
                        </div>
                    </div>
                `;
            });
        } else {
            commentsHtml += '<p class="no-comments">No comments yet.</p>';
        }
        commentsHtml += '</div>';

        commentsHtml += `
            <div class="add-comment">
                <textarea id="new-comment-${type}-${id}" placeholder="Add a comment..."></textarea>
                <button class="btn-primary btn-sm" onclick="timelineApp.addComment('${type}', ${projectId}, ${phaseId}, ${taskId}, ${subtaskId})">Add</button>
            </div>
        `;

        commentSection.innerHTML = commentsHtml;
    },

    addComment(type, projectId, phaseId, taskId, subtaskId) {
        const id = subtaskId || taskId || phaseId || projectId;
        const item = this.getItem(type, projectId, phaseId, taskId, subtaskId);
        const textarea = document.getElementById(`new-comment-${type}-${id}`);
        const commentText = textarea.value.trim();

        if (commentText && item) {
            if (!item.comments) {
                item.comments = [];
            }
            item.comments.push({text: commentText, date: new Date().toISOString()});
            this.saveState();
            this.renderProjects();
            // Re-render the comment section to show the new comment
            const commentSection = document.getElementById(`comment-section-${type}-${id}`);
            if(commentSection){
                commentSection.classList.remove('hidden');
                this.renderCommentSection(type, projectId, phaseId, taskId, subtaskId);
            }
        }
    },

    editComment(type, projectId, phaseId, taskId, subtaskId, commentIndex) {
        const item = this.getItem(type, projectId, phaseId, taskId, subtaskId);
        if (item && item.comments && item.comments[commentIndex]) {
            const newCommentText = prompt("Edit your comment:", item.comments[commentIndex].text);
            if (newCommentText !== null) {
                item.comments[commentIndex].text = newCommentText.trim();
                this.saveState();
                this.renderProjects();
                this.renderCommentSection(type, projectId, phaseId, taskId, subtaskId);
            }
        }
    },

    deleteComment(type, projectId, phaseId, taskId, subtaskId, commentIndex) {
        const item = this.getItem(type, projectId, phaseId, taskId, subtaskId);
        if (item && item.comments && item.comments[commentIndex]) {
            if (confirm("Are you sure you want to delete this comment?")) {
                item.comments.splice(commentIndex, 1);
                this.saveState();
                this.renderProjects();
                this.renderCommentSection(type, projectId, phaseId, taskId, subtaskId);
            }
        }
    },
    
    getItem(type, projectId, phaseId, taskId, subtaskId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return null;
        if (type === 'project') return project;

        const phase = project.phases.find(ph => ph.id === phaseId);
        if (!phase) return null;
        if (type === 'phase') return phase;

        const task = phase.tasks.find(t => t.id === taskId);
        if (!task) return null;
        if (type === 'task') return task;

        if (type === 'subtask') {
            return task.subtasks.find(st => st.id === subtaskId);
        }
        return null;
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






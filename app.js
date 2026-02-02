const timelineApp = {
    // --- STATE & CONFIG ---
    projects: [],
    deletedProjectLogs: [],
    history: [],
    redoStack: [],
    standaloneTasks: [],
    moveModalSelectedTags: [], // New state to track tags picked in the modal
    MAX_HISTORY: 10,
    sharedPicker: null,
    currentPickerContext: null,
    pendingDateChange: null,
    pendingDeletion: null,
    pendingLockChange: null,
    pendingMoveTask: null,
    dependencyMode: false,
    firstSelectedItem: null,
    pendingClearDependencies: null,
    deletedLogCollapsed: true,
    taskLoadChartColor: null,
    activeTab: 'projects',
    tabOrder: ['projects', 'list', 'overall-load', 'upcoming'],
    resizeTimeout: null,
    upcomingProjectFilter: 'all',
    hideCompletedTasks: false,
    hideCompletedProjects: false,
    tagFilter: 'all',

    // --- NEW: Centralized Default Tags ---
    defaultTags: [
        { name: '@Computer', color: 'bg-blue-100 text-blue-800' },
        { name: '@Phone', color: 'bg-green-100 text-green-800' },
        { name: '@Errands', color: 'bg-orange-100 text-orange-800' },
        { name: '@Home', color: 'bg-teal-100 text-teal-800' },
        { name: '@Office', color: 'bg-gray-100 text-gray-800' },
        { name: '@Agenda', color: 'bg-yellow-100 text-yellow-800' },
        { name: '#15min', color: 'bg-purple-100 text-purple-800' },
        { name: '#DeepWork', color: 'bg-red-100 text-red-800' },
        { name: '#Braindead', color: 'bg-gray-200 text-gray-700' },
        { name: '#Read/Review', color: 'bg-indigo-100 text-indigo-800' }
    ],

    // --- DOM ELEMENTS ---
    elements: {},

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
            logChangeCheckbox: document.getElementById('log-change-checkbox'),
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
            upcomingProjectFilter: document.getElementById('upcoming-project-filter'),
            fullscreenModal: document.getElementById('fullscreen-modal'),

            // --- Header Controls ---
            projectViewControls: document.getElementById('project-view-controls'),
            projectViewGlider: document.getElementById('project-view-glider'),
            btnViewGantt: document.getElementById('btn-view-gantt'),
            btnViewLinear: document.getElementById('btn-view-linear'),
            
            // --- NEW: Toggle Container ---
            ganttViewOptions: document.getElementById('gantt-view-options'),

            // --- Move to Project Modal Elements ---
            moveToProjectModal: document.getElementById('move-to-project-modal'),
            moveProjectSelect: document.getElementById('move-project-select'),
            movePhaseSelect: document.getElementById('move-phase-select'),
            cancelMoveBtn: document.getElementById('cancel-move-btn'),
            confirmMoveBtn: document.getElementById('confirm-move-btn')
        };
    },

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
        window.timelineApp = this;
        
        // Initialize D3 scale (Moved here to prevent race conditions)
        this.taskLoadChartColor = d3.scaleOrdinal(d3.schemeTableau10);

        this.cacheDOMElements();
        
        // Load data (Active tab, View Mode, Filters)
        this.loadTabData();
        
        // --- FORCE TAB ORDER (Inbox -> Projects -> Review) ---
        this.tabOrder = ['list', 'projects', 'overall-load']; 
        
        // REMOVED: this.projectViewMode = 'gantt'; (Now handled in loadTabData)
        
        this.renderTabs();
        this.addEventListeners();
        this.applyTheme();
        this.loadProjects();
        
        // CHANGED: Use setProjectView instead of renderProjects
        // This ensures the buttons (Timeline/Action Hub) match the loaded state visually
        this.setProjectView(this.projectViewMode);
        
        this.showMainTab(this.activeTab, false);
        this.updateUndoRedoButtons();
        this.initializeSharedDatePicker();
    },

    toggleHideCompleted() {
        this.hideCompletedTasks = !this.hideCompletedTasks;
        // --- NEW: Save to LocalStorage ---
        localStorage.setItem('timelineHideCompleted', this.hideCompletedTasks);
        this.renderLinearView();
    },

    toggleItemComplete(event, projectId, phaseId, taskId, subtaskId) {
        event.stopPropagation(); // Stop the row from navigating
        
        if (subtaskId && subtaskId !== 'null' && subtaskId !== null) {
            this.toggleSubtaskComplete(projectId, phaseId, taskId, subtaskId);
        } else {
            this.toggleTaskComplete(projectId, phaseId, taskId);
        }
    },

    setTagFilter(tag) {
        this.tagFilter = tag;
        this.renderLinearView();
    },

    toggleSubtaskFollowUp(projectId, phaseId, taskId, subtaskId) {
        const subtask = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId)?.subtasks.find(s => s.id === subtaskId);
        if (subtask) {
            subtask.isFollowUp = !subtask.isFollowUp;
            // Default to tomorrow if turning on and no date exists
            if (subtask.isFollowUp && !subtask.followUpDate) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                subtask.followUpDate = tomorrow.toISOString().split('T')[0];
            }
            this.saveState();
            this.renderProjects();
        }
    },

    addEventListeners() {
            this.elements.themeSelect.addEventListener('change', (e) => {
                document.documentElement.setAttribute('data-theme', e.target.value);
                localStorage.setItem('timeline-theme-name', e.target.value);
                this.renderProjects(); 
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

            document.addEventListener('click', (e) => {
                // [Existing logic for datepicker, dependency, etc...]
                
                // NEW: Close tag dropdowns when clicking outside
                // FIX: Exclude the Move Modal inputs so they don't auto-close the dropdown on click
                if (!e.target.closest('.tag-menu-dropdown') && 
                    !e.target.closest('.add-tag-btn') &&
                    e.target.id !== 'move-tag-input' &&
                    e.target.id !== 'move-who-input') {
                    document.querySelectorAll('.tag-menu-dropdown').forEach(el => el.classList.add('hidden'));
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

            // --- NEW: Listeners for Move Modal ---
            this.elements.cancelMoveBtn.addEventListener('click', () => {
                this.elements.moveToProjectModal.classList.add('hidden');
                this.pendingMoveTask = null;
            });
            
            this.elements.moveProjectSelect.addEventListener('change', () => this.populatePhaseSelectForMove());
            
            this.elements.confirmMoveBtn.addEventListener('click', () => this.executeMoveToProject());
            // -------------------------------------

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
            this.updateProjectViewIndicator(); // Add this line
            
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
        localStorage.setItem('projectStandaloneTasks', JSON.stringify(this.standaloneTasks)); 
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

        const savedStandalone = localStorage.getItem('projectStandaloneTasks');
        this.standaloneTasks = savedStandalone ? JSON.parse(savedStandalone) : [];
        
        let hasMigrated = false;

        this.projects.forEach(project => {
            if (!project.originalStartDate) project.originalStartDate = project.startDate;
            if (!project.originalEndDate) project.originalEndDate = project.endDate;
            if (project.locked === undefined) project.locked = false;

            // --- NEW: Initialize Exclude Logic ---
            if (project.excludeFromStats === undefined) project.excludeFromStats = false;
            // -------------------------------------

            if (project.priority === undefined) {
                project.priority = 5; 
                hasMigrated = true;
            }

            if (!project.generalTasks) project.generalTasks = [];
            if (!project.phases) project.phases = [];
            if (project.zoomDomain === undefined) project.zoomDomain = null;
            
            project.phases.forEach(phase => {
                if(phase.collapsed === undefined) phase.collapsed = false;
                if (phase.locked === undefined) phase.locked = false;
                if(!phase.dependencies) phase.dependencies = [];
                if(!phase.dependents) phase.dependents = [];
                
                phase.tasks.forEach(task => {
                    if(this.migrateTagsForItem(task)) hasMigrated = true;
                    if(task.collapsed === undefined) task.collapsed = false;
                    if(!task.dependencies) task.dependencies = [];
                    if(!task.dependents) task.dependents = [];
                    if(task.subtasks) {
                        task.subtasks.forEach(subtask => {
                            if(this.migrateTagsForItem(subtask)) hasMigrated = true;
                            if(!subtask.dependencies) subtask.dependencies = [];
                            if(!subtask.dependents) subtask.dependents = [];
                        });
                    }
                });
            });
            
            project.generalTasks.forEach(task => {
                 if(this.migrateTagsForItem(task)) hasMigrated = true;
                 if(!task.dependencies) task.dependencies = [];
                 if(!task.dependents) task.dependents = [];
            });

            if (!project.logs) project.logs = [];
            if (project.collapsed === undefined) project.collapsed = false;
            if (typeof project.startDate !== 'string' || project.startDate.trim() === '') project.startDate = null;
            if (typeof project.endDate !== 'string' || project.endDate.trim() === '') project.endDate = null;
        });
        
        if(hasMigrated) {
            this.saveState();
        }

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

    toggleProjectStats(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.excludeFromStats = !project.excludeFromStats;
            this.saveState();
            this.renderProjects(); 
            
            // If the user is currently on the Review tab, refresh it immediately
            if (this.activeTab === 'overall-load') {
                this.renderReviewDashboard();
            }
        }
    },

    toggleProjectFavorite(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.favorite = !project.favorite;
            this.saveState();
            this.renderProjects();
        }
    },

    updateProjectPriority(projectId, newPriority) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.priority = parseInt(newPriority);
            this.saveState();
            // Re-render both views to reflect sorting
            if (!this.elements.timelineView.classList.contains('hidden')) {
                this.renderGanttView();
            } else {
                this.renderLinearView();
            }
        }
    },

    migrateTagsForItem(item) {
        if (!item.tags) item.tags = [];
        const regex = /(^|\s)(@[a-zA-Z0-9_\-]+)/g;
        const matches = item.name.match(regex);
        if (matches) {
            matches.forEach(m => {
                const tag = m.trim().substring(1); 
                if (!item.tags.includes(tag)) item.tags.push(tag);
            });
            item.name = item.name.replace(regex, ' ').trim();
            return true; // Indicate change occurred
        }
        return false;
    },

    getAllTags() {
        const tags = new Set();

        // 1. Add Default Tags
        if (this.defaultTags) {
            this.defaultTags.forEach(t => tags.add(t.name));
        }

        // 2. Add Tags AND Delegates from Projects
        this.projects.forEach(p => p.phases.forEach(ph => ph.tasks.forEach(t => {
            if (t.tags) t.tags.forEach(tag => tags.add(tag));
            if (t.delegatedTo) tags.add(t.delegatedTo); // Add person to tag pool
            
            if (t.subtasks) t.subtasks.forEach(st => {
                if (st.tags) st.tags.forEach(tag => tags.add(tag));
                if (st.delegatedTo) tags.add(st.delegatedTo); // Add person to tag pool
            });
        })));

        // 3. Add Tags AND Delegates from Standalone Tasks
        if (this.standaloneTasks) {
            this.standaloneTasks.forEach(t => {
                if (t.tags) t.tags.forEach(tag => tags.add(tag));
                if (t.delegatedTo) tags.add(t.delegatedTo);
            });
        }

        return Array.from(tags).sort();
    },

    getTagColor(tagName) {
        const defaultTag = (this.defaultTags || []).find(t => t.name === tagName);
        // Default style if no match found
        return defaultTag ? defaultTag.color : 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300 border-gray-300 dark:border-gray-600';
    },

    addTag(projectId, phaseId, taskId, subtaskId, tagName) {
        // FIX: Check if subtaskId exists to determine type
        const type = (subtaskId && subtaskId !== 'null' && subtaskId !== null) ? 'subtask' : 'task';
        const item = this.getItem(type, projectId, phaseId, taskId, subtaskId);

        if (item) {
            if (!item.tags) item.tags = [];
            const cleanTag = tagName.trim();
            if (cleanTag && !item.tags.includes(cleanTag)) {
                item.tags.push(cleanTag);
                this.saveState();
                this.renderProjects();
            }
        }
    },

    removeTag(projectId, phaseId, taskId, subtaskId, tagName) {
        // FIX: Check if subtaskId exists to determine type
        const type = (subtaskId && subtaskId !== 'null' && subtaskId !== null) ? 'subtask' : 'task';
        const item = this.getItem(type, projectId, phaseId, taskId, subtaskId);

        if (item && item.tags) {
            item.tags = item.tags.filter(t => t !== tagName);
            this.saveState();
            this.renderProjects();
        }
    },

    renderTagOptions(projectId, phaseId, taskId, subtaskId, filter = '') {
        const id = subtaskId || taskId;
        const container = document.getElementById(`tag-options-${id}`);
        if (!container) return;

        const allTags = this.getAllTags();
        
        const type = (subtaskId && subtaskId !== 'null' && subtaskId !== null) ? 'subtask' : 'task';
        const item = this.getItem(type, projectId, phaseId, taskId, subtaskId);
        const currentTags = item ? (item.tags || []) : [];
        
        const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(filter.toLowerCase()));
        
        let html = '';
        
        // Show "Create New" only if the user typed something that doesn't exist
        if (filter && !allTags.includes(filter) && !currentTags.includes(filter)) {
             html += `
                <div class="tag-option create-new" onclick="timelineApp.addTag(${projectId}, ${phaseId}, ${taskId}, ${subtaskId ? subtaskId : 'null'}, '${filter}')">
                    Create "${filter}"
                </div>
             `;
        }

        filteredTags.forEach(tag => {
            const isSelected = currentTags.includes(tag);
            if (!isSelected) {
                const colorClass = this.getTagColor(tag);
                html += `
                    <div class="tag-option" onclick="timelineApp.addTag(${projectId}, ${phaseId}, ${taskId}, ${subtaskId ? subtaskId : 'null'}, '${tag}')">
                        <span class="tag-badge ${colorClass} border-transparent cursor-pointer">${tag}</span>
                    </div>
                `;
            }
        });
        
        if (html === '' && !filter) {
            html = '<div class="text-xs text-gray-500 p-2 text-center">No other tags available.</div>';
        }

        container.innerHTML = html;
    },

    toggleTagMenu(event, projectId, phaseId, taskId, subtaskId) {
        event.stopPropagation();
        const id = subtaskId || taskId;
        const menuId = `tag-menu-${id}`;
        
        // Close all other open menus
        document.querySelectorAll('.tag-menu-dropdown').forEach(el => {
            if (el.id !== menuId) el.classList.add('hidden');
        });

        const menu = document.getElementById(menuId);
        if (menu) {
            menu.classList.toggle('hidden');
            if (!menu.classList.contains('hidden')) {
                const input = document.getElementById(`tag-input-${id}`);
                if(input) {
                    input.value = '';
                    input.focus();
                }
                this.renderTagOptions(projectId, phaseId, taskId, subtaskId);
            }
        }
    },

    handleTagInput(event, projectId, phaseId, taskId, subtaskId) {
        const filter = event.target.value;
        if (event.key === 'Enter' && filter) {
            this.addTag(projectId, phaseId, taskId, subtaskId, filter);
            return;
        }
        this.renderTagOptions(projectId, phaseId, taskId, subtaskId, filter);
    },

    getAllPeople() {
        const people = new Set();
        
        // Collect from Projects
        this.projects.forEach(p => p.phases.forEach(ph => ph.tasks.forEach(t => {
            if (t.delegatedTo) people.add(t.delegatedTo);
            if (t.subtasks) t.subtasks.forEach(st => {
                if (st.delegatedTo) people.add(st.delegatedTo);
            });
        })));

        // Collect from Inbox
        if (this.standaloneTasks) {
            this.standaloneTasks.forEach(t => {
                if (t.delegatedTo) people.add(t.delegatedTo);
            });
        }

        return Array.from(people).sort();
    },

    handleWhoInput(event) {
        const filter = event.target.value.trim();
        const dropdown = document.getElementById('move-who-options');
        
        // Hide on Escape
        if (event.key === 'Escape') {
            dropdown.classList.add('hidden');
            return;
        }

        dropdown.classList.remove('hidden');
        this.renderWhoOptions(filter);
    },

    renderWhoOptions(filter) {
        const container = document.getElementById('move-who-options');
        const allPeople = this.getAllPeople();
        
        // Filter options (case-insensitive)
        const filteredPeople = allPeople.filter(p => p.toLowerCase().includes(filter.toLowerCase()));
        
        let html = '';

        // If typing a new name, show "Use 'Name'" option at top
        if (filter && !allPeople.includes(filter)) {
            html += `
                <div class="tag-option create-new" onclick="timelineApp.selectWho('${filter}')">
                    Use "${filter}"
                </div>
            `;
        }

        // List existing people
        filteredPeople.forEach(person => {
            html += `
                <div class="tag-option flex items-center gap-2" onclick="timelineApp.selectWho('${person}')">
                    <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
                    <span>${person}</span>
                </div>
            `;
        });

        if (html === '' && !filter) {
            html = '<div class="text-xs text-gray-500 p-2 text-center">No recent contacts found. Type to add.</div>';
        }

        container.innerHTML = html;
    },

    selectWho(name) {
        const input = document.getElementById('move-who-input');
        input.value = name;
        document.getElementById('move-who-options').classList.add('hidden');
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

    renderProjects(recalculate = true) {
        // Only run the heavy math if data has actually changed
        if (recalculate) {
            this.calculateRollups();
            this.resolveDependencies();
        }
        
        this.elements.projectsContainer.innerHTML = '';

        if (this.projectViewMode === 'gantt') {
            this.renderGanttView();
        } else {
            this.renderLinearView();
        }
        
        this.renderDeletedProjectsLog();
    },

    renderLinearView() {
        const container = this.elements.projectsContainer;
        
        // 1. Initialize Collapsed States from LocalStorage
        if (!this.hubCollapsedStates) {
            this.hubCollapsedStates = JSON.parse(localStorage.getItem('timelineHubCollapsedStates')) || {};
        }

        let allItems = [];
        
        // 2. Collect Standalone Tasks
        if (this.standaloneTasks) {
            this.standaloneTasks.forEach(task => {
                const displayDate = (task.isFollowUp && task.followUpDate) ? task.followUpDate : (task.endDate || task.followUpDate);
                allItems.push({
                    path: 'Inbox',
                    projectId: null, 
                    phaseId: null, 
                    taskId: task.id,
                    name: task.name,
                    date: displayDate,
                    rawDate: displayDate ? this.parseDate(displayDate) : null,
                    completed: task.completed,
                    isFollowUp: task.isFollowUp,
                    delegatedTo: task.delegatedTo,
                    tags: task.tags || [],
                    isStandalone: true
                });
            });
        }

        // 3. Collect Project Tasks
        this.projects.forEach(project => {
            if (project.generalTasks) {
                project.generalTasks.forEach(task => {
                    const currentProjectId = project.id;
                    const itemBase = {
                        path: `${project.name} > General`,
                        projectId: currentProjectId,
                        phaseId: null, 
                        taskId: task.id
                    };
                    
                    if (task.subtasks?.length > 0) {
                        task.subtasks.forEach(st => {
                            const displayDate = (st.isFollowUp && st.followUpDate) ? st.followUpDate : st.endDate;
                            allItems.push({
                                ...itemBase,
                                name: `${task.name}: ${st.name}`,
                                subtaskId: st.id,
                                date: displayDate,
                                rawDate: displayDate ? this.parseDate(displayDate) : null,
                                completed: st.completed,
                                tags: st.tags || [],
                                isFollowUp: st.isFollowUp,
                                delegatedTo: st.delegatedTo,
                                isGeneral: true
                            });
                        });
                    } else {
                        const displayDate = (task.isFollowUp && task.followUpDate) ? task.followUpDate : (task.effectiveEndDate || task.endDate);
                        allItems.push({
                            ...itemBase,
                            subtaskId: null,
                            name: task.name,
                            date: displayDate,
                            rawDate: displayDate ? this.parseDate(displayDate) : null,
                            completed: task.completed,
                            tags: task.tags || [],
                            isFollowUp: task.isFollowUp,
                            delegatedTo: task.delegatedTo,
                            isGeneral: true
                        });
                    }
                });
            }

            project.phases.forEach(phase => {
                phase.tasks.forEach(task => {
                    const itemBase = {
                        path: `${project.name} > ${phase.name}`,
                        projectId: project.id, 
                        phaseId: phase.id, 
                        taskId: task.id
                    };
                    
                    if (task.subtasks?.length > 0) {
                        task.subtasks.forEach(st => {
                            const displayDate = (st.isFollowUp && st.followUpDate) ? st.followUpDate : st.endDate;
                            allItems.push({
                                ...itemBase,
                                name: `${task.name}: ${st.name}`,
                                subtaskId: st.id,
                                date: displayDate,
                                rawDate: displayDate ? this.parseDate(displayDate) : null,
                                completed: st.completed,
                                tags: st.tags || [],
                                isFollowUp: st.isFollowUp,
                                delegatedTo: st.delegatedTo
                            });
                        });
                    } else {
                        const displayDate = (task.isFollowUp && task.followUpDate) ? task.followUpDate : (task.effectiveEndDate || task.endDate);
                        allItems.push({
                            ...itemBase,
                            subtaskId: null,
                            name: task.name,
                            date: displayDate,
                            rawDate: displayDate ? this.parseDate(displayDate) : null,
                            completed: task.completed,
                            tags: task.tags || [],
                            isFollowUp: task.isFollowUp,
                            delegatedTo: task.delegatedTo
                        });
                    }
                });
            });
        });

        // 4. Apply Filters
        if (this.hideCompletedTasks) allItems = allItems.filter(i => !i.completed);
        if (this.tagFilter !== 'all') allItems = allItems.filter(i => i.tags?.includes(this.tagFilter));

        const sortByDate = (a, b) => {
            if (!a.rawDate && !b.rawDate) return 0;
            if (!a.rawDate) return 1;
            if (!b.rawDate) return -1;
            return a.rawDate - b.rawDate;
        };

        // --- UPDATED Render Group Helper with Persistence ---
        const renderGroup = (title, items, headerClass, projectId = null, currentPriority = null, uniqueKey = null) => {
            if (items.length === 0) return '';
            
            // Generate ID
            const groupId = uniqueKey || title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-' + Math.floor(Math.random() * 1000);
            
            // Check Persisted State
            const isCollapsed = this.hubCollapsedStates[groupId] === true;
            const hiddenClass = isCollapsed ? 'hidden' : '';
            const chevronRotation = isCollapsed ? '-rotate-90' : '';

            let prioritySelectHtml = '';
            if (projectId !== null) {
                let options = '';
                const val = currentPriority || 5;
                for(let i=1; i<=10; i++) {
                    options += `<option value="${i}" ${i === val ? 'selected' : ''}>P${i}</option>`;
                }
                prioritySelectHtml = `<select onchange="timelineApp.updateProjectPriority(${projectId}, this.value)" onclick="event.stopPropagation()" class="priority-select ml-auto" title="Priority">${options}</select>`;
            }

            let groupHtml = `<div class="upcoming-card rounded-xl shadow-sm mb-6 border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div class="px-4 py-2 border-b border-primary ${headerClass} flex items-center justify-between cursor-pointer select-none hover:brightness-95 transition-all" onclick="timelineApp.toggleActionHubGroup('${groupId}')">
                    <div class="flex items-center gap-3">
                        <svg id="hub-chevron-${groupId}" class="w-5 h-5 transition-transform duration-200 ${chevronRotation}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        <h3 class="font-bold flex items-center gap-2 text-sm uppercase tracking-wide">${title} 
                            <span class="text-xs font-normal opacity-75 bg-white bg-opacity-30 px-2 py-0.5 rounded-full text-current">${items.length}</span>
                        </h3>
                    </div>
                    ${prioritySelectHtml}
                </div>
                <div id="hub-group-${groupId}" class="p-1 space-y-1 bg-white dark:bg-slate-900/50 transition-all ${hiddenClass}">`;
            
            items.forEach(item => {
                const tagsHtml = (item.tags || []).map(tag => {
                    const colorClass = this.getTagColor(tag);
                    return `<span class="tag-badge ${colorClass} border-transparent">${tag}<span onclick="event.stopPropagation(); timelineApp.removeTag(${item.projectId}, ${item.phaseId || 'null'}, ${item.taskId}, ${item.subtaskId || 'null'}, '${tag}')" class="tag-remove opacity-50 hover:opacity-100 ml-1">&times;</span></span>`;
                }).join('');
                
                const delegationHtml = item.delegatedTo ? `<span class="tag-badge bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200"><svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>${item.delegatedTo}</span>` : '';
                
                const pId = item.projectId === null ? 'null' : item.projectId;
                const phId = item.phaseId === null ? 'null' : item.phaseId;
                const tId = item.taskId;
                const sId = item.subtaskId || 'null';
                
                const deleteCall = item.subtaskId ? `timelineApp.deleteSubtask(${pId}, ${phId}, ${tId}, ${sId})` : `timelineApp.deleteTask(${pId}, ${phId}, ${tId})`;
                const processCall = `timelineApp.handleProcessItem(${pId}, ${phId}, ${tId}, ${sId})`;
                const uniqueId = item.subtaskId || item.taskId;
                
                const tagMenuHtml = `<div class="relative inline-block ml-1"><button onclick="event.stopPropagation(); timelineApp.toggleTagMenu(event, ${pId}, ${phId}, ${tId}, ${sId})" class="add-tag-btn" title="Add Tag"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg><span class="ml-0.5 text-[10px]">+</span></button><div id="tag-menu-${uniqueId}" class="tag-menu-dropdown hidden" onclick="event.stopPropagation()"><div class="tag-menu-header"><span class="text-xs font-bold text-secondary">Tags</span><button onclick="timelineApp.toggleTagMenu(event, ${pId}, ${phId}, ${tId}, ${sId})" class="text-gray-400 hover:text-red-500 font-bold">&times;</button></div><input type="text" id="tag-input-${uniqueId}" class="tag-menu-input" placeholder="Search or create..." onkeyup="timelineApp.handleTagInput(event, ${pId}, ${phId}, ${tId}, ${sId})"><div id="tag-options-${uniqueId}" class="tag-menu-options"></div></div></div>`;

                const itemBgClass = item.isGeneral ? 'border-l-4 border-l-gray-300 dark:border-l-gray-600 pl-2' : '';
                const navCall = item.isStandalone ? '' : `timelineApp.navigateToTask(${item.projectId}, ${item.phaseId || 'null'}, ${item.taskId}, ${item.subtaskId || 'null'})`;

                let dateControlHtml = '';
                if (item.isStandalone) {
                     const iconHtml = `<div class="date-input-icon-wrapper" onclick="event.stopPropagation(); timelineApp.handleDateTrigger(this.previousElementSibling)"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>`;
                     const dateType = item.isFollowUp ? 'task-followup' : 'task-end';
                     const dateInputColorClass = item.isFollowUp ? 'text-purple-700 dark:text-purple-300 font-bold' : '';
                     
                     dateControlHtml = `
                        <div class="date-input-container">
                            <input type="text" value="${item.date ? this.formatDate(this.parseDate(item.date)) : ''}" placeholder="End Date" class="date-input ${dateInputColorClass}" 
                                data-project-id="null" data-phase-id="null" data-task-id="${item.taskId}" data-subtask-id="null"
                                data-type="${dateType}" data-date="${item.date || ''}" 
                                oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                            ${iconHtml}
                        </div>`;
                } else {
                     const dateDisplay = item.date ? this.formatDate(this.parseDate(item.date)) : 'No Date';
                     const dateColorClass = item.isFollowUp ? 'text-purple-700 dark:text-purple-300 font-bold' : 'text-secondary';
                     
                     dateControlHtml = `
                        <div class="px-2 py-1 rounded text-xs font-semibold border border-transparent hover:border-gray-300 bg-gray-50 dark:bg-slate-700/50 ${dateColorClass}" title="Click to view/edit on Timeline" onclick="event.stopPropagation(); ${navCall}">
                            ${dateDisplay}
                        </div>`;
                }

                groupHtml += `
                <div class="upcoming-task-item flex items-center p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${item.completed ? 'line-through opacity-60' : ''} ${item.isStandalone ? 'no-nav' : 'cursor-pointer'} ${itemBgClass}" 
                    onclick="${navCall}">
                    <div class="flex-shrink-0 mr-3 cursor-pointer group" onclick="event.stopPropagation(); timelineApp.toggleItemComplete(event, ${item.projectId}, ${item.phaseId || 'null'}, ${item.taskId}, ${item.subtaskId || 'null'})">
                        ${item.completed 
                            ? `<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>` 
                            : `<div class="w-5 h-5 rounded-full border-2 border-gray-300 group-hover:border-green-500"></div>`
                        }
                    </div>
                    <div class="flex-grow min-w-0">
                        <div class="text-[10px] text-secondary truncate w-2/3">${item.path}</div>
                        <div class="flex items-center gap-1 flex-wrap pt-0.5">
                            <span class="font-medium truncate text-sm editable-text mr-1" onclick="event.stopPropagation(); timelineApp.makeEditable(this, '${item.subtaskId ? 'updateSubtaskName' : 'updateTaskName'}', ${item.projectId}, ${item.phaseId || 'null'}, ${item.taskId}, ${item.subtaskId || ''})">${item.name}</span>
                            <div class="flex-shrink-0 flex items-center flex-wrap">${delegationHtml} ${tagsHtml} ${tagMenuHtml}</div>
                        </div>
                    </div>
                    
                    <div class="flex-shrink-0 ml-2" onclick="event.stopPropagation()">
                        ${dateControlHtml}
                    </div>

                    <button onclick="event.stopPropagation(); ${processCall}" class="text-gray-400 hover:text-blue-500 transition-colors ml-2 flex-shrink-0" title="Process"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></button>
                    <button onclick="event.stopPropagation(); ${deleteCall}" class="text-gray-400 hover:text-red-500 transition-colors text-lg font-bold ml-2 flex-shrink-0" title="Delete">&times;</button>
                </div>`;
            });
            return groupHtml + `</div></div>`;
        };

        const sortedTags = Array.from(new Set(this.getAllTags())).sort();
        const tagOptions = sortedTags.map(tag => `<option value="${tag}" ${this.tagFilter === tag ? 'selected' : ''}>${tag}</option>`).join('');

        const toolbarHtml = `
            <div class="flex justify-between items-center mb-4 px-1 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                        <select onchange="timelineApp.setTagFilter(this.value)" class="tag-filter-dropdown bg-transparent text-xs font-semibold focus:outline-none">
                            <option value="all">All Tags</option>
                            ${tagOptions}
                        </select>
                    </div>
                    <div class="flex bg-gray-100 dark:bg-slate-700/50 p-1 rounded-lg border border-gray-200 dark:border-gray-600">
                        <button onclick="timelineApp.setActionHubGroupMode('time')" class="px-3 py-1 text-xs font-bold rounded-md transition-all ${this.actionHubGroupMode === 'time' ? 'bg-white dark:bg-slate-600 shadow-sm text-primary' : 'text-secondary hover:text-primary'}">Time</button>
                        <button onclick="timelineApp.setActionHubGroupMode('context')" class="px-3 py-1 text-xs font-bold rounded-md transition-all ${this.actionHubGroupMode === 'context' ? 'bg-white dark:bg-slate-600 shadow-sm text-primary' : 'text-secondary hover:text-primary'}">Context</button>
                        <button onclick="timelineApp.setActionHubGroupMode('project')" class="px-3 py-1 text-xs font-bold rounded-md transition-all ${this.actionHubGroupMode === 'project' ? 'bg-white dark:bg-slate-600 shadow-sm text-primary' : 'text-secondary hover:text-primary'}">Project</button>
                    </div>
                </div>
                <label class="flex items-center text-xs font-semibold text-secondary cursor-pointer select-none">
                    <input type="checkbox" class="custom-checkbox mr-2" ${this.hideCompletedTasks ? 'checked' : ''} onchange="timelineApp.toggleHideCompleted()">
                    Hide Completed Tasks
                </label>
            </div>`;

        let contentHtml = '';

        if (this.actionHubGroupMode === 'project') {
            const standaloneItems = allItems.filter(i => i.projectId === null || i.projectId === undefined).sort(sortByDate);
            if (standaloneItems.length > 0) {
                contentHtml += renderGroup("Standalone", standaloneItems, "bg-gray-200 dark:bg-slate-700 text-secondary", null, null, 'standalone-items');
            }
            const sortedProjects = [...this.projects].sort((a,b) => {
                 const pA = a.priority !== undefined ? a.priority : 5;
                 const pB = b.priority !== undefined ? b.priority : 5;
                 if (pA !== pB) return pA - pB;
                 return 0; 
            });

            sortedProjects.forEach(p => {
                 const pItems = allItems.filter(i => i.projectId === p.id).sort((a,b) => {
                     if (a.isGeneral && !b.isGeneral) return -1;
                     if (!a.isGeneral && b.isGeneral) return 1;
                     return sortByDate(a,b);
                 });
                 if (pItems.length > 0) {
                     contentHtml += renderGroup(p.name, pItems, "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200 border-indigo-100", p.id, p.priority, `proj-${p.id}`);
                 }
            });
            
        } else if (this.actionHubGroupMode === 'context') {
            const contextBuckets = {};
            const noContextBucket = [];
            allItems.forEach(item => {
                const itemTags = item.tags || [];
                const relevantTags = itemTags.filter(t => t.startsWith('@') || t.startsWith('#'));
                if (relevantTags.length === 0) { noContextBucket.push(item); } 
                else { relevantTags.forEach(tag => { if (!contextBuckets[tag]) contextBuckets[tag] = []; contextBuckets[tag].push(item); }); }
            });
            if (noContextBucket.length > 0) contentHtml += renderGroup("Clarify (No Context)", noContextBucket, "bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-amber-200", null, null, 'ctx-none');
            Object.keys(contextBuckets).sort().forEach(tag => contentHtml += renderGroup(tag, contextBuckets[tag], "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200", null, null, `ctx-${tag}`));

        } else {
            // Month View Grouping
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const monthBuckets = {};
            const noDateBucket = [];

            allItems.sort(sortByDate);

            allItems.forEach(item => {
                if (!item.rawDate) {
                    noDateBucket.push(item);
                    return;
                }

                const d = item.rawDate;
                const key = `${d.getFullYear()}-${d.getMonth()}`; 
                
                if (!monthBuckets[key]) {
                    monthBuckets[key] = {
                        title: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
                        date: new Date(d.getFullYear(), d.getMonth(), 1),
                        items: [],
                        idKey: key
                    };
                }
                monthBuckets[key].items.push(item);
            });

            const sortedKeys = Object.keys(monthBuckets).sort((a, b) => {
                const [y1, m1] = a.split('-').map(Number);
                const [y2, m2] = b.split('-').map(Number);
                return (y1 * 12 + m1) - (y2 * 12 + m2);
            });

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();

            sortedKeys.forEach(key => {
                const group = monthBuckets[key];
                const groupDate = group.date;
                let headerClass = "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200";

                if (groupDate.getFullYear() < currentYear || (groupDate.getFullYear() === currentYear && groupDate.getMonth() < currentMonth)) {
                    headerClass = "bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 border-red-100";
                    group.title += " (Past)";
                } 
                else if (groupDate.getFullYear() === currentYear && groupDate.getMonth() === currentMonth) {
                    headerClass = "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 border-blue-200";
                    group.title += " (Current)";
                }

                contentHtml += renderGroup(group.title, group.items, headerClass, null, null, `month-${group.idKey}`);
            });

            if (noDateBucket.length > 0) {
                noDateBucket.sort((a,b) => a.path.localeCompare(b.path));
                contentHtml += renderGroup("Backlog / No Date", noDateBucket, "bg-gray-200 dark:bg-slate-700 text-secondary", null, null, 'backlog');
            }
        }
        
        if (contentHtml === '') contentHtml = `<div class="upcoming-card p-4 rounded-xl shadow-md text-center text-secondary">No visible tasks found.</div>`;
        container.innerHTML = toolbarHtml + contentHtml;
    },

    renderGanttView() {
        const container = this.elements.projectsContainer;
        container.innerHTML = '';

        if (this.projects.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-400 mt-10">No projects found. Click "Add Project" to start.</div>`;
            return;
        }

        let filteredProjects = [...this.projects];
        if (this.hideCompletedProjects) {
            filteredProjects = filteredProjects.filter(p => p.overallProgress < 100);
        }

        const sortedProjects = filteredProjects.sort((a, b) => {
            // 1. Completion Status (Completed items always sink to the absolute bottom)
            const aComplete = a.overallProgress >= 100;
            const bComplete = b.overallProgress >= 100;
            if (aComplete && !bComplete) return 1;
            if (!aComplete && bComplete) return -1;
            
            // 2. [NEW] Exclusion Status (Excluded items sink below Active items)
            const aExcluded = a.excludeFromStats === true;
            const bExcluded = b.excludeFromStats === true;
            if (aExcluded && !bExcluded) return 1;
            if (!aExcluded && bExcluded) return -1;

            // 3. Priority (Ascending: 1 is top, 10 is bottom)
            const pA = a.priority !== undefined ? a.priority : 5;
            const pB = b.priority !== undefined ? b.priority : 5;
            if (pA !== pB) return pA - pB;

            // 4. End Date (Earliest first)
            return this.sortByEndDate(a, b, 'endDate');
        });

        sortedProjects.forEach((project) => {
            const projectCard = document.createElement('div');
            projectCard.className = `project-card p-3 rounded-xl mb-4`;
            
            // Visual Fade for Excluded Projects (Optional: makes them look "muted")
            if (project.excludeFromStats && project.overallProgress < 100) {
                projectCard.style.opacity = '0.85'; 
            }

            const isComplete = project.overallProgress >= 100;
            let completionIcon = isComplete ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>` : '';

            // Stats Toggle Icon
            const statsIcon = project.excludeFromStats 
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>` 
                : `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`;

            const durationProgress = this.getDurationProgress(project.startDate, project.endDate);
            const daysLeftInfo = this.getDaysLeft(project.endDate);
            const overallProgress = Math.round(project.overallProgress);
            
            let progressColor = 'var(--green)';
            let statusText = '';
            let statusColorClass = '';

            if (isComplete) {
                progressColor = 'var(--green)';
                statusText = 'Complete';
                statusColorClass = 'status-complete';
            } else if (daysLeftInfo.isOverdue) {
                progressColor = 'var(--red)';
                statusText = 'Late';
                statusColorClass = 'status-late';
            } else if (overallProgress < durationProgress) {
                progressColor = 'var(--amber)';
                statusText = 'At Risk';
                statusColorClass = 'status-at-risk';
            } else {
                progressColor = 'var(--blue)';
                statusText = 'On Track';
                statusColorClass = 'status-on-track';
            }

            const tooltipText = `
                <div class="tooltip-grid">
                    <span>Status:</span><span class="status-pill ${statusColorClass}">${statusText}</span>
                    <span>Completion:</span><span>${overallProgress}%</span>
                    <span>Time Elapsed:</span><span>${Math.round(durationProgress)}%</span>
                    <span>Days Left:</span><span>${daysLeftInfo.days !== null ? daysLeftInfo.days : 'N/A'}</span>
                </div>
            `;

            const pacingBarHTML = `
                <div class="duration-scale-container tooltip">
                    <span class="tooltip-text">${tooltipText}</span>
                    <div class="relative h-2 w-full rounded-full" style="background-color: var(--bg-tertiary);">
                        <div class="absolute h-2 top-0 left-0 rounded-full" style="background-color: var(--bg-tertiary); width: ${durationProgress}%; z-index: 1;"></div>
                        <div class="absolute h-2 top-0 left-0 rounded-full" style="background-color: ${progressColor}; width: ${overallProgress}%; z-index: 2;"></div>
                    </div>
                </div>
            `;

            const daysLeftPillHTML = (isComplete || !daysLeftInfo.text || daysLeftInfo.text === '-') 
                ? '' 
                : `<div class="days-left-pill ${daysLeftInfo.className}" title="${daysLeftInfo.tooltip}">${daysLeftInfo.text}</div>`;

            const lockIcon = project.locked
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/></svg>`;
            
            const commentDot = project.comments && project.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';

            let generalBinHtml = '';
            if (project.generalTasks && project.generalTasks.length > 0) {
                const taskListHtml = this.renderTaskList(project.id, null, project.generalTasks);
                generalBinHtml = `
                    <div class="general-bin-container">
                        <div class="general-bin-header">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                            <span>General / Inbox (${project.generalTasks.length})</span>
                        </div>
                        <div class="space-y-1">
                            ${taskListHtml}
                        </div>
                    </div>
                `;
            }

            const priorityVal = project.priority || 5;
            let priorityOptions = '';
            for(let i=1; i<=10; i++) {
                priorityOptions += `<option value="${i}" ${i === priorityVal ? 'selected' : ''}>P${i}</option>`;
            }
            const prioritySelect = `
                <select onchange="timelineApp.updateProjectPriority(${project.id}, this.value)" class="priority-select" title="Priority Order">
                    ${priorityOptions}
                </select>
            `;

            projectCard.innerHTML = `
                <div class="flex justify-between items-center mb-3 project-header">
                    <div class="flex items-center gap-2 flex-grow min-w-0">
                        ${completionIcon}
                        
                        <button onclick="timelineApp.toggleProjectStats(${project.id})" class="stats-btn ${project.excludeFromStats ? 'excluded' : ''} flex-shrink-0" title="${project.excludeFromStats ? 'Project Excluded from Review' : 'Exclude from Review Stats'}">
                            ${statsIcon}
                        </button>

                        <button onclick="timelineApp.toggleProjectCollapse(${project.id})" class="p-1 rounded-full hover-bg-secondary flex-shrink-0">
                            <svg id="chevron-${project.id}" class="w-5 h-5 text-tertiary chevron ${project.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </button>
                        ${commentDot}
                        <h3 class="text-xl font-bold truncate editable-text" onclick="timelineApp.makeEditable(this, 'updateProjectName', ${project.id})">${project.name}</h3>
                        ${pacingBarHTML}
                        ${daysLeftPillHTML}
                    </div>
                    <div class="flex items-center gap-2 text-sm text-secondary flex-shrink-0">
                        ${prioritySelect}
                        
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
                    
                    ${generalBinHtml}
                    
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
                const chartContainer = document.getElementById(`chart-${project.id}`);
                if (chartContainer) {
                    chartContainer.innerHTML = `<div class="flex items-center justify-center h-full text-gray-400">Set project start and end dates to see progress chart.</div>`;
                }
            }
        });
    },

    renderGanttView() {
        const container = this.elements.projectsContainer;
        container.innerHTML = '';

        if (this.projects.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-400 mt-10">No projects found. Click "Add Project" to start.</div>`;
            return;
        }

        let filteredProjects = [...this.projects];
        if (this.hideCompletedProjects) {
            filteredProjects = filteredProjects.filter(p => p.overallProgress < 100);
        }

        const sortedProjects = filteredProjects.sort((a, b) => {
            // 1. Completion Status
            const aComplete = a.overallProgress >= 100;
            const bComplete = b.overallProgress >= 100;
            if (aComplete && !bComplete) return 1;
            if (!aComplete && bComplete) return -1;
            
            // 2. Exclusion Status
            const aExcluded = a.excludeFromStats === true;
            const bExcluded = b.excludeFromStats === true;
            if (aExcluded && !bExcluded) return 1;
            if (!aExcluded && bExcluded) return -1;

            // 3. Priority
            const pA = a.priority !== undefined ? a.priority : 5;
            const pB = b.priority !== undefined ? b.priority : 5;
            if (pA !== pB) return pA - pB;

            // 4. End Date
            return this.sortByEndDate(a, b, 'endDate');
        });

        sortedProjects.forEach((project) => {
            const projectCard = document.createElement('div');
            projectCard.className = `project-card p-3 rounded-xl mb-4`;
            
            if (project.excludeFromStats && project.overallProgress < 100) {
                projectCard.style.opacity = '0.85'; 
            }

            const isComplete = project.overallProgress >= 100;
            let completionIcon = isComplete ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>` : '';

            const statsIcon = project.excludeFromStats 
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>` 
                : `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`;

            const durationProgress = this.getDurationProgress(project.startDate, project.endDate);
            const daysLeftInfo = this.getDaysLeft(project.endDate);
            const overallProgress = Math.round(project.overallProgress);
            
            let progressColor = 'var(--green)';
            let statusText = '';
            let statusColorClass = '';

            // --- REVISED COLOR LOGIC ---
            if (isComplete) {
                progressColor = 'var(--green)';
                statusText = 'Complete';
                statusColorClass = 'status-complete';
            } else if (daysLeftInfo.isOverdue) {
                progressColor = 'var(--red)'; // Overdue = Red
                statusText = 'Overdue';
                statusColorClass = 'status-late';
            } else if (overallProgress < durationProgress) {
                progressColor = 'var(--amber)'; // Behind schedule = Yellow/Amber
                statusText = 'At Risk';
                statusColorClass = 'status-at-risk';
            } else {
                progressColor = 'var(--green)'; // On track = Green
                statusText = 'On Track';
                statusColorClass = 'status-on-track';
            }
            // ---------------------------

            const tooltipText = `
                <div class="tooltip-grid">
                    <span>Status:</span><span class="status-pill ${statusColorClass}">${statusText}</span>
                    <span>Completion:</span><span>${overallProgress}%</span>
                    <span>Time Elapsed:</span><span>${Math.round(durationProgress)}%</span>
                    <span>Days Left:</span><span>${daysLeftInfo.days !== null ? daysLeftInfo.days : 'N/A'}</span>
                </div>
            `;

            // --- REVISED BAR HTML (Only shows completion %) ---
            const pacingBarHTML = `
                <div class="duration-scale-container tooltip">
                    <span class="tooltip-text">${tooltipText}</span>
                    <div class="relative h-2 w-full rounded-full" style="background-color: var(--bg-tertiary);">
                        <div class="absolute h-2 top-0 left-0 rounded-full" style="background-color: ${progressColor}; width: ${overallProgress}%; z-index: 2;"></div>
                    </div>
                </div>
            `;
            // --------------------------------------------------

            const daysLeftPillHTML = (isComplete || !daysLeftInfo.text || daysLeftInfo.text === '-') 
                ? '' 
                : `<div class="days-left-pill ${daysLeftInfo.className}" title="${daysLeftInfo.tooltip}">${daysLeftInfo.text}</div>`;

            const lockIcon = project.locked
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/></svg>`;
            
            const commentDot = project.comments && project.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';

            let generalBinHtml = '';
            if (project.generalTasks && project.generalTasks.length > 0) {
                const taskListHtml = this.renderTaskList(project.id, null, project.generalTasks);
                generalBinHtml = `
                    <div class="general-bin-container">
                        <div class="general-bin-header">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                            <span>General / Inbox (${project.generalTasks.length})</span>
                        </div>
                        <div class="space-y-1">
                            ${taskListHtml}
                        </div>
                    </div>
                `;
            }

            const priorityVal = project.priority || 5;
            let priorityOptions = '';
            for(let i=1; i<=10; i++) {
                priorityOptions += `<option value="${i}" ${i === priorityVal ? 'selected' : ''}>P${i}</option>`;
            }
            const prioritySelect = `
                <select onchange="timelineApp.updateProjectPriority(${project.id}, this.value)" class="priority-select" title="Priority Order">
                    ${priorityOptions}
                </select>
            `;

            projectCard.innerHTML = `
                <div class="flex justify-between items-center mb-3 project-header">
                    <div class="flex items-center gap-2 flex-grow min-w-0">
                        ${completionIcon}
                        
                        <button onclick="timelineApp.toggleProjectStats(${project.id})" class="stats-btn ${project.excludeFromStats ? 'excluded' : ''} flex-shrink-0" title="${project.excludeFromStats ? 'Project Excluded from Review' : 'Exclude from Review Stats'}">
                            ${statsIcon}
                        </button>

                        <button onclick="timelineApp.toggleProjectCollapse(${project.id})" class="p-1 rounded-full hover-bg-secondary flex-shrink-0">
                            <svg id="chevron-${project.id}" class="w-5 h-5 text-tertiary chevron ${project.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </button>
                        ${commentDot}
                        <h3 class="text-xl font-bold truncate editable-text" onclick="timelineApp.makeEditable(this, 'updateProjectName', ${project.id})">${project.name}</h3>
                        ${pacingBarHTML}
                        ${daysLeftPillHTML}
                    </div>
                    <div class="flex items-center gap-2 text-sm text-secondary flex-shrink-0">
                        ${prioritySelect}
                        
                        <button onclick="timelineApp.generatePrintView(${project.id})" class="print-btn" title="Print Project">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd" /></svg>
                        </button>
                        <button onclick="timelineApp.toggleCommentSection('project', ${project.id})" class="comment-btn" title="Comments">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                        </button>
                        <button onclick="timelineApp.toggleProjectLock(${project.id})" class="lock-toggle-btn" title="${project.locked ? 'Unlock Project Dates' : 'Lock Project Dates'}">
                            ${lockIcon}
                        </button>
                        
                        ${this.renderDateRangePill(project.startDate, project.endDate, project.id, null, null, null, project.locked, false)}

                    </div>
                    <button onclick="timelineApp.deleteProject(${project.id})" class="text-gray-400 hover:text-red-500 transition-colors text-xl font-bold ml-4 flex-shrink-0">&times;</button>
                </div>
                <div id="project-body-${project.id}" class="${project.collapsed ? 'hidden' : ''}">
                    <div id="comment-section-project-${project.id}" class="comment-section hidden"></div>
                    <div class="relative">
                        <button onclick="timelineApp.resetZoom(${project.id})" class="reset-zoom-btn btn-secondary px-2 py-1 text-xs font-semibold rounded-md ${!project.zoomDomain ? 'hidden' : ''}">Reset Zoom</button>
                        <div id="chart-${project.id}" class="w-full h-48 mb-3 relative"></div>
                    </div>
                    
                    ${generalBinHtml}
                    
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
                const chartContainer = document.getElementById(`chart-${project.id}`);
                if (chartContainer) {
                    chartContainer.innerHTML = `<div class="flex items-center justify-center h-full text-gray-400">Set project start and end dates to see progress chart.</div>`;
                }
            }
        });
    },

    renderPhaseList(project) {
        const phaseContainer = document.getElementById(`phases-${project.id}`);
        let html = '';
        const sortedPhases = [...project.phases].sort((a, b) => this.sortByEndDate(a, b, 'endDate'));

        sortedPhases.forEach((phase) => {
            const hasTasks = phase.tasks && phase.tasks.length > 0;
            const toggleButton = hasTasks ?
                `<button onclick="timelineApp.togglePhaseCollapse(${project.id}, ${phase.id})" class="p-1 rounded-full hover-bg-tertiary flex-shrink-0">
                    <svg id="phase-chevron-${phase.id}" class="w-4 h-4 text-tertiary chevron ${phase.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>` : `<div class="w-6 h-6 flex-shrink-0"></div>`;

            const depClass = this.dependencyMode && this.firstSelectedItem?.id !== phase.id ? 'dependency-candidate' : '';
            const selectedClass = this.firstSelectedItem?.id === phase.id ? 'dependency-selected' : '';
            const commentDot = phase.comments && phase.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';
            
            // --- NEW PROGRESS BAR LOGIC ---
            const durationProgress = this.getDurationProgress(phase.effectiveStartDate, phase.effectiveEndDate);
            const actualProgress = phase.progress || 0;
            
            let barColorClass = 'bg-green-500'; // Default On Track

            if (phase.completed) {
                barColorClass = 'bg-green-500'; // Complete
            } else if (durationProgress >= 100) {
                barColorClass = 'bg-red-500'; // Overdue
            } else if (actualProgress < durationProgress) {
                barColorClass = 'bg-yellow-500'; // At Risk
            } else {
                barColorClass = 'bg-green-500'; // On Track
            }
            // ------------------------------

            const lockIcon = phase.locked
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/></svg>`;

            html += `
                <div class="phase-row rounded-lg p-2 ${depClass} ${selectedClass}" data-id="${phase.id}" data-type="phase" data-project-id="${project.id}" onmouseover="timelineApp.highlightPhaseOnChart(${phase.id})" onmouseout="timelineApp.unhighlightPhaseOnChart(${phase.id})">
                    <div class="flex items-center gap-3 item-main-row">
                        ${toggleButton}
                        ${commentDot}
                        <div class="text-xs font-bold text-secondary w-10 text-center flex-shrink-0">${Math.round(actualProgress)}%</div>
                        <div class="duration-scale-container" title="Completion Status">
                            <div class="duration-scale-bar ${barColorClass}" style="width: ${actualProgress}%;"></div>
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
                            
                            ${this.renderDateRangePill(phase.startDate, phase.endDate, project.id, phase.id, null, null, phase.locked, phase.isDriven)}
                        
                        </div>
                        <button onclick="timelineApp.deletePhase(${project.id}, ${phase.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold ml-2">&times;</button>
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
        const sortedTasks = [...tasks].sort((a, b) => {
            if (a.isFollowUp && !b.isFollowUp) return -1;
            if (!a.isFollowUp && b.isFollowUp) return 1;
            if (a.isFollowUp && b.isFollowUp) {
                const dateA = a.followUpDate ? new Date(a.followUpDate) : new Date(9999, 11, 31);
                const dateB = b.followUpDate ? new Date(b.followUpDate) : new Date(9999, 11, 31);
                return dateA - dateB;
            }
            return this.sortByEndDate(a, b, 'effectiveEndDate');
        });

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
            
            // --- NEW PROGRESS BAR LOGIC ---
            const durationProgress = this.getDurationProgress(task.effectiveStartDate, task.effectiveEndDate);
            const actualProgress = task.progress || (task.completed ? 100 : 0);
            
            let barColorClass = 'bg-green-500';

            if (task.completed) {
                barColorClass = 'bg-green-500';
            } else if (durationProgress >= 100) {
                barColorClass = 'bg-red-500';
            } else if (actualProgress < durationProgress) {
                barColorClass = 'bg-yellow-500';
            } else {
                barColorClass = 'bg-green-500';
            }
            // ------------------------------

            // Tasks with subtasks are effectively locked (rollup)
            const isTaskLocked = hasSubtasks; 
            const followUpClass = task.isFollowUp ? 'follow-up-active' : '';
            const followUpIconColor = task.isFollowUp ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 hover:text-purple-500';
            
            const followUpDateHtml = task.isFollowUp ? `
                <div class="date-input-container mr-2">
                    <input type="text" 
                        value="${task.followUpDate ? this.formatDate(this.parseDate(task.followUpDate)) : ''}" 
                        class="date-input border-purple-300 dark:border-purple-700 font-bold text-purple-700 dark:text-purple-300" 
                        placeholder="Follow Up"
                        data-project-id="${projectId}" 
                        data-phase-id="${phaseId}" 
                        data-task-id="${task.id}" 
                        data-type="task-followup" 
                        data-date="${task.followUpDate || ''}" 
                        oninput="timelineApp.formatDateInput(event)" 
                        onblur="timelineApp.handleManualDateInput(event)" 
                        onkeydown="timelineApp.handleDateInputKeydown(event)">
                    <div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                </div>
            ` : '';

            const tags = task.tags || [];
            const tagHtml = tags.map(tag => `
                <span class="tag-badge">
                    ${tag}
                    <span onclick="event.stopPropagation(); timelineApp.removeTag(${projectId}, ${phaseId}, ${task.id}, null, '${tag}')" class="tag-remove">&times;</span>
                </span>
            `).join('');

            const tagMenuHtml = `
                <div class="relative inline-block ml-2">
                    <button onclick="timelineApp.toggleTagMenu(event, ${projectId}, ${phaseId}, ${task.id}, null)" class="add-tag-btn" title="Add Tag">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                        <span class="ml-0.5 text-[10px]">+</span>
                    </button>
                    <div id="tag-menu-${task.id}" class="tag-menu-dropdown hidden" onclick="event.stopPropagation()">
                        <input type="text" id="tag-input-${task.id}" class="tag-menu-input" placeholder="Search or create..." 
                            onkeyup="timelineApp.handleTagInput(event, ${projectId}, ${phaseId}, ${task.id}, null)">
                        <div id="tag-options-${task.id}" class="tag-menu-options"></div>
                    </div>
                </div>
            `;

            html += `
                <div class="task-row rounded-lg px-2 py-1 ${depClass} ${selectedClass} ${followUpClass}" data-id="${task.id}" data-type="task" data-project-id="${projectId}" data-phase-id="${phaseId}">
                    <div class="flex items-center gap-3 item-main-row">
                        ${toggleButton}
                        ${commentDot}
                        ${taskControlHtml}
                        <div class="duration-scale-container" title="Completion Status">
                            <div class="duration-scale-bar ${barColorClass}" style="width: ${actualProgress}%;"></div>
                        </div>
                        <div class="flex-grow flex items-center gap-2 flex-wrap">
                            <span class="font-medium editable-text" onclick="timelineApp.makeEditable(this, 'updateTaskName', ${projectId}, ${phaseId}, ${task.id})">${task.name}</span>
                            <div class="flex items-center">${tagHtml}${tagMenuHtml}</div>
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
                        
                        <div class="flex items-center">
                            ${followUpDateHtml}
                            <button onclick="timelineApp.toggleTaskFollowUp(${projectId}, ${phaseId}, ${task.id})" 
                                    class="p-1 rounded-md ${followUpIconColor} transition-colors" 
                                    title="Toggle Follow Up">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="${task.isFollowUp ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </button>
                        </div>

                        <div class="flex items-center gap-2 text-sm text-secondary">
                            <button onclick="timelineApp.toggleCommentSection('task', ${projectId}, ${phaseId}, ${task.id})" class="comment-btn" title="Comments">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                            </button>
                            
                            ${this.renderDateRangePill(task.startDate, task.endDate, projectId, phaseId, task.id, null, isTaskLocked, task.isDriven)}
                            
                        </div>
                        
                        <button onclick="timelineApp.handleProcessItem(${projectId}, ${phaseId}, ${task.id}, null)" class="text-gray-400 hover:text-blue-500 transition-colors ml-2" title="Process / Move">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </button>

                        <button onclick="timelineApp.deleteTask(${projectId}, ${phaseId}, ${task.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold ml-2">&times;</button>
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
        const sortedSubtasks = [...subtasks].sort((a,b) => {
            if (a.isFollowUp && !b.isFollowUp) return -1;
            if (!a.isFollowUp && b.isFollowUp) return 1;
            if (a.isFollowUp && b.isFollowUp) {
                const dateA = a.followUpDate ? new Date(a.followUpDate) : new Date(9999, 11, 31);
                const dateB = b.followUpDate ? new Date(b.followUpDate) : new Date(9999, 11, 31);
                return dateA - dateB;
            }
            return this.sortByEndDate(a, b, 'endDate');
        });

        sortedSubtasks.forEach(subtask => {
            const depClass = this.dependencyMode && this.firstSelectedItem?.id !== subtask.id ? 'dependency-candidate' : '';
            const selectedClass = this.firstSelectedItem?.id === subtask.id ? 'dependency-selected' : '';
            const commentDot = subtask.comments && subtask.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';
            
            // --- NEW PROGRESS BAR LOGIC ---
            const durationProgress = this.getDurationProgress(subtask.startDate, subtask.endDate);
            const actualProgress = subtask.completed ? 100 : 0;
            
            let barColorClass = 'bg-green-500';

            if (subtask.completed) {
                barColorClass = 'bg-green-500';
            } else if (durationProgress >= 100) {
                barColorClass = 'bg-red-500';
            } else if (actualProgress < durationProgress) {
                barColorClass = 'bg-yellow-500';
            } else {
                barColorClass = 'bg-green-500';
            }
            // ------------------------------
            
            const followUpClass = subtask.isFollowUp ? 'follow-up-active' : '';
            const followUpIconColor = subtask.isFollowUp ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 hover:text-purple-500';
            
            const followUpDateHtml = subtask.isFollowUp ? `
                <div class="date-input-container mr-2">
                    <input type="text" 
                        value="${subtask.followUpDate ? this.formatDate(this.parseDate(subtask.followUpDate)) : ''}" 
                        class="date-input border-purple-300 dark:border-purple-700 font-bold text-purple-700 dark:text-purple-300" 
                        placeholder="Follow Up"
                        data-project-id="${projectId}" 
                        data-phase-id="${phaseId}" 
                        data-task-id="${taskId}" 
                        data-subtask-id="${subtask.id}"
                        data-type="subtask-followup" 
                        data-date="${subtask.followUpDate || ''}" 
                        oninput="timelineApp.formatDateInput(event)" 
                        onblur="timelineApp.handleManualDateInput(event)" 
                        onkeydown="timelineApp.handleDateInputKeydown(event)">
                    <div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                </div>
            ` : '';

            const tags = subtask.tags || [];
            const tagHtml = tags.map(tag => `
                <span class="tag-badge">
                    ${tag}
                    <span onclick="event.stopPropagation(); timelineApp.removeTag(${projectId}, ${phaseId}, ${taskId}, ${subtask.id}, '${tag}')" class="tag-remove">&times;</span>
                </span>
            `).join('');

            const tagMenuHtml = `
                <div class="relative inline-block ml-2">
                    <button onclick="timelineApp.toggleTagMenu(event, ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="add-tag-btn" title="Add Tag">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                        <span class="ml-0.5 text-[10px]">+</span>
                    </button>
                    <div id="tag-menu-${subtask.id}" class="tag-menu-dropdown hidden" onclick="event.stopPropagation()">
                        <input type="text" id="tag-input-${subtask.id}" class="tag-menu-input" placeholder="Search or create..." 
                            onkeyup="timelineApp.handleTagInput(event, ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})">
                        <div id="tag-options-${subtask.id}" class="tag-menu-options"></div>
                    </div>
                </div>
            `;

            html += `
                <div class="subtask-row-wrapper">
                    <div class="flex items-center gap-3 subtask-row ${depClass} ${selectedClass} ${followUpClass}" data-id="${subtask.id}" data-type="subtask" data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}">
                        ${commentDot}
                        <input type="checkbox" class="custom-checkbox" onchange="timelineApp.toggleSubtaskComplete(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" ${subtask.completed ? 'checked' : ''}>
                        <div class="duration-scale-container" title="Completion Status">
                            <div class="duration-scale-bar ${barColorClass}" style="width: ${actualProgress}%;"></div>
                        </div>
                        <div class="flex-grow flex items-center flex-wrap gap-2">
                            <span class="text-sm ${subtask.completed ? 'line-through opacity-60' : ''} editable-text" onclick="timelineApp.makeEditable(this, 'updateSubtaskName', ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})">${subtask.name}</span>
                            <div class="flex items-center">${tagHtml}${tagMenuHtml}</div>
                        </div>
                        ${this.getDependencyIcon(subtask)}
                        
                        <div class="flex items-center">
                            ${followUpDateHtml}
                            <button onclick="timelineApp.toggleSubtaskFollowUp(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" 
                                    class="p-1 rounded-md ${followUpIconColor} transition-colors" 
                                    title="Toggle Follow Up">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="${subtask.isFollowUp ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </button>
                        </div>
                        
                        <button onclick="timelineApp.toggleCommentSection('subtask', ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="comment-btn" title="Comments">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                        </button>
                        
                        ${this.renderDateRangePill(subtask.startDate, subtask.endDate, projectId, phaseId, taskId, subtask.id, false, subtask.isDriven)}

                        <button onclick="timelineApp.handleProcessItem(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="text-gray-400 hover:text-blue-500 transition-colors ml-2" title="Process / Move">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </button>

                        <button onclick="timelineApp.deleteSubtask(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold w-5 text-center flex-shrink-0 ml-2">&times;</button>
                    </div>
                    <div id="comment-section-subtask-${subtask.id}" class="comment-section hidden"></div>
                </div>
                `;
        });
        return html + '</div>';
    },

    toggleActionHubGroup(id) {
        const group = document.getElementById(`hub-group-${id}`);
        const chevron = document.getElementById(`hub-chevron-${id}`);
        
        if (group) {
            // Toggle visibility
            group.classList.toggle('hidden');
            const isCollapsed = group.classList.contains('hidden');

            // Rotate Chevron
            if (chevron) {
                if (isCollapsed) chevron.classList.add('-rotate-90');
                else chevron.classList.remove('-rotate-90');
            }

            // Save State to LocalStorage
            if (!this.hubCollapsedStates) this.hubCollapsedStates = {};
            this.hubCollapsedStates[id] = isCollapsed;
            localStorage.setItem('timelineHubCollapsedStates', JSON.stringify(this.hubCollapsedStates));
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

                // This section now uses the corrected helper function
                const tickInterval = this.getTickInterval(x.domain());
                const tickFormat = this.getTickFormat(x.domain());
                svg.append("g").attr("class", "chart-grid").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(tickInterval).tickFormat(tickFormat));

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
        const container = document.getElementById('load-chart');
        if (!container) return;

        container.innerHTML = '';

        // Helper to get local YYYY-MM-DD string to avoid UTC timezone shifts
        const getLocalISODate = (date) => {
            const offset = date.getTimezoneOffset() * 60000;
            return new Date(date.getTime() - offset).toISOString().split('T')[0];
        };

        // 1. Calculate Next 10 Business Days
        const businessDays = [];
        let cursor = new Date();
        cursor.setHours(0, 0, 0, 0); // Local Midnight
        
        while (businessDays.length < 10) {
            const day = cursor.getDay();
            if (day !== 0 && day !== 6) { // 0 = Sun, 6 = Sat
                businessDays.push(new Date(cursor));
            }
            cursor.setDate(cursor.getDate() + 1);
        }

        // 2. Collect Active Tasks (Strictly by Due Date)
        const dailyBuckets = new Map(); 
        
        // Initialize buckets for our 10 days using local date keys
        businessDays.forEach(d => {
            dailyBuckets.set(getLocalISODate(d), []);
        });

        // Helper to place item in the specific bucket
        const placeInBucket = (dateStr, meta) => {
             if (!dateStr) return;
             const date = this.parseDate(dateStr); // app.js parseDate (d3.timeParse) returns Local Date
             if (!date) return;
             
             // Normalize to YYYY-MM-DD (Local) to match bucket keys
             const key = getLocalISODate(date);
             
             if (dailyBuckets.has(key)) {
                 dailyBuckets.get(key).push(meta);
             }
        };

        this.projects.forEach(project => {
            if (project.excludeFromStats) return;

            // Project Tasks
            project.phases.forEach(phase => {
                phase.tasks.forEach(task => {
                    const hasSubtasks = task.subtasks && task.subtasks.length > 0;

                    if (hasSubtasks) {
                        task.subtasks.forEach(sub => {
                            if (sub.endDate && sub.progress < 100) {
                                placeInBucket(sub.endDate, {
                                    id: sub.id,
                                    name: `${task.name}: ${sub.name}`,
                                    projectId: project.id, 
                                    phaseId: phase.id, 
                                    taskId: task.id, 
                                    subtaskId: sub.id,
                                    completed: false
                                });
                            }
                        });
                    } else {
                        const dueDate = task.effectiveEndDate || task.endDate;
                        if (dueDate && task.progress < 100) {
                            placeInBucket(dueDate, { 
                                id: task.id, 
                                name: task.name, 
                                projectId: project.id, 
                                phaseId: phase.id, 
                                taskId: task.id, 
                                subtaskId: null,
                                completed: false
                            });
                        }
                    }
                });
            });

            // General Tasks
            project.generalTasks.forEach(task => {
                 const dueDate = task.effectiveEndDate || task.endDate;
                 if (dueDate && task.progress < 100) {
                     placeInBucket(dueDate, {
                        id: task.id, 
                        name: task.name, 
                        projectId: project.id, 
                        phaseId: null, 
                        taskId: task.id, 
                        subtaskId: null,
                        completed: false
                     });
                 }
            });
        });

        // 3. Setup D3 Chart
        const margin = { top: 20, right: 30, bottom: 30, left: 40 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = 200 - margin.top - margin.bottom;

        const svg = d3.select(container).append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // X Scale (Business Days)
        // Use keys directly to ensure alignment
        const x = d3.scaleBand()
            .domain(Array.from(dailyBuckets.keys())) 
            .range([0, width])
            .padding(0.2);

        // Find max stack size to determine Y scale
        let maxLoad = 0;
        dailyBuckets.forEach(tasks => {
            if (tasks.length > maxLoad) maxLoad = tasks.length;
        });
        
        maxLoad = Math.max(maxLoad, 5);

        const y = d3.scaleLinear()
            .domain([0, maxLoad])
            .range([height, 0]);

        // 4. Draw Axes
        const xAxis = d3.axisBottom(x)
            .tickFormat(d => {
                // d is "YYYY-MM-DD"
                // We construct the date manually to prevent any UTC conversion shifts
                const [y, m, day] = d.split('-').map(Number);
                const date = new Date(y, m - 1, day); 
                return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
            });

        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("text-anchor", "middle");

        svg.append("g")
            .call(d3.axisLeft(y).ticks(5));

        // 5. Draw Task Boxes
        let tooltip = d3.select("body").select(".chart-tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
        }

        const boxHeight = (height / maxLoad) - 1; // -1 for gap
        
        dailyBuckets.forEach((tasks, dateKey) => {
            const dayGroup = svg.append("g")
                .attr("transform", `translate(${x(dateKey)}, 0)`);

            dayGroup.selectAll("rect")
                .data(tasks)
                .enter()
                .append("rect")
                .attr("x", 0)
                .attr("y", (d, i) => y(i + 1)) // Stack from bottom up
                .attr("width", x.bandwidth())
                .attr("height", y(0) - y(1) - 1)
                .attr("fill", (d, i) => this.taskLoadChartColor(i))
                .attr("rx", 2)
                .style("cursor", "pointer")
                .on("mouseover", function(event, d) {
                    d3.select(this).style("opacity", 0.8);
                    tooltip.style("visibility", "visible")
                        .html(`<strong>${d.name}</strong><br>Click to go to task`);
                })
                .on("mousemove", (event) => {
                    tooltip.style("top", (event.pageY - 10) + "px")
                           .style("left", (event.pageX + 10) + "px");
                })
                .on("mouseout", function() {
                    d3.select(this).style("opacity", 1);
                    tooltip.style("visibility", "hidden");
                })
                .on("click", (event, d) => {
                    this.navigateToTask(d.projectId, d.phaseId, d.taskId, d.subtaskId);
                });
        });
        
        // Add "Business Days" Label
        svg.append("text")
            .attr("x", width)
            .attr("y", -5)
            .attr("text-anchor", "end")
            .style("font-size", "10px")
            .style("fill", "var(--text-secondary)")
            .text("Next 10 Business Days (Due)");
    },

    renderUpcomingTasks() {
            // Update Filter Dropdown
            const filterDropdown = this.elements.upcomingProjectFilter;
            const currentFilterValue = this.upcomingProjectFilter;
            filterDropdown.innerHTML = '<option value="all">All Projects</option>';
            this.projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                filterDropdown.appendChild(option);
            });
            filterDropdown.value = currentFilterValue;

            const container = document.getElementById('upcoming-tasks-container');
            container.innerHTML = '';
            
            let allItems = [];
            
            // Collect ALL tasks, regardless of date
            this.projects.forEach(project => {
                if (this.upcomingProjectFilter !== 'all' && project.id.toString() !== this.upcomingProjectFilter) return;

                project.phases.forEach(phase => {
                    phase.tasks.forEach(task => {
                        // Check Subtasks
                        if (task.subtasks && task.subtasks.length > 0) {
                            task.subtasks.forEach(subtask => {
                                allItems.push({
                                    date: subtask.endDate || 'No Date',
                                    rawDate: subtask.endDate ? this.parseDate(subtask.endDate) : null,
                                    path: `${project.name} > ${phase.name} > ${task.name}`,
                                    name: subtask.name,
                                    completed: subtask.completed,
                                    projectId: project.id, phaseId: phase.id, taskId: task.id, subtaskId: subtask.id
                                });
                            });
                        } else {
                            // Check Tasks
                            allItems.push({
                                date: task.effectiveEndDate || 'No Date',
                                rawDate: task.effectiveEndDate ? this.parseDate(task.effectiveEndDate) : null,
                                path: `${project.name} > ${phase.name}`,
                                name: task.name,
                                completed: task.completed,
                                projectId: project.id, phaseId: phase.id, taskId: task.id, subtaskId: null
                            });
                        }
                    });
                });
            });

            if (allItems.length === 0) {
                container.innerHTML = `<div class="upcoming-card p-4 rounded-xl shadow-md text-center text-secondary">No tasks found.</div>`;
                return;
            }

            // Split into Dated and Undated
            const datedItems = allItems.filter(i => i.rawDate !== null);
            const undatedItems = allItems.filter(i => i.rawDate === null);

            // Sort Dated Items
            datedItems.sort((a, b) => a.rawDate - b.rawDate);

            // Helper to render a group of tasks
            const renderGroup = (title, items, headerClass) => {
                if (items.length === 0) return '';
                let html = `<div class="upcoming-card rounded-xl shadow-md mb-4 overflow-hidden">
                    <div class="p-3 border-b border-primary ${headerClass}">
                        <h3 class="font-bold">${title} <span class="text-sm font-normal opacity-75">(${items.length})</span></h3>
                    </div>
                    <div class="p-3 space-y-2">`;
                    
                items.forEach(item => {
                    const completedClass = item.completed ? 'line-through opacity-60' : '';
                    html += `<div class="upcoming-task-item flex items-center text-sm ${completedClass}" onclick="timelineApp.navigateToTask(${item.projectId}, ${item.phaseId}, ${item.taskId}, ${item.subtaskId || 'null'})">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2 text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                        <div class="flex-grow min-w-0">
                            <div class="text-xs text-secondary truncate">${item.path}</div>
                            <div class="font-medium truncate">${item.name}</div>
                        </div>
                    </div>`;
                });
                return html + `</div></div>`;
            };

            let fullHtml = '';

            // 1. Render Overdue/Today/Upcoming (Grouped by Date)
            const groupedByDate = d3.group(datedItems, d => d.date);
            const today = new Date(); today.setHours(0,0,0,0);

            // Sort the dates
            const sortedDates = Array.from(groupedByDate.keys()).sort((a,b) => this.parseDate(a) - this.parseDate(b));

            sortedDates.forEach(dateStr => {
                const items = groupedByDate.get(dateStr);
                const dueDate = this.parseDate(dateStr);
                const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
                
                let label = this.formatDate(dueDate);
                let colorClass = 'bg-gray-100 dark:bg-slate-800';

                if (diffDays < 0) { 
                    label += ` (Overdue)`; 
                    colorClass = 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200'; 
                }
                else if (diffDays === 0) { 
                    label += ` (Today)`; 
                    colorClass = 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'; 
                }
                else if (diffDays === 1) { 
                    label += ` (Tomorrow)`; 
                    colorClass = 'bg-orange-200 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300'; 
                }
                
                fullHtml += renderGroup(label, items, colorClass);
            });

            // 2. Render Undated (Linear List at the end)
            if (undatedItems.length > 0) {
                fullHtml += renderGroup("Backlog / No Due Date", undatedItems, 'bg-gray-200 dark:bg-slate-700 text-secondary');
            }

            container.innerHTML = fullHtml;
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
            if (task) {
                task.collapsed = false;
            }

            // Force switch to Gantt view so the rows exist in the DOM
            this.projectViewMode = 'gantt';
            this.elements.btnViewGantt.classList.add('active');
            this.elements.btnViewLinear.classList.remove('active');
            this.updateProjectViewIndicator();

            // OPTIMIZATION: Pass false to skip recalculation
            this.renderProjects(false);

            // Scroll to the element
            setTimeout(() => {
                let element;
                if (subtaskId && subtaskId !== 'null') {
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
            if (!input.dataset.type.startsWith('new-project') && !input.dataset.type.startsWith('move')) {
                this.updateDate({ type: input.dataset.type, projectId: input.dataset.projectId === 'null' ? null : parseInt(input.dataset.projectId), phaseId: parseInt(input.dataset.phaseId), taskId: parseInt(input.dataset.taskId), subtaskId: parseInt(input.dataset.subtaskId), element: input }, null);
            }
            return;
        }

        const [month, day, year] = dateStr.split('/').map(p => parseInt(p, 10));
        const dateObj = new Date(year + 2000, month - 1, day);
        const newDate = dateObj.toISOString().split('T')[0], oldDate = input.dataset.date || null;
        
        if (input.dataset.type === 'new-project-start' || input.dataset.type === 'new-project-end' || input.dataset.type === 'move-followup') {
            input.dataset.date = newDate;
            return;
        }
        
        if (oldDate && oldDate !== newDate) {
            const context = { type: input.dataset.type, projectId: input.dataset.projectId === 'null' ? null : parseInt(input.dataset.projectId), phaseId: parseInt(input.dataset.phaseId), taskId: parseInt(input.dataset.taskId), subtaskId: parseInt(input.dataset.subtaskId), element: input };
            this.pendingDateChange = { context, newDate };
            this.elements.reasonModalTitle.textContent = 'Reason for Date Change';
            this.elements.reasonModalDetails.textContent = `Changing date from ${this.formatDate(this.parseDate(oldDate))} to ${this.formatDate(this.parseDate(newDate))}.`;
            this.elements.reasonModal.classList.remove('hidden');
            this.elements.reasonCommentTextarea.focus();
        } else if (!oldDate && newDate) {
            this.updateDate({ type: input.dataset.type, projectId: input.dataset.projectId === 'null' ? null : parseInt(input.dataset.projectId), phaseId: parseInt(input.dataset.phaseId), taskId: parseInt(input.dataset.taskId), subtaskId: parseInt(input.dataset.subtaskId), element: input }, newDate);
        }
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
            
            // --- MODIFIED SECTION START ---
            const defaultPhaseNames = ["Initiation", "Evaluation", "Disposition", "Implementation", "Release"];
            const baseId = Date.now();

            const phases = defaultPhaseNames.map((phaseName, index) => ({
                id: baseId + index + 1, // Offset ID slightly to ensure uniqueness vs project ID
                name: phaseName,
                startDate: null,
                endDate: null,
                collapsed: false,
                tasks: [],
                dependencies: [],
                dependents: []
            }));

            this.projects.push({ 
                id: baseId, 
                name, 
                startDate, 
                endDate, 
                originalStartDate: startDate, 
                originalEndDate: endDate, 
                collapsed: false, 
                phases: phases, // Use the new default phases array
                logs: [], 
                zoomDomain: null 
            });
            // --- MODIFIED SECTION END ---

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

    updateTaskName(projectId, phaseId, taskId, newName) {
        const t = this.getItem('task', projectId, phaseId, taskId);
        if (t) {
            t.name = newName;
            this.saveState();
        }
        },

    updateSubtaskName(projectId, phaseId, taskId, subtaskId, newName) { const s = this.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId)?.subtasks.find(st => st.id === subtaskId); if (s) { s.name = newName; this.saveState(); } },

    updateDate(context, value, comment = null, shouldLog = true) {
        const { projectId, phaseId, taskId, subtaskId, type } = context; 
        let project = null;
        let targetItem = null;
        let dateField = null;
        let itemName = '';

        if (projectId !== null && projectId !== 'null') {
            project = this.projects.find(p => p.id === projectId);
        }

        if (type.startsWith('project')) { 
            targetItem = project; 
            dateField = type.endsWith('start') ? 'startDate' : 'endDate'; 
            itemName = `Project '${project.name}'`; 
        } else {
            const task = this.getItem('task', projectId, phaseId, taskId);
            if (!task) return;
            targetItem = task;
            itemName = `Task '${task.name}'`;

            if (type.startsWith('task')) {
                dateField = type.includes('followup') ? 'followUpDate' : (type.endsWith('start') ? 'startDate' : 'endDate');
            } else if (type.startsWith('subtask')) {
                const subtask = task.subtasks.find(st => st.id === subtaskId);
                if (!subtask) return;
                targetItem = subtask;
                dateField = type.includes('followup') ? 'followUpDate' : (type.endsWith('start') ? 'startDate' : 'endDate');
                itemName = `Subtask '${subtask.name}'`;
            }
        }
        
        if (targetItem && dateField) {
            const oldDate = targetItem[dateField];
            if (project && comment && shouldLog) {
                if (!project.logs) project.logs = [];
                project.logs.push({ timestamp: new Date().toISOString(), item: itemName, from: oldDate, to: value, comment });
            }
            targetItem[dateField] = value;
        }
        this.saveState(); 
        this.renderProjects();
        },

    toggleTaskComplete(projectId, phaseId, taskId) {
        const t = this.getItem('task', projectId, phaseId, taskId);
        if (t) {
            t.completed = !t.completed;
            this.saveState();
            this.renderProjects();
        }
        },    

    toggleSubtaskComplete(projectId, phaseId, taskId, subtaskId) {
        const s = this.getItem('subtask', projectId, phaseId, taskId, subtaskId);
        if (s) {
            s.completed = !s.completed;
            this.saveState();
            this.renderProjects();
        }
    },

    toggleTaskFollowUp(projectId, phaseId, taskId) {
        const task = this.getItem('task', projectId, phaseId, taskId);
        if (task) {
            task.isFollowUp = !task.isFollowUp;
            if (task.isFollowUp && !task.followUpDate) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                task.followUpDate = tomorrow.toISOString().split('T')[0];
            }
            this.saveState();
            this.renderProjects();
        }
        },

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
        let item;
        let itemName;
        let deleteFn;

        const pId = (projectId === 'null' || projectId === null) ? null : parseInt(projectId);
        const phId = (phaseId === 'null' || phaseId === null) ? null : parseInt(phaseId);

        // 1. Standalone Task
        if (pId === null) {
            item = this.standaloneTasks.find(t => t.id === taskId);
            if (!item) return;
            itemName = `Standalone Task '${item.name}'`;
            deleteFn = () => { this.standaloneTasks = this.standaloneTasks.filter(t => t.id !== taskId); };
        } 
        // 2. Project Task
        else {
            const project = this.projects.find(p => p.id === pId);
            
            // A. General Task (No Phase)
            if (phId === null) {
                item = project.generalTasks.find(t => t.id === taskId);
                if (!item) return;
                itemName = `General Task '${item.name}' from project '${project.name}'`;
                deleteFn = () => { project.generalTasks = project.generalTasks.filter(t => t.id !== taskId); };
            } 
            // B. Phase Task
            else {
                const phase = project?.phases.find(ph => ph.id === phId);
                item = phase?.tasks.find(t => t.id === taskId);
                if (!item) return;
                itemName = `Task '${item.name}' from phase '${phase.name}'`;
                deleteFn = () => { phase.tasks = phase.tasks.filter(t => t.id !== taskId); };
            }
        }

        this.removeAllDependencies(taskId);
        if (item.subtasks) item.subtasks.forEach(st => this.removeAllDependencies(st.id));
        
        this.pendingDeletion = { 
            type: 'task', 
            logContext: { projectId: pId }, 
            deleteFn: deleteFn, 
            itemName: itemName 
        };
        
        this.elements.reasonModalTitle.textContent = 'Reason for Deletion';
        this.elements.reasonModalDetails.textContent = `You are about to delete: "${item.name}".`;
        this.elements.reasonModal.classList.remove('hidden');
        this.elements.reasonCommentTextarea.focus();
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

        // --- NEW: Toggle visibility of the Project View Switcher ---
        if (tabName === 'projects') {
            this.elements.projectViewControls.classList.remove('hidden');
            // We must update the indicator after removing 'hidden' so dimensions are calculable
            this.updateProjectViewIndicator(); 
        } else {
            this.elements.projectViewControls.classList.add('hidden');
        }
        // -----------------------------------------------------------

        ['projects', 'list', 'overall-load'].forEach(name => {
            const panel = document.getElementById(`main-tab-panel-${name}`);
            const btn = document.getElementById(`main-tab-btn-${name}`);
            if (panel) panel.classList.add('hidden');
            if (btn) btn.classList.remove('active');
        });

        const activePanel = document.getElementById(`main-tab-panel-${tabName}`);
        const activeBtn = document.getElementById(`main-tab-btn-${tabName}`);
        if (activePanel) activePanel.classList.remove('hidden');
        if (activeBtn) activeBtn.classList.add('active');

        // Conditional rendering
        if (tabName === 'projects') {
            this.projects.forEach(project => {
                if (!project.collapsed && project.startDate && project.endDate) {
                    this.drawChart(project);
                }
            });
        } else if (tabName === 'overall-load') {
            // Updated to call the new dashboard renderer instead of the old chart
            this.renderReviewDashboard();
        } else if (tabName === 'list') {
            if (window.punchListApp) punchListApp.init();
        }
    },

    setProjectView(mode) {
        this.projectViewMode = mode;
        localStorage.setItem('timelineProjectViewMode', mode);
        
        this.elements.btnViewGantt.classList.toggle('active', mode === 'gantt');
        this.elements.btnViewLinear.classList.toggle('active', mode === 'linear');

        this.updateProjectViewIndicator();
        
        // Toggle visibility of the Hide Completed Projects switch
        if (this.elements.ganttViewOptions) {
            if (mode === 'gantt') {
                this.elements.ganttViewOptions.classList.remove('hidden');
            } else {
                this.elements.ganttViewOptions.classList.add('hidden');
            }
        }

        // OPTIMIZATION: Pass false to skip heavy dependency recalculations
        this.renderProjects(false); 

        // Reset scroll to top when switching to Action Hub
        if (mode === 'linear') {
            window.scrollTo(0, 0);
        }
    },

    updateProjectViewIndicator() {
            // Small delay to ensure DOM is painted if it was just unhidden
            setTimeout(() => {
                const container = this.elements.projectViewControls;
                if (!container || container.classList.contains('hidden')) return;
                
                const activeBtn = container.querySelector('.tab-button.active');
                const glider = this.elements.projectViewGlider;
                
                if (activeBtn && glider) {
                    glider.style.width = `${activeBtn.offsetWidth}px`;
                    glider.style.left = `${activeBtn.offsetLeft}px`;
                }
            }, 50);
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
        const dummy = document.createElement('input'); 
        // Fix: Do not remove dummy input, but hide it. 
        // This ensures the flatpickr instance maintains a valid reference in the DOM.
        dummy.style.position = 'absolute';
        dummy.style.visibility = 'hidden';
        dummy.style.pointerEvents = 'none';
        dummy.style.top = '0';
        dummy.style.left = '0';
        document.body.appendChild(dummy);
        
        this.sharedPicker = flatpickr(dummy, {
            dateFormat: "Y-m-d",
            onOpen: () => this.elements.datepickerBackdrop.classList.remove('hidden'),
            onClose: () => this.elements.datepickerBackdrop.classList.add('hidden'),
            onChange: (selectedDates, dateStr, instance) => {
                if (!this.currentPickerContext) return;
                
                const newDate = instance.formatDate(selectedDates[0], "Y-m-d");
                const { type, oldDate, element } = this.currentPickerContext;

                if (type.startsWith('new-project') || type === 'move-followup') { 
                    element.value = this.formatDate(this.parseDate(newDate)); 
                    element.dataset.date = newDate; 
                    instance.close(); 
                    return; 
                }

                if (oldDate && oldDate !== newDate) {
                    this.pendingDateChange = { context: this.currentPickerContext, newDate };
                    this.elements.reasonModalTitle.textContent = 'Reason for Date Change';
                    this.elements.reasonModalDetails.textContent = `Changing date from ${this.formatDate(this.parseDate(oldDate))} to ${this.formatDate(this.parseDate(newDate))}.`;
                    this.elements.reasonModal.classList.remove('hidden');
                    this.elements.reasonCommentTextarea.focus();
                    instance.close();
                }
                else if (!oldDate) { 
                    this.updateDate(this.currentPickerContext, newDate); 
                    instance.close(); 
                } else { 
                    instance.close(); 
                }
            },
            onReady: [function() { 
                const button = document.createElement("button"); 
                button.className = "flatpickr-today-button"; 
                button.textContent = "Today"; 
                button.addEventListener("click", (e) => { 
                    this.setDate(new Date(), true); 
                    e.preventDefault(); 
                }); 
                this.calendarContainer.appendChild(button); 
            }]
        });
        // Removed: document.body.removeChild(dummy);
    },

    handleDateTrigger(trigger) {
        if (!trigger) return;
        const { projectId, phaseId, taskId, subtaskId, type } = trigger.dataset;

        this.currentPickerContext = { 
            type, 
            projectId: (projectId === 'null' || !projectId) ? null : parseInt(projectId), 
            phaseId: phaseId === 'null' ? null : parseInt(phaseId), 
            taskId: parseInt(taskId), 
            subtaskId: (subtaskId === 'null' || !subtaskId) ? null : parseInt(subtaskId), 
            element: trigger, 
            oldDate: trigger.dataset.date || null 
        };

        let d = trigger.dataset.date || new Date();
        
        // Fix: Position the calendar relative to the trigger icon
        this.sharedPicker.set('positionElement', trigger);
        
        // Fix: Reset onClose to default (hide backdrop only) in case it was changed by Range Trigger
        this.sharedPicker.set('onClose', () => this.elements.datepickerBackdrop.classList.add('hidden'));

        this.sharedPicker.set('defaultDate', d);
        this.sharedPicker.open();
    },

    handleRangeTrigger(element, currentStart, currentEnd, projectId, phaseId, taskId, subtaskId, isDriven) {
        element.classList.add('active');
        this.elements.datepickerBackdrop.classList.remove('hidden');

        // Fix: Position the calendar relative to the date pill
        this.sharedPicker.set('positionElement', element);

        let isEscapePressed = false;

        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                isEscapePressed = true;
                this.sharedPicker.close();
            }
        };

        document.addEventListener('keydown', escapeHandler);

        const typeContext = subtaskId ? 'subtask' : (taskId ? 'task' : 'phase');

        if (isDriven) {
            this.sharedPicker.set('mode', 'single');
            
            if (currentEnd && currentEnd !== 'null') {
                this.sharedPicker.setDate(this.parseDate(currentEnd));
            } else {
                this.sharedPicker.clear();
            }

            this.sharedPicker.set('onClose', (selectedDates) => {
                document.removeEventListener('keydown', escapeHandler);
                this.elements.datepickerBackdrop.classList.add('hidden');
                element.classList.remove('active');

                if (isEscapePressed) return;

                if (selectedDates.length > 0) {
                    const endStr = this.sharedPicker.formatDate(selectedDates[0], "Y-m-d");
                    this.updateDate({ type: `${typeContext}-end`, projectId, phaseId, taskId, subtaskId, element }, endStr, "Driven date update");
                }
            });

        } else {
            this.sharedPicker.set('mode', 'range');
            
            const dates = [];
            if(currentStart && currentStart !== 'null') dates.push(this.parseDate(currentStart));
            if(currentEnd && currentEnd !== 'null') dates.push(this.parseDate(currentEnd));
            this.sharedPicker.setDate(dates);

            this.sharedPicker.set('onClose', (selectedDates) => {
                document.removeEventListener('keydown', escapeHandler);
                this.elements.datepickerBackdrop.classList.add('hidden');
                element.classList.remove('active');
                
                if (isEscapePressed) return;
                
                if (selectedDates.length > 0) {
                    const startStr = this.sharedPicker.formatDate(selectedDates[0], "Y-m-d");
                    
                    // Fix: If only 1 date selected, set End Date = Start Date (Single Day Task)
                    const endStr = selectedDates.length > 1 
                        ? this.sharedPicker.formatDate(selectedDates[1], "Y-m-d") 
                        : startStr;

                    this.updateDate({ type: `${typeContext}-start`, projectId, phaseId, taskId, subtaskId, element }, startStr, null, false);
                    
                    if (endStr) {
                        this.updateDate({ type: `${typeContext}-end`, projectId, phaseId, taskId, subtaskId, element }, endStr, "Range update");
                    } else {
                         this.renderProjects();
                    }
                }
            });
        }

        this.sharedPicker.open();
    },

    handleSaveReason() {
        const comment = this.elements.reasonCommentTextarea.value.trim();
        const shouldLog = this.elements.logChangeCheckbox.checked;

        if (!comment && shouldLog) {
            this.elements.reasonCommentTextarea.classList.add('border-red-500', 'ring-red-500');
            setTimeout(() => this.elements.reasonCommentTextarea.classList.remove('border-red-500', 'ring-red-500'), 2000);
            return;
        }

        if (this.pendingDateChange) {
            this.updateDate(this.pendingDateChange.context, this.pendingDateChange.newDate, comment, shouldLog);
        } else if (this.pendingDeletion) {
            const { type, logContext, deleteFn, itemName } = this.pendingDeletion;

            if (shouldLog) {
                // Save log to global Deleted Log if there is no specific project
                if (type === 'project' || logContext.projectId === null || logContext.projectId === 'null') {
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
            if (project) {
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
                    if (shouldLog) {
                        const logType = newState ? 'lock' : 'unlock';
                        if (!project.logs) project.logs = [];
                        project.logs.push({ timestamp: new Date().toISOString(), item: itemName, type: logType, comment: comment });
                    }
                    this.saveState();
                    this.renderProjects();
                }
            }
        }

        this.elements.reasonModal.classList.add('hidden');
        this.elements.reasonCommentTextarea.value = '';
        this.elements.logChangeCheckbox.checked = true;
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
                if(Array.isArray(parsedOrder) && parsedOrder.length === this.tabOrder.length && parsedOrder.every(t => this.tabOrder.includes(t))) {
                    this.tabOrder = parsedOrder;
                }
            } catch(e) { console.error("Could not parse tab order", e); }
        }

        // Load View Preference
        const savedViewMode = localStorage.getItem('timelineProjectViewMode');
        this.projectViewMode = savedViewMode || 'gantt'; 

        // Load Task Visibility Preference
        const savedHideCompleted = localStorage.getItem('timelineHideCompleted');
        this.hideCompletedTasks = savedHideCompleted === 'true';

        // Load Project Visibility Preference
        const savedHideProjects = localStorage.getItem('timelineHideCompletedProjects');
        this.hideCompletedProjects = savedHideProjects === 'true';
        
        // NEW: Load Action Hub Grouping Preference
        const savedGroupMode = localStorage.getItem('timelineActionHubGroupMode');
        this.actionHubGroupMode = savedGroupMode || 'time';
    },

    setActionHubGroupMode(mode) {
        this.actionHubGroupMode = mode;
        localStorage.setItem('timelineActionHubGroupMode', mode);
        this.renderLinearView();
    },

    renderTabs() {
            this.elements.mainTabs.innerHTML = '';
            const glider = document.createElement('div');
            glider.className = 'glider';
            this.elements.mainTabs.appendChild(glider);

            // --- GTD NAMES ---
            const tabNames = {
                list: 'Inbox',           // 1. Capture
                projects: 'Projects',    // 2. Organize & Engage
                'overall-load': 'Review' // 3. Reflect
            };

            // Render buttons in the strict order of this.tabOrder
            this.tabOrder.forEach(tabKey => {
                if (!tabNames[tabKey]) return; // Skip invalid tabs

                const button = document.createElement('button');
                button.id = `main-tab-btn-${tabKey}`;
                button.className = 'tab-button';
                button.textContent = tabNames[tabKey];
                button.dataset.tabName = tabKey;
                button.setAttribute('draggable', true);
                button.onclick = () => this.showMainTab(tabKey);
                this.elements.mainTabs.appendChild(button);
            });
            
            // Fallback if active tab is invalid
            if (!tabNames[this.activeTab]) {
                this.activeTab = 'list'; // Default to Inbox if lost
            }
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
        const pId = (projectId === 'null' || projectId === null) ? null : Number(projectId);
        
        // Search Standalone Tasks if no Project ID
        if (pId === null) {
            return this.standaloneTasks.find(t => t.id === Number(taskId));
        }

        const p = this.projects.find(p => p.id === pId);
        if (!p) return null;
        if (type === 'project') return p;

        // --- NEW: Logic for General Tasks (Phase ID is null) ---
        const phId = (phaseId === 'null' || phaseId === null) ? null : Number(phaseId);

        if (phId === null) {
            // Looking for a General Task or its Subtask
            const t = p.generalTasks.find(t => t.id === Number(taskId));
            if (!t) return null;
            if (type === 'task') return t;
            return type === 'subtask' ? t.subtasks.find(st => st.id === Number(subtaskId)) : null;
        }
        // --------------------------------------------------------

        const ph = p.phases.find(ph => ph.id === phId);
        if (!ph) return null;
        if (type === 'phase') return ph;

        const t = ph.tasks.find(t => t.id === Number(taskId));
        if (!t) return null;
        if (type === 'task') return t;

        return type === 'subtask' ? t.subtasks.find(st => st.id === Number(subtaskId)) : null;
    },

    promptMoveToProject(taskText, isFollowUp = false, successCallback, existingTags = [], prefillData = {}) {
        if (typeof isFollowUp === 'function') {
            successCallback = isFollowUp;
            isFollowUp = false;
        }

        this.pendingMoveTask = { text: taskText, isFollowUp: isFollowUp, cb: successCallback };
        
        // Reset Modal Fields
        this.moveModalSelectedTags = [...existingTags]; // Capture existing tags
        document.getElementById('move-tag-input').value = '';
        
        // --- UPDATED: Prefill Who Input ---
        document.getElementById('move-who-input').value = prefillData.delegatedTo || ''; 
        
        const dateInput = document.getElementById('move-followup-input');
        
        // --- UPDATED: Prefill Date Input ---
        if (prefillData.date) {
            dateInput.dataset.date = prefillData.date;
            dateInput.value = this.formatDate(this.parseDate(prefillData.date));
        } else {
            dateInput.value = '';
            delete dateInput.dataset.date;
        }

        this.renderMoveModalSelectedTags(); 

        // --- INJECT DEFAULT TAGS ---
        const tagGroup = document.getElementById('move-tag-group');
        let quickContextContainer = document.getElementById('quick-context-chips');
        
        if (!quickContextContainer && tagGroup) {
            quickContextContainer = document.createElement('div');
            quickContextContainer.id = 'quick-context-chips';
            quickContextContainer.className = 'flex flex-wrap gap-1 mt-2';
            tagGroup.appendChild(quickContextContainer);
        }

        if (quickContextContainer) {
            const suggestedTags = this.defaultTags || [
                { name: '@Computer', color: 'bg-blue-100 text-blue-800' },
                { name: '@Phone', color: 'bg-blue-100 text-blue-800' },
                { name: '@Errands', color: 'bg-orange-100 text-orange-800' },
                { name: '@Home', color: 'bg-green-100 text-green-800' },
                { name: '@Office', color: 'bg-gray-100 text-gray-800' },
                { name: '#15min', color: 'bg-purple-100 text-purple-800' },
                { name: '#DeepWork', color: 'bg-red-100 text-red-800' },
                { name: '#Braindead', color: 'bg-gray-200 text-gray-700' }
            ];

            quickContextContainer.innerHTML = suggestedTags.map(tag => `
                <button onclick="timelineApp.addTagToMoveModal('${tag.name}')" 
                        class="text-[10px] font-bold px-2 py-1 rounded border border-transparent hover:border-current opacity-70 hover:opacity-100 transition-opacity ${tag.color}">
                    ${tag.name}
                </button>
            `).join('');
        }

        // Populate Projects
        const projSelect = this.elements.moveProjectSelect;
        projSelect.innerHTML = '<option value="none">None (Standalone Action)</option>';
        
        this.projects
            .filter(p => p.overallProgress < 100) 
            .forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                projSelect.appendChild(opt);
            });
        
        // --- UPDATED: Select Project and Phase if provided ---
        const typeSelect = document.getElementById('move-type-select');
        
        if (prefillData.projectId) {
            projSelect.value = prefillData.projectId;
            typeSelect.value = 'project';
        } else if (prefillData.delegatedTo) {
            projSelect.value = 'none';
            typeSelect.value = 'waiting';
        } else {
            projSelect.value = 'none';
            typeSelect.value = 'standalone';
        }

        this.populatePhaseSelectForMove(); // Updates phase dropdown based on project selection

        if (prefillData.projectId && prefillData.phaseId) {
            this.elements.movePhaseSelect.value = prefillData.phaseId;
        }
        // ----------------------------------------------------

        this.toggleMoveModalFields();
        this.elements.moveToProjectModal.classList.remove('hidden');
    },

    handleProcessItem(projectId, phaseId, taskId, subtaskId) {
        // Resolve item
        const item = this.getItem(subtaskId ? 'subtask' : 'task', projectId, phaseId, taskId, subtaskId);
        if (!item) return;

        // Define callback to delete the original item after "moving" (creating the new one)
        const callback = () => {
             // Perform silent deletion to avoid the "Reason for Deletion" modal
             
             // 1. Remove Dependencies
             if (subtaskId) {
                 this.removeAllDependencies(subtaskId);
             } else {
                 this.removeAllDependencies(taskId);
                 if (item.subtasks) item.subtasks.forEach(st => this.removeAllDependencies(st.id));
             }

             // 2. Remove Item from Data Structure & Prepare Log Context
             let itemName = '';
             let logContextProjectId = projectId;
             const comment = "Moved to new location via Action Hub";
             
             if (subtaskId) {
                 const project = this.projects.find(p => p.id === projectId);
                 const task = project?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
                 if (task) {
                     task.subtasks = task.subtasks.filter(st => st.id !== subtaskId);
                     itemName = `Subtask '${item.name}' from task '${task.name}'`;
                 }
             } else {
                 if (projectId === null || projectId === 'null') {
                     // Standalone Task
                     this.standaloneTasks = this.standaloneTasks.filter(t => t.id !== taskId);
                     itemName = `Standalone Task '${item.name}'`;
                     logContextProjectId = null; 
                 } else {
                     // Project Task
                     const project = this.projects.find(p => p.id === projectId);
                     const phase = project?.phases.find(ph => ph.id === phaseId);
                     if (phase) {
                         phase.tasks = phase.tasks.filter(t => t.id !== taskId);
                         itemName = `Task '${item.name}' from phase '${phase.name}'`;
                     }
                 }
             }

             // 3. Log the "Move" (as a deletion entry)
             const logEntry = { 
                 timestamp: new Date().toISOString(), 
                 item: itemName, 
                 type: 'deletion', 
                 comment: comment 
             };

             if (logContextProjectId) {
                 const project = this.projects.find(p => p.id === logContextProjectId);
                 if (project) {
                     if (!project.logs) project.logs = [];
                     project.logs.push(logEntry);
                 }
             } else {
                 // Fallback to global log for standalone items
                 this.deletedProjectLogs.push(logEntry);
             }

             // 4. Update State
             this.saveState();
             this.renderProjects();
        };

        // --- UPDATED: Collect prefill data ---
        const prefillData = {
            projectId: (projectId && projectId !== 'null') ? parseInt(projectId) : null,
            phaseId: (phaseId && phaseId !== 'null') ? parseInt(phaseId) : null,
            delegatedTo: item.delegatedTo,
            date: (item.isFollowUp && item.followUpDate) ? item.followUpDate : (item.endDate || item.followUpDate)
        };

        // Open the modal with existing data AND prefill data
        this.promptMoveToProject(item.name, item.isFollowUp, callback, item.tags || [], prefillData);
    },

    executeMoveToProject() {
        if (!this.pendingMoveTask) return;
        
        const moveType = document.getElementById('move-type-select').value;
        const projectSelectValue = this.elements.moveProjectSelect.value;
        const phaseSelectValue = this.elements.movePhaseSelect.value; // Get raw value
        
        const whoInput = document.getElementById('move-who-input').value.trim();
        const delegateTo = whoInput || null;
        const customFollowUpDate = document.getElementById('move-followup-input').dataset.date;
        
        // MODIFICATION 1: Ensure isDelegated requires a name to be present
        const isDelegated = moveType === 'waiting' && delegateTo !== null;
        const isStandalone = moveType === 'standalone' || projectSelectValue === 'none';
        const isGeneralBin = phaseSelectValue === 'general';

        const hasFollowUpDate = customFollowUpDate && customFollowUpDate !== '';
        
        // MODIFICATION 2: Calculate status strictly from current inputs (do not inherit old status)
        const isFollowUp = isDelegated || hasFollowUpDate;

        const newTask = {
            id: Date.now(),
            name: this.pendingMoveTask.text,
            startDate: null,
            endDate: isDelegated ? customFollowUpDate : null,
            completed: false,
            subtasks: [],
            dependencies: [],
            dependents: [],
            tags: [...(this.moveModalSelectedTags || [])],
            isFollowUp: isFollowUp, 
            delegatedTo: delegateTo,
            followUpDate: hasFollowUpDate ? customFollowUpDate : null 
        };

        if (isStandalone) {
            if (!this.standaloneTasks) this.standaloneTasks = [];
            this.standaloneTasks.push(newTask);
        } else {
            const project = this.projects.find(p => p.id === parseInt(projectSelectValue));
            if (project) {
                if (isGeneralBin) {
                    if (!project.generalTasks) project.generalTasks = [];
                    project.generalTasks.push(newTask);
                } else {
                    const phaseId = parseInt(phaseSelectValue);
                    const phase = project.phases.find(ph => ph.id === phaseId);
                    if (phase) phase.tasks.push(newTask);
                }
            }
        }
        
        this.saveState();
        this.renderProjects();
        if (this.pendingMoveTask.cb) this.pendingMoveTask.cb();
        
        this.elements.moveToProjectModal.classList.add('hidden');
        this.pendingMoveTask = null;
    },

    toggleMoveModalFields() {
        const type = document.getElementById('move-type-select').value;
        const projectGroup = document.getElementById('project-select-group');
        const phaseGroup = document.getElementById('move-phase-group');
        const followupGroup = document.getElementById('move-followup-group');
        const projectSelect = document.getElementById('move-project-select');
        
        followupGroup.classList.remove('hidden');

        if (type === 'project' || type === 'waiting') {
            projectGroup.classList.remove('hidden');
            
            const isStandalone = projectSelect.value === 'none';
            if (phaseGroup) phaseGroup.classList.toggle('hidden', isStandalone);
        } else {
            projectGroup.classList.add('hidden');
        }
    },

    populatePhaseSelectForMove() {
        const projectSelectValue = this.elements.moveProjectSelect.value;
        const isStandalone = projectSelectValue === 'none';
        this.elements.movePhaseSelect.innerHTML = '';
        
        if (isStandalone) {
            const opt = document.createElement('option');
            opt.value = 'none';
            opt.textContent = "N/A (Standalone)";
            this.elements.movePhaseSelect.appendChild(opt);
            this.elements.confirmMoveBtn.disabled = false;
            return;
        }

        // --- NEW: Add "General / No Phase" Option ---
        const generalOpt = document.createElement('option');
        generalOpt.value = 'general';
        generalOpt.textContent = "General (No Phase)";
        generalOpt.style.fontWeight = "bold";
        this.elements.movePhaseSelect.appendChild(generalOpt);
        // ---------------------------------------------

        const projectId = parseInt(projectSelectValue);
        const project = this.projects.find(p => p.id === projectId);
        
        if (project && project.phases.length > 0) {
            project.phases.forEach(ph => {
                const opt = document.createElement('option');
                opt.value = ph.id;
                opt.textContent = ph.name;
                this.elements.movePhaseSelect.appendChild(opt);
            });
        }
        // Even if no phases, we can now add to "General", so enable button
        this.elements.confirmMoveBtn.disabled = false;
    },

    handleMoveTagInput(event) {
        const filter = event.target.value.trim();
        const dropdown = document.getElementById('move-tag-options');
        
        if (event.key === 'Enter' && filter) {
            this.addTagToMoveModal(filter);
            return;
        }

        // Always show the dropdown when interacting, even if filter is empty
        dropdown.classList.remove('hidden');
        this.renderMoveModalTagOptions(filter);
    },

    renderMoveModalTagOptions(filter = '') {
        const container = document.getElementById('move-tag-options');
        const allTags = this.getAllTags();
        const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(filter.toLowerCase()) && !this.moveModalSelectedTags.includes(tag));
        let html = '';
        if (filter && !allTags.includes(filter)) {
            html += `<div class="tag-option create-new" onclick="timelineApp.addTagToMoveModal('${filter}')">Create "${filter}"</div>`;
        }
        filteredTags.forEach(tag => {
            html += `<div class="tag-option" onclick="timelineApp.addTagToMoveModal('${tag}')">${tag}</div>`;
        });
        container.innerHTML = html || '<div class="p-2 text-xs text-secondary text-center">No tags found</div>';
        },

    addTagToMoveModal(tagName) {
        if (tagName && !this.moveModalSelectedTags.includes(tagName)) {
            this.moveModalSelectedTags.push(tagName);
            this.renderMoveModalSelectedTags();
        }
        document.getElementById('move-tag-input').value = '';
        document.getElementById('move-tag-options').classList.add('hidden');
        },

    removeTagFromMoveModal(tagName) {
        this.moveModalSelectedTags = this.moveModalSelectedTags.filter(t => t !== tagName);
        this.renderMoveModalSelectedTags();
        },

    renderMoveModalSelectedTags() {
        const container = document.getElementById('move-selected-tags');
        container.innerHTML = this.moveModalSelectedTags.map(tag => `
            <span class="tag-badge">
                ${tag}
                <span onclick="timelineApp.removeTagFromMoveModal('${tag}')" class="tag-remove">&times;</span>
            </span>
        `).join('');
        },

    toggleHideCompletedProjects() {
        this.hideCompletedProjects = !this.hideCompletedProjects;
        localStorage.setItem('timelineHideCompletedProjects', this.hideCompletedProjects);
        this.renderProjects();
    },

    loadTabData() {
        const savedTab = localStorage.getItem('timelineActiveTab');
        if (savedTab) this.activeTab = savedTab;

        const savedOrder = localStorage.getItem('timelineTabOrder');
        if (savedOrder) {
            try {
                const parsedOrder = JSON.parse(savedOrder);
                if(Array.isArray(parsedOrder) && parsedOrder.length === this.tabOrder.length && parsedOrder.every(t => this.tabOrder.includes(t))) {
                    this.tabOrder = parsedOrder;
                }
            } catch(e) { console.error("Could not parse tab order", e); }
        }

        // Load View Preference
        const savedViewMode = localStorage.getItem('timelineProjectViewMode');
        this.projectViewMode = savedViewMode || 'gantt'; 

        // Load Task Visibility Preference
        const savedHideCompleted = localStorage.getItem('timelineHideCompleted');
        this.hideCompletedTasks = savedHideCompleted === 'true';

        // NEW: Load Project Visibility Preference
        const savedHideProjects = localStorage.getItem('timelineHideCompletedProjects');
        this.hideCompletedProjects = savedHideProjects === 'true';
        
        // Update the checkbox in the UI if it exists
        const toggle = document.getElementById('hide-completed-projects-toggle');
        if (toggle) toggle.checked = this.hideCompletedProjects;
    },

    handlePillDateClick(element, position, currentDate, projectId, phaseId, taskId, subtaskId) {
    event.stopPropagation();
    
    // 1. Determine context type based on IDs present
    let itemType = 'phase';
    if (subtaskId !== null && subtaskId !== 'null' && subtaskId !== undefined) itemType = 'subtask';
    else if (taskId !== null && taskId !== 'null' && taskId !== undefined) itemType = 'task';
    
    // Construct the type string expected by updateDate (e.g., 'task-start', 'subtask-end')
    const type = `${itemType}-${position}`;

    // 2. Setup Context for the Picker
    this.currentPickerContext = { 
        type, 
        projectId: (projectId === 'null' || !projectId) ? null : parseInt(projectId), 
        phaseId: (phaseId === 'null' || !phaseId) ? null : parseInt(phaseId), 
        taskId: (taskId === 'null' || !taskId) ? null : parseInt(taskId), 
        subtaskId: (subtaskId === 'null' || !subtaskId) ? null : parseInt(subtaskId), 
        element: element, 
        oldDate: currentDate && currentDate !== 'null' && currentDate !== 'undefined' ? currentDate : null 
    };

    // 3. Configure Shared Picker for Single Date Selection
    // Position relative to the specific text clicked, not the whole pill
    this.sharedPicker.set('positionElement', element);
    this.sharedPicker.set('mode', 'single');
    
    // Ensure backdrop hides on close
    this.sharedPicker.set('onClose', () => {
            this.elements.datepickerBackdrop.classList.add('hidden');
    });

    // Set initial date if exists, otherwise default to today
    const dateToSet = (currentDate && currentDate !== 'null' && currentDate !== 'undefined') 
        ? this.parseDate(currentDate) 
        : new Date();
    
    this.sharedPicker.setDate(dateToSet);
    this.elements.datepickerBackdrop.classList.remove('hidden');
    this.sharedPicker.open();
    },

    renderDateRangePill(start, end, projectId, phaseId, taskId, subtaskId, isLocked = false, isDriven = false) {
    // Format dates
    const startStr = start ? this.formatDate(this.parseDate(start)) : 'Set Start';
    const endStr = end ? this.formatDate(this.parseDate(end)) : 'Set End';
    
    // Define Icon for the Status Column (Leftmost)
    let statusIconHtml = '';
    if (isLocked) {
        statusIconHtml = `<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>`;
    } else if (isDriven) {
        statusIconHtml = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>`;
    }

    const pId = projectId || 'null';
    const phId = phaseId || 'null';
    const tId = taskId || 'null';
    const sId = subtaskId || 'null';

    // --- Logic for Interactivity ---
    // 1. Start Date: Clickable ONLY if not Locked AND not Driven (dependency)
    const startOnClick = (!isLocked && !isDriven) 
        ? `onclick="timelineApp.handlePillDateClick(this, 'start', '${start || ''}', ${pId}, ${phId}, ${tId}, ${sId})"` 
        : '';
    
    // 2. End Date: Clickable if not Locked
    const endOnClick = (!isLocked) 
        ? `onclick="timelineApp.handlePillDateClick(this, 'end', '${end || ''}', ${pId}, ${phId}, ${tId}, ${sId})"` 
        : '';

    // --- Visual Classes ---
    const startHoverClass = (!isLocked && !isDriven) ? 'hoverable-date' : 'locked-date';
    const endHoverClass = (!isLocked) ? 'hoverable-date' : 'locked-date';

    let innerHtml;

    if (!start && !end) {
        // Empty State: Show placeholders with independent clicks
        innerHtml = `
            <div class="status-col"></div>
            <div class="date-col ${startHoverClass} opacity-50" ${startOnClick}>Set Start</div>
            <div class="arrow-col">→</div>
            <div class="date-col ${endHoverClass} opacity-50" ${endOnClick}>Set End</div>
        `;
    } 
    else if (isLocked && (!start || !end)) {
        innerHtml = `
            <div class="status-col">${statusIconHtml}</div>
            <div class="full-span-col" style="grid-column: 2 / -1;">Dates Locked</div>
        `;
    }
    else {
        innerHtml = `
            <div class="status-col" title="${isDriven ? 'Start date driven by dependency' : (isLocked ? 'Dates locked' : '')}">${statusIconHtml}</div>
            <div class="date-col ${startHoverClass} ${!start ? 'opacity-50' : ''}" ${startOnClick}>${startStr}</div>
            <div class="arrow-col">→</div>
            <div class="date-col ${endHoverClass} ${!end ? 'opacity-50' : ''}" ${endOnClick}>${endStr}</div>
        `;
    }

    const disabledClass = isLocked ? 'disabled' : '';

    return `
        <div class="date-range-pill ${disabledClass}">
            <div class="date-content-grid">
                ${innerHtml}
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" class="range-icon ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        </div>
    `;
    },

    getTickInterval(domain) {
            const [startDate, endDate] = domain;
            const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

            if (durationDays <= 14) {         // Up to 2 weeks
                return d3.timeDay.every(2);
            } else if (durationDays <= 60) {  // Up to ~2 months
                return d3.timeWeek.every(1);
            } else if (durationDays <= 180) { // Up to ~6 months
                return d3.timeMonth.every(1);
            } else if (durationDays <= 366) { // Up to ~1 year
                return d3.timeMonth.every(2);
            } else if (durationDays <= 731) { // Up to ~2 years
                return d3.timeMonth.every(3); // Quarterly
            } else if (durationDays <= 1460) { // Up to ~4 years
                return d3.timeMonth.every(6); // Half-yearly
            } else {                          // More than 4 years
                return d3.timeYear.every(1);
            }
        },

    getTickFormat(domain) {
            const [startDate, endDate] = domain;
            const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

            if (durationDays <= 93) { // Up to a quarter
                return d3.timeFormat("%b %d"); // e.g., Jan 01
            } else if (durationDays <= 366) { // Up to a year
                return d3.timeFormat("%b '%y"); // e.g., Jan '25
            } else { // More than a year
                return d3.timeFormat("%Y"); // e.g., 2025
            }
        },

    renderReviewDashboard() {
        this.calculateKPIs();
        
        // Replaced 'drawDriftChart' with the new Risk Matrix
        this.drawRiskMatrix(); 
        
        this.drawContextChart();
        this.generateStrategyInsights();
        
        // Ensure this is called if you have the container in your HTML,
        // otherwise this call is harmless if the ID isn't found.
        this.drawOverallLoadChart(); 
    },

    calculateKPIs() {
        // --- NEW: Filter Excluded Projects ---
        const validProjects = this.projects.filter(p => !p.excludeFromStats);
        // -------------------------------------

        const activeProjects = validProjects.filter(p => p.overallProgress < 100);
        document.getElementById('kpi-active-projects').textContent = activeProjects.length;

        let totalTasks = 0;
        let completedTasks = 0;

        validProjects.forEach(project => {
            project.phases.forEach(phase => {
                totalTasks += phase.tasks.length;
                completedTasks += phase.tasks.filter(t => t.progress >= 100).length;
                phase.tasks.forEach(t => {
                    if (t.subtasks) {
                        totalTasks += t.subtasks.length;
                        completedTasks += t.subtasks.filter(s => s.progress >= 100).length;
                    }
                });
            });
            totalTasks += project.generalTasks.length;
            completedTasks += project.generalTasks.filter(t => t.progress >= 100).length;
        });

        const overallCompletion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        document.getElementById('kpi-overall-completion').textContent = `${overallCompletion}%`;

        const overdueCount = activeProjects.filter(p => {
             const daysLeftInfo = this.getDaysLeft(p.endDate);
             return daysLeftInfo.isOverdue;
        }).length;
        document.getElementById('kpi-overdue-projects').textContent = overdueCount;

        const dueThisWeek = activeProjects.filter(p => {
            if (!p.endDate) return false;
            const end = this.parseDate(p.endDate);
            const today = new Date();
            const diffTime = end - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 7;
        }).length;
        document.getElementById('kpi-due-soon').textContent = dueThisWeek;
    },

    drawRiskMatrix() {
        const container = document.getElementById('risk-matrix-chart');
        if (!container) return;
        container.innerHTML = '';

        // 1. Prepare Data
        // Filter out completed projects and those marked 'excludeFromStats'
        const activeProjects = this.projects.filter(p => 
            !p.excludeFromStats && 
            p.startDate && 
            p.endDate && 
            p.overallProgress < 100
        );

        if (activeProjects.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 text-sm mt-10">No active projects to analyze.</div>';
            return;
        }

        const data = activeProjects.map(p => {
            const daysLeftInfo = this.getDaysLeft(p.endDate);
            // Cap days left at 60 for the chart so outliers don't squash the view
            let days = daysLeftInfo.days !== null ? daysLeftInfo.days : 0;
            
            // Calculate "Burn Rate Required" (Simple Linear)
            // If you are 50% through the time, you should be 50% done.
            const totalDuration = (this.parseDate(p.endDate) - this.parseDate(p.startDate)) / (1000 * 60 * 60 * 24);
            const timeElapsed = (new Date() - this.parseDate(p.startDate)) / (1000 * 60 * 60 * 24);
            const timeProgress = Math.min(100, Math.max(0, (timeElapsed / totalDuration) * 100));
            
            // Risk Logic:
            // Red: Overdue OR (Progress is > 20% behind Time Elapsed)
            // Yellow: Progress is 0-20% behind Time Elapsed
            // Green: Progress is ahead of Time Elapsed
            let status = 'green';
            if (days < 0) status = 'red'; // Overdue
            else if (p.overallProgress < (timeProgress - 20)) status = 'red';
            else if (p.overallProgress < timeProgress) status = 'yellow';

            return {
                name: p.name,
                daysLeft: days,
                progress: p.overallProgress,
                status: status,
                realDays: daysLeftInfo.days // For tooltip
            };
        });

        // 2. Setup Dimensions
        const margin = { top: 20, right: 20, bottom: 40, left: 50 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = container.clientHeight - margin.top - margin.bottom;

        const svg = d3.select(container).append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // 3. Scales
        // X Axis: Days Remaining (0 to 60+)
        const x = d3.scaleLinear()
            .domain([0, Math.max(60, d3.max(data, d => d.daysLeft))]) 
            .range([0, width]);

        // Y Axis: % Complete (0 to 100)
        const y = d3.scaleLinear()
            .domain([0, 100])
            .range([height, 0]);

        // 4. Draw Danger Zone (Background Rect)
        // Bottom-Left (Low Time, Low Progress) = Critical Area
        svg.append("rect")
            .attr("x", 0)
            .attr("y", y(50)) // Bottom half (0-50% progress)
            .attr("width", x(14)) // First 2 weeks
            .attr("height", height - y(50))
            .attr("fill", "rgba(239, 68, 68, 0.1)") // Light Red
            .attr("rx", 4);

        // 5. Axes
        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(5))
            .append("text")
            .attr("x", width)
            .attr("y", 35)
            .attr("fill", "var(--text-secondary)")
            .attr("text-anchor", "end")
            .text("Days Remaining →");

        svg.append("g")
            .call(d3.axisLeft(y).ticks(5))
            .append("text")
            .attr("x", -10)
            .attr("y", -10)
            .attr("fill", "var(--text-secondary)")
            .attr("text-anchor", "end")
            .text("% Done");

        // 6. Plot Points
        const circles = svg.selectAll("circle")
            .data(data)
            .enter()
            .append("circle")
            .attr("cx", d => x(Math.max(0, d.daysLeft))) // Clamp negatives to 0 line
            .attr("cy", d => y(d.progress))
            .attr("r", 8)
            .attr("fill", d => {
                if(d.status === 'red') return "var(--red)";
                if(d.status === 'yellow') return "var(--amber)";
                return "var(--green)";
            })
            .attr("stroke", "var(--bg-primary)")
            .attr("stroke-width", 2)
            .style("cursor", "pointer")
            .style("opacity", 0.9);

        // 7. Tooltips
        let tooltip = d3.select("body").select(".chart-tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
        }

        circles.on("mouseover", function(event, d) {
            d3.select(this).attr("r", 10).style("opacity", 1);
            tooltip.style("visibility", "visible")
                .html(`
                    <strong>${d.name}</strong><br/>
                    Due in: ${d.realDays} days<br/>
                    Progress: ${Math.round(d.progress)}%
                `);
        })
        .on("mousemove", (event) => {
            tooltip.style("top", (event.pageY - 10) + "px")
                   .style("left", (event.pageX + 10) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("r", 8).style("opacity", 0.9);
            tooltip.style("visibility", "hidden");
        });
    },

    drawContextChart() {
        const container = document.getElementById('context-chart');
        container.innerHTML = '';

        const tagCounts = {};
        
        // --- NEW: Filter Excluded Projects ---
        this.projects.forEach(p => {
            if (p.excludeFromStats) return; 
            
            p.phases.forEach(ph => ph.tasks.forEach(t => {
                if(t.tags) t.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
                if(t.subtasks) t.subtasks.forEach(s => {
                    if(s.tags) s.tags.forEach(tag => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                });
            }));
            p.generalTasks.forEach(t => {
                if(t.tags) t.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            });
        });

        const data = Object.entries(tagCounts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); 

        if (data.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 text-sm mt-10">No tag data available.</div>';
            return;
        }
        
        const width = 200;
        const height = 200;
        const radius = Math.min(width, height) / 2;

        const svg = d3.select(container).append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${width / 2},${height / 2})`);

        const color = d3.scaleOrdinal()
             .range(["var(--blue)", "var(--green)", "var(--amber)", "var(--red)", "var(--purple)"]);

        const pie = d3.pie()
            .value(d => d.count);

        const arc = d3.arc()
            .innerRadius(0)
            .outerRadius(radius);

        const arcs = svg.selectAll("arc")
            .data(pie(data))
            .enter()
            .append("g")
            .attr("class", "arc");

        arcs.append("path")
            .attr("d", arc)
            .attr("fill", d => color(d.data.tag))
            .attr("stroke", "var(--bg-primary)")
            .style("stroke-width", "2px");

        arcs.append("text")
            .attr("transform", d => `translate(${arc.centroid(d)})`)
            .attr("text-anchor", "middle")
            .text(d => d.data.tag)
            .attr("fill", "white")
            .attr("font-size", "10px");
    },

    generateStrategyInsights() {
        const container = document.getElementById('strategy-text-content');
        let insightsHTML = '';

        // --- NEW: Filter Excluded Projects ---
        const activeProjects = this.projects
            .filter(p => !p.excludeFromStats) // Added Filter
            .filter(p => p.overallProgress < 100);

        // 1. Zombie Projects
        activeProjects.forEach(p => {
             const daysLeft = this.getDaysLeft(p.endDate).days;
             const completion = p.overallProgress;
             if (daysLeft < 0 && completion < 50) {
                 insightsHTML += `<p class="mb-2"><strong class="text-red-400">Zombie Alert:</strong> Project <strong>${p.name}</strong> is overdue and less than 50% complete. Consider killing or rescoping.</p>`;
             }
        });

        // 2. Planning Fallacy
        const heavySlippers = this.projects
            .filter(p => !p.excludeFromStats) // Added Filter
            .filter(p => {
            if(!p.originalEndDate || !p.endDate) return false;
            const original = this.parseDate(p.originalEndDate);
            const current = this.parseDate(p.endDate);
            const drift = (current - original) / (1000 * 60 * 60 * 24);
            return drift > 14; 
        });

        if (heavySlippers.length > 0) {
            insightsHTML += `<p class="mb-2"><strong class="text-amber-400">Optimism Bias:</strong> ${heavySlippers.length} projects have slipped by more than 2 weeks. Add 20% buffer to future estimates.</p>`;
        }

        // 3. Context Switch Overload
        let dueSoon = 0;
        this.projects.forEach(p => {
            if (p.excludeFromStats) return; // Added Filter
            
            p.phases.forEach(ph => ph.tasks.forEach(t => {
                if (t.endDate && t.progress < 100) {
                     const end = this.parseDate(t.endDate);
                     const diff = (end - new Date()) / (1000*60*60*24);
                     if(diff >=0 && diff <= 3) dueSoon++;
                }
            }));
            p.generalTasks.forEach(t => {
                 if (t.endDate && t.progress < 100) {
                     const end = this.parseDate(t.endDate);
                     const diff = (end - new Date()) / (1000*60*60*24);
                     if(diff >=0 && diff <= 3) dueSoon++;
                }
            });
        });

        if (dueSoon > 5) {
             insightsHTML += `<p class="mb-2"><strong class="text-purple-400">Bottleneck Warning:</strong> ${dueSoon} individual tasks are due in the next 3 days. Prioritize or delegate.</p>`;
        }

        if (insightsHTML === '') {
            insightsHTML = '<p class="text-gray-400">No critical strategic alerts at this time. Keep shipping!</p>';
        }

        container.innerHTML = insightsHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    timelineApp.init();
    // Global keydown listener for punch list logic when its tab is active
    document.addEventListener('keydown', (e) => {
        const listPanel = document.getElementById('main-tab-panel-list');
        if (listPanel && !listPanel.classList.contains('hidden')) {
            // FIX: Explicitly call window.punchListApp
            if (window.punchListApp) window.punchListApp.handleKeyboard(e);
        }
    });
});


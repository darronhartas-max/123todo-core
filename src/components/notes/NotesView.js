import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Folder, Search, X, Check, PlusCircle, MinusCircle, ChevronDown, Settings, Mic
} from 'lucide-react';
import NoteCard from './NoteCard';
import PhotoAttachments from './PhotoAttachments';
import SearchBar from '../tasks/SearchBar';
import './NotesView.css';
import { isSpeechRecognitionSupported, startVoiceDictation } from '../../utils/voiceUtils';
import { ActionableEntitiesBar, ensureCursorVisible, ensureElementInViewport } from '../../utils/textUtils';
import { DEFAULT_PROJECTS } from '../../utils/constants';
import { ProjectPicker, PrioritySelector } from '../tasks/editor';

const NotesView = ({
  tasks = [],
  projects = [],
  onAddNote,
  onUpdateTask,
  onConvertNoteToTask,
  onCompleteTask,
  onDeleteTask,
  onAssignProject,
  onBulkAssignProject,
  activeProjectFilter = 'all',
  onSelectProjectFilter,
  searchQuery = '',
  onSearchChange,
  onOpenSettings,
  onOpenCommandPalette,
  notesFontSize = 18,
  notesAutosaveDelay = '60s',
  viewProfile = 'lite',
  buttonDisplayMode = 'icons',
  priorityColors,
  onEdit
}) => {
  const showBtnIcons = buttonDisplayMode === 'icons' || buttonDisplayMode === 'both';
  const showBtnText = buttonDisplayMode === 'text' || buttonDisplayMode === 'both';
  const [showAddNote, setShowAddNote] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState([]);
  const [newNotes, setNewNotes] = useState('');
  const [newPhotos, setNewPhotos] = useState([]);
  const [targetProjectId, setTargetProjectId] = useState(activeProjectFilter === 'all' ? 'general' : activeProjectFilter);
  const [isDictatingQuickAdd, setIsDictatingQuickAdd] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showBatchProjectPicker, setShowBatchProjectPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(Boolean(searchQuery && searchQuery.trim().length > 0));
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [newPriority, setNewPriority] = useState(1);

  const quickRecognitionRef = useRef(null);
  const quickAddTextareaRef = useRef(null);
  const autoSaveTimerRef = useRef(null);

  // Inactivity timeout in ms based on user preference ('30s' -> 30s, '60s' -> 1 min, '120s' -> 2 min, '300s' -> 5 min, 'off' -> 0)
  const autosaveDelayMs = useMemo(() => {
    switch (notesAutosaveDelay) {
      case '30s': return 30000;
      case '60s': return 60000;
      case '120s': return 120000;
      case '300s': return 300000;
      case 'off': return 0;
      default: return 60000; // 1 minute default
    }
  }, [notesAutosaveDelay]);

  // Auto-expand textarea height & keep the latest spoken/typed lines visible in viewport at all times
  useEffect(() => {
    if (quickAddTextareaRef.current) {
      const el = quickAddTextareaRef.current;
      el.style.height = 'auto';
      const targetHeight = Math.max(el.scrollHeight, 80);
      el.style.height = `${targetHeight}px`;
      ensureCursorVisible(el);
      ensureElementInViewport(el, { preferBottom: true });
    }
  }, [newNotes, isDictatingQuickAdd]);

  // Sync target project ID with active project filter when user changes filter tab
  useEffect(() => {
    if (activeProjectFilter && activeProjectFilter !== 'all') {
      setTargetProjectId(activeProjectFilter);
    } else {
      setTargetProjectId('general');
    }
  }, [activeProjectFilter]);

  // Filter tasks to show all items (since every task can act as a note or has notes)
  const filteredNotes = useMemo(() => {
    const list = tasks.filter(task => {
      // Filter by project
      if (activeProjectFilter && activeProjectFilter !== 'all') {
        if (task.projectId !== activeProjectFilter) return false;
      }
      // Filter by search query
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const textMatch = (task.text || '').toLowerCase().includes(query);
        const notesMatch = (task.notes || '').toLowerCase().includes(query);
        if (!textMatch && !notesMatch) return false;
      }
      return true;
    });

    // Sort descending so newly created or updated notes (highest timestamp or ID) appear at the top of the list
    return list.sort((a, b) => {
      const valA = Number(a.createdAt || a.updatedAt || a.id || 0);
      const valB = Number(b.createdAt || b.updatedAt || b.id || 0);
      return valB - valA;
    });
  }, [tasks, activeProjectFilter, searchQuery]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (quickRecognitionRef.current) {
        try { quickRecognitionRef.current.stop(); } catch (e) {}
        quickRecognitionRef.current = null;
      }
    };
  }, []);

  // Restore uncommitted draft on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem('123Todo_Draft_Note');
      const savedPhotos = localStorage.getItem('123Todo_Draft_Photos');
      if (savedDraft) setNewNotes(savedDraft);
      if (savedPhotos) setNewPhotos(JSON.parse(savedPhotos));
    } catch (e) {}
  }, []);

  // Sync draft to localStorage in real-time
  useEffect(() => {
    try {
      if (newNotes.trim() || newPhotos.length > 0) {
        localStorage.setItem('123Todo_Draft_Note', newNotes);
        localStorage.setItem('123Todo_Draft_Photos', JSON.stringify(newPhotos));
      } else {
        localStorage.removeItem('123Todo_Draft_Note');
        localStorage.removeItem('123Todo_Draft_Photos');
      }
    } catch (e) {}
  }, [newNotes, newPhotos]);

  const handleCreateNote = useCallback((overrideBody, overridePhotos) => {
    const rawContent = typeof overrideBody === 'string' ? overrideBody : newNotes;
    const photosToSave = overridePhotos || newPhotos;

    if (!rawContent.trim() && (!photosToSave || photosToSave.length === 0)) return;

    // Unconditionally stop voice dictation if running
    if (quickRecognitionRef.current) {
      try { quickRecognitionRef.current.stop(); } catch (e) {}
      quickRecognitionRef.current = null;
    }
    setIsDictatingQuickAdd(false);

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const title = rawContent.trim() || (photosToSave && photosToSave.length > 0 ? `Photo Note (${photosToSave.length})` : 'Untitled Note');

    onAddNote(title, '', targetProjectId || 'general', { photos: photosToSave, priority: newPriority });
    setNewNotes('');
    setNewPhotos([]);
    setNewPriority(1);
    setIsAddProjectOpen(false);
    setShowAddNote(false);

    try {
      localStorage.removeItem('123Todo_Draft_Note');
      localStorage.removeItem('123Todo_Draft_Photos');
    } catch (e) {}

    setStatusMessage('✓ Note saved');
    setTimeout(() => setStatusMessage(''), 2500);
  }, [newNotes, newPhotos, targetProjectId, newPriority, onAddNote]);

  const handleCancelQuickAdd = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (quickRecognitionRef.current) {
      try { quickRecognitionRef.current.stop(); } catch (e) {}
      quickRecognitionRef.current = null;
    }
    setIsDictatingQuickAdd(false);
    setStatusMessage('');
    setShowAddNote(false);
    setNewNotes('');
    setNewPhotos([]);
    setNewPriority(1);
    setIsAddProjectOpen(false);
    try {
      localStorage.removeItem('123Todo_Draft_Note');
      localStorage.removeItem('123Todo_Draft_Photos');
    } catch (e) {}
  }, []);

  // Auto-save: automatically saves note after configured idle period so taking notes, inspecting jobs, or walking away never loses data
  useEffect(() => {
    if (autosaveDelayMs === 0) return;

    if ((newNotes.trim().length > 0 || newPhotos.length > 0) && !isDictatingQuickAdd) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        handleCreateNote();
      }, autosaveDelayMs);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [newNotes, newPhotos, isDictatingQuickAdd, autosaveDelayMs, handleCreateNote]);

  // Also auto-save on visibility change (switching apps or locking phone on site)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (newNotes.trim() || newPhotos.length > 0) {
          handleCreateNote();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [newNotes, newPhotos, handleCreateNote]);

  // Toggle Dictation for Quick Add Card
  const toggleQuickAddDictation = () => {
    if (isDictatingQuickAdd) {
      if (quickRecognitionRef.current) {
        try { quickRecognitionRef.current.stop(); } catch (e) {}
        quickRecognitionRef.current = null;
      }
      setIsDictatingQuickAdd(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setStatusMessage('Voice input is not supported');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    setIsDictatingQuickAdd(true);

    // When using dictate mode in Notes view, append to the bottom of the note on a new line
    const currentVal = newNotes || '';
    let prefix = currentVal;
    if (currentVal.trim().length > 0) {
      const separator = currentVal.endsWith('\n') ? '' : '\n';
      prefix = currentVal + separator;
      if (prefix !== currentVal) {
        setNewNotes(prefix);
      }
    }

    // Automatically focus and place cursor at the end of the note on a new line
    const moveCursorToEnd = () => {
      if (quickAddTextareaRef.current) {
        try {
          quickAddTextareaRef.current.focus();
          const endPos = prefix.length;
          quickAddTextareaRef.current.setSelectionRange(endPos, endPos);
          ensureCursorVisible(quickAddTextareaRef.current, endPos);
          ensureElementInViewport(quickAddTextareaRef.current, { preferBottom: true });
        } catch (e) {}
      }
    };

    moveCursorToEnd();
    setTimeout(moveCursorToEnd, 30);

    quickRecognitionRef.current = startVoiceDictation({
      initialText: prefix,
      prefix,
      onTranscript: (updatedText, isSubmitCommand) => {
        if (isSubmitCommand) {
          if (quickRecognitionRef.current) {
            try { quickRecognitionRef.current.stop(); } catch (e) {}
            quickRecognitionRef.current = null;
          }
          setIsDictatingQuickAdd(false);
          handleCreateNote(updatedText);
        } else {
          setNewNotes(updatedText);
          if (quickAddTextareaRef.current) {
            const pos = updatedText.length;
            try {
              quickAddTextareaRef.current.setSelectionRange(pos, pos);
              ensureCursorVisible(quickAddTextareaRef.current, pos);
            } catch (e) {}
          }
        }
      },
      onStatusChange: (msg) => setStatusMessage(msg),
      onEnd: () => setIsDictatingQuickAdd(false)
    });
  };

  const handleToggleSelectNote = (id) => {
    setSelectedNoteIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkAssign = (projId) => {
    if (onBulkAssignProject && selectedNoteIds.length > 0) {
      onBulkAssignProject(selectedNoteIds, projId);
      setSelectedNoteIds([]);
      setShowBatchProjectPicker(false);
    }
  };

  const addNoteProjects = useMemo(() => {
    const nonAll = (projects || []).filter(p => p.id !== 'all');
    const hasGeneral = nonAll.some(p => p.id === 'general');
    return hasGeneral ? nonAll : [{ id: 'general', name: 'Unassigned Inbox', color: '#6b7280' }, ...nonAll];
  }, [projects]);

  const allProjects = useMemo(() => {
    return [
      DEFAULT_PROJECTS.find(p => p.id === 'all') || { id: 'all', name: 'All Notes', color: '#6b7280' },
      { id: 'general', name: 'Unassigned Inbox', color: '#6b7280' },
      ...projects.filter(p => p.id !== 'all' && p.id !== 'general')
    ];
  }, [projects]);

  const activeProject = useMemo(() => {
    return allProjects.find(p => p.id === activeProjectFilter) || allProjects[0];
  }, [allProjects, activeProjectFilter]);

  const activeColor = activeProject?.color || '#6b7280';

  const getProjectNoteCount = useCallback((projectId) => {
    if (!tasks || tasks.length === 0) return 0;
    if (projectId === 'all') {
      return tasks.length;
    }
    return tasks.filter(t => (t.projectId || 'general').toLowerCase() === projectId.toLowerCase()).length;
  }, [tasks]);

  const activeCount = getProjectNoteCount(activeProject?.id);

  const getProjectLabelLength = useCallback((p) => {
    const count = getProjectNoteCount(p.id);
    return (p?.name || '').length + String(count).length + 4;
  }, [getProjectNoteCount]);

  const maxProjectNameLength = Math.max(...allProjects.map(getProjectLabelLength), 10);
  const dropdownMinWidth = Math.min(Math.max(maxProjectNameLength * 9 + 48, 140), 320);

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [hoveredProjectOptionId, setHoveredProjectOptionId] = useState(null);

  return (
    <div className="notes-container">
      {/* Header Bar: Search Icon, Projects Dropdown, Add Note Icon (clean single-row order) */}
      <div className="notes-header-bar" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', width: '100%', paddingBottom: '4px' }}>
        {/* 1. Search Toggle Icon Button (identical circular style as Task mode) */}
        <button
          onClick={() => setShowSearch(!showSearch)}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: showSearch || searchQuery ? 'var(--accent-bg)' : 'var(--bg-color)',
            border: `1.5px solid ${showSearch || searchQuery ? 'var(--accent-color)' : 'var(--border-color)'}`,
            color: showSearch || searchQuery ? 'var(--accent-color)' : 'var(--muted-text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            flexShrink: 0
          }}
          title={showSearch ? "Close Search" : "Search"}
          aria-label={showSearch ? "Close Search" : "Search"}
        >
          <Search size={16} />
        </button>

        {/* 2. Projects Filter Dropdown (matching Task mode styling with brand colors) */}
        <div style={{
          position: 'relative',
          display: 'inline-flex',
          flexDirection: 'column',
          flex: '0 1 auto',
          minWidth: 0,
          maxWidth: `${dropdownMinWidth}px`
        }}>
          <button
            type="button"
            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
            style={{
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              padding: '4px 8px',
              borderRadius: '6px',
              border: `1.5px solid ${activeColor}`,
              background: 'var(--item-bg)',
              color: activeColor,
              fontSize: '0.92rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              outline: 'none',
              transition: 'all 0.2s ease',
              textAlign: 'left',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              lineHeight: '1.25',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ 
              flex: '1 1 auto',
              minWidth: 0,
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
              whiteSpace: 'normal',
              lineHeight: '1.25'
            }}>
              {activeProject?.name === 'All' ? 'All Notes' : activeProject?.name} ({activeCount})
            </span>
            <ChevronDown size={16} style={{ color: activeColor, flexShrink: 0, marginLeft: '4px' }} />
          </button>
          {isProjectDropdownOpen && (
            <>
              <div 
                onClick={() => setIsProjectDropdownOpen(false)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 99,
                  background: 'transparent'
                }}
              />
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                minWidth: '100%',
                maxWidth: 'min(320px, calc(100vw - 32px))',
                width: 'max-content',
                background: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                zIndex: 100,
                maxHeight: 'calc(100vh - 120px)',
                overflowY: 'auto',
                padding: '4px 0',
                boxSizing: 'border-box'
              }}>
                {allProjects.map(p => {
                  const count = getProjectNoteCount(p.id);
                  const isSelected = p.id === activeProjectFilter;
                  const displayName = p.name === 'All' ? 'All Notes' : p.name;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        onSelectProjectFilter(p.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      onMouseEnter={() => setHoveredProjectOptionId(p.id)}
                      onMouseLeave={() => setHoveredProjectOptionId(null)}
                      style={{
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        fontWeight: '600',
                        color: isSelected ? p.color : 'var(--text-color)',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        background: isSelected
                          ? `${p.color}15`
                          : (hoveredProjectOptionId === p.id ? 'var(--accent-bg, rgba(0,0,0,0.04))' : 'transparent')
                      }}
                    >
                      <div style={{
                        width: '4px',
                        height: '14px',
                        borderRadius: '2px',
                        backgroundColor: p.color,
                        flexShrink: 0
                      }} />
                      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{displayName}</span>
                      <span style={{
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: isSelected ? `${p.color}25` : 'var(--item-bg)',
                        color: isSelected ? p.color : 'var(--muted-text)',
                        border: '1px solid var(--border-color)',
                        marginLeft: '8px',
                        flexShrink: 0
                      }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Right-aligned actions container ensuring icons are never pushed off-screen */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexShrink: 0,
          marginLeft: 'auto'
        }}>
          {/* Settings cog icon button */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              style={{
                width: '32px',
                height: '32px',
                padding: 0,
                borderRadius: '50%',
                background: 'var(--bg-color)',
                border: '1.5px solid var(--border-color)',
                color: 'var(--accent-color)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
              title="Settings"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          )}

          {/* Add Note + / - toggle button */}
          <button
            type="button"
            onClick={() => setShowAddNote(!showAddNote)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-color)',
              cursor: 'pointer',
              padding: 0,
              width: '32px',
              height: '32px',
              minWidth: '32px',
              minHeight: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginLeft: 'auto',
              transition: 'transform 0.2s ease'
            }}
            aria-label={showAddNote ? "Close add note" : "Add new note"}
            title={showAddNote ? "Close add note form" : "Add new note"}
          >
            {showAddNote ? <MinusCircle size={28} /> : <PlusCircle size={28} />}
          </button>
        </div>
      </div>

      {/* Expanding Search Bar (collapses back on X click) */}
      {(showSearch || searchQuery) && (
        <SearchBar
          value={searchQuery || ''}
          onChange={onSearchChange}
          onClear={() => {
            onSearchChange('');
            setShowSearch(false);
          }}
          onOpenCommandPalette={onOpenCommandPalette}
          placeholder="Search notes..."
        />
      )}

      {/* Quick Add Note Card (Unified with Tasks AddTask interface, optimized for gloves wearers) */}
      {showAddNote && (
        <div className="quick-add-note-card">
          {/* Top Row: Project Picker on Left, Prominent Mic + Tasks-mode Cancel Button on Right */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            position: 'relative',
            zIndex: isAddProjectOpen ? 121 : 1,
            marginBottom: '8px'
          }}>
            {/* Target Project Picker */}
            <ProjectPicker
              projects={addNoteProjects}
              selectedProjectId={targetProjectId}
              onSelectProject={setTargetProjectId}
              isOpen={isAddProjectOpen}
              onToggleOpen={setIsAddProjectOpen}
              buttonPadding="6px 12px"
              fontSize="0.95rem"
            />

            {/* Right Group: Tasks-mode Cancel Button on Left & Prominent Mic Icon Button on Far Right */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '18px',
              marginLeft: 'auto',
              flexShrink: 0
            }}>
              {/* Tasks-mode Circular Cancel Button */}
              <button
                type="button"
                onClick={handleCancelQuickAdd}
                aria-label="Cancel and close"
                title="Cancel (Esc)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--muted-text)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  padding: 0,
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = '#ef4444';
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--muted-text)';
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <X size={16} />
              </button>

              {/* Prominent Mic / Talk button for gloves wearers on the FAR RIGHT */}
              <button
                type="button"
                onClick={toggleQuickAddDictation}
                aria-label={isDictatingQuickAdd ? "Listening" : "Talk"}
                title={isDictatingQuickAdd ? "Listening - Tap to finish" : (isSpeechRecognitionSupported() ? "Click to speak and append to note" : "Voice input not supported")}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: showBtnText ? '8px 18px' : '8px 16px',
                  minWidth: showBtnText ? 'auto' : '46px',
                  minHeight: '44px',
                  borderRadius: '22px',
                  border: isDictatingQuickAdd ? '2px solid #ef4444' : '2px solid var(--border-color)',
                  backgroundColor: isDictatingQuickAdd ? 'rgba(239, 68, 68, 0.15)' : 'var(--item-bg)',
                  color: isDictatingQuickAdd ? '#ef4444' : 'var(--text-color)',
                  fontWeight: '800',
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                  boxShadow: isDictatingQuickAdd ? '0 0 10px rgba(239, 68, 68, 0.4)' : 'none'
                }}
              >
                {isDictatingQuickAdd ? (
                  <>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#ef4444',
                      display: 'inline-block',
                      boxShadow: '0 0 8px #ef4444',
                      animation: 'pulse 1s infinite'
                    }} />
                    <Mic size={16} color="#ef4444" />
                    <span>Listening...</span>
                  </>
                ) : (
                  <>
                    {showBtnIcons && <Mic size={16} color="rgba(239, 68, 68, 0.75)" />}
                    {showBtnText && <span>Talk</span>}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Voice Status Alert if active/blocked */}
          {statusMessage && (
            <div
              onClick={statusMessage.includes('Settings') && onOpenSettings ? onOpenSettings : undefined}
              role={statusMessage.includes('Settings') && onOpenSettings ? 'button' : undefined}
              tabIndex={statusMessage.includes('Settings') && onOpenSettings ? 0 : undefined}
              onKeyDown={statusMessage.includes('Settings') && onOpenSettings ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenSettings();
                }
              } : undefined}
              style={{
                fontSize: '0.82rem',
                padding: '6px 12px',
                borderRadius: '8px',
                marginTop: '4px',
                marginBottom: '6px',
                background: isDictatingQuickAdd ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.12)',
                color: isDictatingQuickAdd ? '#ef4444' : '#15803d',
                border: `1px solid ${isDictatingQuickAdd ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)'}`,
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: statusMessage.includes('Settings') && onOpenSettings ? 'pointer' : 'default',
                transition: 'all 0.2s ease'
              }}
            >
              {isDictatingQuickAdd && (
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 8px #ef4444',
                  animation: 'pulse 1s infinite'
                }} />
              )}
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Textarea for note text */}
          <textarea
            ref={quickAddTextareaRef}
            rows={3}
            value={newNotes}
            onChange={(e) => {
              setNewNotes(e.target.value);
              ensureCursorVisible(e.target, e.target.selectionStart);
              ensureElementInViewport(e.target, { preferBottom: true });
            }}
            onFocus={(e) => {
              ensureCursorVisible(e.target, e.target.selectionStart);
              ensureElementInViewport(e.target, { preferBottom: true });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelQuickAdd();
              } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleCreateNote();
              }
            }}
            placeholder="Add New Note..."
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: `${Math.max(notesFontSize, 16)}px`,
              border: '1px solid var(--accent-color)',
              borderRadius: '6px',
              resize: 'vertical',
              minHeight: '68px',
              maxHeight: '180px',
              overflowY: 'auto',
              fontFamily: 'inherit',
              background: 'var(--item-bg)',
              color: 'var(--text-color)',
              boxSizing: 'border-box',
              outline: 'none',
              lineHeight: 1.45
            }}
          />

          {newNotes && <ActionableEntitiesBar text={newNotes} />}

          {/* Photos with Camera Button on the Right */}
          <div style={{ marginTop: '8px' }}>
            <PhotoAttachments
              photos={newPhotos}
              onChange={setNewPhotos}
              readOnly={false}
              controlsOnRight={true}
            />
          </div>

          {/* Bottom Row: PrioritySelector & Prominent Save Button (for gloves wearers) */}
          <PrioritySelector
            priority={newPriority}
            onChangePriority={setNewPriority}
            priorityColors={priorityColors}
            actionButton={
              <button
                type="button"
                onClick={() => handleCreateNote()}
                aria-label="Save"
                title="Save Note (Cmd+Enter)"
                style={{
                  padding: '8px 24px',
                  background: '#10b981',
                  color: 'white',
                  border: '2px solid #059669',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  flex: '0 0 auto',
                  minWidth: '85px',
                  minHeight: '44px',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box',
                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#059669';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#10b981';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.25)';
                }}
              >
                <Check size={18} strokeWidth={2.8} />
                <span>Save</span>
              </button>
            }
          />
        </div>
      )}

      {/* Notes Stream Grid */}
      {filteredNotes.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          backgroundColor: 'var(--surface-color)',
          borderRadius: '14px',
          border: '1px dashed var(--border-color)',
          color: 'var(--muted-text)'
        }}>
          <p style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 8px 0', color: 'var(--text-color)' }}>No notes found</p>
          <p style={{ fontSize: '14px', margin: 0 }}>
            Tap the red 'Talk' button or header mic button to dictate your notes hands-free! Notes are saved directly into your task list.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              projects={projects}
              onUpdateNote={(id, updates) => onUpdateTask(id, updates)}
              onConvertNoteToTask={(id, p) => onConvertNoteToTask(id, p)}
              onCompleteNote={(id) => onCompleteTask(id)}
              onDeleteNote={(id) => onDeleteTask(id)}
              onAssignProject={(id, projId) => onAssignProject(id, projId)}
              isSelected={selectedNoteIds.includes(note.id)}
              onToggleSelect={handleToggleSelectNote}
              onOpenSettings={onOpenSettings}
              notesFontSize={notesFontSize}
              notesAutosaveDelay={notesAutosaveDelay}
              viewProfile={viewProfile}
              buttonDisplayMode={buttonDisplayMode}
              priorityColors={priorityColors}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}

      {/* Batch Selection Action Bar */}
      {selectedNoteIds.length > 0 && (
        <div className="batch-action-bar">
          <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color)' }}>
            {selectedNoteIds.length} notes selected
          </span>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowBatchProjectPicker(!showBatchProjectPicker)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--accent-color)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}
            >
              <Folder size={14} />
              <span>Assign to Project</span>
            </button>

            {showBatchProjectPicker && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: '8px',
                backgroundColor: 'var(--surface-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                padding: '6px',
                minWidth: '180px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}>
                <button
                  onClick={() => handleBulkAssign('general')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-color)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}
                >
                  Unassigned Inbox
                </button>
                {projects.filter(p => p.id !== 'all' && p.id !== 'general').map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleBulkAssign(p.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-color)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setSelectedNoteIds([])}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'transparent',
              color: 'var(--muted-text)',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default NotesView;

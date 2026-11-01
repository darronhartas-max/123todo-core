import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Folder, Mic, ChevronDown, ChevronUp,
  Flag, Check, Clock, Camera, Copy,
  Square, CheckSquare, ListChecks, Edit2, FileText
} from 'lucide-react';
import { getPriorities } from '../../utils/constants';
import { isSpeechRecognitionSupported, startVoiceDictation } from '../../utils/voiceUtils';
import PhotoAttachments from './PhotoAttachments';
import { renderActionableText, ActionableEntitiesBar, ensureCursorVisible, ensureElementInViewport } from '../../utils/textUtils';
import { formatEvidentiaryTimestamp } from '../../utils/dateUtils';
import { toggleSubtaskStatus } from '../../utils/reorderUtils';
import { getMaxSubtasksPerTask } from '../../utils/booster';

const NoteCard = ({
  note,
  projects = [],
  onUpdateNote,
  onConvertNoteToTask,
  onCompleteNote,
  onDeleteNote,
  onAssignProject,
  isSelected,
  onToggleSelect,
  onOpenSettings,
  notesFontSize = 18,
  notesAutosaveDelay = '60s',
  viewProfile = 'pro',
  buttonDisplayMode = 'icons',
  priorityColors,
  onEdit
}) => {
  const showBtnIcons = buttonDisplayMode === 'icons' || buttonDisplayMode === 'both';
  const showBtnText = buttonDisplayMode === 'text' || buttonDisplayMode === 'both';
  const [isEditing, setIsEditing] = useState(false);
  const [isLiteExpanded, setIsLiteExpanded] = useState(false);
  const isLite = viewProfile === 'lite';
  const [titleText, setTitleText] = useState(note.text || '');
  const [notesText, setNotesText] = useState(note.notes || '');
  const [subtasks, setSubtasks] = useState(note.subtasks || []);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(() => Boolean((note.notes && note.notes.trim().length > 0) || (notesText && notesText.trim().length > 0)));
  const [showSubtasksSection, setShowSubtasksSection] = useState(() => Boolean(subtasks && subtasks.length > 0));
  const [isDictatingTitle, setIsDictatingTitle] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedEvidence, setCopiedEvidence] = useState(false);
  const [isChecked, setIsChecked] = useState(false);

  const subtaskTextFontSize = Math.max(notesFontSize - 2, 13);
  const subtaskHeaderFontSize = Math.max(notesFontSize - 5, 12);
  const subtaskCheckboxSize = Math.min(Math.max(Math.round(notesFontSize * 0.85), 15), 24);
  const subtaskIconSize = Math.min(Math.max(Math.round(notesFontSize * 0.8), 14), 22);
  
  const titleRecognitionRef = useRef(null);
  const noteTextareaRef = useRef(null);
  const titleTextareaRef = useRef(null);
  const titleCursorPosRef = useRef(null);
  const editAutoSaveTimerRef = useRef(null);
  const archiveTimeoutRef = useRef(null);

  // Reset local checked state whenever note ID changes
  useEffect(() => {
    setIsChecked(false);
    if (archiveTimeoutRef.current) {
      clearTimeout(archiveTimeoutRef.current);
      archiveTimeoutRef.current = null;
    }
  }, [note.id]);

  // Clean up archive timeout on unmount
  useEffect(() => {
    return () => {
      if (archiveTimeoutRef.current) {
        clearTimeout(archiveTimeoutRef.current);
        archiveTimeoutRef.current = null;
      }
    };
  }, []);

  const handleComplete = (e) => {
    if (e) {
      if (e.stopPropagation) e.stopPropagation();
      if (e.preventDefault && e.cancelable) e.preventDefault();
    }
    if (isChecked) return;
    setIsChecked(true);

    if (archiveTimeoutRef.current) {
      clearTimeout(archiveTimeoutRef.current);
    }

    archiveTimeoutRef.current = setTimeout(() => {
      archiveTimeoutRef.current = null;
      setIsChecked(false);
      onCompleteNote(note.id);
    }, 300);
  };

  const handleStartEdit = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (onEdit) {
      onEdit(note);
    } else {
      setIsEditing(true);
      setTimeout(() => {
        if (titleTextareaRef.current) {
          titleTextareaRef.current.focus();
        }
      }, 50);
    }
  };

  // Keep title textarea auto-expanded to fit content without truncation
  useEffect(() => {
    if (titleTextareaRef.current) {
      const el = titleTextareaRef.current;
      el.style.height = 'auto';
      const targetHeight = Math.max(el.scrollHeight, 46);
      el.style.height = `${targetHeight}px`;
      ensureCursorVisible(el, titleCursorPosRef.current);
      ensureElementInViewport(el, { preferBottom: true });
    }
  }, [titleText, isEditing, isDictatingTitle]);

  // Keep note textarea auto-expanded
  useEffect(() => {
    if (noteTextareaRef.current) {
      const el = noteTextareaRef.current;
      el.style.height = 'auto';
      const targetHeight = Math.max(el.scrollHeight, 60);
      el.style.height = `${targetHeight}px`;
      ensureCursorVisible(el);
      ensureElementInViewport(el, { preferBottom: true });
    }
  }, [notesText, isEditing]);

  useEffect(() => {
    setTitleText(note.text || '');
    setNotesText(note.notes || '');
    setSubtasks(note.subtasks || []);
  }, [note.text, note.notes, note.subtasks]);

  const hasAssociatedNote = showDetails || Boolean((note.notes && note.notes.trim().length > 0) || (notesText && notesText.trim().length > 0));

  const currentProject = projects.find(p => p.id === note.projectId) || { id: 'general', name: 'Unassigned Inbox', color: '#6b7280' };
  const effectivePriorities = getPriorities(priorityColors);
  const currentPriorityConfig = (note.priority && effectivePriorities[note.priority]) ? effectivePriorities[note.priority] : null;
  const priorityColor = currentPriorityConfig ? currentPriorityConfig.color : 'var(--accent-color)';
  const priorityBg = currentPriorityConfig ? `${currentPriorityConfig.color}18` : 'var(--accent-bg)';
  const priorityBorder = currentPriorityConfig ? `1px solid ${currentPriorityConfig.color}40` : '1px solid var(--border-color)';

  const renderPriorityPicker = () => (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowPriorityPicker(!showPriorityPicker);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '6px 12px',
          borderRadius: '10px',
          border: priorityBorder,
          backgroundColor: priorityBg,
          color: priorityColor,
          fontSize: '13px',
          fontWeight: '700',
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
        title="Adjust Priority"
        aria-label="Adjust Priority"
      >
        <Flag size={13} fill={priorityColor} color={priorityColor} />
        <span>{currentPriorityConfig ? `P${note.priority} (${currentPriorityConfig.label})` : 'Priority'}</span>
        <ChevronDown size={12} color={priorityColor} />
      </button>

      {showPriorityPicker && (
        <>
          <div 
            onClick={(e) => {
              e.stopPropagation();
              setShowPriorityPicker(false);
            }} 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99, background: 'transparent' }} 
          />
          <div style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '6px',
            backgroundColor: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            zIndex: 100,
            minWidth: '180px',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted-text)', padding: '4px 8px' }}>
              Assign Priority:
            </div>
            {[1, 2, 3, 4].map(p => {
              const pConfig = effectivePriorities[p];
              const isSelected = note.priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onConvertNoteToTask) {
                      onConvertNoteToTask(note.id, p);
                    } else if (onUpdateNote) {
                      onUpdateNote(note.id, { priority: p });
                    }
                    setShowPriorityPicker(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: isSelected ? `1px solid ${pConfig.color}60` : '1px solid transparent',
                    backgroundColor: isSelected ? `${pConfig.color}20` : `${pConfig.color}0c`,
                    color: pConfig.color,
                    fontSize: '13px',
                    fontWeight: isSelected ? '800' : '600',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Flag size={13} fill={pConfig.color} color={pConfig.color} />
                    <span>P{p} ({pConfig.label})</span>
                  </div>
                  {isSelected && <Check size={14} color={pConfig.color} strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  const handleAddSubtask = () => {
    if (!newSubtaskText.trim()) return;
    if (subtasks.length >= getMaxSubtasksPerTask()) {
      alert(`Maximum of ${getMaxSubtasksPerTask()} subtasks reached per note.`);
      return;
    }
    const newSt = {
      id: Date.now() + Math.random(),
      text: newSubtaskText.trim(),
      completed: false
    };
    const updated = [newSt, ...subtasks];
    setSubtasks(updated);
    setNewSubtaskText('');
    onUpdateNote(note.id, { subtasks: updated });
  };

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (titleRecognitionRef.current) {
        try { titleRecognitionRef.current.stop(); } catch (e) {}
        titleRecognitionRef.current = null;
      }
    };
  }, []);

  const handleSaveEdits = () => {
    if (editAutoSaveTimerRef.current) {
      clearTimeout(editAutoSaveTimerRef.current);
      editAutoSaveTimerRef.current = null;
    }
    if (titleRecognitionRef.current) {
      try { titleRecognitionRef.current.stop(); } catch (e) {}
      titleRecognitionRef.current = null;
    }
    setIsDictatingTitle(false);

    setIsEditing(false);
    onUpdateNote(note.id, {
      text: titleText.trim() || 'Untitled Task',
      notes: notesText.trim(),
      subtasks
    });
  };

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

  // Auto-save existing note edits after configured idle period so user never loses edits on site
  useEffect(() => {
    if (!isEditing || isDictatingTitle || autosaveDelayMs === 0) return;

    const hasChanges =
      titleText !== (note.text || '') ||
      notesText !== (note.notes || '') ||
      JSON.stringify(subtasks) !== JSON.stringify(note.subtasks || []);

    if (hasChanges) {
      if (editAutoSaveTimerRef.current) {
        clearTimeout(editAutoSaveTimerRef.current);
      }
      editAutoSaveTimerRef.current = setTimeout(() => {
        onUpdateNote(note.id, {
          text: titleText.trim() || 'Untitled Task',
          notes: notesText.trim(),
          subtasks
        });
      }, autosaveDelayMs);
    }

    return () => {
      if (editAutoSaveTimerRef.current) {
        clearTimeout(editAutoSaveTimerRef.current);
      }
    };
  }, [isEditing, titleText, notesText, subtasks, isDictatingTitle, autosaveDelayMs, note, onUpdateNote]);

  // Auto-save edits on phone lock / app switch
  useEffect(() => {
    if (!isEditing) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const hasChanges =
          titleText !== (note.text || '') ||
          notesText !== (note.notes || '') ||
          JSON.stringify(subtasks) !== JSON.stringify(note.subtasks || []);
        if (hasChanges) {
          onUpdateNote(note.id, {
            text: titleText.trim() || 'Untitled Task',
            notes: notesText.trim(),
            subtasks
          });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isEditing, titleText, notesText, subtasks, note, onUpdateNote]);

  const handleToggleTitleDictation = (e) => {
    if (e) e.stopPropagation();
    if (isDictatingTitle) {
      if (titleRecognitionRef.current) {
        try { titleRecognitionRef.current.stop(); } catch (e) {}
        titleRecognitionRef.current = null;
      }
      setIsDictatingTitle(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setStatusMessage('Voice input is not supported');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    setIsDictatingTitle(true);
    const currentVal = titleText || '';
    const cursorPos = titleCursorPosRef.current;
    const userPlacedCursorElsewhere = typeof cursorPos === 'number' && cursorPos < currentVal.length;

    let prefix = '';
    let suffix = '';

    if (currentVal.trim().length > 0) {
      if (userPlacedCursorElsewhere) {
        prefix = currentVal.slice(0, cursorPos);
        suffix = currentVal.slice(cursorPos);
      } else {
        const separator = currentVal.endsWith('\n') ? '' : '\n';
        prefix = currentVal + separator;
        suffix = '';
        if (prefix !== currentVal) {
          setTitleText(prefix);
          if (onUpdateNote) {
            onUpdateNote(note.id, { text: prefix });
          }
        }
      }
    }

    titleRecognitionRef.current = startVoiceDictation({
      initialText: prefix,
      prefix,
      suffix,
      onTranscript: (updatedText, isSubmitCommand) => {
        setTitleText(updatedText);
        onUpdateNote(note.id, { text: updatedText });
        if (isSubmitCommand) {
          if (titleRecognitionRef.current) {
            try { titleRecognitionRef.current.stop(); } catch (e) {}
            titleRecognitionRef.current = null;
          }
          setIsDictatingTitle(false);
          if (isEditing) {
            handleSaveEdits();
          }
        }
      },
      onStatusChange: (msg) => setStatusMessage(msg),
      onEnd: () => {
        setIsDictatingTitle(false);
        titleRecognitionRef.current = null;
        titleCursorPosRef.current = null;
      }
    });

    if (!userPlacedCursorElsewhere) {
      // Move cursor to end of textarea on the new line
      const moveToEnd = () => {
        if (titleTextareaRef.current) {
          titleTextareaRef.current.focus();
          const targetLen = prefix ? prefix.length : titleTextareaRef.current.value.length;
          titleTextareaRef.current.setSelectionRange(targetLen, targetLen);
          ensureCursorVisible(titleTextareaRef.current, targetLen);
          ensureElementInViewport(titleTextareaRef.current, { preferBottom: true });
        }
      };
      moveToEnd();
      setTimeout(moveToEnd, 40);
    }
  };

  const handleCancelEdits = (e) => {
    if (e) e.stopPropagation();
    const hasChanges = 
      titleText !== (note.text || '') ||
      notesText !== (note.notes || '') ||
      JSON.stringify(subtasks) !== JSON.stringify(note.subtasks || []);

    if (hasChanges && window.confirm) {
      const confirmDiscard = window.confirm('Discard unsaved changes to this note?');
      if (!confirmDiscard) return;
    }

    if (editAutoSaveTimerRef.current) {
      clearTimeout(editAutoSaveTimerRef.current);
      editAutoSaveTimerRef.current = null;
    }

    if (titleRecognitionRef.current) {
      try { titleRecognitionRef.current.stop(); } catch (err) {}
      titleRecognitionRef.current = null;
    }
    setIsDictatingTitle(false);
    setTitleText(note.text || '');
    setNotesText(note.notes || '');
    setSubtasks(note.subtasks || []);
    setIsEditing(false);
  };

  const createdTs = note.createdAt;
  const createdFormatted = formatEvidentiaryTimestamp(createdTs);
  const updatedFormatted = note.updatedAt && createdTs && (Number(note.updatedAt) - Number(createdTs) > 60000)
    ? formatEvidentiaryTimestamp(note.updatedAt)
    : null;

  const handleCopyEvidence = (e) => {
    if (e) e.stopPropagation();
    let textToCopy = '123 ToDo Entry Log';
    if (createdFormatted) {
      textToCopy += ` | Created: ${createdFormatted}`;
    }
    if (updatedFormatted) {
      textToCopy += ` | Edited: ${updatedFormatted}`;
    }
    textToCopy += ` | Task: "${note.text || ''}"`;
    if (note.notes) {
      textToCopy += ` | Notes: "${note.notes}"`;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopiedEvidence(true);
        setTimeout(() => setCopiedEvidence(false), 2500);
      }).catch(() => {});
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        backgroundColor: 'var(--surface-color)',
        borderRadius: isLite && !isLiteExpanded && !isEditing ? '10px' : '14px',
        padding: isLite && !isLiteExpanded && !isEditing ? '10px 14px' : '18px',
        boxShadow: isSelected ? '0 0 0 2px var(--accent-color), 0 8px 24px rgba(0, 0, 0, 0.12)' : '0 2px 8px rgba(0, 0, 0, 0.04)',
        border: '1px solid var(--border-color)',
        position: 'relative',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: isLite && !isLiteExpanded && !isEditing ? '4px' : '12px',
        cursor: isLite && !isLiteExpanded && !isEditing ? 'pointer' : 'default'
      }}
      onClick={() => {
        if (isLite && !isLiteExpanded && !isEditing) {
          setIsLiteExpanded(true);
        }
      }}
    >
      {isLite && !isLiteExpanded && !isEditing ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
          <div style={{ 
            fontWeight: '600', 
            fontSize: '15px', 
            color: 'var(--text-color)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            wordBreak: 'break-word',
            lineHeight: '1.35',
            flex: 1
          }}>
            {renderActionableText(note.text || (note.notes ? note.notes.trim() : 'Untitled Note'))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <motion.button
              onClick={handleComplete}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                background: isChecked ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                minWidth: '30px',
                touchAction: 'manipulation',
                color: isChecked ? '#10b981' : 'var(--muted-text)',
                padding: '2px'
              }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9, backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
              title={isChecked ? "Cancel completion" : "Complete / Archive Note"}
              aria-label={isChecked ? "Cancel completion" : "Complete / Archive Note"}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isChecked ? (
                  <motion.div key="check" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                    <CheckSquare size={17} strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div key="square" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Square size={17} opacity={0.65} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      ) : (
        <>
          {/* Top Header Row: Project Badge & Timestamp */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Project Tag Pill */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowProjectPicker(!showProjectPicker)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
                backgroundColor: currentProject.color ? `${currentProject.color}18` : 'var(--accent-bg)',
                color: currentProject.color || 'var(--accent-color)',
                border: `1px solid ${currentProject.color ? `${currentProject.color}40` : 'var(--border-color)'}`,
                cursor: 'pointer'
              }}
            >
              <Folder size={12} color={currentProject.color || 'var(--accent-color)'} />
              <span>{currentProject.name}</span>
              <ChevronDown size={12} />
            </button>

            {/* Project Picker Dropdown */}
            <AnimatePresence>
              {showProjectPicker && (
                <>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowProjectPicker(false);
                    }}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99, background: 'transparent' }}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '6px',
                      backgroundColor: 'var(--surface-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                      zIndex: 100,
                      minWidth: '180px',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted-text)', padding: '6px 8px' }}>
                      Assign to Project:
                    </div>
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onAssignProject(note.id, p.id);
                          setShowProjectPicker(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: p.id === note.projectId ? 'var(--accent-bg)' : 'transparent',
                          color: 'var(--text-color)',
                          fontSize: '13px',
                          fontWeight: p.id === note.projectId ? '700' : '500',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%'
                        }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.color || '#6b7280' }} />
                        <span style={{ flex: 1 }}>{p.name}</span>
                        {p.id === note.projectId && <Check size={14} color="var(--accent-color)" />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Photo indicator badge */}
          {note.photos && note.photos.length > 0 && (
            <span style={{
              fontSize: '11px',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: 'var(--accent-bg)',
              color: 'var(--accent-color)',
              border: '1px solid var(--border-color)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }} title={`${note.photos.length} photo${note.photos.length > 1 ? 's' : ''} attached`}>
              <Camera size={12} strokeWidth={2.2} /> {note.photos.length} {note.photos.length > 1 ? 'photos' : 'photo'}
            </span>
          )}
        </div>

        {/* Right side: Archive Checkbox in exact same style as Task mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
          {/* Archive Checkbox - Same style as Task mode */}
          <motion.button
            onClick={handleComplete}
            onTouchStart={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: isChecked ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              minWidth: '32px',
              minHeight: '32px',
              touchAction: 'manipulation',
              color: isChecked ? '#10b981' : 'var(--muted-text)',
              padding: '2px',
              transition: 'all 0.15s ease'
            }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9, backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
            title={isChecked ? "Cancel completion" : "Complete / Archive Note"}
            aria-label={isChecked ? "Cancel completion" : "Complete / Archive Note"}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isChecked ? (
                <motion.div
                  key="check"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.1 }}
                >
                  <CheckSquare size={18} strokeWidth={2.5} />
                </motion.div>
              ) : (
                <motion.div
                  key="square"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                >
                  <Square size={18} opacity={0.65} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* Note Main Text Area (Large Builder Font) */}
      <div
        style={{ cursor: isEditing ? 'default' : 'pointer' }}
        onClick={(e) => {
          if (!isEditing) {
            if (e.target.tagName === 'A' || e.target.closest('a') || e.target.tagName === 'BUTTON' || e.target.closest('button')) {
              return;
            }
            handleStartEdit(e);
          }
        }}
      >
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Top Action Toolbar for Edit Mode: Large Save Button, Dictate Button, Cancel Button */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
              paddingBottom: '10px',
              borderBottom: '1.5px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '13px',
                  fontWeight: '800',
                  color: 'var(--accent-color)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  ✏️ Edit Note
                </span>
                <button
                  type="button"
                  onClick={handleCancelEdits}
                  style={{
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--muted-text)',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: '8px'
                  }}
                  title="Discard unsaved changes"
                >
                  Cancel
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {/* Prominent Dictate at End Record Button */}
                <button
                  type="button"
                  onClick={handleToggleTitleDictation}
                  aria-label={isDictatingTitle ? "Listening" : "Talk"}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: showBtnText ? '8px 14px' : '8px 14px',
                    minWidth: showBtnText ? 'auto' : '42px',
                    borderRadius: '10px',
                    border: `1.5px solid ${isDictatingTitle ? '#ef4444' : 'var(--border-color)'}`,
                    backgroundColor: isDictatingTitle ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-color)',
                    color: isDictatingTitle ? '#ef4444' : 'var(--text-color)',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    minHeight: '40px',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                    boxShadow: isDictatingTitle ? '0 0 10px rgba(239, 68, 68, 0.4)' : 'none'
                  }}
                  title={isDictatingTitle ? "Tap to stop listening" : "Begin dictating at the end of this note"}
                >
                  {isDictatingTitle ? (
                    <>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        boxShadow: '0 0 8px #ef4444',
                        display: 'inline-block',
                        animation: 'pulse 1s infinite'
                      }} />
                      <Mic size={15} color="#ef4444" />
                      <span>Listening...</span>
                    </>
                  ) : (
                    <>
                      {showBtnIcons && <Mic size={15} color="rgba(239, 68, 68, 0.65)" />}
                      {showBtnText && <span>Talk</span>}
                    </>
                  )}
                </button>

                {/* Large Prominent Save Note Button at the TOP */}
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  aria-label="Save Note"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: showBtnText ? '8px 22px' : '8px 16px',
                    minWidth: showBtnText ? 'auto' : '46px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color)',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    minHeight: '40px',
                    boxSizing: 'border-box',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Save Note / Task changes"
                >
                  {showBtnIcons && <Check size={18} strokeWidth={2.6} />}
                  {showBtnText && <span>Save Note</span>}
                </button>
              </div>
            </div>

            <textarea
              ref={titleTextareaRef}
              value={titleText}
              onChange={(e) => {
                setTitleText(e.target.value);
                titleCursorPosRef.current = e.target.selectionStart;
                ensureCursorVisible(e.target, e.target.selectionStart);
                ensureElementInViewport(e.target, { preferBottom: true });
              }}
              onSelect={(e) => {
                titleCursorPosRef.current = e.target.selectionStart;
                ensureCursorVisible(e.target, e.target.selectionStart);
              }}
              onClick={(e) => {
                titleCursorPosRef.current = e.target.selectionStart;
                ensureCursorVisible(e.target, e.target.selectionStart);
                ensureElementInViewport(e.target, { preferBottom: true });
              }}
              onKeyUp={(e) => {
                titleCursorPosRef.current = e.target.selectionStart;
                ensureCursorVisible(e.target, e.target.selectionStart);
              }}
              onFocus={(e) => {
                titleCursorPosRef.current = e.target.selectionStart;
                ensureCursorVisible(e.target, e.target.selectionStart);
                ensureElementInViewport(e.target, { preferBottom: true });
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveEdits();
                }
              }}
              placeholder="Note Title..."
              rows={2}
              spellCheck="true"
              autoCorrect="on"
              autoCapitalize="sentences"
              style={{
                fontSize: `${notesFontSize}px`,
                fontWeight: '700',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1.5px solid var(--accent-color)',
                backgroundColor: 'var(--item-bg)',
                color: 'var(--text-color)',
                outline: 'none',
                width: '100%',
                resize: 'none',
                lineHeight: 1.45,
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            <ActionableEntitiesBar text={titleText} />

            {/* Action Buttons Row: Details & Subtasks Toggles (aligned with Tasks Edit Mode) */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '2px', marginBottom: '4px' }}>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: showBtnText ? '5px 12px' : '5px 8px',
                  borderRadius: '8px',
                  border: `1.5px solid ${showDetails ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  backgroundColor: showDetails ? 'var(--accent-bg)' : 'var(--item-bg)',
                  color: showDetails ? 'var(--accent-color)' : 'var(--text-color)',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                aria-label="Toggle Details"
                title={showDetails ? "Hide note details" : "Add or show note details"}
              >
                <FileText size={14} />
                {showBtnText && <span>Details{(notesText && notesText.trim().length > 0) ? ' •' : ''}</span>}
              </button>

              <button
                type="button"
                onClick={() => setShowSubtasksSection(!showSubtasksSection)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: showBtnText ? '5px 12px' : '5px 8px',
                  borderRadius: '8px',
                  border: `1.5px solid ${showSubtasksSection ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  backgroundColor: showSubtasksSection ? 'var(--accent-bg)' : 'var(--item-bg)',
                  color: showSubtasksSection ? 'var(--accent-color)' : 'var(--text-color)',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                aria-label={`Toggle Subtasks (${subtasks.length})`}
                title={showSubtasksSection ? "Hide subtasks checklist" : "Add or show subtasks"}
              >
                <ListChecks size={14} />
                {showBtnText && <span>Subtasks ({subtasks.length})</span>}
              </button>
            </div>

            {hasAssociatedNote && (
              <>
                <textarea
                  ref={noteTextareaRef}
                  value={notesText}
                  onChange={(e) => {
                    setNotesText(e.target.value);
                    ensureCursorVisible(e.target, e.target.selectionStart);
                    ensureElementInViewport(e.target, { preferBottom: true });
                  }}
                  onFocus={(e) => {
                    ensureCursorVisible(e.target, e.target.selectionStart);
                    ensureElementInViewport(e.target, { preferBottom: true });
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdits();
                    }
                  }}
                  placeholder="Write note details or dictation..."
                  rows={3}
                  spellCheck="true"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  style={{
                    fontSize: `${Math.max(notesFontSize - 2, 14)}px`,
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--item-bg)',
                    color: 'var(--text-color)',
                    outline: 'none',
                    width: '100%',
                    resize: 'none',
                    lineHeight: 1.5
                  }}
                />
                <ActionableEntitiesBar text={notesText} />
              </>
            )}
            <PhotoAttachments
              photos={note.photos || []}
              onChange={(newPhotos) => onUpdateNote(note.id, { photos: newPhotos })}
              readOnly={false}
            />
            {/* Subtasks Section in Edit Mode */}
            {(showSubtasksSection || (subtasks && subtasks.length > 0)) && (
              <div style={{ marginTop: '4px', padding: '10px', borderRadius: '10px', background: 'var(--item-bg)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: `${subtaskHeaderFontSize}px`, fontWeight: '700', color: 'var(--text-color)', marginBottom: '8px' }}>
                  <ListChecks size={subtaskIconSize} />
                  <span>Subtasks ({subtasks.filter(s => s.completed).length}/{subtasks.length})</span>
                </div>
                {subtasks.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}>
                    {subtasks.map((st) => (
                      <li key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <textarea
                            ref={(el) => {
                              if (el) {
                                el.style.height = 'auto';
                                el.style.height = `${Math.max(el.scrollHeight, subtaskTextFontSize + 8)}px`;
                              }
                            }}
                            value={st.text}
                            rows={1}
                            onChange={(e) => {
                              const updatedText = e.target.value;
                              const updated = subtasks.map(s => s.id === st.id ? { ...s, text: updatedText } : s);
                              setSubtasks(updated);
                              onUpdateNote(note.id, { subtasks: updated });
                            }}
                            onInput={(e) => {
                              e.target.style.height = 'auto';
                              e.target.style.height = `${Math.max(e.target.scrollHeight, subtaskTextFontSize + 8)}px`;
                            }}
                            placeholder="Subtask step..."
                            style={{
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              fontSize: `${subtaskTextFontSize}px`,
                              color: st.completed ? 'var(--muted-text)' : 'var(--text-color)',
                              textDecoration: st.completed ? 'line-through' : 'none',
                              outline: 'none',
                              padding: '2px 4px',
                              borderRadius: '4px',
                              fontFamily: 'inherit',
                              resize: 'none',
                              overflowY: 'hidden',
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap',
                              lineHeight: '1.4',
                              minHeight: `${subtaskTextFontSize + 8}px`,
                              boxSizing: 'border-box'
                            }}
                            onFocus={(e) => {
                              e.target.style.background = 'var(--surface-color)';
                              e.target.style.boxShadow = '0 0 0 1px var(--accent-color)';
                              e.target.style.height = 'auto';
                              e.target.style.height = `${Math.max(e.target.scrollHeight, subtaskTextFontSize + 8)}px`;
                            }}
                            onBlur={(e) => {
                              e.target.style.background = 'transparent';
                              e.target.style.boxShadow = 'none';
                              if (!st.text.trim()) {
                                const updated = subtasks.filter(s => s.id !== st.id);
                                setSubtasks(updated);
                                onUpdateNote(note.id, { subtasks: updated });
                              }
                            }}
                          />
                          <ActionableEntitiesBar text={st.text} compact />
                        </div>
                        <input
                          type="checkbox"
                          checked={st.completed}
                          onChange={() => {
                            const updated = toggleSubtaskStatus(subtasks, st.id);
                            setSubtasks(updated);
                            onUpdateNote(note.id, { subtasks: updated });
                          }}
                          aria-label={st.completed ? "Mark subtask incomplete" : "Mark subtask completed"}
                          title={st.completed ? "Mark incomplete" : "Mark completed"}
                          style={{ cursor: 'pointer', width: `${subtaskCheckboxSize}px`, height: `${subtaskCheckboxSize}px`, flexShrink: 0, marginRight: '2px', accentColor: 'var(--accent-color)' }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    value={newSubtaskText}
                    onChange={(e) => setNewSubtaskText(e.target.value)}
                    placeholder="Add step..."
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      fontSize: `${subtaskTextFontSize}px`,
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--surface-color)',
                      color: 'var(--text-color)',
                      outline: 'none'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSubtask}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: 'var(--accent-color)',
                      color: '#ffffff',
                      fontSize: `${Math.max(subtaskTextFontSize - 2, 13)}px`,
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    Add
                  </button>
                </div>
                <ActionableEntitiesBar text={newSubtaskText} compact />
              </div>
            )}

            {/* Edit Mode Bottom Action Bar: Timestamp on Left, Priority & Buttons on Right */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-color)',
              flexWrap: 'wrap',
              marginTop: '6px'
            }}>
              {/* Left: Evidentiary Timestamp with Copy Button in Edit Mode */}
              {createdFormatted ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div 
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--item-bg)',
                      border: '1px solid var(--border-color)',
                      fontSize: '11px',
                      color: 'var(--muted-text)',
                      fontFamily: 'monospace, sans-serif'
                    }}
                    title="Timestamp evidence: Created date & time of this note/task"
                  >
                    <Clock size={12} color="var(--muted-text)" style={{ flexShrink: 0 }} />
                    <span>
                      {createdFormatted}
                      {updatedFormatted && ` (Edit: ${updatedFormatted.split(',')[1] || updatedFormatted})`}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyEvidence}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        border: 'none',
                        background: copiedEvidence ? '#10b981' : 'var(--accent-bg)',
                        color: copiedEvidence ? '#ffffff' : 'var(--accent-color)',
                        borderRadius: '5px',
                        padding: '2px 6px',
                        fontSize: '10px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        marginLeft: '4px'
                      }}
                      title="Copy evidentiary timestamp & note to clipboard"
                    >
                      {copiedEvidence ? (
                        <>
                          <Check size={10} strokeWidth={3} />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={10} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : <div />}

              {/* Right: Priority Popover, Cancel, and Save Note */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                {renderPriorityPicker()}
                <button
                  type="button"
                  onClick={handleCancelEdits}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-text)',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                  title="Discard changes"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  aria-label="Save Note"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color)',
                    color: '#ffffff',
                    fontWeight: '800',
                    fontSize: '14px',
                    cursor: 'pointer',
                    minHeight: '38px',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)'
                  }}
                  title="Save Note changes"
                >
                  <Check size={16} strokeWidth={2.4} />
                  <span>Save Note</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 style={{ 
              fontSize: `${notesFontSize}px`, 
              fontWeight: '700', 
              color: 'var(--text-color)', 
              margin: '0 0 6px 0',
              lineHeight: 1.3
            }}>
              {renderActionableText(note.text)}
            </h3>

            {note.notes && note.notes.trim().length > 0 ? (
              <p
                style={{ 
                  fontSize: `${Math.max(notesFontSize - 2, 12)}px`, 
                  color: 'var(--text-color)', 
                  margin: 0, 
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '280px',
                  overflowY: 'auto'
                }}
              >
                {renderActionableText(note.notes)}
              </p>
            ) : null}

            {note.photos && note.photos.length > 0 && (
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '8px' }}>
                <PhotoAttachments
                  photos={note.photos}
                  readOnly={true}
                />
              </div>
            )}

            {/* Subtasks in View Mode */}
            {subtasks.length > 0 && (
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: `${subtaskHeaderFontSize}px`, fontWeight: '700', color: 'var(--muted-text)', marginBottom: '4px' }}>
                  <ListChecks size={subtaskIconSize} />
                  <span>Steps ({subtasks.filter(s => s.completed).length}/{subtasks.length}):</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {subtasks.map((st) => (
                    <li key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <input
                          type="text"
                          value={st.text}
                          onChange={(e) => {
                            const updatedText = e.target.value;
                            const updated = subtasks.map(s => s.id === st.id ? { ...s, text: updatedText } : s);
                            setSubtasks(updated);
                            onUpdateNote(note.id, { subtasks: updated });
                          }}
                          placeholder="Subtask step..."
                          style={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            fontSize: `${subtaskTextFontSize}px`,
                            color: st.completed ? 'var(--muted-text)' : 'var(--text-color)',
                            textDecoration: st.completed ? 'line-through' : 'none',
                            outline: 'none',
                            padding: '2px 4px',
                            borderRadius: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.background = 'var(--surface-color)';
                            e.target.style.boxShadow = '0 0 0 1px var(--accent-color)';
                          }}
                          onBlur={(e) => {
                            e.target.style.background = 'transparent';
                            e.target.style.boxShadow = 'none';
                            if (!st.text.trim()) {
                              const updated = subtasks.filter(s => s.id !== st.id);
                              setSubtasks(updated);
                              onUpdateNote(note.id, { subtasks: updated });
                            }
                          }}
                        />
                        <ActionableEntitiesBar text={st.text} compact />
                      </div>
                      <input
                        type="checkbox"
                        checked={st.completed}
                        onChange={() => {
                          const updated = toggleSubtaskStatus(subtasks, st.id);
                          setSubtasks(updated);
                          onUpdateNote(note.id, { subtasks: updated });
                        }}
                        aria-label={st.completed ? "Mark subtask incomplete" : "Mark subtask completed"}
                        title={st.completed ? "Mark incomplete" : "Mark completed"}
                        style={{ cursor: 'pointer', width: `${subtaskCheckboxSize}px`, height: `${subtaskCheckboxSize}px`, flexShrink: 0, marginRight: '2px' }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dictation Status Bar if Active */}
      {(isDictatingTitle || statusMessage) && (
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
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: isDictatingTitle ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.12)',
            color: isDictatingTitle ? '#ef4444' : '#15803d',
            border: `1px solid ${isDictatingTitle ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)'}`,
            fontSize: '13px',
            fontWeight: '600',
            cursor: statusMessage.includes('Settings') && onOpenSettings ? 'pointer' : 'default',
            transition: 'all 0.2s ease'
          }}
        >
          {isDictatingTitle ? (
            <Mic size={16} style={{ animation: 'pulse 1.2s infinite' }} />
          ) : (
            <span style={{ fontSize: '14px' }}>✨</span>
          )}
          <span>{statusMessage || 'Listening...'}</span>
        </div>
      )}

      {/* Bottom Action Bar (View Mode): Evidentiary Timestamp on Left, Edit & Priority on Right */}
      {!isEditing && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: '10px',
          paddingTop: '10px',
          borderTop: '1px solid var(--border-color)',
          flexWrap: 'wrap'
        }}>
          {/* Left: Evidentiary Timestamp Display without copy button in listing view */}
          {createdFormatted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <div 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--item-bg)',
                  border: '1px solid var(--border-color)',
                  fontSize: '11px',
                  color: 'var(--muted-text)',
                  fontFamily: 'monospace, sans-serif'
                }}
                title="Timestamp evidence: Created date & time of this note/task"
              >
                <Clock size={12} color="var(--muted-text)" style={{ flexShrink: 0 }} />
                <span>
                  {createdFormatted}
                  {updatedFormatted && ` (Edit: ${updatedFormatted.split(',')[1] || updatedFormatted})`}
                </span>
              </div>
            </div>
          )}

          {/* Right: Action Group: Priority Dropdown & Edit Note Button on bottom right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            {renderPriorityPicker()}

            {/* Edit Note Button on bottom right */}
            <button
              type="button"
              onClick={handleStartEdit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 14px',
                borderRadius: '10px',
                border: '1.5px solid var(--accent-color)',
                backgroundColor: 'var(--accent-bg)',
                color: 'var(--accent-color)',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Edit Note"
              aria-label="Edit Note"
            >
              <Edit2 size={13} color="var(--accent-color)" />
              <span>Edit Note</span>
            </button>
            {isLite && isLiteExpanded && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLiteExpanded(false);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'transparent',
                  color: 'var(--muted-text)',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Collapse Note"
                aria-label="Collapse Note"
              >
                <ChevronUp size={13} />
                <span>Collapse</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )}
    </motion.div>
  );
};

const areNoteCardPropsEqual = (prevProps, nextProps) => {
  return (
    prevProps.note === nextProps.note &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.projects === nextProps.projects &&
    prevProps.notesFontSize === nextProps.notesFontSize &&
    prevProps.notesAutosaveDelay === nextProps.notesAutosaveDelay &&
    prevProps.viewProfile === nextProps.viewProfile &&
    prevProps.buttonDisplayMode === nextProps.buttonDisplayMode
  );
};

export default React.memo(NoteCard, areNoteCardPropsEqual);

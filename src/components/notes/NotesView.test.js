import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NotesView from './NotesView';
import * as voiceUtils from '../../utils/voiceUtils';

describe('NotesView', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const sampleTasks = [
    { id: 1, text: 'First existing note', notes: 'Details', projectId: 'general' }
  ];

  const sampleProjects = [
    { id: 'general', name: 'Unassigned Inbox', color: '#6b7280' },
    { id: 'proj1', name: 'Work', color: '#2563eb' }
  ];

  test('renders closed note form by default showing existing notes and Add New Note button', () => {
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Add New Note/i })).toBeInTheDocument();
    expect(screen.getByText('First existing note')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add New Note...')).not.toBeInTheDocument();

    // Clicking Add New Note opens the form
    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));
    expect(screen.getByPlaceholderText('Add New Note...')).toBeInTheDocument();
  });

  test('renders Save button on left and Talk button on top right with correct placeholder when opened', () => {
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    // Save button should say "Save" (not "Save Note")
    const saveButton = screen.getByRole('button', { name: /^Save$/i });
    expect(saveButton).toBeInTheDocument();

    // Talk button should say "Talk"
    const talkButton = screen.getByRole('button', { name: /Talk/i });
    expect(talkButton).toBeInTheDocument();

    // Textarea placeholder should only say "Add New Note..."
    const textarea = screen.getByPlaceholderText('Add New Note...');
    expect(textarea).toBeInTheDocument();

    // Photo attachments component should be present in the Quick Add card
    expect(screen.getByText(/Camera|Add Photos/i)).toBeInTheDocument();
  });

  test('saves note manually when clicking Save button', () => {
    const onAddNoteMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={onAddNoteMock}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    const textarea = screen.getByPlaceholderText('Add New Note...');
    fireEvent.change(textarea, { target: { value: 'Urgent site inspection notes' } });

    const saveButton = screen.getByRole('button', { name: /^Save$/i });
    fireEvent.click(saveButton);

    expect(onAddNoteMock).toHaveBeenCalledWith(
      'Urgent site inspection notes',
      '',
      'general',
      expect.objectContaining({ photos: [] })
    );
  });

  test('auto-saves draft after default 60 seconds (1 min) of idle time without premature interruption', () => {
    const onAddNoteMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={onAddNoteMock}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    const textarea = screen.getByPlaceholderText('Add New Note...');
    fireEvent.change(textarea, { target: { value: 'Site note estimating electrical wiring' } });

    // Should NOT save at 4 seconds or 30 seconds when thinking or taking measurements
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(onAddNoteMock).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(26000); // 30s total
    });
    expect(onAddNoteMock).not.toHaveBeenCalled();

    // Advance to 60 seconds total
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    expect(onAddNoteMock).toHaveBeenCalledWith(
      'Site note estimating electrical wiring',
      '',
      'general',
      expect.objectContaining({ photos: [] })
    );
  });

  test('respects configurable notesAutosaveDelay prop (e.g. 30s)', () => {
    const onAddNoteMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={onAddNoteMock}
        notesAutosaveDelay="30s"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    const textarea = screen.getByPlaceholderText('Add New Note...');
    fireEvent.change(textarea, { target: { value: 'Quick notes 30s test' } });

    act(() => {
      jest.advanceTimersByTime(29000);
    });
    expect(onAddNoteMock).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onAddNoteMock).toHaveBeenCalledWith(
      'Quick notes 30s test',
      '',
      'general',
      expect.objectContaining({ photos: [] })
    );
  });

  test('disables idle auto-save when notesAutosaveDelay is set to off', () => {
    const onAddNoteMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={onAddNoteMock}
        notesAutosaveDelay="off"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    const textarea = screen.getByPlaceholderText('Add New Note...');
    fireEvent.change(textarea, { target: { value: 'Manual only note' } });

    act(() => {
      jest.advanceTimersByTime(300000); // 5 minutes
    });
    expect(onAddNoteMock).not.toHaveBeenCalled();
  });

  test('auto-saves draft on document visibilitychange when user switches app or locks phone', () => {
    const onAddNoteMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={onAddNoteMock}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    const textarea = screen.getByPlaceholderText('Add New Note...');
    fireEvent.change(textarea, { target: { value: 'Note before locking phone' } });

    // Simulate tab switch / screen lock
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onAddNoteMock).toHaveBeenCalledWith(
      'Note before locking phone',
      '',
      'general',
      expect.objectContaining({ photos: [] })
    );
  });

  test('does not render Pro/Lite profile toggle switch in the toolbar', () => {
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
        viewProfile="lite"
      />
    );

    expect(screen.queryByRole('button', { name: /^Pro$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Lite$/i })).not.toBeInTheDocument();
  });

  test('renders styled project dropdown trigger and opens dropdown with project color bands and counts', () => {
    const onSelectProjectFilterMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        activeProjectFilter="all"
        onSelectProjectFilter={onSelectProjectFilterMock}
        onAddNote={jest.fn()}
      />
    );

    // Initial trigger button says "All Notes (1)"
    const trigger = screen.getByText(/All Notes\s*\(1\)/i);
    expect(trigger).toBeInTheDocument();

    // Clicking trigger opens custom dropdown
    fireEvent.click(trigger);

    // Verify project options in dropdown
    expect(screen.getByText('Unassigned Inbox')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();

    // Selecting a project option calls onSelectProjectFilter
    fireEvent.click(screen.getByText('Work'));
    expect(onSelectProjectFilterMock).toHaveBeenCalledWith('proj1');
  });

  test('renders top bar with Settings button and Add New Note button without achievements badge or duplicate button below', () => {
    const onOpenSettingsMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
        onOpenSettings={onOpenSettingsMock}
      />
    );

    // Achievements badge is NOT in the Notes view
    expect(screen.queryByTitle('Productivity Achievements & Insights')).not.toBeInTheDocument();
    
    // Settings cog IS in the Notes view top section next to Add Note
    const settingsBtn = screen.getByTitle('Settings');
    expect(settingsBtn).toBeInTheDocument();
    fireEvent.click(settingsBtn);
    expect(onOpenSettingsMock).toHaveBeenCalledTimes(1);

    // The red Add new note button is in the top bar
    const addNoteBtn = screen.getByRole('button', { name: /Add new note/i });
    expect(addNoteBtn).toBeInTheDocument();

    // The duplicate "Add New Note" dashed button below is NOT rendered
    expect(screen.queryByText('Add New Note')).not.toBeInTheDocument();
  });

  test('renders generous header gap (24px) between Settings and Add Note button to prevent accidental clicks', () => {
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
        onOpenSettings={jest.fn()}
      />
    );

    const settingsBtn = screen.getByTitle('Settings');
    const actionsContainer = settingsBtn.parentElement;
    expect(actionsContainer.style.gap).toBe('24px');

    const addNoteBtn = screen.getByRole('button', { name: /Add new note/i });
    expect(addNoteBtn.style.marginLeft).toBe('auto');
  });

  test('integrates Command Palette into search bar when search is activated in Notes mode', () => {
    const onOpenCommandPaletteMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
        onOpenCommandPalette={onOpenCommandPaletteMock}
      />
    );

    // Click search icon button to open search bar
    const searchToggleBtn = screen.getByRole('button', { name: /^Search$/i });
    fireEvent.click(searchToggleBtn);

    // Command palette pill button should be visible in search bar
    const cmdKPill = screen.getByRole('button', { name: /Open Command Palette \(Cmd\+K\)/i });
    expect(cmdKPill).toBeInTheDocument();

    fireEvent.click(cmdKPill);
    expect(onOpenCommandPaletteMock).toHaveBeenCalledTimes(1);
  });

  test('renders glowing listening indicator when Talk dictation is active and allows clicking mic access blocked to open Settings', () => {
    const onOpenSettingsMock = jest.fn();
    let statusCallback = null;

    jest.spyOn(voiceUtils, 'isSpeechRecognitionSupported').mockReturnValue(true);
    jest.spyOn(voiceUtils, 'startVoiceDictation').mockImplementation(({ onStatusChange }) => {
      statusCallback = onStatusChange;
      return { stop: jest.fn() };
    });

    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
        onOpenSettings={onOpenSettingsMock}
      />
    );

    // Open Add Note
    fireEvent.click(screen.getByRole('button', { name: /Add new note/i }));

    // Click Talk button
    const talkBtn = screen.getByRole('button', { name: /Talk/i });
    fireEvent.click(talkBtn);

    // Verify Talk button enters active listening state with glow
    const listeningBtn = screen.getByRole('button', { name: /Listening/i });
    expect(listeningBtn).toBeInTheDocument();
    expect(listeningBtn.style.boxShadow).toBe('0 0 10px rgba(239, 68, 68, 0.4)');
    expect(screen.getByText('Listening...')).toBeInTheDocument();

    // Trigger mic access blocked error message
    act(() => {
      statusCallback('⚠️ Mic access blocked. Check permissions or Settings → Voice.');
    });

    const statusBanner = screen.getByText(/Mic access blocked/i);
    expect(statusBanner).toBeInTheDocument();

    // Clicking status banner opens Settings
    fireEvent.click(statusBanner.closest('div'));
    expect(onOpenSettingsMock).toHaveBeenCalledTimes(1);

    voiceUtils.isSpeechRecognitionSupported.mockRestore();
    voiceUtils.startVoiceDictation.mockRestore();
  });

  test('delegates onEdit to NoteCard so editing in Notes mode triggers the unified editing interface', () => {
    const onEditMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
        onEdit={onEditMock}
        viewProfile="pro"
      />
    );

    const editBtn = screen.getByRole('button', { name: /Edit Note/i });
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    expect(onEditMock).toHaveBeenCalledTimes(1);
    expect(onEditMock).toHaveBeenCalledWith(sampleTasks[0]);
  });

  test('aligns add note interface with tasks mode: mic on far right, cancel button to its left with generous spacing, camera on right, prominent save, and no instructions', () => {
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    // Mic button on far right
    const talkButton = screen.getByRole('button', { name: /Talk/i });
    expect(talkButton).toBeInTheDocument();
    expect(talkButton.style.minHeight).toBe('44px');

    // Cancel button in Tasks-mode circular style, placed to the left of the mic button
    const cancelBtn = screen.getByRole('button', { name: /Cancel and close/i });
    expect(cancelBtn).toBeInTheDocument();
    expect(cancelBtn.style.borderRadius).toBe('50%');
    expect(cancelBtn.nextElementSibling).toBe(talkButton);
    expect(talkButton.parentElement.style.gap).toBe('18px');

    // Save button prominent for gloves wearers
    const saveButton = screen.getByRole('button', { name: /^Save$/i });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton.style.minHeight).toBe('44px');

    // Camera button on the right
    const cameraBtn = screen.getByText('Camera').closest('button');
    expect(cameraBtn).toBeInTheDocument();
    const photoControls = cameraBtn.parentElement;
    expect(photoControls.style.marginLeft).toBe('auto');

    // No instructions modal text
    expect(screen.queryByText(/💡 Auto-saves after/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Say "add note"/i)).not.toBeInTheDocument();
  });

  test('appends to bottom on a new line and sets cursor to end when clicking mic in Notes view mode', () => {
    let capturedOptions = null;
    jest.spyOn(voiceUtils, 'isSpeechRecognitionSupported').mockReturnValue(true);
    jest.spyOn(voiceUtils, 'startVoiceDictation').mockImplementation((options) => {
      capturedOptions = options;
      return { stop: jest.fn() };
    });

    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    const textarea = screen.getByPlaceholderText('Add New Note...');
    fireEvent.change(textarea, { target: { value: 'Measure kitchen window width' } });

    // Click Talk button to start dictating
    const talkBtn = screen.getByRole('button', { name: /Talk/i });
    fireEvent.click(talkBtn);

    // Textarea value should have a newline appended automatically
    expect(textarea.value).toBe('Measure kitchen window width\n');

    // Cursor should be at the end on the new line
    expect(textarea.selectionStart).toBe('Measure kitchen window width\n'.length);
    expect(textarea.selectionEnd).toBe('Measure kitchen window width\n'.length);

    // Dictation initialized with the newline prefix
    expect(capturedOptions.prefix).toBe('Measure kitchen window width\n');

    // When voice transcript returns, it appends to the new line
    act(() => {
      capturedOptions.onTranscript('Measure kitchen window width\n120cm wide by 90cm high', false);
    });

    expect(textarea.value).toBe('Measure kitchen window width\n120cm wide by 90cm high');
    expect(textarea.selectionStart).toBe('Measure kitchen window width\n120cm wide by 90cm high'.length);

    voiceUtils.isSpeechRecognitionSupported.mockRestore();
    voiceUtils.startVoiceDictation.mockRestore();
  });

  test('allows selecting priority when adding note and closes via circular cancel button', () => {
    const onAddNoteMock = jest.fn();
    render(
      <NotesView
        tasks={sampleTasks}
        projects={sampleProjects}
        onAddNote={onAddNoteMock}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));

    const textarea = screen.getByPlaceholderText('Add New Note...');
    fireEvent.change(textarea, { target: { value: 'Important safety inspection' } });

    // Select Priority 2 (Should Do)
    const p2Btn = screen.getByRole('button', { name: /Should Do/i });
    fireEvent.click(p2Btn);

    const saveButton = screen.getByRole('button', { name: /^Save$/i });
    fireEvent.click(saveButton);

    expect(onAddNoteMock).toHaveBeenCalledWith(
      'Important safety inspection',
      '',
      'general',
      expect.objectContaining({ priority: 2 })
    );

    // Reopen and test cancel closes it
    fireEvent.click(screen.getByRole('button', { name: /Add New Note/i }));
    expect(screen.getByPlaceholderText('Add New Note...')).toBeInTheDocument();
    const cancelBtn = screen.getByRole('button', { name: /Cancel and close/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByPlaceholderText('Add New Note...')).not.toBeInTheDocument();
  });
});


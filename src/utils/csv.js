/**
 * utils/csv.js
 * CSV export utilities.
 * No DOM dependencies beyond Blob/URL — safe to unit-test in Node.
 */

/**
 * A6: Download the board's task list as CSV.
 * Does NOT include peer reviews, scores, or any sensitive data (UREB A1/A2).
 *
 * @param {object[]} tasks   Array of task objects from IndexedDB
 * @param {object[]} members Array of member objects from IndexedDB
 * @param {object}   group   Group document
 */
export function exportTasksCSV(tasks, members, group) {
  const STATUS_LABELS = {
    'todo':             'To Do',
    'in-progress':      'In Progress',
    'pending-approval': 'Pending Approval',
    'done':             'Completed',
  };
  const headers = ['Title', 'Assignee', 'Status', 'Weight', 'Difficulty', 'Task Type', 'Deadline'];
  const rows = (tasks || []).map((t) => {
    const assignee = members.find((m) => m.id === t.assignedTo)?.displayName || 'Unassigned';
    const status   = STATUS_LABELS[t.status] || t.status;
    const deadline = t.deadline ? new Date(t.deadline).toLocaleDateString() : '';
    return [
      '"' + (t.title || '').replace(/"/g, '""') + '"',
      '"' + assignee.replace(/"/g, '""') + '"',
      '"' + status + '"',
      t.weight ?? '',
      t.difficulty || '',
      '"' + (t.taskType || '').replace(/"/g, '""') + '"',
      deadline,
    ].join(',');
  });
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = (group?.name || 'tasks').replace(/[^a-z0-9]/gi, '_') + '-tasks-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

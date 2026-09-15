import { calculatePoints } from './gamificationEngine.js';

/**
 * Build an audit report from group data. Pure function — no I/O.
 *
 * @param {object} audit
 * @param {Array} members
 * @param {Array} tasks
 * @param {Array} peerReviews
 * @param {Array} badges
 */
export function generateAuditReport(audit, members, tasks, peerReviews, badges) {
  const targetMembers = audit.scope === 'member'
    ? members.filter((m) => m.id === audit.memberId)
    : members;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const overdueTasks = tasks.filter(
    (t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done'
  );

  const completionTimes = doneTasks
    .filter((t) => t.createdAt && t.completedAt)
    .map((t) => t.completedAt - t.createdAt);
  const avgCompletionMs = completionTimes.length > 0
    ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
    : 0;
  const avgCompletionDays = Math.round((avgCompletionMs / (1000 * 60 * 60 * 24)) * 10) / 10;

  const memberReports = targetMembers.map((m) => {
    const assigned = tasks.filter((t) => t.assignedTo === m.id).length;
    const completed = tasks.filter((t) => t.assignedTo === m.id && t.status === 'done').length;
    const pts = calculatePoints(tasks, m.id);
    const reviews = peerReviews.filter((r) => r.evaluateeId === m.id);
    const avgScore = reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(1)
      : 'N/A';
    const memberBadges = badges.filter((b) => b.memberId === m.id).length;
    return { name: m.displayName, role: m.role, assigned, completed, pts, avgScore, memberBadges };
  });

  const recommendations = [];
  for (const mr of memberReports) {
    if (mr.assigned > 0 && mr.completed / mr.assigned < 0.3) {
      recommendations.push(`⚠️ ${mr.name} has a low completion rate (${mr.completed}/${mr.assigned}). Consider providing guidance or redistributing tasks.`);
    }
    if (mr.avgScore !== 'N/A' && parseFloat(mr.avgScore) < 2.5) {
      recommendations.push(`⚠️ ${mr.name} has a low peer rating (${mr.avgScore}★). Consider a private conversation.`);
    }
  }

  const ranked = [...memberReports].sort((a, b) => b.pts - a.pts);
  const topContributor = ranked[0];
  if (topContributor && ranked.length > 1) {
    const secondPlace = ranked[1];
    if (topContributor.pts > secondPlace.pts * 2) {
      recommendations.push(`📊 Work distribution is top-heavy. ${topContributor.name} has ${topContributor.pts} pts while the next member has ${secondPlace.pts} pts.`);
    }
  }

  if (overdueTasks.length > 3) {
    recommendations.push(`⏰ ${overdueTasks.length} tasks are overdue. Consider a team standup to address blockers.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Team performance looks healthy. No critical issues detected.');
  }

  return {
    totalTasks,
    doneTasks: doneTasks.length,
    overdueTasks: overdueTasks.length,
    avgCompletionDays,
    memberReports,
    recommendations,
    generatedAt: Date.now(),
  };
}

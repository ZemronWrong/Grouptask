/**
 * @typedef {Object} AuditRequest
 * @property {string} id
 * @property {string} groupId
 * @property {'full'|'member'} scope
 * @property {string|null} [memberId]
 * @property {string|null} [memberName]
 * @property {string} [reason]
 * @property {string} requestedBy
 * @property {'pending'|'completed'} status
 * @property {number} createdAt
 * @property {number} [completedAt]
 * @property {AuditReport} [report]
 */

/**
 * @typedef {Object} AuditReport
 * @property {number} totalTasks
 * @property {number} doneTasks
 * @property {number} overdueTasks
 * @property {number} avgCompletionDays
 * @property {Array<Object>} memberReports
 * @property {string[]} recommendations
 * @property {number} generatedAt
 */

export {};

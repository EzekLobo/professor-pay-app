export const correctionUrlFor = ({
  link,
  taskId,
  studentId,
  groupId,
}: {
  link: string;
  taskId: string;
  studentId: string;
  groupId: string;
}) => {
  const direct = link.trim();
  const absolute = /^https?:\/\//.test(direct)
    ? direct
    : direct
      ? `https://bo.kodland.org${direct}`
      : "";
  const taskMatch = absolute.match(/^(https:\/\/learn\.kodland\.org\/[^/]+\/task\/[^/]+\/check)(?:\/([^/?#]+))?\/?([?#].*)?$/);
  if (taskMatch?.[2]) return absolute;
  if (taskMatch && studentId) return `${taskMatch[1]}/${encodeURIComponent(studentId)}${taskMatch[3] ?? ""}`;
  if (absolute) return absolute;
  if (taskId && studentId) {
    return `https://learn.kodland.org/pt/task/${encodeURIComponent(taskId)}/check/${encodeURIComponent(studentId)}`;
  }
  return `https://bo.kodland.org/groups/${groupId}`;
};

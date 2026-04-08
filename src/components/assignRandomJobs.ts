import { members } from "../lib/members";

export const assignRandomJobs = (
  jobs: string[],
  availableMembers: typeof members
) => {
  if (!availableMembers || availableMembers.length === 0) {
    console.warn("No members available to assign jobs.");
    return [];
  }

  const shuffledMembers = [...availableMembers].sort(() => Math.random() - 0.5);
  const assignedJobs: { job_name: string; member_name: string }[] = [];

  let memberIndex = 0;
  jobs.forEach((job) => {
    const assignedMember = shuffledMembers[memberIndex];
    assignedJobs.push({
      job_name: job,
      member_name: assignedMember?.name || "Unassigned",
    });
    memberIndex = (memberIndex + 1) % shuffledMembers.length;
  });

  return assignedJobs;
};

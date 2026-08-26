export {
  copyDir,
  copyWorktreeIncludeFiles,
  isDirEmpty,
  pathExists,
  safeResolvePath,
  writeFileAtomic,
} from './zoneScaffolding.js'

export { copyWorktreeIncludeFiles as copyZoneIncludeFiles } from './zoneScaffolding.js'

export {
  findGitRoot,
  findCanonicalGitRoot,
  isGitWorktree,
} from './git.js'

export {
  getWorktreeInfo,
  isWorktreePathSafe,
  type WorktreeInfo,
} from '../ink/utils/worktree.js'

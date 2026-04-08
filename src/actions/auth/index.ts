// actions/auth/index.ts
// IMPORTANT: NO "use server" in barrel files.
// Server Actions live in ./actions.ts (which *does* have "use server").

export {
  signUpAction,
  signInAction,
  signOutAction,
  forgotPasswordAction,
  resetPasswordAction,
} from "./actions";
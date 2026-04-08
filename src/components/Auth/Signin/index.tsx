import Link from "next/link";
import GoogleSigninButton from "../GoogleSigninButton";
import SigninWithPassword from "../SigninWithPassword";
import { useTheme } from "@/app/provider";

export default function Signin() {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  return (
    <div className={`p-6 rounded-lg ${
      isDark 
        ? "bg-[hsl(var(--card))] shadow-[var(--shadow-md)]" 
        : "bg-[hsl(var(--background))] shadow-[var(--shadow-sm)]"
    }`}>
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Welcome Back</h2>
        <p className="text-[hsl(var(--muted-foreground))] mt-2">Sign in to your account to continue</p>
      </div>
      
      <GoogleSigninButton text="Sign in with Google" />

      <div className="my-6 flex items-center justify-center">
        <span className="block h-px w-full bg-[hsl(var(--border))]"></span>
        <div className="block w-full min-w-fit px-3 text-center font-medium text-[hsl(var(--muted-foreground))]">
          Or sign in with email
        </div>
        <span className="block h-px w-full bg-[hsl(var(--border))]"></span>
      </div>

      <div>
        <SigninWithPassword />
      </div>

      <div className="mt-6 text-center">
        <p className="text-[hsl(var(--muted-foreground))]">
          Don't have an account?{" "}
          <Link 
            href="/auth/sign-up" 
            className="text-[hsl(var(--sidebar-primary))] hover:underline transition-all duration-200"
          >
            Sign Up
          </Link>
        </p>
      </div>
      
      <div className="mt-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
        <p>By signing in, you agree to our <Link href="/terms" className="hover:underline">Terms of Service</Link> and <Link href="/privacy" className="hover:underline">Privacy Policy</Link></p>
      </div>
    </div>
  );
}

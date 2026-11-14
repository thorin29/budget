import Link from "next/link";
import { AuthCard, AuthForm } from "@/components/auth-form";
import { MIN_PASSWORD } from "@/lib/auth/rules";
import { joinAction } from "./actions";

export const dynamic = "force-dynamic";

export default function JoinPage() {
  return (
    <AuthCard
      title="Create your account"
      lead="Use the one-time code from Settings → Sign-in & people on the other person's account. It lasts 15 minutes."
    >
      <AuthForm
        action={joinAction}
        submitLabel="Create account"
        fields={[
          { name: "code", label: "One-time code", autoComplete: "one-time-code" },
          { name: "username", label: "Username", autoComplete: "username", hint: "3–32 letters, numbers, dot, dash or underscore" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: `At least ${MIN_PASSWORD} characters` },
          { name: "confirm", label: "Password again", type: "password", autoComplete: "new-password" },
        ]}
      />
      <p className="mt-5 text-xs text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-accent-text hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

import Link from "next/link";
import { AuthCard, AuthForm } from "@/components/auth-form";
import { safeNext } from "@/lib/auth/safe-next";
import { signInAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Sign in">
      <AuthForm
        action={signInAction}
        submitLabel="Sign in"
        hidden={{ next: safeNext(next) }}
        fields={[
          { name: "username", label: "Username", autoComplete: "username" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-5 text-xs text-muted">
        Have a code from the other account holder?{" "}
        <Link href="/join" className="font-semibold text-accent-text hover:underline">
          Create your account
        </Link>
      </p>
    </AuthCard>
  );
}

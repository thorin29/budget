import { AuthCard, AuthForm } from "@/components/auth-form";
import { setupCodeForLog } from "@/server/auth";
import { MIN_PASSWORD } from "@/lib/auth/rules";
import { createFirstAccountAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * First run only: the proxy closes this page for good once an account exists.
 * Rendering it writes the setup code to the container log.
 */
export default async function SetupAccountPage() {
  await setupCodeForLog();
  return (
    <AuthCard
      title="Create your account"
      lead={
        <>
          Budget now asks you to sign in. To prove you run this server, enter the setup code
          from the container&rsquo;s log — it is written there when this page opens, under
          &ldquo;first-run setup code&rdquo;.
        </>
      }
    >
      <AuthForm
        action={createFirstAccountAction}
        submitLabel="Create account"
        fields={[
          { name: "code", label: "Setup code", autoComplete: "one-time-code", hint: "Looks like 1234-5678-9012" },
          { name: "username", label: "Username", autoComplete: "username", hint: "3–32 letters, numbers, dot, dash or underscore" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: `At least ${MIN_PASSWORD} characters` },
          { name: "confirm", label: "Password again", type: "password", autoComplete: "new-password" },
        ]}
      />
    </AuthCard>
  );
}

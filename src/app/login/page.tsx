import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import SetupScreen from "@/components/SetupScreen";
import { getAuth } from "@/lib/auth";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  await connection(); // auth state is per request
  const auth = await getAuth();
  if (auth.kind === "user" || auth.kind === "dev-bypass") redirect("/");
  if (auth.kind === "unconfigured") return <SetupScreen />;
  const { error } = await searchParams;
  return <LoginForm initialError={error === "confirm" ? "That confirmation link is invalid or expired. Try signing in." : null} />;
}

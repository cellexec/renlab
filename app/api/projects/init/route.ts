import { NextResponse } from "next/server";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { scaffoldKnowledge } from "../../../lib/knowledgeManager";

const exec = promisify(execCb);

const SUPABASE_CLIENT_TEMPLATE = `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`;

const ENV_LOCAL_TEMPLATE = `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
`;

const AUTH_MIDDLEWARE_TEMPLATE = `import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/signup") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
`;

const LOGIN_PAGE_TEMPLATE = `"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Log in</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border p-2" required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded border p-2" required />
        <button type="submit" className="w-full rounded bg-blue-600 p-2 text-white hover:bg-blue-500">Log in</button>
        <p className="text-sm text-center">Don&apos;t have an account? <Link href="/signup" className="text-blue-500 underline">Sign up</Link></p>
      </form>
    </div>
  );
}
`;

const SIGNUP_PAGE_TEMPLATE = `"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSignup} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Sign up</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border p-2" required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded border p-2" required />
        <button type="submit" className="w-full rounded bg-blue-600 p-2 text-white hover:bg-blue-500">Sign up</button>
        <p className="text-sm text-center">Already have an account? <Link href="/login" className="text-blue-500 underline">Log in</Link></p>
      </form>
    </div>
  );
}
`;

type Stack = "nextjs" | "nextjs-supabase" | "nextjs-supabase-auth";

async function scaffold(dir: string, stack: Stack) {
  // Create Next.js app
  await exec(
    `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm --yes`,
    { cwd: dir }
  );

  if (stack === "nextjs-supabase" || stack === "nextjs-supabase-auth") {
    // Install supabase client
    await exec(`npm install @supabase/supabase-js`, { cwd: dir });

    // Write lib/supabase.ts
    await mkdir(path.join(dir, "lib"), { recursive: true });
    await writeFile(path.join(dir, "lib", "supabase.ts"), SUPABASE_CLIENT_TEMPLATE);

    // Write .env.local template
    await writeFile(path.join(dir, ".env.local"), ENV_LOCAL_TEMPLATE);
  }

  if (stack === "nextjs-supabase-auth") {
    // Install SSR package
    await exec(`npm install @supabase/ssr`, { cwd: dir });

    // Write middleware
    await writeFile(path.join(dir, "middleware.ts"), AUTH_MIDDLEWARE_TEMPLATE);

    // Write login page
    await mkdir(path.join(dir, "app", "login"), { recursive: true });
    await writeFile(path.join(dir, "app", "login", "page.tsx"), LOGIN_PAGE_TEMPLATE);

    // Write signup page
    await mkdir(path.join(dir, "app", "signup"), { recursive: true });
    await writeFile(path.join(dir, "app", "signup", "page.tsx"), SIGNUP_PAGE_TEMPLATE);
  }
}

export async function POST(req: Request) {
  try {
    const { path: dir, stack, scaffold: shouldScaffold } = (await req.json()) as {
      path: string;
      stack: Stack;
      scaffold: boolean;
    };

    if (!dir) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    if (shouldScaffold) {
      await scaffold(dir, stack ?? "nextjs");
    }

    // Only git init if the directory is not already inside a git repo
    const { stdout: gitRoot } = await exec("git rev-parse --show-toplevel", { cwd: dir }).catch(() => ({ stdout: "" }));
    if (!gitRoot.trim()) {
      await exec("git init", { cwd: dir });
    }

    // Scaffold knowledge directory structure
    await scaffoldKnowledge(dir);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

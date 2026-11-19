# CurhatIn Chat App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CurhatIn, a realtime chat web app (Next.js 14 + Supabase) with username-based auth, text/image/video messaging, and an account settings page (edit profile, change password, delete account).

**Architecture:** Next.js 14 App Router frontend talking directly to Supabase (Auth, Postgres, Realtime, Storage) from the client, except account deletion which goes through a Next.js server route using the Supabase service role key. Username-based auth is implemented as a thin layer over Supabase Auth's email/password by mapping `username` → synthetic email `{username}@chatapp.local`.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Tailwind CSS, @supabase/supabase-js, Vitest (unit tests for pure logic), Vercel (hosting).

## Global Constraints

- Project root for the app is `chat-app/` inside `D:\Imam\Claude\Website\CHAT`.
- Image uploads (chat media & avatars): formats JPG, PNG, GIF, WebP; max size 5MB.
- Video uploads (chat media): formats MP4, WebM; max size 20MB.
- Synthetic email domain for username-based auth: `@chatapp.local`.
- Storage buckets: `media` (chat images/videos), `avatars` (profile pictures). Both public-read, upload/update/delete restricted to the owning `auth.uid()` via path prefix `{uid}/...`.
- Tables: `users` (id, username, name, avatar_url, created_at), `messages` (id, uid, name, type, content, created_at). Both have RLS enabled.
- App name "CurhatIn" and the supplied dinosaur logo must appear on Login, Register, and the `/chat` header.
- Account deletion must only be performed server-side with the Supabase service role key (never exposed to the client).

---

## File Structure

```
chat-app/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                      ← Login
│   ├── register/page.tsx             ← Register
│   ├── chat/page.tsx                 ← Chat main
│   ├── settings/page.tsx             ← Account settings
│   └── api/delete-account/route.ts   ← Server route (service role)
├── components/
│   ├── Logo.tsx
│   ├── ChatBubble.tsx
│   ├── MessageInput.tsx
│   ├── MediaPreview.tsx
│   ├── ProfileForm.tsx
│   ├── PasswordForm.tsx
│   └── DeleteAccountModal.tsx
├── lib/
│   └── supabase.ts
├── utils/
│   ├── auth.ts
│   ├── validation.ts
│   ├── messages.ts
│   ├── upload.ts
│   └── profile.ts
├── public/icons/logo.png
├── supabase/schema.sql
├── .env.local.example
└── vitest.config.ts
```

---

### Task 1: Project scaffold & Supabase client

**Files:**
- Create: `chat-app/package.json` (via create-next-app)
- Create: `chat-app/lib/supabase.ts`
- Create: `chat-app/.env.local.example`
- Create: `chat-app/vitest.config.ts`
- Test: `chat-app/lib/supabase.test.ts`

**Interfaces:**
- Produces: `supabase` (default export, `SupabaseClient`) from `lib/supabase.ts`, used by every later task that talks to Supabase.

- [ ] **Step 1: Scaffold the Next.js app**

Run inside `D:\Imam\Claude\Website\CHAT`:

```bash
npx create-next-app@14 chat-app --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"
cd chat-app
npm install @supabase/supabase-js
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/jest-dom
```

- [ ] **Step 2: Create Vitest config**

`chat-app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

Add to `chat-app/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write the failing test for the Supabase client**

`chat-app/lib/supabase.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { supabase } from "./supabase";

describe("supabase client", () => {
  it("is created with a non-empty url and key", () => {
    expect(supabase).toBeTruthy();
    expect((supabase as any).supabaseUrl).toContain("http");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- lib/supabase.test.ts`
Expected: FAIL — `./supabase` module not found.

- [ ] **Step 5: Implement the Supabase client**

`chat-app/.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Copy this to `.env.local` and fill in real values before running the app.

`chat-app/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- lib/supabase.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/supabase.ts lib/supabase.test.ts vitest.config.ts .env.local.example .gitignore
git commit -m "chore: scaffold Next.js app and Supabase client"
```

---

### Task 2: Supabase SQL schema (tables, RLS, storage buckets)

**Files:**
- Create: `chat-app/supabase/schema.sql`

**Interfaces:**
- Produces: the `users` and `messages` tables and `media`/`avatars` storage buckets that every later task reads from or writes to. No code interface — this is infrastructure applied manually in the Supabase SQL editor.

- [ ] **Step 1: Write the schema file**

`chat-app/supabase/schema.sql`:

```sql
-- USERS TABLE
CREATE TABLE users (
  id          uuid REFERENCES auth.users PRIMARY KEY,
  username    text UNIQUE NOT NULL,
  name        text NOT NULL,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read users"
  ON users FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "insert own user"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "update own user"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- MESSAGES TABLE
CREATE TABLE messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid         uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL,
  type        text CHECK (type IN ('text','image','video')),
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read messages"
  ON messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "insert own message"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = uid);

-- STORAGE: media bucket (chat images/videos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true);

CREATE POLICY "upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- STORAGE: avatars bucket (profile pictures)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

CREATE POLICY "upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply the schema**

In the Supabase dashboard → SQL Editor, paste and run the contents of `schema.sql`. Then go to Database → Replication (or Table Editor → `messages` → enable Realtime) and turn on Realtime for the `messages` table.

- [ ] **Step 3: Verify manually**

In Table Editor, confirm `users` and `messages` tables exist with RLS enabled (shield icon), and Storage shows buckets `media` and `avatars`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema for users, messages, and storage buckets"
```

---

### Task 3: Username ↔ synthetic email mapping + validation utils

**Files:**
- Create: `chat-app/utils/auth.ts` (mapping function only in this task; auth calls added in Task 4)
- Create: `chat-app/utils/validation.ts`
- Test: `chat-app/utils/auth.test.ts`
- Test: `chat-app/utils/validation.test.ts`

**Interfaces:**
- Produces: `usernameToEmail(username: string): string` from `utils/auth.ts`.
- Produces: `isValidUsername(username: string): boolean`, `validateImageFile(file: File): string | null`, `validateVideoFile(file: File): string | null` from `utils/validation.ts` (returns `null` when valid, else an error message string).

- [ ] **Step 1: Write the failing tests**

`chat-app/utils/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { usernameToEmail } from "./auth";

describe("usernameToEmail", () => {
  it("appends the synthetic domain", () => {
    expect(usernameToEmail("budi")).toBe("budi@chatapp.local");
  });

  it("lowercases the username", () => {
    expect(usernameToEmail("Budi123")).toBe("budi123@chatapp.local");
  });
});
```

`chat-app/utils/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isValidUsername, validateImageFile, validateVideoFile } from "./validation";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe("isValidUsername", () => {
  it("accepts alphanumeric 3-20 chars", () => {
    expect(isValidUsername("budi123")).toBe(true);
  });
  it("rejects spaces and symbols", () => {
    expect(isValidUsername("budi 123!")).toBe(false);
  });
  it("rejects too short", () => {
    expect(isValidUsername("ab")).toBe(false);
  });
});

describe("validateImageFile", () => {
  it("accepts a valid jpg under 5MB", () => {
    const file = makeFile("a.jpg", "image/jpeg", 1024);
    expect(validateImageFile(file)).toBeNull();
  });
  it("rejects unsupported type", () => {
    const file = makeFile("a.bmp", "image/bmp", 1024);
    expect(validateImageFile(file)).toMatch(/format/i);
  });
  it("rejects file over 5MB", () => {
    const file = makeFile("a.png", "image/png", 6 * 1024 * 1024);
    expect(validateImageFile(file)).toMatch(/5MB/);
  });
});

describe("validateVideoFile", () => {
  it("accepts a valid mp4 under 20MB", () => {
    const file = makeFile("a.mp4", "video/mp4", 1024);
    expect(validateVideoFile(file)).toBeNull();
  });
  it("rejects file over 20MB", () => {
    const file = makeFile("a.mp4", "video/mp4", 21 * 1024 * 1024);
    expect(validateVideoFile(file)).toMatch(/20MB/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- utils/auth.test.ts utils/validation.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the utils**

`chat-app/utils/auth.ts`:

```ts
export const SYNTHETIC_EMAIL_DOMAIN = "chatapp.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
```

`chat-app/utils/validation.ts`:

```ts
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

export function validateImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Format gambar tidak didukung. Gunakan JPG, PNG, GIF, atau WebP.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Ukuran gambar maksimal 5MB.";
  }
  return null;
}

export function validateVideoFile(file: File): string | null {
  if (!VIDEO_TYPES.includes(file.type)) {
    return "Format video tidak didukung. Gunakan MP4 atau WebM.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "Ukuran video maksimal 20MB.";
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- utils/auth.test.ts utils/validation.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/auth.ts utils/auth.test.ts utils/validation.ts utils/validation.test.ts
git commit -m "feat: add username-to-email mapping and file validation utils"
```

---

### Task 4: Auth utils (register, login, logout)

**Files:**
- Modify: `chat-app/utils/auth.ts`
- Test: `chat-app/utils/auth.test.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts` (Task 1), `usernameToEmail` (Task 3), `isValidUsername` from `utils/validation.ts` (Task 3).
- Produces: `registerUser(username: string, password: string): Promise<{ error: string | null }>`, `loginUser(username: string, password: string): Promise<{ error: string | null }>`, `logoutUser(): Promise<void>` from `utils/auth.ts`. Used by Task 6 (Login page) and Task 7 (Register page).

- [ ] **Step 1: Write the failing tests**

Append to `chat-app/utils/auth.test.ts`:

```ts
import { vi, beforeEach } from "vitest";
import { registerUser, loginUser, logoutUser } from "./auth";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe("registerUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid username without calling Supabase", async () => {
    const result = await registerUser("ab", "password123");
    expect(result.error).toMatch(/username/i);
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it("checks username availability then signs up with synthetic email", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    (supabase.from as any).mockReturnValue({ select });
    (supabase.auth.signUp as any).mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "users") return { select, insert };
      return { select };
    });

    const result = await registerUser("budi123", "password123");

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "budi123@chatapp.local",
      password: "password123",
    });
    expect(result.error).toBeNull();
  });

  it("returns an error when username is already taken", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { username: "budi123" } });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    (supabase.from as any).mockReturnValue({ select });

    const result = await registerUser("budi123", "password123");

    expect(result.error).toMatch(/sudah dipakai/i);
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });
});

describe("loginUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("translates username to synthetic email and signs in", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ error: null });

    const result = await loginUser("budi123", "password123");

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "budi123@chatapp.local",
      password: "password123",
    });
    expect(result.error).toBeNull();
  });

  it("returns an error on failed login", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    const result = await loginUser("budi123", "wrong");

    expect(result.error).toBe("Invalid login credentials");
  });
});

describe("logoutUser", () => {
  it("calls supabase signOut", async () => {
    (supabase.auth.signOut as any).mockResolvedValue({ error: null });
    await logoutUser();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- utils/auth.test.ts`
Expected: FAIL — `registerUser`, `loginUser`, `logoutUser` not exported.

- [ ] **Step 3: Implement register/login/logout**

Replace `chat-app/utils/auth.ts` with:

```ts
import { supabase } from "../lib/supabase";
import { isValidUsername } from "./validation";

export const SYNTHETIC_EMAIL_DOMAIN = "chatapp.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export async function registerUser(
  username: string,
  password: string
): Promise<{ error: string | null }> {
  if (!isValidUsername(username)) {
    return { error: "Username harus 3-20 karakter huruf, angka, atau underscore." };
  }

  const normalized = username.trim().toLowerCase();

  const { data: existing } = await supabase
    .from("users")
    .select("username")
    .eq("username", normalized)
    .maybeSingle();

  if (existing) {
    return { error: "Username sudah dipakai." };
  }

  const { data, error: signUpError } = await supabase.auth.signUp({
    email: usernameToEmail(normalized),
    password,
  });

  if (signUpError || !data.user) {
    return { error: signUpError?.message ?? "Gagal mendaftar." };
  }

  const { error: insertError } = await supabase.from("users").insert({
    id: data.user.id,
    username: normalized,
    name: normalized,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  return { error: null };
}

export async function loginUser(
  username: string,
  password: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  return { error: error ? error.message : null };
}

export async function logoutUser(): Promise<void> {
  await supabase.auth.signOut();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- utils/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/auth.ts utils/auth.test.ts
git commit -m "feat: implement register, login, logout against Supabase Auth"
```

---

### Task 5: Logo asset and component

**Files:**
- Create: `chat-app/public/icons/logo.png`
- Create: `chat-app/components/Logo.tsx`

**Interfaces:**
- Produces: `Logo` (default export, React component, props `{ size?: number }`) used by Task 6, 7, and 9 (chat header).

- [ ] **Step 1: Save the logo image**

Save the dinosaur logo image supplied by the user to `chat-app/public/icons/logo.png`.

- [ ] **Step 2: Implement the Logo component**

`chat-app/components/Logo.tsx`:

```tsx
import Image from "next/image";

export default function Logo({ size = 48 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/icons/logo.png"
        alt="CurhatIn logo"
        width={size}
        height={size}
        priority
      />
      <span className="text-xl font-bold text-green-700">CurhatIn</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

Run `npm run dev`, temporarily render `<Logo />` on `app/page.tsx` (it will be wired in properly in Task 6), and confirm the logo + "CurhatIn" text render in the browser at `http://localhost:3000`.

- [ ] **Step 4: Commit**

```bash
git add public/icons/logo.png components/Logo.tsx
git commit -m "feat: add CurhatIn logo asset and Logo component"
```

---

### Task 6: Login page

**Files:**
- Modify: `chat-app/app/page.tsx`

**Interfaces:**
- Consumes: `loginUser` from `utils/auth.ts` (Task 4), `Logo` from `components/Logo.tsx` (Task 5).
- Produces: `/` route rendering the login form; on success, navigates to `/chat`.

- [ ] **Step 1: Implement the login page**

`chat-app/app/page.tsx`:

```tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { loginUser } from "@/utils/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: loginError } = await loginUser(username, password);
    setLoading(false);
    if (loginError) {
      setError(loginError);
      return;
    }
    router.push("/chat");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo size={64} />
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded border px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Masuk..." : "Login"}
        </button>
        <Link href="/register" className="text-center text-sm text-green-700 underline">
          Belum punya akun? Register
        </Link>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify manually**

Run `npm run dev`, open `http://localhost:3000`. Confirm the logo, inputs, and buttons render. Submitting with a username that doesn't exist yet should show the Supabase error message (login will be fully testable end-to-end after Task 7 creates an account).

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: implement login page"
```

---

### Task 7: Register page

**Files:**
- Modify: `chat-app/app/register/page.tsx`

**Interfaces:**
- Consumes: `registerUser` from `utils/auth.ts` (Task 4), `Logo` from `components/Logo.tsx` (Task 5).
- Produces: `/register` route; on success, navigates to `/chat`.

- [ ] **Step 1: Implement the register page**

`chat-app/app/register/page.tsx`:

```tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { registerUser, loginUser } from "@/utils/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setLoading(true);
    const { error: registerError } = await registerUser(username, password);
    if (registerError) {
      setLoading(false);
      setError(registerError);
      return;
    }

    const { error: loginError } = await loginUser(username, password);
    setLoading(false);
    if (loginError) {
      setError(loginError);
      return;
    }
    router.push("/chat");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo size={64} />
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded border px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="Konfirmasi Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded border px-3 py-2"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Mendaftar..." : "Register"}
        </button>
        <Link href="/" className="text-center text-sm text-green-700 underline">
          Sudah punya akun? Login
        </Link>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify manually (end-to-end auth)**

With a real Supabase project connected (Task 2 schema applied, `.env.local` filled in), run `npm run dev`:
1. Go to `/register`, register a new username — expect redirect to `/chat` (will 404 or blank until Task 9, that's expected for now; confirm no console errors from the auth call itself).
2. Register the same username again — expect "Username sudah dipakai." error.
3. Go to `/`, log in with the created username/password — expect redirect to `/chat`.
4. Log in with wrong password — expect an error message.

- [ ] **Step 3: Commit**

```bash
git add app/register/page.tsx
git commit -m "feat: implement register page"
```

---

### Task 8: Media upload util

**Files:**
- Create: `chat-app/utils/upload.ts`
- Test: `chat-app/utils/upload.test.ts`

**Interfaces:**
- Consumes: `supabase` (Task 1), `validateImageFile`/`validateVideoFile` (Task 3).
- Produces: `uploadChatMedia(file: File, uid: string): Promise<{ url: string | null; error: string | null; type: "image" | "video" | null }>` used by Task 11 (MessageInput).

- [ ] **Step 1: Write the failing test**

`chat-app/utils/upload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadChatMedia } from "./upload";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe("uploadChatMedia", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid files without calling storage", async () => {
    const file = makeFile("a.bmp", "image/bmp", 1024);
    const result = await uploadChatMedia(file, "user-1");
    expect(result.error).toMatch(/format/i);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("uploads a valid image and returns its public url", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://example.com/media/user-1/123-a.jpg" },
    });
    (supabase.storage.from as any).mockReturnValue({ upload, getPublicUrl });

    const file = makeFile("a.jpg", "image/jpeg", 1024);
    const result = await uploadChatMedia(file, "user-1");

    expect(supabase.storage.from).toHaveBeenCalledWith("media");
    expect(result.error).toBeNull();
    expect(result.type).toBe("image");
    expect(result.url).toBe("https://example.com/media/user-1/123-a.jpg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- utils/upload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the upload util**

`chat-app/utils/upload.ts`:

```ts
import { supabase } from "../lib/supabase";
import { validateImageFile, validateVideoFile } from "./validation";

type MediaKind = "image" | "video";

function detectKind(file: File): MediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export async function uploadChatMedia(
  file: File,
  uid: string
): Promise<{ url: string | null; error: string | null; type: MediaKind | null }> {
  const kind = detectKind(file);

  if (kind === "image") {
    const err = validateImageFile(file);
    if (err) return { url: null, error: err, type: null };
  } else if (kind === "video") {
    const err = validateVideoFile(file);
    if (err) return { url: null, error: err, type: null };
  } else {
    return { url: null, error: "Format file tidak didukung.", type: null };
  }

  const path = `${uid}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("media").upload(path, file);

  if (uploadError) {
    return { url: null, error: uploadError.message, type: null };
  }

  const { data } = supabase.storage.from("media").getPublicUrl(path);

  return { url: data.publicUrl, error: null, type: kind };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- utils/upload.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/upload.ts utils/upload.test.ts
git commit -m "feat: add chat media upload util"
```

---

### Task 9: Messages util (send + realtime subscribe)

**Files:**
- Create: `chat-app/utils/messages.ts`
- Test: `chat-app/utils/messages.test.ts`

**Interfaces:**
- Consumes: `supabase` (Task 1).
- Produces:
  - `type Message = { id: string; uid: string; name: string; type: "text" | "image" | "video"; content: string; created_at: string }`
  - `sendMessage(uid: string, name: string, type: Message["type"], content: string): Promise<{ error: string | null }>`
  - `fetchMessages(): Promise<Message[]>`
  - `subscribeToMessages(onInsert: (message: Message) => void): () => void` (returns an unsubscribe function)
  - Used by Task 12 (Chat page).

- [ ] **Step 1: Write the failing tests**

`chat-app/utils/messages.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage, fetchMessages, subscribeToMessages } from "./messages";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
  },
}));

describe("sendMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a message row", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockReturnValue({ insert });

    const result = await sendMessage("user-1", "budi", "text", "halo");

    expect(supabase.from).toHaveBeenCalledWith("messages");
    expect(insert).toHaveBeenCalledWith({
      uid: "user-1",
      name: "budi",
      type: "text",
      content: "halo",
    });
    expect(result.error).toBeNull();
  });
});

describe("fetchMessages", () => {
  it("returns ordered messages", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null });
    const select = vi.fn().mockReturnValue({ order });
    (supabase.from as any).mockReturnValue({ select });

    const messages = await fetchMessages();

    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(messages).toEqual([{ id: "1" }]);
  });
});

describe("subscribeToMessages", () => {
  it("subscribes to postgres_changes inserts on messages and returns an unsubscribe fn", () => {
    const on = vi.fn().mockReturnThis();
    const subscribe = vi.fn().mockReturnThis();
    const unsubscribe = vi.fn();
    (supabase.channel as any).mockReturnValue({ on, subscribe, unsubscribe });

    const onInsert = vi.fn();
    const unsub = subscribeToMessages(onInsert);

    expect(supabase.channel).toHaveBeenCalledWith("messages-realtime");
    expect(on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      expect.any(Function)
    );
    unsub();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- utils/messages.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the messages util**

`chat-app/utils/messages.ts`:

```ts
import { supabase } from "../lib/supabase";

export type Message = {
  id: string;
  uid: string;
  name: string;
  type: "text" | "image" | "video";
  content: string;
  created_at: string;
};

export async function sendMessage(
  uid: string,
  name: string,
  type: Message["type"],
  content: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("messages").insert({ uid, name, type, content });
  return { error: error ? error.message : null };
}

export async function fetchMessages(): Promise<Message[]> {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as Message[]) ?? [];
}

export function subscribeToMessages(onInsert: (message: Message) => void): () => void {
  const channel = supabase
    .channel("messages-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload: { new: Message }) => onInsert(payload.new)
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- utils/messages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/messages.ts utils/messages.test.ts
git commit -m "feat: add send/fetch/subscribe messages util"
```

---

### Task 10: ChatBubble component

**Files:**
- Create: `chat-app/components/ChatBubble.tsx`

**Interfaces:**
- Consumes: `Message` type (Task 9).
- Produces: `ChatBubble` (default export, props `{ message: Message; isOwn: boolean; avatarUrl?: string | null }`) used by Task 12 (Chat page).

- [ ] **Step 1: Implement ChatBubble**

`chat-app/components/ChatBubble.tsx`:

```tsx
import Image from "next/image";
import { Message } from "@/utils/messages";

export default function ChatBubble({
  message,
  isOwn,
  avatarUrl,
}: {
  message: Message;
  isOwn: boolean;
  avatarUrl?: string | null;
}) {
  const time = new Date(message.created_at).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
      <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
        {avatarUrl && (
          <Image src={avatarUrl} alt={message.name} width={32} height={32} />
        )}
      </div>
      <div
        className={`max-w-xs rounded-2xl px-3 py-2 ${
          isOwn ? "bg-green-700 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        <p className="text-xs opacity-70">
          {message.name} · {time}
        </p>
        {message.type === "text" && <p>{message.content}</p>}
        {message.type === "image" && (
          <Image src={message.content} alt="gambar" width={240} height={240} className="mt-1 rounded" />
        )}
        {message.type === "video" && (
          <video src={message.content} controls className="mt-1 max-w-full rounded" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

This component is exercised end-to-end once wired into Task 12's chat page; no standalone verification needed here beyond confirming it compiles (`npx tsc --noEmit`).

- [ ] **Step 3: Commit**

```bash
git add components/ChatBubble.tsx
git commit -m "feat: add ChatBubble component"
```

---

### Task 11: MessageInput + MediaPreview components

**Files:**
- Create: `chat-app/components/MediaPreview.tsx`
- Create: `chat-app/components/MessageInput.tsx`

**Interfaces:**
- Consumes: `uploadChatMedia` (Task 8), `sendMessage` (Task 9).
- Produces: `MessageInput` (default export, props `{ uid: string; name: string; onSent?: () => void }`) used by Task 12 (Chat page). `MediaPreview` (default export, props `{ file: File; onCancel: () => void }`).

- [ ] **Step 1: Implement MediaPreview**

`chat-app/components/MediaPreview.tsx`:

```tsx
import { useEffect, useState } from "react";

export default function MediaPreview({ file, onCancel }: { file: File; onCancel: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;

  return (
    <div className="flex items-center gap-2 rounded border p-2">
      {file.type.startsWith("image/") ? (
        <img src={url} alt="preview" className="h-16 w-16 rounded object-cover" />
      ) : (
        <video src={url} className="h-16 w-16 rounded object-cover" />
      )}
      <span className="flex-1 truncate text-sm">{file.name}</span>
      <button type="button" onClick={onCancel} className="text-sm text-red-600">
        Batal
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Implement MessageInput**

`chat-app/components/MessageInput.tsx`:

```tsx
"use client";

import { useRef, useState, FormEvent } from "react";
import MediaPreview from "./MediaPreview";
import { uploadChatMedia } from "@/utils/upload";
import { sendMessage } from "@/utils/messages";

export default function MessageInput({
  uid,
  name,
  onSent,
}: {
  uid: string;
  name: string;
  onSent?: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (file) {
      setSending(true);
      const { url, error: uploadError, type } = await uploadChatMedia(file, uid);
      setSending(false);
      if (uploadError || !url || !type) {
        setError(uploadError ?? "Gagal mengunggah file.");
        return;
      }
      await sendMessage(uid, name, type, url);
      setFile(null);
      onSent?.();
      return;
    }

    if (!text.trim()) return;
    setSending(true);
    const { error: sendError } = await sendMessage(uid, name, "text", text.trim());
    setSending(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    setText("");
    onSent?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t p-3">
      {file && <MediaPreview file={file} onCancel={() => setFile(null)} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xl"
          aria-label="Lampirkan file"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tulis pesan..."
          className="flex-1 rounded border px-3 py-2"
          disabled={!!file}
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
        >
          Kirim
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Verify manually**

Compiles with `npx tsc --noEmit`; full behavior verified in Task 12 once mounted on the chat page.

- [ ] **Step 4: Commit**

```bash
git add components/MediaPreview.tsx components/MessageInput.tsx
git commit -m "feat: add MessageInput and MediaPreview components"
```

---

### Task 12: Chat page

**Files:**
- Modify: `chat-app/app/chat/page.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 1), `logoutUser` (Task 4), `Logo` (Task 5), `fetchMessages`/`subscribeToMessages`/`Message` (Task 9), `ChatBubble` (Task 10), `MessageInput` (Task 11).
- Produces: `/chat` route — the main chat screen, redirects to `/` if not authenticated.

- [ ] **Step 1: Implement the chat page**

`chat-app/app/chat/page.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import ChatBubble from "@/components/ChatBubble";
import MessageInput from "@/components/MessageInput";
import { supabase } from "@/lib/supabase";
import { logoutUser } from "@/utils/auth";
import { fetchMessages, subscribeToMessages, Message } from "@/utils/messages";

type Profile = { id: string; username: string; name: string; avatar_url: string | null };

export default function ChatPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/");
        return;
      }

      const uid = sessionData.session.user.id;
      const { data: userRow } = await supabase
        .from("users")
        .select("id, username, name, avatar_url")
        .eq("id", uid)
        .single();
      setProfile(userRow as Profile);

      setMessages(await fetchMessages());
      unsubscribe = subscribeToMessages((message) => {
        setMessages((prev) => [...prev, message]);
      });
    }

    init();
    return () => unsubscribe?.();
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleLogout() {
    await logoutUser();
    router.push("/");
  }

  if (!profile) {
    return <main className="flex min-h-screen items-center justify-center">Memuat...</main>;
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b p-3">
        <Logo size={32} />
        <div className="flex gap-3 text-sm">
          <Link href="/settings" className="text-green-700 underline">
            Settings
          </Link>
          <button onClick={handleLogout} className="text-red-600 underline">
            Logout
          </button>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            isOwn={message.uid === profile.id}
            avatarUrl={message.uid === profile.id ? profile.avatar_url : null}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageInput uid={profile.id} name={profile.name} />
    </main>
  );
}
```

- [ ] **Step 2: Verify manually (end-to-end chat)**

With `.env.local` pointed at the real Supabase project and schema applied:
1. Log in with two different browser sessions (e.g. normal + incognito) using two registered usernames.
2. Send a text message from session A — confirm it appears instantly in session B without refresh, on the correct (left/right) side.
3. Send an image under 5MB — confirm it uploads and renders inline in both sessions.
4. Send a video under 20MB — confirm it renders with playback controls in both sessions.
5. Try an unsupported file / oversized file — confirm the error message shows and nothing is sent.
6. Refresh the page — confirm the session persists (still logged in, message history loads).

- [ ] **Step 3: Commit**

```bash
git add app/chat/page.tsx
git commit -m "feat: implement chat page with realtime messages and media"
```

---

### Task 13: Profile utils (update profile, change password, upload avatar)

**Files:**
- Create: `chat-app/utils/profile.ts`
- Test: `chat-app/utils/profile.test.ts`

**Interfaces:**
- Consumes: `supabase` (Task 1), `validateImageFile` (Task 3).
- Produces:
  - `uploadAvatar(file: File, uid: string): Promise<{ url: string | null; error: string | null }>`
  - `updateProfile(uid: string, name: string, avatarUrl: string | null): Promise<{ error: string | null }>`
  - `changePassword(currentPassword: string, newPassword: string, email: string): Promise<{ error: string | null }>`
  - Used by Task 15 (ProfileForm) and Task 16 (PasswordForm).

- [ ] **Step 1: Write the failing tests**

`chat-app/utils/profile.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadAvatar, updateProfile, changePassword } from "./profile";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    storage: { from: vi.fn() },
    from: vi.fn(),
    auth: { signInWithPassword: vi.fn(), updateUser: vi.fn() },
  },
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe("uploadAvatar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid files", async () => {
    const file = makeFile("a.bmp", "image/bmp", 1024);
    const result = await uploadAvatar(file, "user-1");
    expect(result.error).toMatch(/format/i);
  });

  it("uploads to the avatars bucket and returns the public url", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://example.com/avatars/user-1/123-a.jpg" },
    });
    (supabase.storage.from as any).mockReturnValue({ upload, getPublicUrl });

    const file = makeFile("a.jpg", "image/jpeg", 1024);
    const result = await uploadAvatar(file, "user-1");

    expect(supabase.storage.from).toHaveBeenCalledWith("avatars");
    expect(result.url).toBe("https://example.com/avatars/user-1/123-a.jpg");
  });
});

describe("updateProfile", () => {
  it("updates name and avatar_url for the given uid", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (supabase.from as any).mockReturnValue({ update });

    const result = await updateProfile("user-1", "Budi", "https://example.com/a.jpg");

    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(update).toHaveBeenCalledWith({ name: "Budi", avatar_url: "https://example.com/a.jpg" });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
    expect(result.error).toBeNull();
  });
});

describe("changePassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies the current password before updating", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ error: null });
    (supabase.auth.updateUser as any).mockResolvedValue({ error: null });

    const result = await changePassword("oldpass", "newpass123", "budi@chatapp.local");

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "budi@chatapp.local",
      password: "oldpass",
    });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "newpass123" });
    expect(result.error).toBeNull();
  });

  it("returns an error when the current password is wrong", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    const result = await changePassword("wrong", "newpass123", "budi@chatapp.local");

    expect(result.error).toMatch(/password lama/i);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- utils/profile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the profile util**

`chat-app/utils/profile.ts`:

```ts
import { supabase } from "../lib/supabase";
import { validateImageFile } from "./validation";

export async function uploadAvatar(
  file: File,
  uid: string
): Promise<{ url: string | null; error: string | null }> {
  const validationError = validateImageFile(file);
  if (validationError) return { url: null, error: validationError };

  const path = `${uid}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file);
  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function updateProfile(
  uid: string,
  name: string,
  avatarUrl: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("users")
    .update({ name, avatar_url: avatarUrl })
    .eq("id", uid);
  return { error: error ? error.message : null };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  email: string
): Promise<{ error: string | null }> {
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verifyError) {
    return { error: "Password lama salah." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  return { error: updateError ? updateError.message : null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- utils/profile.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/profile.ts utils/profile.test.ts
git commit -m "feat: add profile update, avatar upload, and change password utils"
```

---

### Task 14: Delete-account server route

**Files:**
- Create: `chat-app/app/api/delete-account/route.ts`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY` env var (server-only, Task 1's `.env.local.example`).
- Produces: `POST /api/delete-account` — expects JSON body `{ uid: string }` plus the caller's `Authorization: Bearer <access_token>` header; deletes the user's messages, avatar files, `users` row, and Supabase Auth account. Used by Task 16 (DeleteAccountModal).

- [ ] **Step 1: Implement the route**

`chat-app/app/api/delete-account/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const callerClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await callerClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  const uid = userData.user.id;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  await adminClient.from("messages").delete().eq("uid", uid);

  const { data: avatarFiles } = await adminClient.storage.from("avatars").list(uid);
  if (avatarFiles && avatarFiles.length > 0) {
    await adminClient.storage
      .from("avatars")
      .remove(avatarFiles.map((f) => `${uid}/${f.name}`));
  }

  await adminClient.from("users").delete().eq("id", uid);

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(uid);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ error: null });
}
```

- [ ] **Step 2: Verify manually**

With a real Supabase project and a test account logged in via the browser, use the browser devtools console to run:

```js
const { data } = await window.supabase.auth.getSession();
await fetch("/api/delete-account", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session.access_token}`,
  },
  body: JSON.stringify({ uid: data.session.user.id }),
});
```

(`window.supabase` isn't exposed by default — for this manual check, temporarily run `(window as any).supabase = supabase;` in `app/chat/page.tsx`, test, then remove it.) Confirm the response is `{ error: null }`, the test account's row is gone from `users`, its messages are gone from `messages`, and it can no longer log in. Revert the temporary `window.supabase` line before committing.

- [ ] **Step 3: Commit**

```bash
git add app/api/delete-account/route.ts
git commit -m "feat: add server-side delete-account route using service role key"
```

---

### Task 15: ProfileForm component

**Files:**
- Create: `chat-app/components/ProfileForm.tsx`

**Interfaces:**
- Consumes: `uploadAvatar`, `updateProfile` (Task 13).
- Produces: `ProfileForm` (default export, props `{ uid: string; initialName: string; initialAvatarUrl: string | null; onSaved?: (name: string, avatarUrl: string | null) => void }`) used by Task 17 (Settings page).

- [ ] **Step 1: Implement ProfileForm**

`chat-app/components/ProfileForm.tsx`:

```tsx
"use client";

import { useState, FormEvent } from "react";
import { uploadAvatar, updateProfile } from "@/utils/profile";

export default function ProfileForm({
  uid,
  initialName,
  initialAvatarUrl,
  onSaved,
}: {
  uid: string;
  initialName: string;
  initialAvatarUrl: string | null;
  onSaved?: (name: string, avatarUrl: string | null) => void;
}) {
  const [name, setName] = useState(initialName);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialAvatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setError(null);
    if (selected) setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    let avatarUrl = initialAvatarUrl;
    if (file) {
      const { url, error: uploadError } = await uploadAvatar(file, uid);
      if (uploadError || !url) {
        setSaving(false);
        setError(uploadError ?? "Gagal mengunggah avatar.");
        return;
      }
      avatarUrl = url;
    }

    const { error: updateError } = await updateProfile(uid, name, avatarUrl);
    setSaving(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    setSuccess(true);
    onSaved?.(name, avatarUrl);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Edit Profil</h2>
      {previewUrl && (
        <img src={previewUrl} alt="avatar preview" className="h-20 w-20 rounded-full object-cover" />
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nama"
        className="rounded border px-3 py-2"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">Profil berhasil disimpan.</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? "Menyimpan..." : "Simpan Profil"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verify manually**

Exercised end-to-end once mounted in Task 17's settings page.

- [ ] **Step 3: Commit**

```bash
git add components/ProfileForm.tsx
git commit -m "feat: add ProfileForm component"
```

---

### Task 16: PasswordForm + DeleteAccountModal components

**Files:**
- Create: `chat-app/components/PasswordForm.tsx`
- Create: `chat-app/components/DeleteAccountModal.tsx`

**Interfaces:**
- Consumes: `changePassword` (Task 13), `usernameToEmail` (Task 3/4).
- Produces: `PasswordForm` (default export, props `{ username: string }`), `DeleteAccountModal` (default export, props `{ username: string; onConfirm: () => Promise<void>; onClose: () => void }`). Both used by Task 17.

- [ ] **Step 1: Implement PasswordForm**

`chat-app/components/PasswordForm.tsx`:

```tsx
"use client";

import { useState, FormEvent } from "react";
import { changePassword } from "@/utils/profile";
import { usernameToEmail } from "@/utils/auth";

export default function PasswordForm({ username }: { username: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak cocok.");
      return;
    }

    setSaving(true);
    const { error: changeError } = await changePassword(
      currentPassword,
      newPassword,
      usernameToEmail(username)
    );
    setSaving(false);
    if (changeError) {
      setError(changeError);
      return;
    }
    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Ganti Password</h2>
      <input
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="Password lama"
        className="rounded border px-3 py-2"
        required
      />
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="Password baru"
        className="rounded border px-3 py-2"
        required
      />
      <input
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Konfirmasi password baru"
        className="rounded border px-3 py-2"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">Password berhasil diubah.</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? "Menyimpan..." : "Ganti Password"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Implement DeleteAccountModal**

`chat-app/components/DeleteAccountModal.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function DeleteAccountModal({
  username,
  onConfirm,
  onClose,
}: {
  username: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === "HAPUS";

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus akun.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded bg-white p-6">
        <h2 className="text-lg font-semibold text-red-600">Hapus Akun</h2>
        <p className="mt-2 text-sm">
          Tindakan ini tidak bisa dibatalkan. Semua pesan dan data akun{" "}
          <strong>{username}</strong> akan dihapus permanen. Ketik{" "}
          <strong>HAPUS</strong> untuk melanjutkan.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-3 w-full rounded border px-3 py-2"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-2">
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canDelete || deleting}
            className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {deleting ? "Menghapus..." : "Hapus Akun"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

Compiles with `npx tsc --noEmit`; full behavior verified in Task 17 once mounted on the settings page.

- [ ] **Step 4: Commit**

```bash
git add components/PasswordForm.tsx components/DeleteAccountModal.tsx
git commit -m "feat: add PasswordForm and DeleteAccountModal components"
```

---

### Task 17: Settings page

**Files:**
- Modify: `chat-app/app/settings/page.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 1), `logoutUser` (Task 4), `Logo` (Task 5), `ProfileForm` (Task 15), `PasswordForm`/`DeleteAccountModal` (Task 16).
- Produces: `/settings` route; redirects to `/` if not authenticated.

- [ ] **Step 1: Implement the settings page**

`chat-app/app/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import ProfileForm from "@/components/ProfileForm";
import PasswordForm from "@/components/PasswordForm";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import { supabase } from "@/lib/supabase";
import { logoutUser } from "@/utils/auth";

type Profile = { id: string; username: string; name: string; avatar_url: string | null };

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/");
        return;
      }
      const uid = sessionData.session.user.id;
      const { data: userRow } = await supabase
        .from("users")
        .select("id, username, name, avatar_url")
        .eq("id", uid)
        .single();
      setProfile(userRow as Profile);
    }
    init();
  }, [router]);

  async function handleDeleteAccount() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return;

    const response = await fetch("/api/delete-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ uid: session.user.id }),
    });
    const result = await response.json();
    if (result.error) {
      setDeleteError(result.error);
      throw new Error(result.error);
    }
    await logoutUser();
    router.push("/");
  }

  if (!profile) {
    return <main className="flex min-h-screen items-center justify-center">Memuat...</main>;
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <Logo size={32} />
        <Link href="/chat" className="text-sm text-green-700 underline">
          Kembali ke Chat
        </Link>
      </header>

      <ProfileForm
        uid={profile.id}
        initialName={profile.name}
        initialAvatarUrl={profile.avatar_url}
        onSaved={(name, avatarUrl) => setProfile({ ...profile, name, avatar_url: avatarUrl })}
      />

      <hr />

      <PasswordForm username={profile.username} />

      <hr />

      <div>
        <h2 className="text-lg font-semibold text-red-600">Hapus Akun</h2>
        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        <button
          onClick={() => setShowDeleteModal(true)}
          className="mt-2 rounded border border-red-600 px-4 py-2 text-red-600"
        >
          Hapus Akun
        </button>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal
          username={profile.username}
          onConfirm={handleDeleteAccount}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify manually (end-to-end settings)**

With a real Supabase project and a logged-in test account:
1. Go to `/settings` from the chat header. Update name and upload an avatar under 5MB — confirm success message, then go to `/chat` and confirm the new name/avatar show on your own messages.
2. Try changing password with the wrong current password — confirm the error message.
3. Change password with the correct current password — log out, log back in with the new password to confirm it took effect.
4. Click "Hapus Akun", confirm the modal requires typing "HAPUS" before the button enables, confirm deletion — confirm you're redirected to `/` and can no longer log in with that account.

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: implement settings page with profile, password, and delete account"
```

---

### Task 18: README and setup instructions

**Files:**
- Create: `chat-app/README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Write the README**

`chat-app/README.md`:

```markdown
# CurhatIn

Website chat realtime dengan Next.js 14 dan Supabase.

## Setup

1. Buat project baru di https://supabase.com
2. Jalankan isi `supabase/schema.sql` di SQL Editor Supabase.
3. Aktifkan Realtime untuk tabel `messages` (Database → Replication).
4. Pastikan Storage punya bucket `media` dan `avatars` (dibuat otomatis oleh schema.sql).
5. Salin `.env.local.example` menjadi `.env.local` dan isi:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service_role, JANGAN diekspos ke client)
6. Install dependencies: `npm install`
7. Jalankan secara lokal: `npm run dev`
8. Jalankan unit test: `npm run test`

## Deploy ke Vercel

1. Push repo ke GitHub.
2. Import repo di https://vercel.com
3. Tambahkan environment variables yang sama seperti `.env.local` di pengaturan project Vercel.
4. Deploy — setiap push ke `main` akan otomatis men-deploy ulang.
```

- [ ] **Step 2: Verify manually**

Confirm `npm run dev` and `npm run test` both work following only the README steps on a clean checkout (or by re-reading the steps against what was actually done in Tasks 1-17).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add setup and deployment instructions"
```

---

## Full QA Checklist (run after Task 18)

- [ ] Register with a new username → redirected to `/chat`.
- [ ] Register with a duplicate username → error "Username sudah dipakai."
- [ ] Login with correct credentials → redirected to `/chat`.
- [ ] Login with wrong password → error shown.
- [ ] Refresh `/chat` while logged in → still logged in, history loads.
- [ ] Two sessions: text message from A appears instantly in B, correct side (own = right, other = left).
- [ ] Image under 5MB in supported format sends and renders inline in both sessions.
- [ ] Video under 20MB in supported format sends and renders with controls in both sessions.
- [ ] Oversized or unsupported file is rejected with a clear error, nothing sent.
- [ ] Edit name + avatar in `/settings` → reflected on own bubbles in `/chat`.
- [ ] Change password with wrong old password → rejected.
- [ ] Change password with correct old password → can log in with new password.
- [ ] Delete account requires typing "HAPUS"; after confirming, account's messages/avatar/row/auth are gone and login fails afterward.
- [ ] Logo + "CurhatIn" name visible on `/`, `/register`, and `/chat` header.

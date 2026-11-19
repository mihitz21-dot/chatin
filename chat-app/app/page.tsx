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

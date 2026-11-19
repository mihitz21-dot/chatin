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
    try {
      const { error: registerError } = await registerUser(username, password);
      if (registerError) {
        setLoading(false);
        setError(registerError);
        return;
      }

      const { error: loginError } = await loginUser(username, password);
      if (loginError) {
        setLoading(false);
        setError(
          "Registrasi berhasil, tapi gagal login otomatis. Coba login manual, atau cek pengaturan Supabase (Confirm Email harus dimatikan)."
        );
        return;
      }
      router.push("/chat");
    } catch {
      setError("Terjadi kesalahan, coba lagi.");
      setLoading(false);
    }
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

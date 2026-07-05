'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 目前还没接后端真实验证,先记录登录状态,之后换成真实 API 调用
    login(email);
    router.push('/');
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F5F1] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#E3E0D6] bg-[#FBFAF7] p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#C98A3E] font-serif text-xl font-semibold text-white">
            A
          </div>
          <h1 className="font-serif text-xl font-semibold text-[#1F2937]">欢迎回来</h1>
          <p className="mt-1 text-xs text-[#8A8578]">登录继续和你的 AI 角色对话</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#8A8578]">邮箱</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-[#E3E0D6] bg-white px-4 py-2.5 text-sm text-[#1F2937] outline-none transition focus:ring-2 focus:ring-[#C98A3E]/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#8A8578]">密码</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-[#E3E0D6] bg-white px-4 py-2.5 text-sm text-[#1F2937] outline-none transition focus:ring-2 focus:ring-[#C98A3E]/40"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-xl bg-[#C98A3E] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#B37A34]"
          >
            登录
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[#8A8578]">
          还没有账号？<span className="cursor-pointer text-[#C98A3E]">注册一个</span>
        </p>
      </div>
    </div>
  );
}
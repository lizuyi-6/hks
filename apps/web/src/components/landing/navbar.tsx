"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/landing/logo";

type NavbarProps = {
  authenticated: boolean;
};

const anchors = [
  { href: "#features", label: "能力" },
  { href: "#workflow", label: "工作流" },
  { href: "#faq", label: "常见问题" }
];

export function LandingNavbar({ authenticated }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const findScrollParent = (el: HTMLElement | null): HTMLElement | Window => {
      let node = el?.parentElement ?? null;
      while (node) {
        const style = window.getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY)) return node;
        node = node.parentElement;
      }
      return window;
    };
    const target = findScrollParent(headerRef.current);
    const readScroll = () =>
      target === window
        ? (target as Window).scrollY
        : (target as HTMLElement).scrollTop;
    const onScroll = () => setScrolled(readScroll() > 8);
    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      ref={headerRef}
      className={[
        "sticky top-0 z-sticky w-full transition-colors duration-normal ease-out",
        scrolled
          ? "border-b border-border bg-surface-sunken/80 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      ].join(" ")}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <Logo size={34} />
          <span className="text-base font-semibold tracking-tight text-text-primary">
            A1<span className="text-primary-600">+</span>{" "}
            <span className="text-text-secondary">IP Coworker</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {anchors.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="nav-link rounded-md px-3 py-2 text-sm text-text-secondary"
            >
              {a.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {authenticated ? (
            <Link
              href="/dashboard"
              className="btn-tech btn-press inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-white"
            >
              进入工作台
            </Link>
          ) : (
            <div className="flex items-center gap-1">
              <Link
                href="/login"
                className="nav-link hidden h-9 items-center rounded-md px-3 text-sm font-medium text-text-secondary sm:inline-flex"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="btn-tech btn-press inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-white"
              >
                免费开始
              </Link>
            </div>
          )}
          <button
            type="button"
            aria-label="菜单"
            onClick={() => setMobileOpen((v) => !v)}
            className="icon-press inline-flex h-9 w-9 items-center justify-center rounded-md text-text-tertiary hover:bg-neutral-100 hover:text-text-primary md:hidden"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path strokeLinecap="round" d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-surface-sunken md:hidden">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-1 px-6 py-3">
            {anchors.map((a) => (
              <a
                key={a.href}
                href={a.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-neutral-100 hover:text-text-primary"
              >
                {a.label}
              </a>
            ))}
            {!authenticated ? (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-neutral-100 hover:text-text-primary"
              >
                登录
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

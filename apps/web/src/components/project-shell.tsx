"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Archive, ArrowLeft, BookOpen, LayoutDashboard, Menu, Search, Settings } from "lucide-react"

import { RunTraceLogo } from "@/components/runtrace-logo"
import { AccountMenu } from "@/components/account-menu"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { Project } from "@/lib/types"

const navItems = [
  { label: "Dashboard", suffix: "", icon: LayoutDashboard },
  { label: "Search", suffix: "/search", icon: Search },
  { label: "Archive", suffix: "/archive", icon: Archive },
  { label: "Settings", suffix: "/settings", icon: Settings },
]

function ProjectNavigation({ project, mobile = false }: { project: Project; mobile?: boolean }) {
  const pathname = usePathname()
  const base = `/projects/${project.slug}`
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-20 items-center border-b px-5"><RunTraceLogo /></div>
      <div className="border-b px-3 py-4">
        <Button variant="ghost" className="w-full justify-start" render={<Link href="/" />} nativeButton={false}><ArrowLeft data-icon="inline-start" /><span className="truncate">{project.name}</span></Button>
      </div>
      <nav className="flex flex-col gap-1 p-3" aria-label="Project navigation">
        {navItems.map(({ label, suffix, icon: Icon }) => {
          const href = `${base}${suffix}`
          const active = suffix ? pathname === href : pathname === base
          return (
            <Button key={label} variant={active ? "secondary" : "ghost"} className={cn("justify-start", active && "font-medium")} render={<Link href={href} />} nativeButton={false}>
              <Icon data-icon="inline-start" />{label}
            </Button>
          )
        })}
      </nav>
      <div className="mt-auto border-t p-3">
        <Button variant="ghost" className="w-full justify-start" render={<Link href="/docs" />} nativeButton={false}><BookOpen data-icon="inline-start" />Docs</Button>
        <div className="mt-1"><AccountMenu /></div>
        {mobile ? <p className="px-3 pt-2 text-xs text-muted-foreground">RunTrace v0.1</p> : null}
      </div>
    </div>
  )
}

export function ProjectShell({ project, children }: { project: Project; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r bg-sidebar lg:block"><ProjectNavigation project={project} /></aside>
      <div className="lg:col-start-2">
        <div className="flex h-16 items-center border-b px-4 lg:hidden">
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}><Menu /></SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetHeader className="sr-only"><SheetTitle>Project navigation</SheetTitle><SheetDescription>Navigate RunTrace project views.</SheetDescription></SheetHeader>
              <ProjectNavigation project={project} mobile />
            </SheetContent>
          </Sheet>
          <div className="ml-2 truncate text-sm font-medium">{project.name}</div>
        </div>
        <main className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-8 sm:py-10 xl:px-12">{children}</main>
      </div>
    </div>
  )
}

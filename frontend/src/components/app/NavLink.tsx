"use client";

import Link, { type LinkProps } from "next/link";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavLinkCompatProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "className"
> &
  LinkProps & {
    className?: string;
    activeClassName?: string;
    pendingClassName?: string;
  };

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName: _pendingClassName, href, ...props }, ref) => {
    const pathname = usePathname();
    const isActive = pathname === href;

    return (
      <Link
        ref={ref}
        href={href}
        className={cn(className, isActive && activeClassName)}
        {...props}
      />
    );
  }
);

NavLink.displayName = "NavLink";

export { NavLink };

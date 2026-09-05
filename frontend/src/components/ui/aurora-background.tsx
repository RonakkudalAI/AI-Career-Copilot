"use client";

import React, { type ReactNode } from "react";
import { cn } from "@/shared/utils";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

/**
 * A restrained, theme-aware light field for the auth introduction panel.
 * The palette intentionally uses the landing system: deep navy text, paper, and lime.
 */
export function AuroraBackground({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) {
  return (
    <div
      className={cn("aurora-background", showRadialGradient && "aurora-background-radial", className)}
      {...props}
    >
      <div className="aurora-background-field" aria-hidden="true" />
      <div className="aurora-background-content">{children}</div>
    </div>
  );
}

export default AuroraBackground;

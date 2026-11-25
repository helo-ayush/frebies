import type { ReactNode } from "react";
import { StudioRail } from "@/components/tool/studio/StudioRail";

/**
 * Settings rail for credit-based tools: the shared studio rail with the run
 * action fixed above the controls. The action stays in the rail on phones
 * because callers may pass a tall card; studios whose action is a single
 * button use `StudioRail` directly so it docks to the bottom of the screen.
 */
export function PaidRail({
  children,
  action,
  label = "Tool settings",
}: {
  children: ReactNode;
  action: ReactNode;
  label?: string;
}) {
  return (
    <StudioRail label={label} action={action} pinActionOnMobile={false}>
      {children}
    </StudioRail>
  );
}

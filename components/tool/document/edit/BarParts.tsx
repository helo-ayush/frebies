"use client";

import { useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  BringToFront,
  ChevronDown,
  CopyPlus,
  Group,
  Layers2,
  Lock,
  LockOpen,
  MoveDown,
  MoveUp,
  Scaling,
  SendToBack,
  Trash2,
  Ungroup,
} from "lucide-react";
import { groupSelection, lineUp, sameSize, spread, ungroupSelection, type EdgeName } from "./commands";
import { setSelection } from "./engine/text-dom";
import type { EditObject } from "./model";
import type { EditorStore } from "./store";
import { BarButton, MenuRow, Pop, Rule, Slider } from "./ui";

/** Parts shared by the bars of every kind of object. */

export const ICON = { size: 17, strokeWidth: 1.8, "aria-hidden": true } as const;
export const WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12];

/** Puts the caret back in the text being edited, after a control had to take it. */
export function backToText(store: EditorStore) {
  const { editing, range, cell } = store.view;
  if (!editing) return;
  const name = cell ? `${editing}:${cell.r},${cell.c}` : editing;
  const root = document.querySelector<HTMLElement>(`[data-text-box="${name}"]`);
  if (!root) return;
  root.focus({ preventScroll: true });
  if (range) setSelection(root, range.from, range.to);
}

export const Hint = ({ children }: { children: ReactNode }) => (
  <span className="shrink-0 whitespace-nowrap px-2 text-[13px] text-muted">{children}</span>
);

/** A word or an icon that opens a panel. */
export function Drop({
  label,
  icon,
  text,
  width = 220,
  align,
  disabled,
  active,
  children,
}: {
  label: string;
  icon?: ReactNode;
  text?: ReactNode;
  width?: number;
  align?: "left" | "right";
  disabled?: boolean;
  active?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <Pop
      label={label}
      width={width}
      align={align}
      button={(open, toggle, ref) => (
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-expanded={open}
          title={label}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
          className={`flex h-9 shrink-0 items-center gap-1 whitespace-nowrap px-2 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            active ? "bg-ink text-white" : open ? "bg-hover" : "hover:bg-hover"
          }`}
        >
          {icon}
          {text ? <span>{text}</span> : null}
          <ChevronDown size={12} aria-hidden />
        </button>
      )}
    >
      {children}
    </Pop>
  );
}

export const Head = ({ children }: { children: ReactNode }) => (
  <p className="border-y border-line bg-canvas px-3 py-1.5 text-[12px] uppercase text-muted first:border-t-0">
    {children}
  </p>
);

/** Two faces of one selection: the thing itself, and the words in it. */
export function Faces<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <span
      role="group"
      aria-label="What to change"
      className="mr-1 flex h-9 shrink-0 border border-line-strong bg-white"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(option.value)}
          className={`px-3 text-[13px] font-medium ${value === option.value ? "bg-ink text-white" : "hover:bg-hover"}`}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

/** Remembers which face was last looked at, until the selection asks for another. */
export function useFace<T extends string>(wanted: T): [T, (value: T) => void] {
  const [picked, setPicked] = useState<{ for: T; value: T } | null>(null);
  return [picked && picked.for === wanted ? picked.value : wanted, (value) => setPicked({ for: wanted, value })];
}

function Opacity({ store, objects }: { store: EditorStore; objects: EditObject[] }) {
  const value = objects[0]?.opacity ?? 1;
  return (
    <Pop
      label="See-through"
      width={216}
      button={(open, toggle, ref) => (
        <button
          ref={ref}
          type="button"
          title="Opacity"
          aria-label={`Opacity ${Math.round(value * 100)}%`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
          className="fb-num flex h-9 shrink-0 items-center gap-1.5 px-2 text-[13px] hover:bg-hover"
        >
          <Layers2 size={16} strokeWidth={1.8} aria-hidden />
          {Math.round(value * 100)}%
        </button>
      )}
    >
      {() => (
        <Slider
          label="Opacity"
          min={0.05}
          max={1}
          step={0.05}
          value={value}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(opacity) =>
            store.patchMany(
              objects.map((object) => object.id),
              () => ({ opacity }),
              "opacity",
            )
          }
        />
      )}
    </Pop>
  );
}

function Arrange({ store, objects }: { store: EditorStore; objects: EditObject[] }) {
  const ids = objects.map((object) => object.id);
  const one = objects.length === 1;
  const grouped = objects.some((object) => object.group);
  const locked = objects.some((object) => object.lock);
  const edges: { edge: EdgeName; label: string; icon: ReactNode }[] = [
    { edge: "left", label: one ? "To the left edge" : "Line up left edges", icon: <AlignStartVertical {...ICON} /> },
    {
      edge: "centre",
      label: one ? "Centre across the page" : "Line up centres",
      icon: <AlignCenterVertical {...ICON} />,
    },
    { edge: "right", label: one ? "To the right edge" : "Line up right edges", icon: <AlignEndVertical {...ICON} /> },
    { edge: "top", label: one ? "To the top" : "Line up tops", icon: <AlignStartHorizontal {...ICON} /> },
    {
      edge: "middle",
      label: one ? "Centre down the page" : "Line up middles",
      icon: <AlignCenterHorizontal {...ICON} />,
    },
    { edge: "bottom", label: one ? "To the bottom" : "Line up bottoms", icon: <AlignEndHorizontal {...ICON} /> },
  ];
  return (
    <Drop label="Position" text="Position" width={246} align="right">
      {(close) => (
        <>
          <div className="grid grid-cols-6 border-b border-line p-1.5">
            {edges.map(({ edge, label, icon }) => (
              <BarButton key={edge} label={label} onClick={() => lineUp(store, edge)}>
                {icon}
              </BarButton>
            ))}
            {objects.length > 2 ? (
              <>
                <BarButton label="Same gaps across" onClick={() => spread(store, "x")}>
                  <AlignHorizontalSpaceAround {...ICON} />
                </BarButton>
                <BarButton label="Same gaps down" onClick={() => spread(store, "y")}>
                  <AlignVerticalSpaceAround {...ICON} />
                </BarButton>
              </>
            ) : null}
            {objects.length > 1 ? (
              <BarButton label="Same size as the first" onClick={() => sameSize(store, "both")}>
                <Scaling {...ICON} />
              </BarButton>
            ) : null}
          </div>
          <MenuRow
            label="Bring to front"
            icon={<BringToFront {...ICON} />}
            onClick={() => (store.order(ids, "front"), close())}
          />
          <MenuRow
            label="Bring forward"
            icon={<MoveUp {...ICON} />}
            hint="Ctrl ]"
            onClick={() => store.order(ids, "up")}
          />
          <MenuRow
            label="Send backward"
            icon={<MoveDown {...ICON} />}
            hint="Ctrl ["
            onClick={() => store.order(ids, "down")}
          />
          <MenuRow
            label="Send to back"
            icon={<SendToBack {...ICON} />}
            onClick={() => (store.order(ids, "back"), close())}
          />
          {objects.length > 1 && !grouped ? (
            <MenuRow
              label="Group"
              hint="Ctrl G"
              icon={<Group {...ICON} />}
              onClick={() => (groupSelection(store), close())}
            />
          ) : null}
          {grouped ? (
            <MenuRow
              label="Ungroup"
              hint="Ctrl Shift G"
              icon={<Ungroup {...ICON} />}
              onClick={() => (ungroupSelection(store), close())}
            />
          ) : null}
          <MenuRow
            label={locked ? "Unlock" : "Lock in place"}
            icon={locked ? <LockOpen {...ICON} /> : <Lock {...ICON} />}
            onClick={() => (store.patchMany(ids, () => ({ lock: locked ? undefined : true })), close())}
          />
        </>
      )}
    </Drop>
  );
}

export function Ends({
  store,
  objects,
  plain = false,
}: {
  store: EditorStore;
  objects: EditObject[];
  plain?: boolean;
}) {
  const ids = objects.map((object) => object.id);
  return (
    <>
      {plain ? null : (
        <>
          <Rule />
          <Opacity store={store} objects={objects} />
          <Arrange store={store} objects={objects} />
        </>
      )}
      {/* Always in reach, however long the bar gets. */}
      <span className="sticky right-0 z-[1] ml-auto flex shrink-0 items-center self-stretch bg-panel pr-2">
        <Rule />
        <BarButton label="Duplicate" hint="Ctrl D" onClick={() => store.duplicate(ids)}>
          <CopyPlus {...ICON} />
        </BarButton>
        <BarButton
          label="Delete"
          hint="Del"
          slot="object-remove"
          onClick={() => store.remove(ids)}
          className="hover:!bg-danger hover:!text-white"
        >
          <Trash2 {...ICON} />
        </BarButton>
      </span>
    </>
  );
}

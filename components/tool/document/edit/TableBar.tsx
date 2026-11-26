"use client";

import { useState } from "react";
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpAZ,
  Columns3,
  Grid2x2,
  Heading,
  MoveHorizontal,
  PaintBucket,
  Rows3,
  Sigma,
  SplitSquareHorizontal,
  SplitSquareVertical,
  TableCellsMerge,
  TableCellsSplit,
  Trash2,
} from "lucide-react";
import { Drop, Ends, Faces, ICON, WIDTHS, backToText, useFace } from "./BarParts";
import { TextControls } from "./TextBar";
import {
  cellEdges,
  cellFill,
  cellValign,
  tableAt,
  tableDo,
  tableLook,
  tableSort,
  tableTotal,
  type TableDo,
} from "./commands";
import { GRID_EDGE, LOOKS, applyLook, newTable, resized } from "./engine/table";
import { DEFAULT_STYLE, type Edge, type TableObject } from "./model";
import { useEditor, type EditorStore } from "./store";
import { BarButton, ColorPick, MenuRow, NumberBox, Rule } from "./ui";

const EDGES: { id: Parameters<typeof cellEdges>[1]; label: string; art: string }[] = [
  { id: "all", label: "All lines", art: "M1 1H17V17H1ZM1 9H17M9 1V17" },
  { id: "outer", label: "Around the outside", art: "M1 1H17V17H1Z" },
  { id: "inner", label: "Inside lines", art: "M1 9H17M9 1V17" },
  { id: "none", label: "No lines", art: "" },
  { id: "top", label: "Line above", art: "M1 1H17" },
  { id: "bottom", label: "Line below", art: "M1 17H17" },
  { id: "left", label: "Line on the left", art: "M1 1V17" },
  { id: "right", label: "Line on the right", art: "M17 1V17" },
];

function LookArt({ id }: { id: string }) {
  // The look itself, on a table the size of a stamp.
  const table = { ...newTable(3, 3, 54, { ...DEFAULT_STYLE, size: 6 }), id: "look", x: 0, y: 0 } as TableObject;
  const look = applyLook(table, id);
  return (
    <svg width="54" height="36" viewBox="0 0 54 36" aria-hidden className="bg-white">
      {look.cells.map((row, r) =>
        row.map((cell, c) =>
          cell.fill ? <rect key={`${r}${c}`} x={c * 18} y={r * 12} width="18" height="12" fill={cell.fill} /> : null,
        ),
      )}
      {look.edge ? (
        <path
          d="M0 .5H54M0 12H54M0 24H54M0 35.5H54M.5 0V36M18 0V36M36 0V36M53.5 0V36"
          stroke={look.edge.color}
          strokeWidth="1"
          fill="none"
        />
      ) : look.cells[0][0].edges ? (
        <path d="M0 .5H54M0 12H54M0 24H54M0 35.5H54" stroke="#9b9a97" strokeWidth="1" fill="none" />
      ) : null}
      {look.cells.map((row, r) =>
        row.map((cell, c) => (
          <rect
            key={`t${r}${c}`}
            x={c * 18 + 4}
            y={r * 12 + 5}
            width="10"
            height="2"
            fill={cell.runs[0].style.color}
            opacity={r === 0 && look.head ? 1 : 0.5}
          />
        )),
      )}
    </svg>
  );
}

function TableControls({ store, table }: { store: EditorStore; table: TableObject }) {
  useEditor(store, (s) => s.doc);
  const view = useEditor(store, (s) => s.view);
  const [edge, setEdge] = useState<Edge>(GRID_EDGE);
  const at = tableAt(store);
  if (!at) return null;
  const { area, picked } = at;
  const many = area.r1 > area.r0 || area.c1 > area.c0;
  const first = table.cells[area.r0][area.c0];
  const spans = (first.rows ?? 1) > 1 || (first.cols ?? 1) > 1;
  const run = (what: TableDo) => () => {
    tableDo(store, what);
    requestAnimationFrame(() => backToText(store));
  };
  return (
    <>
      <Drop label="Rows" icon={<Rows3 {...ICON} />} text="Rows" width={216}>
        {(close) => (
          <>
            <MenuRow label="Add a row above" icon={<ArrowUp {...ICON} />} onClick={run("row-above")} />
            <MenuRow label="Add a row below" icon={<ArrowDown {...ICON} />} onClick={run("row-below")} />
            <MenuRow label="Move the row up" onClick={run("row-up")} icon={<span />} />
            <MenuRow label="Move the row down" onClick={run("row-down")} icon={<span />} />
            <MenuRow label="Make rows the same height" icon={<span />} onClick={run("even-rows")} />
            <MenuRow
              label={area.r1 > area.r0 && picked ? "Delete these rows" : "Delete this row"}
              icon={<Trash2 {...ICON} />}
              onClick={() => (run("row-delete")(), close())}
            />
          </>
        )}
      </Drop>
      <Drop label="Columns" icon={<Columns3 {...ICON} />} text="Columns" width={228}>
        {(close) => (
          <>
            <MenuRow label="Add a column on the left" icon={<ArrowLeft {...ICON} />} onClick={run("col-left")} />
            <MenuRow label="Add a column on the right" icon={<ArrowRight {...ICON} />} onClick={run("col-right")} />
            <MenuRow label="Make columns the same width" icon={<span />} onClick={run("even-cols")} />
            <MenuRow label="As wide as the page allows" icon={<MoveHorizontal {...ICON} />} onClick={run("fit")} />
            <MenuRow
              label={area.c1 > area.c0 && picked ? "Delete these columns" : "Delete this column"}
              icon={<Trash2 {...ICON} />}
              onClick={() => (run("col-delete")(), close())}
            />
          </>
        )}
      </Drop>
      <Rule />
      <BarButton label="Merge the picked cells" disabled={!many || !picked} onClick={run("merge")}>
        <TableCellsMerge {...ICON} />
      </BarButton>
      <Drop label="Split" icon={<TableCellsSplit {...ICON} />} width={220} disabled={!picked}>
        {(close) => (
          <>
            {spans ? (
              <MenuRow
                label="Back into single cells"
                icon={<TableCellsSplit {...ICON} />}
                onClick={() => (run("split")(), close())}
              />
            ) : null}
            <MenuRow
              label="Into two, side by side"
              icon={<SplitSquareHorizontal {...ICON} />}
              onClick={() => (run("divide-cols")(), close())}
            />
            <MenuRow
              label="Into two, one over the other"
              icon={<SplitSquareVertical {...ICON} />}
              onClick={() => (run("divide-rows")(), close())}
            />
          </>
        )}
      </Drop>
      <Rule />
      <ColorPick
        label={picked ? "Cell colour" : "Table colour"}
        value={first.fill ?? null}
        icon={<PaintBucket {...ICON} />}
        onChange={(fill) => cellFill(store, fill)}
        onNone={() => cellFill(store, null)}
      />
      <Drop label="Lines" icon={<Grid2x2 {...ICON} />} text="Lines" width={226}>
        {() => (
          <div className="p-2">
            <div className="grid grid-cols-4">
              {EDGES.map(({ id, label, art }) => (
                <BarButton key={id} label={label} onClick={() => cellEdges(store, id, edge)} className="!h-11">
                  <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden>
                    <path
                      d="M1 1H17V17H1ZM1 9H17M9 1V17"
                      stroke="#c9c8c4"
                      strokeWidth="1"
                      fill="none"
                      strokeDasharray="1.5 1.5"
                    />
                    <path d={art} stroke="currentColor" strokeWidth="1.6" fill="none" />
                  </svg>
                </BarButton>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
              <ColorPick label="Line colour" value={edge.color} onChange={(color) => setEdge({ ...edge, color })} />
              <NumberBox
                label="Line thickness"
                value={edge.width}
                min={0.1}
                max={12}
                step={0.25}
                width={44}
                presets={WIDTHS}
                suffix="pt"
                onChange={(width) => setEdge({ ...edge, width })}
              />
              <BarButton
                label="Dashed"
                active={edge.dash === "dash"}
                onClick={() => setEdge({ ...edge, dash: edge.dash === "dash" ? "solid" : "dash" })}
              >
                <span className="block w-4 border-t-2 border-dashed border-current" />
              </BarButton>
            </div>
            <p className="pt-2 text-[12px] text-muted">Set the line, then choose where it goes.</p>
          </div>
        )}
      </Drop>
      {(
        [
          ["top", "Words at the top", AlignVerticalJustifyStart],
          ["middle", "Words in the middle", AlignVerticalJustifyCenter],
          ["bottom", "Words at the bottom", AlignVerticalJustifyEnd],
        ] as const
      ).map(([valign, label, Icon]) => (
        <BarButton
          key={valign}
          label={label}
          active={(first.valign ?? "top") === valign}
          onClick={() => cellValign(store, valign)}
          className="!min-w-8 !px-1"
        >
          <Icon {...ICON} />
        </BarButton>
      ))}
      <Rule />
      <Drop label="Table looks" text="Looks" width={252}>
        {(close) => (
          <div className="grid grid-cols-3 gap-2 p-3">
            {LOOKS.map((look) => (
              <button
                key={look.id}
                type="button"
                title={look.label}
                data-sound="select"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => (tableLook(store, look.id), close())}
                className="grid place-items-center gap-1 border border-line p-1.5 hover:border-ink"
              >
                <LookArt id={look.id} />
                <span className="truncate text-[11px] leading-none">{look.label}</span>
              </button>
            ))}
          </div>
        )}
      </Drop>
      <BarButton
        label="First row is a heading"
        active={Boolean(table.head)}
        onClick={() => store.patch<TableObject>(table.id, { head: !table.head })}
      >
        <Heading {...ICON} />
      </BarButton>
      <BarButton label="Sort by this column, A to Z" onClick={() => tableSort(store, true)}>
        <ArrowDownAZ {...ICON} />
      </BarButton>
      <BarButton label="Sort by this column, Z to A" onClick={() => tableSort(store, false)}>
        <ArrowUpAZ {...ICON} />
      </BarButton>
      <BarButton label="Write the total of the numbers above" disabled={!view.cell} onClick={() => tableTotal(store)}>
        <Sigma {...ICON} />
      </BarButton>
      <span className="flex shrink-0 items-center gap-1.5 pl-1 text-[13px] text-muted">
        Padding
        <NumberBox
          label="Room around the words in a cell"
          value={table.pad.x}
          min={0}
          max={40}
          width={40}
          onChange={(x) => {
            const next = { ...table, pad: { x, y: Math.round(x * 0.8 * 10) / 10 } };
            store.patch<TableObject>(table.id, { pad: next.pad, ...resized(next) }, "cell-pad");
          }}
        />
      </span>
    </>
  );
}

export function TableBar({ store, table }: { store: EditorStore; table: TableObject }) {
  const editing = useEditor(store, (s) => s.view.editing === table.id);
  const [face, setFace] = useFace<"table" | "text">(editing ? "text" : "table");
  return (
    <>
      <Faces
        value={face}
        onChange={setFace}
        options={[
          { value: "table", label: "Table" },
          { value: "text", label: "Text" },
        ]}
      />
      {face === "table" ? (
        <TableControls store={store} table={table} />
      ) : (
        <TextControls store={store} objects={[table]} />
      )}
      <Ends store={store} objects={[table]} plain={face === "text"} />
    </>
  );
}

"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export interface RowCtx {
  index: number;
  count: number;
  /** A drag handle button, already wired to dnd-kit. */
  handle: ReactNode;
  /** Keyboard-accessible fallback: move by one position. */
  move: (delta: -1 | 1) => void;
}

function Row({
  id,
  index,
  count,
  move,
  children,
}: {
  id: string;
  index: number;
  count: number;
  move: (delta: -1 | 1) => void;
  children: (ctx: RowCtx) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label="Kéo để sắp xếp"
      title="Kéo để sắp xếp"
      className="cursor-grab touch-none rounded px-1 text-muted-foreground hover:bg-muted"
      {...attributes}
      {...listeners}
    >
      ⠿
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      {children({ index, count, handle, move })}
    </div>
  );
}

/** Sortable vertical list keyed by `getKey`; reports the new key order. */
export function SortableList<T>({
  id,
  items,
  getKey,
  onReorder,
  children,
}: {
  id: string;
  items: T[];
  getKey: (item: T) => string;
  onReorder: (keys: string[]) => void;
  children: (item: T, ctx: RowCtx) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = items.map(getKey);

  function reorderTo(from: number, to: number) {
    if (to < 0 || to >= keys.length || from === to) return;
    onReorder(arrayMove(keys, from, to));
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    reorderTo(keys.indexOf(String(e.active.id)), keys.indexOf(String(e.over.id)));
  }

  return (
    <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <Row key={keys[i]} id={keys[i]} index={i} count={keys.length} move={(d) => reorderTo(i, i + d)}>
            {(ctx) => children(item, ctx)}
          </Row>
        ))}
      </SortableContext>
    </DndContext>
  );
}

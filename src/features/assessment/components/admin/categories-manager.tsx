"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from "@/features/assessment/actions/category";
import {
  QuestionsManager,
  type QuestionData,
} from "@/features/assessment/components/admin/questions-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface CategoryData {
  id: string;
  name: string;
  description: string | null;
  questions: QuestionData[];
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

export function CategoriesManager({
  assessmentId,
  categories,
}: {
  assessmentId: string;
  categories: CategoryData[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    start(async () => {
      const res = await createCategory(assessmentId, { name, description });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setDescription("");
      router.refresh();
    });
  }

  function reorder(from: number, to: number) {
    const ordered = move(categories, from, to);
    start(async () => {
      await reorderCategories(
        assessmentId,
        ordered.map((c) => c.id),
      );
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this category and all its questions?")) return;
    start(async () => {
      await deleteCategory(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {categories.map((c, i) => (
        <div key={c.id} className="flex flex-col gap-3 rounded-lg border p-4">
          {editingId === c.id ? (
            <CategoryEditForm
              category={c}
              onDone={() => {
                setEditingId(null);
                router.refresh();
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-semibold">{c.name}</span>
                {c.description ? (
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {c.description}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" disabled={pending || i === 0} onClick={() => reorder(i, i - 1)}>↑</Button>
                <Button size="sm" variant="ghost" disabled={pending || i === categories.length - 1} onClick={() => reorder(i, i + 1)}>↓</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(c.id)}>Edit</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(c.id)}>Delete</Button>
              </div>
            </div>
          )}

          <QuestionsManager categoryId={c.id} questions={c.questions} />
        </div>
      ))}

      <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
        <p className="text-sm font-medium">Add category</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cat-desc">Description</Label>
          <Textarea
            id="cat-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <div>
          <Button size="sm" onClick={add} disabled={pending || name.trim() === ""}>
            {pending ? "Saving…" : "Add category"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CategoryEditForm({
  category,
  onDone,
  onCancel,
}: {
  category: CategoryData;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await updateCategory(category.id, { name, description });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
      </div>
    </div>
  );
}

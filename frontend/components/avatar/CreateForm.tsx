"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";

export default function CreateForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [personality, setPersonality] = useState("");
  const [speakingStyle, setSpeakingStyle] = useState("");
  const [expertise, setExpertise] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const form = new FormData();
    form.append("name", name);
    form.append("description", description);
    form.append("personality", personality);
    form.append("speaking_style", speakingStyle);
    form.append("expertise", expertise);
    form.append("topic_tags", JSON.stringify(tags));
    if (imageFile) form.append("image", imageFile);

    try {
      const avatar = await api.createAvatar(form);
      router.push(`/chat/${avatar.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create avatar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 bg-gray-50 text-xs text-ink-muted hover:border-accent"
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            "Upload"
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleImageChange}
        />
        <div className="text-sm text-ink-muted">
          Upload an avatar image (PNG, JPG, WEBP, or GIF).
        </div>
      </div>

      <Field label="Name" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Professor Ada"
          className="input"
        />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Who is this persona? Background, role, context..."
          rows={3}
          className="input"
        />
      </Field>

      <Field label="Personality">
        <textarea
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          placeholder="e.g. Warm, patient, curious, a bit witty"
          rows={2}
          className="input"
        />
      </Field>

      <Field label="Speaking Style">
        <textarea
          value={speakingStyle}
          onChange={(e) => setSpeakingStyle(e.target.value)}
          placeholder="e.g. Uses analogies, asks Socratic questions, casual tone"
          rows={2}
          className="input"
        />
      </Field>

      <Field label="Expertise">
        <input
          value={expertise}
          onChange={(e) => setExpertise(e.target.value)}
          placeholder="e.g. Linear algebra, machine learning"
          className="input"
        />
      </Field>

      <Field label="Topic Tags (comma-separated)">
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g. eigenvalues, gradient descent, neural networks"
          className="input"
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create Avatar"}
      </button>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #1f2328;
          outline: none;
        }
        .input:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
